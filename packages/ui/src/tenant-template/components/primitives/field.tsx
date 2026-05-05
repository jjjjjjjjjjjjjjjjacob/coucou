"use client";

import type { ReactNode } from "react";
import { useMobile } from "../../use-mobile";
import { combineClassNames } from "../../internal-utils";

export interface FieldProps {
  label: string;
  children: ReactNode;
  /**
   * Hint text rendered below the input.
   */
  hint?: ReactNode;
  /**
   * Force-mobile layout regardless of viewport (used by previews).
   */
  forceMobile?: boolean;
}

/**
 * Form field row with an eyebrow label on the left and the input on the
 * right. On mobile collapses to stacked layout. The input itself is the
 * caller's responsibility — typically a borderless transparent input that
 * takes its underline from the parent row's bottom border.
 */
export function Field({ label, children, hint, forceMobile }: FieldProps) {
  const isMobile = useMobile() || Boolean(forceMobile);
  return (
    <div
      className={combineClassNames(
        "grid items-baseline border-b py-4",
        isMobile ? "gap-2" : "gap-6",
      )}
      style={{
        gridTemplateColumns: isMobile ? "1fr" : "180px 1fr",
        borderBottomColor: "var(--tt-rule)",
      }}
    >
      <div
        className="text-[11px] uppercase tracking-[0.04em]"
        style={{ color: "var(--tt-fg-mute)" }}
      >
        {label}
      </div>
      <div className="flex flex-col gap-1">
        {children}
        {hint ? (
          <div
            className="text-[12px] leading-snug"
            style={{ color: "var(--tt-fg-dim)" }}
          >
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const fieldInputClassName =
  "w-full bg-transparent border-0 outline-none p-0 text-[14px]";

export function fieldInputStyle(): React.CSSProperties {
  return {
    fontFamily: "var(--tt-text)",
    color: "var(--tt-fg)",
  };
}
