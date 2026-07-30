import type { StaffGuestFilters, StaffGuestSummary } from "@/types";

export const DEFAULT_GUEST_FILTERS: StaffGuestFilters = {
  approval: "all",
  attendance: "all",
  list: "all",
  ticket: "all",
};

export function serializeGuestFilters(filters: StaffGuestFilters): string {
  return [
    `approval=${filters.approval}`,
    `attendance=${filters.attendance}`,
    `list=${encodeURIComponent(filters.list)}`,
    `ticket=${filters.ticket}`,
  ].join("&");
}

export function guestMatchesFilters(
  guest: StaffGuestSummary,
  search: string,
  filters: StaffGuestFilters,
): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matchesSearch =
    !normalizedSearch ||
    `${guest.name} ${guest.contact ?? ""}`.toLocaleLowerCase().includes(normalizedSearch);

  return (
    matchesSearch &&
    (filters.approval === "all" || guest.approvalStatus === filters.approval) &&
    (filters.attendance === "all" || guest.attendanceStatus === filters.attendance) &&
    (filters.list === "all" || guest.listKey === filters.list) &&
    (filters.ticket === "all" || guest.ticketStatus === filters.ticket)
  );
}
