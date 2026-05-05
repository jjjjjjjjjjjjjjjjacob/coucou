import type { RSVP } from "@/lib/types";

export type RecipientFilterType =
  | "all"
  | "approved_no_approval_sms"
  | "status"
  | "custom_field_missing"
  | "rsvp_before";

export type RecipientFilterState =
  | { type: "all" }
  | { type: "approved_no_approval_sms" }
  | { type: "status"; status: RSVP["status"] }
  | { type: "custom_field_missing"; fieldKey: string }
  | { type: "rsvp_before"; isoDateTime: string };

export const DEFAULT_STATUS_FILTER: RSVP["status"] = "pending";

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
    case "status":
      return JSON.stringify({ type: "status", status: state.status });
    case "custom_field_missing":
      if (!state.fieldKey) return undefined;
      return JSON.stringify({ type: "custom_field_missing", fieldKey: state.fieldKey });
    case "rsvp_before": {
      if (!state.isoDateTime) return undefined;
      const timestamp = Date.parse(state.isoDateTime);
      if (!Number.isFinite(timestamp)) return undefined;
      return JSON.stringify({ type: "rsvp_before", timestamp });
    }
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

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return { type: "all" };
    }

    const candidate = parsed as { type?: RecipientFilterType; [key: string]: unknown };
    switch (candidate.type) {
      case "all":
        return { type: "all" };
      case "approved_no_approval_sms":
        return { type: "approved_no_approval_sms" };
      case "status": {
        const status = candidate.status;
        if (typeof status === "string" && ["pending", "approved", "attending", "denied"].includes(status)) {
          return { type: "status", status: status as RSVP["status"] };
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
          return { type: "rsvp_before", isoDateTime: toDateTimeLocalString(timestamp) };
        }
        return { type: "rsvp_before", isoDateTime: "" };
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
      return "All approved or attending RSVPs";
    case "approved_no_approval_sms":
      return "Approved RSVPs without an approval SMS";
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
    default:
      return "All approved or attending RSVPs";
  }
};

export const isRecipientFilterConfigured = (state: RecipientFilterState): boolean => {
  switch (state.type) {
    case "custom_field_missing":
      return state.fieldKey.trim().length > 0;
    case "rsvp_before":
      return state.isoDateTime.trim().length > 0 && Number.isFinite(Date.parse(state.isoDateTime));
    case "status":
      return state.status !== undefined;
    default:
      return true;
  }
};

export const RECIPIENT_STATUS_LABELS: Record<RSVP["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  attending: "Attending",
  denied: "Denied",
};
