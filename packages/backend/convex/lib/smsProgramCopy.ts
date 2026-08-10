import { formatOrganizerSmsMessage } from "@coucou/sdk/shared/event-branding";

export const CLUB_CHLORINE_SITE_KEY = "club-chlorine";
export const CLUB_CHLORINE_BRAND_NAME = "Club Chlorine";
export const CLUB_CHLORINE_MESSAGE_PREFIX = "CLUB CHLORINE:";
export const DANZA_ORGANICA_SITE_KEY = "danza-organica";
export const DANZA_ORGANICA_BRAND_NAME = "Danza Organica";
export const DANZA_ORGANICA_MESSAGE_PREFIX = "DANZA ORGANICA:";

export function formatSmsOptInConfirmation(organizerName: string): string {
  const trimmedOrganizerName = organizerName.trim();
  return formatOrganizerSmsMessage(
    trimmedOrganizerName,
    `You’re subscribed to recurring ${trimmedOrganizerName} texts about RSVPs, guest-list status, tickets, event updates, and replies to your requests. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.`,
  );
}

export function formatSmsOptOutConfirmation(organizerName: string): string {
  const trimmedOrganizerName = organizerName.trim();
  return formatOrganizerSmsMessage(
    trimmedOrganizerName,
    `You have been unsubscribed and will receive no more ${trimmedOrganizerName} messages. Reply START to resubscribe.`,
  );
}

export const CLUB_CHLORINE_OPT_IN_CONFIRMATION =
  formatSmsOptInConfirmation(CLUB_CHLORINE_BRAND_NAME);
export const CLUB_CHLORINE_OPT_OUT_CONFIRMATION =
  formatSmsOptOutConfirmation(CLUB_CHLORINE_BRAND_NAME);

export function isClubChlorineSite(siteKey: string | null | undefined): boolean {
  return siteKey?.trim().toLowerCase() === CLUB_CHLORINE_SITE_KEY;
}

export function isDanzaOrganicaSite(siteKey: string | null | undefined): boolean {
  return siteKey?.trim().toLowerCase() === DANZA_ORGANICA_SITE_KEY;
}

export function formatSmsMessageForSite(
  siteKey: string | null | undefined,
  message: string,
): string {
  if (!isClubChlorineSite(siteKey)) {
    return message;
  }
  return formatOrganizerSmsMessage(CLUB_CHLORINE_BRAND_NAME, message);
}
