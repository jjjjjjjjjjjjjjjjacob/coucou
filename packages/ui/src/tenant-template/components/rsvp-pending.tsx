"use client";

import type { ReactNode } from "react";
import { usePreset } from "../use-preset";
import { useMobile } from "../use-mobile";
import { TenantShell } from "./tenant-shell";
import { Eyebrow } from "./primitives/eyebrow";

export interface RsvpPendingProps {
  /**
   * Body copy explaining what "pending" means for this tenant.
   */
  description?: ReactNode;
  /**
   * Optional submitted-at line ("Submitted 14:22 · Wednesday").
   */
  submittedAtLabel?: string;
  /**
   * Override the heading.
   */
  heading?: string;
  /**
   * Override the eyebrow.
   */
  eyebrow?: string;
  /**
   * Optional content rendered to the right of the eyebrow (typically an
   * `EyebrowPill` for cross-route navigation).
   */
  eyebrowTrailing?: ReactNode;
  /**
   * Override the status pill text.
   */
  statusLabel?: string;
  /**
   * Page-level brand copy (footer contact).
   */
  footerContact?: string;
  /**
   * Optional content rendered below the status block, inside the same
   * masthead/footer shell. Use for tenant-specific extras (SMS toggle,
   * guest-portal image, etc.).
   */
  extras?: ReactNode;
  /**
   * When true, skip the inner `TenantShell` wrapper. Use when the parent
   * already provides a viewport-owning shell (e.g. `ChlorineSplitShell`).
   */
  noShell?: boolean;
}

const DEFAULT_HEADING: Record<string, string> = {
  dojo: "Sent for review.",
  atrium: "Sent to the host.",
  maison: "Sent to the host.",
  chlorine: "Sent for review.",
  coucou: "Sent for review.",
};

const DEFAULT_DESCRIPTION: Record<string, string> = {
  dojo: "Your request is in. Hosts review on Thursdays. We'll text you either way.",
  atrium:
    "Your request is in. The host reviews these personally. You will hear back by evening, one way or the other.",
  maison:
    "Your password put you on the request list — the host reviews these personally on Friday afternoon. You'll have an answer by evening, one way or the other.",
  chlorine:
    "Your request is in. The host reviews these personally — you'll get a text the moment your status changes.",
  coucou: "Your request is in. We'll let you know once it's been reviewed.",
};

const DEFAULT_STATUS: Record<string, string> = {
  dojo: "Awaiting review",
  atrium: "Awaiting review",
  maison: "Awaiting review",
  chlorine: "Awaiting review",
  coucou: "Awaiting review",
};

export function RsvpPending({
  description,
  submittedAtLabel,
  heading,
  eyebrow = "Pending",
  eyebrowTrailing,
  statusLabel,
  footerContact,
  extras,
  noShell = false,
}: RsvpPendingProps) {
  const { preset, presetKey } = usePreset();
  const isMobile = useMobile();

  const resolvedHeading = heading ?? DEFAULT_HEADING[presetKey];
  const resolvedDescription =
    description ?? DEFAULT_DESCRIPTION[presetKey];

  const sectionPadding = noShell
    ? 0
    : isMobile
      ? "60px 0 48px"
      : "100px 0 80px";
  const pendingSection = (
    <section style={{ padding: sectionPadding }}>
        <Eyebrow trailing={eyebrowTrailing}>
          {preset.upper ? eyebrow.toUpperCase() : eyebrow}
        </Eyebrow>
        <h2
          className="m-0 mb-8"
          style={{
            fontFamily: "var(--tt-display)",
            fontWeight: presetKey === "dojo" ? 700 : 400,
            fontSize: isMobile ? 22 : 26,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
            color: "var(--tt-fg)",
          }}
        >
          {resolvedHeading}
        </h2>

        <div
          className="m-0 max-w-[540px]"
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--tt-fg)",
          }}
        >
          {resolvedDescription}
        </div>

        {submittedAtLabel ? (
          <div
            className="mt-6"
            style={{
              fontSize: 13,
              color: "var(--tt-fg-dim)",
              lineHeight: 1.6,
            }}
          >
            {submittedAtLabel}
          </div>
        ) : null}

        {extras ? <div className="mt-10">{extras}</div> : null}
    </section>
  );

  if (noShell) return pendingSection;
  return <TenantShell>{pendingSection}</TenantShell>;
}
