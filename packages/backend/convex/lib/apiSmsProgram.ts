import type { Doc } from "../_generated/dataModel";

export interface ApiSmsProgram {
  organizerName: string;
  consentLabel: string;
  disclosure: string;
  termsUrl: string;
  privacyUrl: string;
}

export function buildApiSmsProgram(workspace: Doc<"workspaces">): ApiSmsProgram {
  const organizerName = workspace.name.trim() || workspace.slug;

  return {
    organizerName,
    consentLabel: `I agree to receive recurring SMS messages from Coucou, a Soluo LLC service, about ${organizerName} events.`,
    disclosure: `Coucou may send account notifications, RSVP and guest-list updates, tickets or QR codes, event updates, and replies about ${organizerName} events or reservations. ${organizerName} supplies the event context; Coucou is the sender and operates this messaging program. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase, RSVP, or admission.`,
    termsUrl: "https://coucou.events/terms",
    privacyUrl: "https://coucou.events/privacy",
  };
}
