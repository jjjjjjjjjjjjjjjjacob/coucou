export type RawRsvpStatus =
  | "pending"
  | "approved"
  | "denied"
  | "attending";

export type ApprovalStatus = "pending" | "approved" | "denied";

export type ApprovalFilter = ApprovalStatus | "all";

export const ALL_RAW_RSVP_STATUSES: readonly RawRsvpStatus[] = [
  "pending",
  "approved",
  "attending",
  "denied",
];

export function deriveApprovalStatus(
  rawStatus: string | undefined,
): ApprovalStatus {
  if (rawStatus === "approved" || rawStatus === "attending") {
    return "approved";
  }

  if (rawStatus === "denied") {
    return "denied";
  }

  return "pending";
}

export function getRawStatusesForApprovalFilter(
  approvalFilter: ApprovalFilter,
): readonly RawRsvpStatus[] {
  switch (approvalFilter) {
    case "approved":
      return ["approved", "attending"];
    case "denied":
      return ["denied"];
    case "pending":
      return ["pending"];
    case "all":
    default:
      return ALL_RAW_RSVP_STATUSES;
  }
}

export function matchesApprovalFilter(
  rawStatus: string | undefined,
  approvalFilter: ApprovalFilter,
): boolean {
  if (approvalFilter === "all") {
    return true;
  }

  return getRawStatusesForApprovalFilter(approvalFilter).includes(
    rawStatus as RawRsvpStatus,
  );
}

export function hasApprovedRsvpStatus(
  rawStatus: string | undefined,
): boolean {
  return deriveApprovalStatus(rawStatus) === "approved";
}

export function canManuallyEditTicket(
  rawStatus: string | undefined,
): boolean {
  return rawStatus === "approved" || rawStatus === "attending";
}
