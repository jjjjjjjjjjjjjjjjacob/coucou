import { describe, expect, it } from "bun:test";
import {
  readContactDirectoryFilters,
  writeContactDirectoryFilters,
} from "../lib/contact-directory-url";
import {
  createDefaultGuestDirectoryFilterState,
  isGuestDirectoryFilterConfigured,
} from "../lib/text-blast-filters";

describe("contact directory URL state", () => {
  it("round-trips combined filters and sorting without dropping unrelated route state", () => {
    const filters = {
      ...createDefaultGuestDirectoryFilterState(),
      searchText: "+1 (415) 555",
      eventIds: ["event_1", "event_2"],
      listKeys: ["vip"],
      tags: ["friend"],
      defaultListKeys: ["main"],
      smsConsentFilter: "consented" as const,
      recipientFilter: { type: "status" as const, status: "pending" as const },
      recipientHistoryFilter: { type: "received_any" as const, textBlastIds: ["blast_1"] },
      sortBy: "eventCount" as const,
      sortDirection: "desc" as const,
    };
    const parameters = new URLSearchParams("guest=guest_1");
    writeContactDirectoryFilters(parameters, filters);
    expect(readContactDirectoryFilters(parameters)).toEqual(filters);
    expect(parameters.get("guest")).toBe("guest_1");
  });
  it("retains incomplete filters and defaults to name ascending", () => {
    const parameters = new URLSearchParams();
    expect(readContactDirectoryFilters(parameters)).toMatchObject({
      sortBy: "name",
      sortDirection: "asc",
    });
    writeContactDirectoryFilters(parameters, {
      ...createDefaultGuestDirectoryFilterState(),
      recipientFilter: { type: "custom_field_missing", fieldKey: "" },
    });
    expect(isGuestDirectoryFilterConfigured(readContactDirectoryFilters(parameters))).toBe(false);
    expect(readContactDirectoryFilters(parameters).recipientFilter.type).toBe(
      "custom_field_missing",
    );
  });
});
