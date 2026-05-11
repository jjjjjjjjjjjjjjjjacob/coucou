export type ApprovalStatus = "pending" | "approved" | "denied";

export type ApprovalFilter = ApprovalStatus | "all";

export type LegacyRsvpStatus = ApprovalStatus | "attending";

export type AttendanceStatus = "yes" | "no" | "maybe";

export const ALL_APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "approved", "denied"];

export const ALL_LEGACY_RSVP_STATUSES: readonly LegacyRsvpStatus[] = [
  "pending",
  "approved",
  "attending",
  "denied",
];

export const ALL_ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ["yes", "no", "maybe"];

export type RsvpStatusSource = {
  approvalStatus?: string;
  status?: string;
};

export function deriveApprovalStatus(rawStatus: string | undefined): ApprovalStatus {
  if (rawStatus === "approved" || rawStatus === "attending") {
    return "approved";
  }

  if (rawStatus === "denied") {
    return "denied";
  }

  return "pending";
}

export function sanitizeApprovalStatus(status: string | undefined): ApprovalStatus {
  return ALL_APPROVAL_STATUSES.includes(status as ApprovalStatus)
    ? (status as ApprovalStatus)
    : "pending";
}

export function resolveApprovalStatus(source: RsvpStatusSource): ApprovalStatus {
  return source.approvalStatus !== undefined
    ? sanitizeApprovalStatus(source.approvalStatus)
    : deriveApprovalStatus(source.status);
}

export function sanitizeAttendanceStatus(status: string | undefined): AttendanceStatus {
  return ALL_ATTENDANCE_STATUSES.includes(status as AttendanceStatus)
    ? (status as AttendanceStatus)
    : "yes";
}

export function getRawStatusesForApprovalFilter(
  approvalFilter: ApprovalFilter,
): readonly LegacyRsvpStatus[] {
  switch (approvalFilter) {
    case "approved":
      return ["approved", "attending"];
    case "denied":
      return ["denied"];
    case "pending":
      return ["pending"];
    case "all":
    default:
      return ALL_LEGACY_RSVP_STATUSES;
  }
}

export function matchesApprovalFilter(
  statusSource: string | undefined | RsvpStatusSource,
  approvalFilter: ApprovalFilter,
): boolean {
  if (approvalFilter === "all") {
    return true;
  }

  const approvalStatus =
    typeof statusSource === "object"
      ? resolveApprovalStatus(statusSource)
      : deriveApprovalStatus(statusSource);

  return approvalStatus === approvalFilter;
}

export function hasApprovedRsvpStatus(
  statusSource: string | undefined | RsvpStatusSource,
): boolean {
  if (typeof statusSource === "object") {
    return resolveApprovalStatus(statusSource) === "approved";
  }

  return deriveApprovalStatus(statusSource) === "approved";
}

export function canManuallyEditTicket(
  statusSource: string | undefined | RsvpStatusSource,
): boolean {
  return hasApprovedRsvpStatus(statusSource);
}
