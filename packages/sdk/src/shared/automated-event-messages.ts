export interface AutomatedEventMessageSource {
  smsOptInConfirmationMessage?: string | null;
  smsOptOutConfirmationMessage?: string | null;
  qrDeliveryMessage?: string | null;
}

export function sanitizeOptionalAutomatedEventMessage(
  message: string | null | undefined,
): string | undefined {
  if (!message) return undefined;
  const trimmedMessage = message.trim();
  return trimmedMessage.length > 0 ? trimmedMessage : undefined;
}

export function getDefaultSmsOptInConfirmationMessage(organizerName: string): string {
  const trimmedOrganizerName = organizerName.trim() || "this organizer";
  return `You’re subscribed to recurring ${trimmedOrganizerName} texts about RSVPs, guest-list status, tickets, event updates, and replies to your requests. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.`;
}

export function getDefaultSmsOptOutConfirmationMessage(organizerName: string): string {
  const trimmedOrganizerName = organizerName.trim() || "this organizer";
  return `You have been unsubscribed and will receive no more ${trimmedOrganizerName} messages. Reply START to resubscribe.`;
}

export function getDefaultQrDeliveryMessage(): string {
  return "Your QR code for {{eventName}}.\n\nView your ticket here: {{qrCodeUrl}}";
}

export function resolveSmsOptInConfirmationMessage(
  source: AutomatedEventMessageSource,
  organizerName: string,
): string {
  return (
    sanitizeOptionalAutomatedEventMessage(source.smsOptInConfirmationMessage) ??
    getDefaultSmsOptInConfirmationMessage(organizerName)
  );
}

export function resolveSmsOptOutConfirmationMessage(
  source: AutomatedEventMessageSource,
  organizerName: string,
): string {
  return (
    sanitizeOptionalAutomatedEventMessage(source.smsOptOutConfirmationMessage) ??
    getDefaultSmsOptOutConfirmationMessage(organizerName)
  );
}

export function resolveQrDeliveryMessage(source: AutomatedEventMessageSource): string {
  return (
    sanitizeOptionalAutomatedEventMessage(source.qrDeliveryMessage) ?? getDefaultQrDeliveryMessage()
  );
}
