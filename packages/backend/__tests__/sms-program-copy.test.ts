import { describe, expect, it } from "vitest";
import {
  CLUB_CHLORINE_OPT_IN_CONFIRMATION,
  formatSmsMessageForSite,
} from "../convex/lib/smsProgramCopy";

describe("Club Chlorine SMS program copy", () => {
  it("adds the fixed Club Chlorine prefix and opt-out reminder", () => {
    expect(formatSmsMessageForSite("club-chlorine", "Your RSVP is approved.")).toBe(
      "CLUB CHLORINE: Your RSVP is approved.\n\nReply STOP to opt out.",
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
});
