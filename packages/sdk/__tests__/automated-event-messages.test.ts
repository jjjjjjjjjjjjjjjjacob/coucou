import { describe, expect, it } from "bun:test";
import {
  getDefaultQrDeliveryMessage,
  resolveQrDeliveryMessage,
  resolveSmsOptInConfirmationMessage,
  resolveSmsOptOutConfirmationMessage,
  sanitizeOptionalAutomatedEventMessage,
} from "../src/shared/automated-event-messages";

describe("automated event messages", () => {
  it("provides compliant subscription defaults", () => {
    expect(resolveSmsOptInConfirmationMessage({}, "Dojo")).toContain(
      "Reply HELP for help or STOP to opt out.",
    );
    expect(resolveSmsOptOutConfirmationMessage({}, "Dojo")).toBe(
      "You have been unsubscribed and will receive no more Dojo messages. Reply START to resubscribe.",
    );
  });

  it("prefers trimmed custom templates and falls back for blank values", () => {
    expect(
      resolveSmsOptInConfirmationMessage(
        { smsOptInConfirmationMessage: "  Custom subscribed copy  " },
        "Dojo",
      ),
    ).toBe("Custom subscribed copy");
    expect(resolveQrDeliveryMessage({ qrDeliveryMessage: "   " })).toBe(
      getDefaultQrDeliveryMessage(),
    );
    expect(sanitizeOptionalAutomatedEventMessage("  Ticket ready  ")).toBe("Ticket ready");
  });
});
