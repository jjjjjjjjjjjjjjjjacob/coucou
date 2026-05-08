"use client";

import type { ReactNode } from "react";
import { useMobile } from "../use-mobile";
import { usePreset } from "../use-preset";
import { Eyebrow } from "./primitives/eyebrow";
import { TenantShell } from "./tenant-shell";

export interface RsvpDeniedProps {
  /**
   * Body copy explaining the denial. If omitted, a soft preset-default
   * is used.
   */
  description?: ReactNode;
  /**
   * Override the heading.
   */
  heading?: string;
  /**
   * Optional secondary CTA — typically "try a different password".
   */
  secondaryAction?: ReactNode;
  /**
   * Page-level brand copy (footer contact).
   */
  footerContact?: string;
}

const DEFAULT_HEADING: Record<string, string> = {
  dojo: "Not on this list.",
  atrium: "Not on this list.",
  maison: "Not on this list.",
  chlorine: "Not on this list.",
  coucou: "Not on this list.",
};

const DEFAULT_DESCRIPTION: Record<string, string> = {
  dojo: "We could not place you on this list. Reach out to your host if you think this is a mistake.",
  atrium: "We could not place you on this list. Reach out to your host if this is a mistake.",
  maison: "We could not place you on this list. Write to the host if this is in error.",
  chlorine:
    "We could not place you on this list. Reach out to your host if you think this is a mistake.",
  coucou:
    "We could not place you on this list. Reach out to your host if you think this is a mistake.",
};

export function RsvpDenied({ description, heading, secondaryAction }: RsvpDeniedProps) {
  const { preset, presetKey } = usePreset();
  const isMobile = useMobile();

  const resolvedHeading = heading ?? DEFAULT_HEADING[presetKey];
  const resolvedDescription = description ?? DEFAULT_DESCRIPTION[presetKey];

  return (
    <TenantShell>
      <section style={{ padding: isMobile ? "60px 0 48px" : "100px 0 80px" }}>
        <Eyebrow>{preset.upper ? "DECLINED" : "Declined"}</Eyebrow>
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

        {secondaryAction ? (
          <div className="mt-10 flex flex-wrap items-center gap-4">{secondaryAction}</div>
        ) : null}
      </section>
    </TenantShell>
  );
}
