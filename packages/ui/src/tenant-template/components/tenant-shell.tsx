"use client";

import type { ReactNode } from "react";
import { useMobile } from "../use-mobile";
import { combineClassNames } from "../internal-utils";

export interface TenantShellProps {
  children: ReactNode;
  /**
   * Constrain content to the tenant template's editorial column. Pass false
   * for full-bleed surfaces like the ticket.
   */
  contentColumn?: boolean;
  className?: string;
}

/**
 * Editorial-column wrapper for tenant guest surfaces (landing, gate,
 * accepted, pending, ticket). Constrains to ~820px max-width on desktop
 * and applies the preset's font stack.
 *
 * The page's masthead and footer chrome come from the surrounding
 * `<AppChrome>` (which renders `<TenantMasthead>` + `<TenantLegalFooter>`
 * for the maison/coucou presets, or the dojo fab-style header for the dojo
 * preset). TenantShell does *not* render its own masthead/footer — that
 * would double up with the chrome and the result was the redundant bars
 * you saw in club-chlorine + coucou.
 */
export function TenantShell({
  children,
  contentColumn = true,
  className,
}: TenantShellProps) {
  const isMobile = useMobile();

  return (
    <div
      className={combineClassNames(
        "mx-auto flex min-h-full flex-col",
        contentColumn ? "max-w-[820px]" : "",
        className,
      )}
      style={{
        padding: isMobile ? "0 24px" : "0 64px",
        background: "var(--tt-bg)",
        color: "var(--tt-fg)",
        fontFamily: "var(--tt-text)",
      }}
    >
      {children}
    </div>
  );
}
