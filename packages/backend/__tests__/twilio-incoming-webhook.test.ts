import { afterEach, describe, expect, it } from "bun:test";
import {
  classifyTwilioComplianceMessage,
  twilioDestinationMatchesConfiguredNumber,
  verifyTwilioRequestSignature,
} from "../convex/webhooks";

const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

afterEach(() => {
  if (originalTwilioAuthToken === undefined) {
    delete process.env.TWILIO_AUTH_TOKEN;
  } else {
    process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
  }
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
});
