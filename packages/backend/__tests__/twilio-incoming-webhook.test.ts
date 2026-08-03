import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import schema from "../convex/schema";
import {
  classifyTwilioComplianceMessage,
  twilioDestinationMatchesConfiguredNumber,
  verifyTwilioRequestSignature,
} from "../convex/webhooks";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/http.ts": () => import("../convex/http"),
  "../convex/smsCodeRouter.ts": () => import("../convex/smsCodeRouter"),
  "../convex/webhooks.ts": () => import("../convex/webhooks"),
};

const aggregateComponentModules = {
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js"),
};

const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const originalTwilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const originalSmsCodeRouterEnabled = process.env.SMS_CODE_ROUTER_ENABLED;

function restoreEnvironmentVariable(name: string, originalValue: string | undefined): void {
  if (originalValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = originalValue;
  }
}

async function createTwilioSignature(args: {
  requestUrl: string;
  rawBody: string;
  authToken: string;
}): Promise<string> {
  const parameters = new URLSearchParams(args.rawBody);
  const parameterNames = Array.from(new Set(parameters.keys())).sort();
  const payloadParts = [args.requestUrl];
  for (const parameterName of parameterNames) {
    for (const parameterValue of parameters.getAll(parameterName)) {
      payloadParts.push(parameterName, parameterValue);
    }
  }

  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(args.authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    encoder.encode(payloadParts.join("")),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}

afterEach(() => {
  restoreEnvironmentVariable("TWILIO_AUTH_TOKEN", originalTwilioAuthToken);
  restoreEnvironmentVariable("TWILIO_PHONE_NUMBER", originalTwilioPhoneNumber);
  restoreEnvironmentVariable("SMS_CODE_ROUTER_ENABLED", originalSmsCodeRouterEnabled);
});

describe("Twilio incoming webhook validation", () => {
  it("rejects an invalid Twilio signature", async () => {
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    const request = new Request("https://example.test/webhooks/twilio/incoming", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "invalid-signature",
      },
      body: "From=%2B15551230000&To=%2B18449054257&Body=TEST&MessageSid=SM_invalid",
    });

    expect(await verifyTwilioRequestSignature(request, await request.text())).toBe(false);
  });

  it("requires the configured Twilio destination number", () => {
    expect(twilioDestinationMatchesConfiguredNumber("+1 (844) 905-4257", "+18449054257")).toBe(
      true,
    );
    expect(twilioDestinationMatchesConfiguredNumber("+18449050000", "+18449054257")).toBe(false);
    expect(twilioDestinationMatchesConfiguredNumber("+18449054257", undefined)).toBe(false);
  });

  it("gives Twilio Advanced Opt-Out precedence over message text", () => {
    expect(classifyTwilioComplianceMessage("event-code", "STOP")).toBe("opt_out");
    expect(classifyTwilioComplianceMessage("stop", "START")).toBe("opt_in");
    expect(classifyTwilioComplianceMessage("event-code", "HELP")).toBe("help");
    expect(classifyTwilioComplianceMessage("stop", undefined)).toBe("opt_out");
  });

  it("routes an event password even when the retired rollout flag is false", async () => {
    const twilioAuthToken = "test-auth-token";
    const twilioPhoneNumber = "+18449054257";
    const senderPhoneNumber = "+15551230015";
    process.env.TWILIO_AUTH_TOKEN = twilioAuthToken;
    process.env.TWILIO_PHONE_NUMBER = twilioPhoneNumber;
    process.env.SMS_CODE_ROUTER_ENABLED = "false";

    const testBackend = convexTest(schema, convexModules);
    testBackend.registerComponent(
      "rsvpAggregate",
      aggregateComponentSchema,
      aggregateComponentModules,
    );
    const eventId = await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      const createdEventId = await databaseContext.db.insert("events", {
        workspaceSlug: "club-chlorine",
        siteKey: "club-chlorine",
        name: "Always-on SMS event",
        location: "Le Bain",
        eventDate: now + 86_400_000,
        status: "active",
        lifecycle: "published",
        rsvpConfirmationMessageEnabled: false,
        createdAt: now,
        updatedAt: now,
      });
      await databaseContext.db.insert("listCredentials", {
        eventId: createdEventId,
        listKey: "ga",
        password: "ALWAYS",
        passwordNormalized: "always",
        createdAt: now,
      });
      await databaseContext.db.insert("users", {
        clerkUserId: "always_on_sms_user",
        phone: senderPhoneNumber,
        firstName: "Always",
        lastName: "Routed",
        createdAt: now,
        updatedAt: now,
      });
      return createdEventId;
    });

    const rawBody = new URLSearchParams({
      From: senderPhoneNumber,
      To: twilioPhoneNumber,
      Body: "ALWAYS",
      MessageSid: "SM_always_on_route",
    }).toString();
    const requestUrl = "https://some.convex.site/webhooks/twilio/incoming";
    const twilioSignature = await createTwilioSignature({
      requestUrl,
      rawBody,
      authToken: twilioAuthToken,
    });
    const response = await testBackend.fetch("/webhooks/twilio/incoming", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": twilioSignature,
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    const rsvp = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", eventId).eq("clerkUserId", "always_on_sms_user"),
        )
        .unique();
    });
    expect(rsvp?.listKey).toBe("ga");
  });
});
