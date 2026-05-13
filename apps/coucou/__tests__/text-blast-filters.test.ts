import { describe, expect, it } from "bun:test";
import {
  decodeRecipientFilter,
  describeRecipientFilter,
  encodeRecipientFilter,
  RECIPIENT_FILTER_LABELS,
  type RecipientHistoryFilterState,
  recipientHistoryFilterIsConfigured,
} from "../lib/text-blast-filters";
import {
  messageContainsMultiEventRestrictedVariables,
  messageContainsQrCodeUrlVariable,
  replaceQrCodeUrlVariable,
  resolveEffectiveIncludeQrCodes,
} from "../lib/text-blast-message";

describe("text blast filters", () => {
  it("requires selected tracked blasts for history filters", () => {
    const noHistoryFilter: RecipientHistoryFilterState = { type: "none", textBlastIds: [] };
    const emptyReceivedFilter: RecipientHistoryFilterState = {
      type: "received_any",
      textBlastIds: [],
    };
    const configuredNotReceivedFilter: RecipientHistoryFilterState = {
      type: "not_received_any",
      textBlastIds: ["blast_123"],
    };

    expect(recipientHistoryFilterIsConfigured(noHistoryFilter)).toBe(true);
    expect(recipientHistoryFilterIsConfigured(emptyReceivedFilter)).toBe(false);
    expect(recipientHistoryFilterIsConfigured(configuredNotReceivedFilter)).toBe(true);
  });

  it("encodes, decodes, and describes approved recipients with approval SMS sent", () => {
    const encodedFilter = encodeRecipientFilter({ type: "approved_with_approval_sms" });

    expect(encodedFilter).toBe("approved_with_approval_sms");
    expect(decodeRecipientFilter(encodedFilter)).toEqual({ type: "approved_with_approval_sms" });
    expect(decodeRecipientFilter(JSON.stringify({ type: "approved_with_approval_sms" }))).toEqual({
      type: "approved_with_approval_sms",
    });
    expect(describeRecipientFilter({ type: "approved_with_approval_sms" })).toBe(
      "Approved RSVPs with an approval SMS",
    );
    expect(RECIPIENT_FILTER_LABELS.approved_with_approval_sms).toBe(
      "Approved with Approval SMS Sent",
    );
  });

  it("forces QR delivery for single-event messages with the QR code URL variable", () => {
    const message = "Show this at the door: {{ qrCodeUrl }}";

    expect(messageContainsQrCodeUrlVariable(message)).toBe(true);
    expect(messageContainsMultiEventRestrictedVariables(message)).toBe(true);
    expect(
      resolveEffectiveIncludeQrCodes({
        isMultiEventBlast: false,
        includeQrCodes: false,
        message,
      }),
    ).toBe(true);
    expect(
      resolveEffectiveIncludeQrCodes({
        isMultiEventBlast: true,
        includeQrCodes: false,
        message,
      }),
    ).toBe(false);
    expect(replaceQrCodeUrlVariable(message, "https://example.com/ticket")).toBe(
      "Show this at the door: https://example.com/ticket",
    );
  });
});
