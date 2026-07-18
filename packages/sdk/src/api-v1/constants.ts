/**
 * Version string for the coucou partner API. Sent in every webhook envelope and
 * decrypted payload; bump when the payload or endpoint shapes change.
 */
export const API_VERSION = "2026-07-17";

export const WEBHOOK_EVENT_TYPES = [
  "rsvp.created",
  "rsvp.updated",
  "rsvp.approved",
  "rsvp.denied",
  "rsvp.attendance_updated",
  "rsvp.deleted",
  "event.updated",
  "event.published",
  "event.unpublished",
  "event.deleted",
] as const;

export type CoucouWebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isCoucouWebhookEventType(value: string): value is CoucouWebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

export const WEBHOOK_SIGNATURE_HEADER = "X-Coucou-Signature";
export const WEBHOOK_EVENT_TYPE_HEADER = "X-Coucou-Event-Type";
export const WEBHOOK_DELIVERY_ID_HEADER = "X-Coucou-Delivery-Id";
export const WEBHOOK_KEY_GENERATION_HEADER = "X-Coucou-Key-Generation";

/** Maximum allowed clock skew between the signature timestamp and receipt. */
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;
