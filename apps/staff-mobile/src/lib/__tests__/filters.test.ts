import type { StaffGuestSummary } from "@/types";
import { guestMatchesFilters, serializeGuestFilters } from "../filters";

const guest = {
  approvalStatus: "approved",
  attendanceStatus: "yes",
  attendees: 2,
  contact: "••• 0199",
  createdAt: 1,
  entryStatus: "not_checked_in",
  listKey: "friends",
  name: "Avery Chen",
  rsvpId: "rsvp_1",
  ticketStatus: "issued",
  updatedAt: 1,
} as StaffGuestSummary;

describe("guest filters", () => {
  it("serializes every filter deterministically", () => {
    expect(
      serializeGuestFilters({
        approval: "approved",
        attendance: "yes",
        list: "friends & family",
        ticket: "issued",
      }),
    ).toBe("approval=approved&attendance=yes&list=friends%20%26%20family&ticket=issued");
  });

  it("searches names and authorized obfuscated contact values", () => {
    const filters = {
      approval: "all",
      attendance: "all",
      list: "all",
      ticket: "all",
    } as const;
    expect(guestMatchesFilters(guest, "avery", filters)).toBe(true);
    expect(guestMatchesFilters(guest, "0199", filters)).toBe(true);
    expect(guestMatchesFilters(guest, "unlisted", filters)).toBe(false);
  });
});
