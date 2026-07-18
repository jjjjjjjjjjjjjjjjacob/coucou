import type { CoucouWebhookEventType } from "./constants";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "method_not_allowed"
  | "internal_error";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export type ApiApprovalStatus = "pending" | "approved" | "denied";
export type ApiAttendanceStatus = "yes" | "no" | "maybe";

/** Event shape returned by GET /api/v1/events and GET /api/v1/events/{id}. */
export interface ApiEvent {
  id: string;
  shortId: string | null;
  name: string;
  secondaryTitle: string | null;
  description: string | null;
  location: string;
  eventDate: number;
  eventEndDate: number | null;
  eventTimezone: string | null;
  flyerUrl: string | null;
  status: string | null;
  lifecycle: string | null;
  publishedAt: number | null;
  isFeatured: boolean;
  maxAttendeesPerRsvp: number;
  workspaceSlug: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ApiEventList {
  data: ApiEvent[];
  nextCursor: string | null;
}

export interface ApiEventDetail extends ApiEvent {
  lists: { listKey: string; isPasswordProtected: boolean }[];
  attendanceCounts: {
    approved: number;
    pending: number;
    denied: number;
    total: number;
  };
}

/** RSVP shape returned by the lookup and write endpoints. */
export interface ApiRsvp {
  rsvpId: string;
  approvalStatus: ApiApprovalStatus;
  attendanceStatus: ApiAttendanceStatus;
  listKey: string;
  attendees: number;
  name: string | null;
  isGuest: boolean;
  createdAt: number;
  updatedAt: number;
}

/** The plaintext HTTP body of every webhook delivery (payload is inside, encrypted). */
export interface CoucouWebhookEnvelope {
  apiVersion: string;
  encryption: "aes-256-gcm";
  keyGeneration: number;
  iv: string; // base64url, 12 bytes
  ciphertext: string; // base64url, ciphertext || 16-byte GCM tag
}

export interface CoucouWebhookEventSnapshot {
  id: string;
  shortId: string | null;
  name: string;
  eventDate: number;
  eventEndDate: number | null;
  eventTimezone: string | null;
  location: string;
  flyerUrl: string | null;
}

export interface CoucouWebhookRsvpSnapshot {
  id: string;
  listKey: string;
  approvalStatus: ApiApprovalStatus;
  attendanceStatus: ApiAttendanceStatus;
  attendees: number;
  createdAt: number;
  updatedAt: number;
}

export interface CoucouWebhookIdentity {
  /** Normalized E.164, or null for legacy guests recorded before phone persistence. */
  phone: string | null;
  /** SHA-256 hex of the normalized E.164 phone number — always present when known. */
  phoneHash: string | null;
  name: string | null;
  isGuest: boolean;
}

/** The decrypted webhook payload. */
export interface CoucouWebhookPayload {
  apiVersion: string;
  eventType: CoucouWebhookEventType;
  deliveryId: string;
  occurredAt: number;
  workspaceSlug: string;
  /** Present on deliveries triggered from the endpoint's "send test" button. */
  test?: boolean;
  data: {
    event: CoucouWebhookEventSnapshot;
    rsvp?: CoucouWebhookRsvpSnapshot;
    identity?: CoucouWebhookIdentity;
    /** "api" when the change came through the partner API (skip mirroring your own writes). */
    origin?: { type: "api" | "app" };
    changes?: Record<string, unknown>;
  };
}
