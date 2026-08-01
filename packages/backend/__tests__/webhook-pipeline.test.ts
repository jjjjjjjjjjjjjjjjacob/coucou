import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { decryptWebhookEnvelope, verifyWebhookSignatureHeader } from "../convex/lib/webhookCrypto";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/events.ts": () => import("../convex/events"),
  "../convex/notifications.ts": () => import("../convex/notifications"),
  "../convex/rsvps.ts": () => import("../convex/rsvps"),
  "../convex/webhookDeliveries.ts": () => import("../convex/webhookDeliveries"),
  "../convex/webhookDispatch.ts": () => import("../convex/webhookDispatch"),
  "../convex/webhookEndpoints.ts": () => import("../convex/webhookEndpoints"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

const aggregateComponentModules = {
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js"),
};

const WORKSPACE_SLUG = "dojo-pomodoro";
const SITE_KEY = "dojo";
const CLERK_ORGANIZATION_ID = "org_dojo";
const ENDPOINT_URL = "https://consumer.example.com/webhooks/coucou";

type TestBackend = ReturnType<typeof convexTest>;

interface CapturedWebhookRequest {
  url: string;
  headers: Record<string, string>;
  rawBody: string;
}

let capturedWebhookRequests: CapturedWebhookRequest[] = [];
let webhookResponseStatus = 200;
const originalFetch = globalThis.fetch;
let previousDevTwilioEnabled: string | undefined;

beforeEach(() => {
  capturedWebhookRequests = [];
  webhookResponseStatus = 200;
  // Approval flows schedule notifications:sendApprovalSms, which throws when
  // Twilio env vars are absent (CI). Disable the Twilio path so scheduled
  // drains stay deterministic regardless of environment.
  previousDevTwilioEnabled = process.env.DEV_TWILIO_ENABLED;
  process.env.DEV_TWILIO_ENABLED = "false";
  vi.useFakeTimers();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://consumer.example.com/")) {
      capturedWebhookRequests.push({
        url,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        rawBody: String(init?.body ?? ""),
      });
      return new Response("", { status: webhookResponseStatus });
    }
    return originalFetch(input as never, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousDevTwilioEnabled === undefined) {
    delete process.env.DEV_TWILIO_ENABLED;
  } else {
    process.env.DEV_TWILIO_ENABLED = previousDevTwilioEnabled;
  }
  // Discard any timers a test left behind — a leaked scheduled-function
  // timer firing during a later test runs against a torn-down convex-test
  // instance and corrupts its global function stack.
  vi.clearAllTimers();
  vi.useRealTimers();
});

function setupTestBackend(): TestBackend {
  const testBackend = convexTest(schema, convexModules);
  testBackend.registerComponent(
    "rsvpAggregate",
    aggregateComponentSchema,
    aggregateComponentModules,
  );
  return testBackend;
}

function createHostIdentity(subject: string): Partial<UserIdentity> {
  return {
    subject,
    org_id: CLERK_ORGANIZATION_ID,
    role: "org:admin",
  } as unknown as Partial<UserIdentity>;
}

// Yield real macrotasks so a just-fired scheduled function can progress
// through its async work (dynamic module imports, db writes) before the
// drain loop inspects state. setImmediate is not covered by bun's fake
// timers, so this settles without advancing the fake clock.
async function settleAsyncWork() {
  for (let yieldIteration = 0; yieldIteration < 20; yieldIteration++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function drainScheduledFunctions(testBackend: TestBackend) {
  // Advance ONE timer per iteration instead of vi.runAllTimers: firing every
  // pending timer at once runs scheduled functions concurrently, and
  // convex-test's global function stack then resolves a function's module
  // against whichever component happens to be executing (e.g. the
  // rsvpAggregate component), throwing "Could not find module". Stepping a
  // single timer keeps scheduled functions serialized. The fake-timer count
  // is the loop condition — a scheduled follow-up (webhook retry) registers
  // a new timer before the previous one settles out of it.
  for (let drainIteration = 0; drainIteration < 500; drainIteration++) {
    await settleAsyncWork();
    await testBackend.finishInProgressScheduledFunctions();
    await settleAsyncWork();
    if (vi.getTimerCount() === 0) {
      return;
    }
    vi.advanceTimersToNextTimer();
  }
  throw new Error("drainScheduledFunctions: too many iterations");
}

async function seedWorkspace(testBackend: TestBackend) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("workspaces", {
      slug: WORKSPACE_SLUG,
      name: "Dojo Pomodoro",
      clerkOrganizationId: CLERK_ORGANIZATION_ID,
      clerkOrganizationSlug: WORKSPACE_SLUG,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedEvent(
  testBackend: TestBackend,
  overrides: Record<string, unknown> = {},
): Promise<Id<"events">> {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("events", {
      workspaceSlug: WORKSPACE_SLUG,
      siteKey: SITE_KEY,
      shortId: "evt-webhooks",
      name: "Webhook Event",
      location: "Main Room",
      eventDate: Date.now() + 86_400_000,
      status: "active",
      lifecycle: "published",
      maxAttendees: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    });
  });
}

async function createEndpoint(
  testBackend: TestBackend,
  subscribedEventTypes: string[],
  eventAccess: {
    eventAccessMode: "all" | "selected";
    allowedEventIds?: Id<"events">[];
  } = { eventAccessMode: "all" },
): Promise<{
  endpointId: Id<"webhookEndpoints">;
  encryptionSecretBase64: string;
  signingSecretBase64: string;
}> {
  const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));
  const created = await hostBackend.mutation(api.webhookEndpoints.create, {
    workspaceSlug: WORKSPACE_SLUG,
    url: ENDPOINT_URL,
    subscribedEventTypes,
    eventAccessMode: eventAccess.eventAccessMode,
    allowedEventIds: eventAccess.allowedEventIds,
  });
  return {
    endpointId: created.endpointId,
    encryptionSecretBase64: created.encryptionSecretBase64,
    signingSecretBase64: created.signingSecretBase64,
  };
}

async function submitGuestRsvp(testBackend: TestBackend, eventId: Id<"events">, phone: string) {
  return await testBackend.mutation(api.rsvps.submitGuestRequest, {
    eventId,
    siteKey: SITE_KEY,
    listKey: "ga",
    firstName: "Ava",
    lastName: "Green",
    phone,
    shareContact: true,
    attendees: 1,
    customFields: {},
    socialProfiles: [],
  });
}

async function decryptCapturedRequest(
  capturedRequest: CapturedWebhookRequest,
  encryptionSecretBase64: string,
) {
  const envelope = JSON.parse(capturedRequest.rawBody);
  const payloadJson = await decryptWebhookEnvelope(envelope, encryptionSecretBase64);
  return { envelope, payload: JSON.parse(payloadJson) };
}

describe("webhook pipeline", () => {
  it("delivers an encrypted, signed rsvp.created payload for a guest RSVP", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const endpoint = await createEndpoint(testBackend, ["rsvp.created", "rsvp.approved"]);

    await submitGuestRsvp(testBackend, eventId, "(310) 499-6272");
    await drainScheduledFunctions(testBackend);

    expect(capturedWebhookRequests).toHaveLength(1);
    const capturedRequest = capturedWebhookRequests[0];
    expect(capturedRequest.url).toBe(ENDPOINT_URL);
    expect(capturedRequest.headers["x-coucou-event-type"]).toBe("rsvp.created");
    expect(capturedRequest.headers["x-coucou-key-generation"]).toBe("1");
    expect(capturedRequest.headers["x-coucou-delivery-id"]).toBeTruthy();

    // The raw body must never contain plaintext PII.
    expect(capturedRequest.rawBody).not.toContain("310");
    expect(capturedRequest.rawBody).not.toContain("Ava");

    const signatureIsValid = await verifyWebhookSignatureHeader({
      rawBody: capturedRequest.rawBody,
      signatureHeader: capturedRequest.headers["x-coucou-signature"],
      signingSecretBase64: endpoint.signingSecretBase64,
      nowSeconds: Math.floor(Date.now() / 1000),
      toleranceSeconds: 300,
    });
    expect(signatureIsValid).toBe(true);

    const { payload } = await decryptCapturedRequest(
      capturedRequest,
      endpoint.encryptionSecretBase64,
    );
    expect(payload.eventType).toBe("rsvp.created");
    expect(payload.deliveryId).toBe(capturedRequest.headers["x-coucou-delivery-id"]);
    expect(payload.workspaceSlug).toBe(WORKSPACE_SLUG);
    expect(payload.data.identity.phone).toBe("+13104996272");
    expect(payload.data.identity.isGuest).toBe(true);
    expect(payload.data.identity.name).toBe("Ava Green");
    expect(payload.data.rsvp.approvalStatus).toBe("pending");
    expect(payload.data.origin.type).toBe("app");
    expect(payload.data.event.name).toBe("Webhook Event");

    const delivery = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("webhookDeliveries")
        .withIndex("by_endpoint", (queryBuilder) =>
          queryBuilder.eq("endpointId", endpoint.endpointId),
        )
        .unique();
    });
    expect(delivery?.status).toBe("success");
    expect(delivery?.attemptCount).toBe(1);
  });

  it("delivers rsvp.approved on bulk approval", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const endpoint = await createEndpoint(testBackend, ["rsvp.approved"]);

    const submissionResult = await submitGuestRsvp(testBackend, eventId, "(310) 499-6272");
    await drainScheduledFunctions(testBackend);
    expect(capturedWebhookRequests).toHaveLength(0); // not subscribed to rsvp.created

    const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));
    await hostBackend.mutation(api.rsvps.bulkUpdateApproval, {
      workspaceSlug: WORKSPACE_SLUG,
      updates: [{ rsvpId: submissionResult.rsvpId, approvalStatus: "approved" }],
    });
    await drainScheduledFunctions(testBackend);

    expect(capturedWebhookRequests).toHaveLength(1);
    const { payload } = await decryptCapturedRequest(
      capturedWebhookRequests[0],
      endpoint.encryptionSecretBase64,
    );
    expect(payload.eventType).toBe("rsvp.approved");
    expect(payload.data.changes.previousApprovalStatus).toBe("pending");
    expect(payload.data.origin.type).toBe("app");
    expect(payload.data.ticket.status).toBe("issued");
    expect(payload.data.ticket.redemptionCode).toBeTruthy();
    expect(payload.data.ticket.qrEnabled).toBe(false);
  });

  it("delivers event.updated and event.unpublished for event changes", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const endpoint = await createEndpoint(testBackend, ["event.updated", "event.unpublished"]);

    const newEventDate = Date.now() + 2 * 86_400_000;
    const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));
    await hostBackend.mutation(api.events.update, {
      eventId,
      workspaceSlug: WORKSPACE_SLUG,
      eventDate: newEventDate,
    });
    await drainScheduledFunctions(testBackend);

    expect(capturedWebhookRequests).toHaveLength(1);
    const { payload } = await decryptCapturedRequest(
      capturedWebhookRequests[0],
      endpoint.encryptionSecretBase64,
    );
    expect(payload.eventType).toBe("event.updated");
    expect(payload.data.event.eventDate).toBe(newEventDate);
    expect(payload.data.changes.changedFields).toContain("eventDate");

    await hostBackend.mutation(api.events.unpublishEvent, {
      eventId,
      workspaceSlug: WORKSPACE_SLUG,
    });
    await drainScheduledFunctions(testBackend);

    expect(capturedWebhookRequests).toHaveLength(2);
    const { payload: unpublishPayload } = await decryptCapturedRequest(
      capturedWebhookRequests[1],
      endpoint.encryptionSecretBase64,
    );
    expect(unpublishPayload.eventType).toBe("event.unpublished");
  });

  it("does not deliver to inactive endpoints and skips unsubscribed types", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const endpoint = await createEndpoint(testBackend, ["rsvp.created"]);

    const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));
    await hostBackend.mutation(api.webhookEndpoints.update, {
      workspaceSlug: WORKSPACE_SLUG,
      endpointId: endpoint.endpointId,
      isActive: false,
    });

    await submitGuestRsvp(testBackend, eventId, "(310) 499-6272");
    await drainScheduledFunctions(testBackend);
    expect(capturedWebhookRequests).toHaveLength(0);
  });

  it("delivers only granted events and preserves event.deleted for a granted event", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const grantedEventId = await seedEvent(testBackend, { shortId: "evt-webhook-granted" });
    const ungrantedEventId = await seedEvent(testBackend, {
      shortId: "evt-webhook-ungranted",
    });
    const endpoint = await createEndpoint(testBackend, ["rsvp.created", "event.deleted"], {
      eventAccessMode: "selected",
      allowedEventIds: [grantedEventId],
    });

    await submitGuestRsvp(testBackend, grantedEventId, "+15551238881");
    await submitGuestRsvp(testBackend, ungrantedEventId, "+15551238882");
    await drainScheduledFunctions(testBackend);
    expect(capturedWebhookRequests).toHaveLength(1);

    const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));
    await hostBackend.mutation(api.events.remove, {
      eventId: grantedEventId,
      workspaceSlug: WORKSPACE_SLUG,
    });
    await drainScheduledFunctions(testBackend);
    expect(capturedWebhookRequests).toHaveLength(2);
    const { payload } = await decryptCapturedRequest(
      capturedWebhookRequests[1],
      endpoint.encryptionSecretBase64,
    );
    expect(payload.eventType).toBe("event.deleted");
    expect(payload.data.event.id).toBe(grantedEventId);
  });

  it("re-checks event access before delivering a queued attempt", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const initiallyGrantedEventId = await seedEvent(testBackend, {
      shortId: "evt-webhook-revoked",
    });
    const replacementEventId = await seedEvent(testBackend, {
      shortId: "evt-webhook-replacement",
    });
    const endpoint = await createEndpoint(testBackend, ["rsvp.created"], {
      eventAccessMode: "selected",
      allowedEventIds: [initiallyGrantedEventId],
    });
    await submitGuestRsvp(testBackend, initiallyGrantedEventId, "+15551238883");

    const pendingDelivery = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.query("webhookDeliveries").unique();
    });
    if (!pendingDelivery) throw new Error("Expected a pending webhook delivery");

    const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));
    await hostBackend.mutation(api.webhookEndpoints.updateEventAccess, {
      workspaceSlug: WORKSPACE_SLUG,
      endpointId: endpoint.endpointId,
      eventAccessMode: "selected",
      allowedEventIds: [replacementEventId],
    });
    await testBackend.action(internal.webhookDispatch.attemptDelivery, {
      deliveryId: pendingDelivery._id,
    });

    expect(capturedWebhookRequests).toHaveLength(0);
    const skippedDelivery = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.get(pendingDelivery._id);
    });
    expect(skippedDelivery?.status).toBe("skipped_inactive");
  });

  it("retries failed deliveries with backoff and marks them exhausted", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const endpoint = await createEndpoint(testBackend, ["rsvp.created"]);
    webhookResponseStatus = 500;

    await submitGuestRsvp(testBackend, eventId, "(310) 499-6272");

    const pendingDelivery = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("webhookDeliveries")
        .withIndex("by_endpoint", (queryBuilder) =>
          queryBuilder.eq("endpointId", endpoint.endpointId),
        )
        .unique();
    });
    if (!pendingDelivery) throw new Error("expected the emission to create a pending delivery");

    // Drive the retry chain by invoking attemptDelivery directly instead of
    // advancing fake timers through the drain: each recordDeliveryAttempt
    // still schedules its follow-up via the scheduler (timers are discarded
    // in afterEach), but direct invocation keeps the attempts serialized —
    // timer-driven draining of this chain deadlocked convex-test's global
    // function stack on CI. The 7th invocation must no-op because the
    // delivery is already exhausted.
    for (let attemptIndex = 0; attemptIndex < 7; attemptIndex++) {
      await testBackend.action(internal.webhookDispatch.attemptDelivery, {
        deliveryId: pendingDelivery._id,
      });
    }

    // 1 initial attempt + 5 retries
    expect(capturedWebhookRequests).toHaveLength(6);
    const delivery = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("webhookDeliveries")
        .withIndex("by_endpoint", (queryBuilder) =>
          queryBuilder.eq("endpointId", endpoint.endpointId),
        )
        .unique();
    });
    expect(delivery?.status).toBe("exhausted");
    expect(delivery?.attemptCount).toBe(6);
    expect(delivery?.lastResponseStatus).toBe(500);

    const endpointDocument = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.get(endpoint.endpointId);
    });
    expect(endpointDocument?.consecutiveFailureCount).toBe(1);
    expect(endpointDocument?.isActive).toBe(true);
  });

  it("auto-disables an endpoint after sustained failures", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const endpoint = await createEndpoint(testBackend, ["rsvp.created"]);

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(endpoint.endpointId, { consecutiveFailureCount: 9 });
    });

    const deliveryId = await testBackend.run(async (databaseContext) => {
      const endpointDocument = await databaseContext.db.get(endpoint.endpointId);
      if (!endpointDocument) throw new Error("endpoint missing");
      return await databaseContext.db.insert("webhookDeliveries", {
        endpointId: endpoint.endpointId,
        workspaceId: endpointDocument.workspaceId,
        eventType: "rsvp.created",
        payloadJson: "{}",
        status: "pending",
        attemptCount: 5, // next failure exhausts the delivery
        occurredAt: Date.now(),
      });
    });

    await testBackend.mutation(internal.webhookDeliveries.recordDeliveryAttempt, {
      deliveryId,
      responseStatus: 500,
      errorMessage: "HTTP 500",
    });

    const endpointDocument = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.get(endpoint.endpointId);
    });
    expect(endpointDocument?.isActive).toBe(false);
    expect(endpointDocument?.disabledReason).toBe("auto_failure");
    expect(endpointDocument?.consecutiveFailureCount).toBe(10);
  });
});
