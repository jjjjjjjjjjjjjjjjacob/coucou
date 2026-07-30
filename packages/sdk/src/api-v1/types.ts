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
    field?: string;
  };
}

export type ApiApprovalStatus = "pending" | "approved" | "denied";
export type ApiAttendanceStatus = "yes" | "no" | "maybe";
export type ApiTicketStatus = "issued" | "disabled" | "redeemed";
export type PartnerEventAccessMode = "all" | "selected";

export interface PartnerEventAccess {
  eventAccessMode: PartnerEventAccessMode;
  allowedEventIds: string[];
  isLegacyAllEventsAccess: boolean;
}

export interface ApiTicket {
  status: ApiTicketStatus;
  qrEnabled: boolean;
  redemptionCode: string;
  redeemUrl: string | null;
}

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
  lists: { listKey: string; isPasswordProtected: boolean; generatesQrCode: boolean }[];
  rsvpForm: {
    attendanceQuestionEnabled: boolean;
    maxAttendees: number;
    acceptsListPassword: boolean;
    customFields: Array<{
      key: string;
      label: string;
      placeholder?: string;
      required: boolean;
      trimWhitespace: boolean;
    }>;
    socialPlatforms: Array<{
      platformKey: string;
      label: string;
      placeholder?: string;
      profileUrlPrefix?: string;
      required: boolean;
    }>;
    invitedBy: {
      enabled: boolean;
      label?: string;
      placeholder?: string;
      required: boolean;
    } | null;
  };
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
  ticket: ApiTicket | null;
}

export interface ApiRsvpContact extends ApiRsvp {
  /** Normalized E.164, or null when plaintext contact data is unavailable. */
  phone: string | null;
  /** SHA-256 hex of the normalized E.164 phone number, or null when unknown. */
  phoneHash: string | null;
}

export interface ApiRsvpContactList {
  data: ApiRsvpContact[];
  nextCursor: string | null;
}

export interface ApiSmsProgram {
  organizerName: string;
  consentLabel: string;
  disclosure: string;
  termsUrl: string;
  privacyUrl: string;
}

export interface ApiSmsConsent {
  smsConsent: boolean | null;
  smsConsentTimestamp: number | null;
  smsProgram: ApiSmsProgram;
}

export interface ApiRsvpWriteInput {
  phone: string;
  name: string;
  listKey?: string;
  listPassword?: string;
  attendees?: number;
  attendanceStatus?: ApiAttendanceStatus;
  note?: string;
  customFieldValues?: Record<string, string>;
  socialProfiles?: Array<{ platformKey: string; handle: string }>;
  invitedByName?: string;
  smsConsent?: boolean;
  smsConsentIpAddress?: string;
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

export type CoucouWebhookTicketSnapshot = ApiTicket;

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
    ticket?: CoucouWebhookTicketSnapshot;
    /** API deliveries identify the exact client so consumers skip only their own writes. */
    origin: { type: "api"; apiClientId: string } | { type: "app" };
    changes?: Record<string, unknown>;
  };
}
