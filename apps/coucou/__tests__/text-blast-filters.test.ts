import { describe, expect, it } from "bun:test";
import {
  type RecipientHistoryFilterState,
  recipientHistoryFilterIsConfigured,
} from "../lib/text-blast-filters";

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
});
