export const CLUB_CHLORINE_SITE_KEY = "club-chlorine";
export const CLUB_CHLORINE_MESSAGE_PREFIX = "CLUB CHLORINE:";
export const CLUB_CHLORINE_OPT_IN_CONFIRMATION =
  "CLUB CHLORINE: You’re subscribed to recurring Club Chlorine texts about RSVPs, guest-list status, tickets, event updates, and replies to your requests. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.";
export const CLUB_CHLORINE_OPT_OUT_CONFIRMATION =
  "CLUB CHLORINE: You have been unsubscribed and will receive no more Club Chlorine messages. Reply START to resubscribe.";

export function isClubChlorineSite(siteKey: string | null | undefined): boolean {
  return siteKey?.trim().toLowerCase() === CLUB_CHLORINE_SITE_KEY;
}

export function formatSmsMessageForSite(
  siteKey: string | null | undefined,
  message: string,
  options: { includeOptOutReminder?: boolean } = {},
): string {
  if (!isClubChlorineSite(siteKey)) {
    return message;
  }

  const trimmedMessage = message.trim();
  const brandedMessage = trimmedMessage.startsWith(CLUB_CHLORINE_MESSAGE_PREFIX)
    ? trimmedMessage
    : `${CLUB_CHLORINE_MESSAGE_PREFIX} ${trimmedMessage}`;
  const shouldIncludeOptOutReminder = options.includeOptOutReminder !== false;
  if (!shouldIncludeOptOutReminder || /\bSTOP\b/i.test(brandedMessage)) {
    return brandedMessage;
  }

  return `${brandedMessage}\n\nReply STOP to opt out.`;
}
