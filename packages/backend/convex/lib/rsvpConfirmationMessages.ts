import {
  formatOrganizerSmsMessage,
  resolveEventMessagingBrandName,
} from "@coucou/sdk/shared/event-branding";
import {
  applyMessageTemplateVariables,
  formatEventDateForMessageTemplate,
  formatEventTitleForMessageTemplate,
  resolveMessageTemplateFirstName,
} from "@coucou/sdk/shared/message-template";
import { resolveRsvpConfirmationMessageText } from "@coucou/sdk/shared/rsvp-confirmation-messages";
import type { Doc } from "../_generated/dataModel";
import { CLUB_CHLORINE_BRAND_NAME, isClubChlorineSite } from "./smsProgramCopy";

type RsvpConfirmationEvent = Pick<
  Doc<"events">,
  | "name"
  | "secondaryTitle"
  | "siteKey"
  | "location"
  | "eventDate"
  | "eventTimezone"
  | "hosts"
  | "productionCompany"
  | "rsvpConfirmationMessage"
  | "rsvpConfirmationMessageEnabled"
>;

type RsvpConfirmationRecipient = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
};

export function formatRsvpConfirmationMessage(
  event: RsvpConfirmationEvent,
  recipient: RsvpConfirmationRecipient,
  options: { organizerName?: string } = {},
): string | undefined {
  const messageTemplate = resolveRsvpConfirmationMessageText({
    eventName: event.name,
    eventSecondaryTitle: event.secondaryTitle,
    rsvpConfirmationMessage: event.rsvpConfirmationMessage,
    rsvpConfirmationMessageEnabled: event.rsvpConfirmationMessageEnabled,
  });
  if (!messageTemplate) return undefined;

  const recipientFullName =
    recipient.fullName ?? [recipient.firstName, recipient.lastName].filter(Boolean).join(" ");

  const organizerName =
    options.organizerName?.trim() ||
    (isClubChlorineSite(event.siteKey)
      ? CLUB_CHLORINE_BRAND_NAME
      : resolveEventMessagingBrandName(event));
  return formatOrganizerSmsMessage(
    organizerName,
    applyMessageTemplateVariables(messageTemplate, {
      firstName: resolveMessageTemplateFirstName({
        firstName: recipient.firstName,
        fullName: recipientFullName,
      }),
      eventName: formatEventTitleForMessageTemplate(event),
      eventDate: formatEventDateForMessageTemplate(event.eventDate, event.eventTimezone),
      eventLocation: event.location?.trim() ?? "",
      qrCodeUrl: "",
    }),
  );
}
