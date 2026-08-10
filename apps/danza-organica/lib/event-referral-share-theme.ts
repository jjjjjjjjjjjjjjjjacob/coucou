import type { CSSProperties } from "react";

export type EventReferralShareButtonVariant = "outline" | "prominent";

const tenantForegroundColor = "var(--tt-fg, var(--foreground))";
const tenantAccentColor = "var(--tt-accent, var(--accent))";

/**
 * Share controls use the event accent for their border and icon stroke so
 * they read as a single secondary action beside the accent RSVP brick.
 */
export function buildEventReferralShareButtonThemeStyle(
  variant: EventReferralShareButtonVariant,
): CSSProperties {
  if (variant === "prominent") {
    return {
      backgroundColor: tenantForegroundColor,
      borderColor: tenantAccentColor,
      borderStyle: "solid",
      borderWidth: 1,
      color: tenantAccentColor,
    };
  }

  return {
    backgroundColor: "transparent",
    borderColor: tenantAccentColor,
    color: tenantAccentColor,
  };
}
