import { describe, expect, it } from "vitest";
import {
  CLUB_CHLORINE_OPT_IN_CONFIRMATION,
  formatSmsMessageForSite,
  formatSmsOptInConfirmation,
} from "../convex/lib/smsProgramCopy";

describe("Club Chlorine SMS program copy", () => {
  it("adds the fixed Club Chlorine prefix without an ongoing opt-out reminder", () => {
    expect(formatSmsMessageForSite("club-chlorine", "Your RSVP is approved.")).toBe(
      "CLUB CHLORINE: Your RSVP is approved.",
    );
  });

  it("does not duplicate an existing prefix or STOP disclosure", () => {
    expect(formatSmsMessageForSite("club-chlorine", CLUB_CHLORINE_OPT_IN_CONFIRMATION)).toBe(
      CLUB_CHLORINE_OPT_IN_CONFIRMATION,
    );
  });

  it("does not change other sites", () => {
    const originalMessage = "DOJO POMODORO: Your RSVP is approved. ";
    expect(formatSmsMessageForSite("dojo", originalMessage)).toBe(originalMessage);
  });

  it("builds verbose opt-in copy for any workspace", () => {
    expect(formatSmsOptInConfirmation("Danza Organica")).toBe(
      "DANZA ORGANICA: You’re subscribed to recurring Danza Organica texts about RSVPs, guest-list status, tickets, event updates, and replies to your requests. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.",
    );
  });
});
