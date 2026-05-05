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
}

const DEFAULT_HEADING: Record<string, string> = {
  dojo: "Sent for review.",
  atrium: "Sent to the host.",
  maison: "Sent to the host.",
};

const DEFAULT_DESCRIPTION: Record<string, string> = {
  dojo: "Your request is in. Hosts review on Thursdays. We'll text you either way.",
  atrium:
    "Your request is in. The host reviews these personally. You will hear back by evening, one way or the other.",
  maison:
    "Your password put you on the request list — the host reviews these personally on Friday afternoon. You'll have an answer by evening, one way or the other.",
};

const DEFAULT_STATUS: Record<string, string> = {
  dojo: "Awaiting review",
  atrium: "Awaiting review",
  maison: "Awaiting review",
};

export function RsvpPending({
  description,
  submittedAtLabel,
  heading,
  eyebrow = "Pending",
  statusLabel,
  footerContact,
  extras,
}: RsvpPendingProps) {
  const { preset, presetKey } = usePreset();
  const isMobile = useMobile();

  const resolvedHeading = heading ?? DEFAULT_HEADING[presetKey];
  const resolvedDescription =
    description ?? DEFAULT_DESCRIPTION[presetKey];
  const resolvedStatus = statusLabel ?? DEFAULT_STATUS[presetKey];

  return (
    <TenantShell>
      <section style={{ padding: isMobile ? "60px 0 48px" : "100px 0 80px" }}>
        <Eyebrow>{preset.upper ? eyebrow.toUpperCase() : eyebrow}</Eyebrow>
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

        <p
          className="m-0 max-w-[540px]"
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--tt-fg)",
          }}
        >
          {resolvedDescription}
        </p>

        <div
          className="border-y"
          style={{
            padding: "28px 0",
            margin: "40px 0 0",
            borderTopColor: "var(--tt-rule)",
            borderBottomColor: "var(--tt-rule)",
          }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.04em]"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            Status
          </div>
          <div
            style={{
              fontSize: 20,
              fontFamily: "var(--tt-display)",
              color: "var(--tt-fg)",
              margin: "8px 0 12px",
              fontWeight: presetKey === "dojo" ? 600 : 400,
            }}
          >
            {preset.upper ? resolvedStatus.toUpperCase() : resolvedStatus}
          </div>
          {submittedAtLabel ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--tt-fg-dim)",
                lineHeight: 1.6,
              }}
            >
              {submittedAtLabel}
            </div>
          ) : null}
        </div>

        {extras ? <div className="mt-10">{extras}</div> : null}
      </section>
    </TenantShell>
  );
}
