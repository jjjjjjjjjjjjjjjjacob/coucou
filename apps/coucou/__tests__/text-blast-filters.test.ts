import { describe, expect, it } from "bun:test";
import {
  decodeRecipientFilter,
  describeRecipientFilter,
  encodeRecipientFilter,
  isRecipientFilterConfigured,
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

  it("encodes, decodes, describes, and validates previous-event RSVP exclusions", () => {
    const encodedFilter = encodeRecipientFilter({
      type: "previous_approved_not_rsvped",
      excludedEventId: "event_current",
    });

    expect(encodedFilter).toBe(
      JSON.stringify({
        type: "previous_approved_not_rsvped",
        excludedEventId: "event_current",
      }),
    );
    expect(decodeRecipientFilter(encodedFilter)).toEqual({
      type: "previous_approved_not_rsvped",
      excludedEventId: "event_current",
    });
    expect(
      describeRecipientFilter({
        type: "previous_approved_not_rsvped",
        excludedEventId: "event_current",
      }),
    ).toBe(
      "Approved RSVPs from the selected source events, excluding anyone who RSVP'd to the excluded event",
    );
    expect(
      isRecipientFilterConfigured({
        type: "previous_approved_not_rsvped",
        excludedEventId: "",
      }),
    ).toBe(false);
    expect(RECIPIENT_FILTER_LABELS.previous_approved_not_rsvped).toBe(
      "Approved previous RSVPs who have not RSVP'd to an event",
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

describe("guest directory filter state", () => {
  it("creates an unconfigured-free default state", async () => {
    const { createDefaultGuestDirectoryFilterState, isGuestDirectoryFilterConfigured } =
      await import("../lib/text-blast-filters");
    const defaultState = createDefaultGuestDirectoryFilterState();
    expect(defaultState.recipientFilter).toEqual({ type: "all" });
    expect(defaultState.recipientHistoryFilter).toEqual({ type: "none", textBlastIds: [] });
    expect(defaultState.sortBy).toBe("latestRsvpAt");
    expect(isGuestDirectoryFilterConfigured(defaultState)).toBe(true);
  });

  it("encodes only active filters into query args", async () => {
    const { createDefaultGuestDirectoryFilterState, encodeGuestDirectoryFilterArgs } = await import(
      "../lib/text-blast-filters"
    );
    const defaultEncoded = encodeGuestDirectoryFilterArgs(createDefaultGuestDirectoryFilterState());
    expect(defaultEncoded.searchText).toBeUndefined();
    expect(defaultEncoded.eventIds).toBeUndefined();
    expect(defaultEncoded.recipientFilter).toBeUndefined();
    expect(defaultEncoded.recipientHistoryFilter).toBeUndefined();
    expect(defaultEncoded.smsConsentFilter).toBeUndefined();
    expect(defaultEncoded.tags).toBeUndefined();
    expect(defaultEncoded.rsvpedToLatestEvent).toBeUndefined();
    expect(defaultEncoded.sortBy).toBe("latestRsvpAt");
    expect(defaultEncoded.sortDirection).toBe("desc");

    const activeEncoded = encodeGuestDirectoryFilterArgs({
      ...createDefaultGuestDirectoryFilterState(),
      searchText: "  casey  ",
      eventIds: ["event_1"],
      recipientFilter: { type: "status", status: "pending" },
      recipientHistoryFilter: { type: "received_any", textBlastIds: ["blast_1"] },
      smsConsentFilter: "consented",
      tags: ["vip"],
      defaultListKeys: ["ga"],
      rsvpedToLatestEvent: "no",
    });
    expect(activeEncoded.searchText).toBe("casey");
    expect(activeEncoded.eventIds).toEqual(["event_1"]);
    expect(activeEncoded.recipientFilter).toBe(
      JSON.stringify({ type: "status", status: "pending" }),
    );
    expect(activeEncoded.recipientHistoryFilter).toEqual({
      type: "received_any",
      textBlastIds: ["blast_1"],
    });
    expect(activeEncoded.smsConsentFilter).toBe("consented");
    expect(activeEncoded.tags).toEqual(["vip"]);
    expect(activeEncoded.defaultListKeys).toEqual(["ga"]);
    expect(activeEncoded.rsvpedToLatestEvent).toBe("no");
  });

  it("omits an unconfigured history filter and counts active filters", async () => {
    const {
      countActiveGuestDirectoryFilters,
      createDefaultGuestDirectoryFilterState,
      encodeGuestDirectoryFilterArgs,
      isGuestDirectoryFilterConfigured,
    } = await import("../lib/text-blast-filters");

    const partialHistoryState = {
      ...createDefaultGuestDirectoryFilterState(),
      recipientHistoryFilter: { type: "received_any" as const, textBlastIds: [] },
    };
    expect(isGuestDirectoryFilterConfigured(partialHistoryState)).toBe(false);
    expect(
      encodeGuestDirectoryFilterArgs(partialHistoryState).recipientHistoryFilter,
    ).toBeUndefined();

    expect(countActiveGuestDirectoryFilters(createDefaultGuestDirectoryFilterState())).toBe(0);
    expect(
      countActiveGuestDirectoryFilters({
        ...createDefaultGuestDirectoryFilterState(),
        tags: ["vip"],
        smsConsentFilter: "not_consented",
      }),
    ).toBe(2);
  });
});
