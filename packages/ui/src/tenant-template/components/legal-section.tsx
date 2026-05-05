"use client";

import type { ReactNode } from "react";
import { usePreset } from "../use-preset";

export interface LegalSectionProps {
  title: string;
  children: ReactNode;
  /**
   * Show a hairline above the section heading. Default true.
   */
  rule?: boolean;
}

/**
 * One section of a legal page. Uses preset typography for h2 and provides
 * baseline line-height for the body. Inner markup (lists, paragraphs,
 * callouts) is the caller's responsibility — render any JSX inside.
 */
export function LegalSection({ title, children, rule = true }: LegalSectionProps) {
  const { preset, presetKey } = usePreset();
  return (
    <section
      style={{
        marginTop: rule ? "3.5rem" : "2rem",
        paddingTop: rule ? "2.5rem" : 0,
        borderTop: rule ? "1px solid var(--tt-rule)" : undefined,
      }}
    >
      <h2
        style={{
          margin: "0 0 1.25rem",
          fontFamily: "var(--tt-display)",
          fontWeight: presetKey === "dojo" ? 600 : 500,
          fontSize: 22,
          lineHeight: 1.25,
          letterSpacing: preset.upper ? "0.01em" : "-0.005em",
          color: "var(--tt-fg)",
        }}
      >
        {preset.upper ? title.toUpperCase() : title}
      </h2>
      <div
        className="space-y-4"
        style={{
          fontSize: 14.5,
          lineHeight: 1.75,
          color: "var(--tt-fg)",
        }}
      >
        {children}
      </div>
    </section>
  );
}
