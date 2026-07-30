import { api } from "@coucou/backend/api";
import type { FunctionReturnType } from "convex/server";

export type StaffBootstrap = FunctionReturnType<typeof api.mobileStaff.getBootstrap>;
export type StaffWorkspace = StaffBootstrap["workspaces"][number];
export type StaffEventSummary = FunctionReturnType<typeof api.mobileStaff.listEvents>[number];
export type StaffGuestPage = FunctionReturnType<typeof api.mobileStaff.listGuests>;
export type StaffGuestSummary = StaffGuestPage["page"][number];
export type StaffScanOutcome = FunctionReturnType<typeof api.mobileStaff.scanTicket>;

export type ApprovalFilter = "all" | "pending" | "approved" | "denied";
export type AttendanceFilter = "all" | "yes" | "no" | "maybe";
export type TicketFilter = "all" | "not-issued" | "issued" | "disabled" | "redeemed";

export interface StaffGuestFilters {
  approval: ApprovalFilter;
  attendance: AttendanceFilter;
  list: string;
  ticket: TicketFilter;
}

export interface CachedGuestSnapshot {
  version: 1;
  workspaceId: string;
  eventId: string;
  storedAt: number;
  expiresAt: number;
  guests: StaffGuestSummary[];
}
