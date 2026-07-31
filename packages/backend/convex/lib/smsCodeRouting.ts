import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import type { Doc } from "../_generated/dataModel";
import { normalizeCredentialPassword } from "./credentialPasswords";

export const SMS_RSVP_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const SMS_CODE_RESERVATION_DURATION_MS = 15 * 60 * 1000;

export function normalizeSmsCode(value: string): string {
  return normalizeCredentialPassword(value);
}

export function isSmsExecutableEvent(
  event: Pick<Doc<"events">, "status" | "lifecycle" | "eventDate" | "eventEndDate">,
  now: number = Date.now(),
): boolean {
  return event.lifecycle !== "draft" && isEventOpenForRsvp(event, now);
}

export function formatSmsFieldList(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function buildSmsRsvpFieldPrompt(labels: readonly string[]): string {
  const fieldList = formatSmsFieldList(labels);
  const valueWord = labels.length === 1 ? "value" : "values";
  return `Reply with ${fieldList}, in that order, separated by commas (${labels.length} ${valueWord}).`;
}
