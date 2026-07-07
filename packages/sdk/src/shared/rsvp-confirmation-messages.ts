import { formatEventTitleForMessageTemplate } from "./message-template";

export interface RsvpConfirmationMessageSource {
  eventName?: string | null;
  eventSecondaryTitle?: string | null;
  rsvpConfirmationMessage?: string | null;
  rsvpConfirmationMessageEnabled?: boolean | null;
}

export function sanitizeOptionalRsvpConfirmationMessage(
  rsvpConfirmationMessage: string | null | undefined,
): string | undefined {
  if (!rsvpConfirmationMessage) return undefined;
  const trimmedRsvpConfirmationMessage = rsvpConfirmationMessage.trim();
  return trimmedRsvpConfirmationMessage.length > 0 ? trimmedRsvpConfirmationMessage : undefined;
}

export function getDefaultRsvpConfirmationMessage(event: {
  name?: string | null;
  secondaryTitle?: string | null;
}): string {
  const eventName = formatEventTitleForMessageTemplate({
    name: event.name,
    secondaryTitle: event.secondaryTitle,
  });
  if (eventName === "Event") {
    return "RSVP submitted. Your request is pending approval.";
  }
  return `RSVP submitted for ${eventName}. Your request is pending approval.`;
}

export function resolveRsvpConfirmationMessageText({
  eventName,
  eventSecondaryTitle,
  rsvpConfirmationMessage,
  rsvpConfirmationMessageEnabled,
}: RsvpConfirmationMessageSource): string | undefined {
  if (rsvpConfirmationMessageEnabled === false) return undefined;
  return (
    sanitizeOptionalRsvpConfirmationMessage(rsvpConfirmationMessage) ??
    getDefaultRsvpConfirmationMessage({
      name: eventName,
      secondaryTitle: eventSecondaryTitle,
    })
  );
}
