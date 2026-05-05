"use client";

import type { ReactNode } from "react";
import { usePreset } from "../use-preset";
import { useMobile } from "../use-mobile";
import { TenantShell } from "./tenant-shell";
import { Eyebrow } from "./primitives/eyebrow";

export interface RsvpAcceptedProps {
  /**
   * The tier label to reveal — "VIP", "Comp · house guest", etc.
   */
  tier: string;
  /**
   * Sub-copy under the tier ("Two on the list. We'll text the address day-of.")
   */
  tierDescription?: ReactNode;
  /**
   * The actual form. Caller supplies fields + submit button — the template
   * renders the surrounding chrome (eyebrow, heading, tier reveal block).
   */
  children: ReactNode;
  /**
   * Override the heading copy.
   */
  heading?: string;
  /**
   * Override the eyebrow.
   */
  eyebrow?: string;
  /**
   * Page-level brand copy (footer contact).
   */
  footerContact?: string;
}

const DEFAULT_HEADING: Record<string, string> = {
  dojo: "You're on the list.",
  atrium: "You're on the list.",
  maison: "You're on the list.",
};

const DEFAULT_EYEBROW: Record<string, string> = {
  dojo: "WELCOME",
  atrium: "Welcome",
  maison: "Welcome",
};

export function RsvpAccepted({
  tier,
  tierDescription,
  children,
  heading,
  eyebrow,
  footerContact,
}: RsvpAcceptedProps) {
  const { preset, presetKey } = usePreset();
  const isMobile = useMobile();

  const resolvedHeading = heading ?? DEFAULT_HEADING[presetKey];
  const resolvedEyebrow = eyebrow ?? DEFAULT_EYEBROW[presetKey];

  return (
    <TenantShell>
      <section style={{ padding: isMobile ? "60px 0 48px" : "100px 0 80px" }}>
        <Eyebrow>{resolvedEyebrow}</Eyebrow>
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
          className="border-y"
          style={{
            padding: "28px 0",
            margin: "0 0 56px",
            borderTopColor: "var(--tt-rule)",
            borderBottomColor: "var(--tt-rule)",
          }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.04em]"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            Tier
          </div>
          <div
            style={{
              fontSize: 22,
              fontFamily: "var(--tt-display)",
              color: "var(--tt-fg)",
              margin: "8px 0 12px",
              fontWeight: presetKey === "dojo" ? 600 : 400,
            }}
          >
            {preset.upper ? tier.toUpperCase() : tier}
          </div>
          {tierDescription ? (
            <div
              className="max-w-[460px]"
              style={{
                fontSize: 13,
                color: "var(--tt-fg-dim)",
                lineHeight: 1.6,
              }}
            >
              {tierDescription}
            </div>
          ) : null}
        </div>

        {children}
      </section>
    </TenantShell>
  );
}
