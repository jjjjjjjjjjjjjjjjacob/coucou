export type RecipientApprovalStatus = "pending" | "approved" | "denied";

export type RecipientFilterType =
  | "all"
  | "approved_no_approval_sms"
  | "approved_with_approval_sms"
  | "status"
  | "custom_field_missing"
  | "rsvp_before"
  | "previous_approved_not_rsvped";

export type RecipientFilterState =
  | { type: "all" }
  | { type: "approved_no_approval_sms" }
  | { type: "approved_with_approval_sms" }
  | { type: "status"; status: RecipientApprovalStatus }
  | { type: "custom_field_missing"; fieldKey: string }
  | { type: "rsvp_before"; isoDateTime: string }
  | { type: "previous_approved_not_rsvped"; excludedEventId: string };

export type RecipientHistoryFilterState =
  | { type: "none"; textBlastIds: [] }
  | { type: "received_any"; textBlastIds: string[] }
  | { type: "not_received_any"; textBlastIds: string[] };

export const DEFAULT_STATUS_FILTER: RecipientApprovalStatus = "pending";

export const RECIPIENT_FILTER_LABELS: Record<RecipientFilterType, string> = {
  all: "All Approved",
  approved_no_approval_sms: "Approved but No Approval SMS Sent",
  approved_with_approval_sms: "Approved with Approval SMS Sent",
  status: "Filter by RSVP Status",
  custom_field_missing: "Missing Custom Field",
  rsvp_before: "RSVP Before Date/Time",
  previous_approved_not_rsvped: "Approved previous RSVPs who have not RSVP'd to an event",
};

const toDateTimeLocalString = (timestamp: number): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value: number) => value.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const encodeRecipientFilter = (state: RecipientFilterState): string | undefined => {
  switch (state.type) {
    case "all":
      return undefined;
    case "approved_no_approval_sms":
      return "approved_no_approval_sms";
    case "approved_with_approval_sms":
      return "approved_with_approval_sms";
    case "status":
      return JSON.stringify({ type: "status", status: state.status });
    case "custom_field_missing":
      if (!state.fieldKey) return undefined;
      return JSON.stringify({
        type: "custom_field_missing",
        fieldKey: state.fieldKey,
      });
    case "rsvp_before": {
      if (!state.isoDateTime) return undefined;
      const timestamp = Date.parse(state.isoDateTime);
      if (!Number.isFinite(timestamp)) return undefined;
      return JSON.stringify({ type: "rsvp_before", timestamp });
    }
    case "previous_approved_not_rsvped":
      if (!state.excludedEventId) return undefined;
      return JSON.stringify({
        type: "previous_approved_not_rsvped",
        excludedEventId: state.excludedEventId,
      });
    default:
      return undefined;
  }
};

export const decodeRecipientFilter = (value: string | null | undefined): RecipientFilterState => {
  if (!value) {
    return { type: "all" };
  }

  if (value === "approved_no_approval_sms") {
    return { type: "approved_no_approval_sms" };
  }

  if (value === "approved_with_approval_sms") {
    return { type: "approved_with_approval_sms" };
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return { type: "all" };
    }

    const candidate = parsed as {
      type?: RecipientFilterType;
      [key: string]: unknown;
    };
    switch (candidate.type) {
      case "all":
        return { type: "all" };
      case "approved_no_approval_sms":
        return { type: "approved_no_approval_sms" };
      case "approved_with_approval_sms":
        return { type: "approved_with_approval_sms" };
      case "status": {
        const status = candidate.status;
        if (typeof status === "string" && ["pending", "approved", "denied"].includes(status)) {
          return { type: "status", status: status as RecipientApprovalStatus };
        }
        return { type: "status", status: DEFAULT_STATUS_FILTER };
      }
      case "custom_field_missing": {
        const fieldKey = candidate.fieldKey;
        if (typeof fieldKey === "string") {
          return { type: "custom_field_missing", fieldKey };
        }
        return { type: "custom_field_missing", fieldKey: "" };
      }
      case "rsvp_before": {
        const timestamp = candidate.timestamp;
        if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
          return {
            type: "rsvp_before",
            isoDateTime: toDateTimeLocalString(timestamp),
          };
        }
        return { type: "rsvp_before", isoDateTime: "" };
      }
      case "previous_approved_not_rsvped": {
        const excludedEventId = candidate.excludedEventId;
        if (typeof excludedEventId === "string") {
          return { type: "previous_approved_not_rsvped", excludedEventId };
        }
        return { type: "previous_approved_not_rsvped", excludedEventId: "" };
      }
      default:
        return { type: "all" };
    }
  } catch (error) {
    console.warn("[decodeRecipientFilter] Failed to parse recipient filter", error);
    return { type: "all" };
  }
};

type DescribeOptions = {
  resolveCustomFieldLabel?: (key: string) => string | undefined;
};

export const describeRecipientFilter = (
  state: RecipientFilterState,
  options?: DescribeOptions,
): string => {
  switch (state.type) {
    case "all":
      return "All approved RSVPs";
    case "approved_no_approval_sms":
      return "Approved RSVPs without an approval SMS";
    case "approved_with_approval_sms":
      return "Approved RSVPs with an approval SMS";
    case "status":
      return `RSVP status: ${state.status}`;
    case "custom_field_missing": {
      if (!state.fieldKey) {
        return "Missing custom field (not selected)";
      }
      const label = options?.resolveCustomFieldLabel?.(state.fieldKey) ?? state.fieldKey;
      return `Missing custom field: ${label}`;
    }
    case "rsvp_before":
      return state.isoDateTime
        ? `RSVP created before ${new Date(state.isoDateTime).toLocaleString()}`
        : "RSVP before a specific date/time";
    case "previous_approved_not_rsvped":
      return state.excludedEventId
        ? "Approved RSVPs from the selected source events, excluding anyone who RSVP'd to the excluded event"
        : "Approved RSVPs from previous events, excluding a selected event";
    default:
      return "All approved RSVPs";
  }
};

export const isRecipientFilterConfigured = (state: RecipientFilterState): boolean => {
  switch (state.type) {
    case "custom_field_missing":
      return state.fieldKey.trim().length > 0;
    case "rsvp_before":
      return state.isoDateTime.trim().length > 0 && Number.isFinite(Date.parse(state.isoDateTime));
    case "previous_approved_not_rsvped":
      return state.excludedEventId.trim().length > 0;
    case "status":
      return state.status !== undefined;
    default:
      return true;
  }
};

export const recipientHistoryFilterIsConfigured = (state: RecipientHistoryFilterState): boolean =>
  state.type === "none" || state.textBlastIds.length > 0;

export const RECIPIENT_STATUS_LABELS: Record<RecipientApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
};
