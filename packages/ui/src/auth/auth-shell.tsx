"use client";

import { type EventThemeColorSource, PRESET_DEFINITIONS, type PresetKey } from "@coucou/sdk";
import type { SiteAuthConfiguration } from "@coucou/sdk/site-config";
import type { ReactNode } from "react";
import { TenantTemplateProvider } from "../tenant-template/provider";
import { BrandMark } from "./brand-mark";
import { combineClassNames } from "./internal-utils";

export interface AuthBrandingOverrides {
  heading?: string | null;
  sub?: string | null;
  eyebrow?: string | null;
  brandMarkStyle?:
    | "filled-circle"
    | "square-serif"
    | "thin-ring"
    | "logo-upload"
    | "wordmark-only"
    | null;
  showCoucouAttribution?: boolean | null;
}

export interface AuthShellProps {
  preset: PresetKey;
  siteAuthConfiguration: SiteAuthConfiguration;
  authBranding?: AuthBrandingOverrides | null;
  /**
   * Optional replacement for the default preset mark. Apps use this for a
   * real platform logo while tenant auth can keep the generated mark.
   */
  brandMarkSlot?: ReactNode;
  /**
   * When the sign-in is reached via redirect from an event page, the event's
   * themeBackgroundColor/themeTextColor flow through here so the takeover
   * styling extends to the auth surface (every preset token is re-derived
   * from the override pair).
   */
  event?: EventThemeColorSource | null;
  children: ReactNode;
  className?: string;
}

function trimmedOrUndefined(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Tenant-branded chrome around any auth flow. Renders:
 *
 *   ┌─────────────────────────────┐
 *   │  Brand           tagline    │  ← masthead (hairline border)
 *   ├─────────────────────────────┤
 *   │                             │
 *   │           [BrandMark]       │  ← centered preset mark
 *   │           BRAND NAME        │
 *   │           eyebrow text      │
 *   │                             │
 *   │   Sign-in heading           │
 *   │   Sub copy                  │
 *   │   ┌─ phone form ─┐          │
 *   │   │              │          │
 *   │   └──────────────┘          │
 *   │                             │
 *   ├─────────────────────────────┤
 *   │   Terms · Privacy · Cookies │  ← footer
 *   └─────────────────────────────┘
 *
 * Page is `min-h-dvh` flex column so it never cuts off vertically. Content
 * is constrained to a 360px column so the form never stretches edge-to-edge
 * on desktop.
 */
export function AuthShell({
  preset,
  siteAuthConfiguration,
  authBranding,
  brandMarkSlot,
  event,
  children,
  className,
}: AuthShellProps) {
  const presetDefinition = PRESET_DEFINITIONS[preset];

  const headingCopy =
    trimmedOrUndefined(authBranding?.heading) ??
    siteAuthConfiguration.heading ??
    presetDefinition.authCopy.heading;
  const subCopy =
    trimmedOrUndefined(authBranding?.sub) ??
    siteAuthConfiguration.description ??
    presetDefinition.authCopy.sub;
  const eyebrowCopy =
    trimmedOrUndefined(authBranding?.eyebrow) ?? presetDefinition.authCopy.eyebrow;
  const brandMarkStyle = authBranding?.brandMarkStyle ?? undefined;
  const showAttribution = Boolean(authBranding?.showCoucouAttribution);

  return (
    <TenantTemplateProvider siteConfigurationPreset={preset} event={event}>
      <main
        className="flex min-h-dvh flex-col"
        style={{
          background: "var(--tt-bg)",
          color: "var(--tt-fg)",
          fontFamily: "var(--tt-text)",
        }}
      >
        {/* No top masthead bar here. The brand wordmark is rendered
        centered (just below the BrandMark) so a top stripe would
        duplicate the identity, and the preset tagline ("06.06 · brooklyn"
        etc.) is a fictional event reference that doesn't apply to a
        sign-in page. AppChrome already hides on /sign-in routes. */}

        {/* Centered content column */}
        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:py-16">
          <section className={combineClassNames("w-full max-w-[360px] space-y-8", className)}>
            {/* Brand mark + uppercased brand name + eyebrow */}
            <div className="flex flex-col items-center gap-3 text-center">
              {brandMarkSlot ?? (
                <BrandMark
                  preset={preset}
                  accentMark={siteAuthConfiguration.accentMark}
                  size={64}
                  style={brandMarkStyle ?? undefined}
                />
              )}
              <div
                className="text-[22px] leading-tight"
                style={{
                  fontFamily: "var(--tt-display)",
                  fontWeight: preset === "dojo" ? 700 : 500,
                  letterSpacing: presetDefinition.upper ? "0.02em" : "-0.005em",
                  color: "var(--tt-fg)",
                }}
              >
                {presetDefinition.upper
                  ? siteAuthConfiguration.brandName.toUpperCase()
                  : siteAuthConfiguration.brandName}
              </div>
              {eyebrowCopy ? (
                <div
                  className="text-[11px] uppercase tracking-[0.08em]"
                  style={{ color: "var(--tt-fg-dim)" }}
                >
                  {eyebrowCopy}
                </div>
              ) : null}
            </div>

            {/* Heading + sub copy */}
            <div className="space-y-2 text-center">
              <h1
                className="m-0 text-[22px] leading-tight"
                style={{
                  fontFamily: "var(--tt-display)",
                  fontWeight: preset === "dojo" ? 700 : 500,
                  color: "var(--tt-fg)",
                }}
              >
                {headingCopy}
              </h1>
              <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--tt-fg-dim)" }}>
                {subCopy}
              </p>
            </div>

            {/* Flow body */}
            <div>{children}</div>
          </section>
        </div>

        {/* Footer */}
        <footer
          className="flex flex-wrap items-center justify-center gap-5 border-t py-6 text-[11px] uppercase tracking-[0.06em]"
          style={{
            borderTopColor: "var(--tt-rule)",
            color: "var(--tt-fg-mute)",
            paddingLeft: "max(env(safe-area-inset-left), 24px)",
            paddingRight: "max(env(safe-area-inset-right), 24px)",
          }}
        >
          <a
            href="/terms"
            className="transition-opacity hover:opacity-80"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            Terms
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="/privacy"
            className="transition-opacity hover:opacity-80"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            Privacy
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="/cookies"
            className="transition-opacity hover:opacity-80"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            Cookies
          </a>
          {showAttribution ? (
            <>
              <span aria-hidden="true">·</span>
              <a
                href="https://coucou.events"
                target="_blank"
                rel="noreferrer"
                className="transition-opacity hover:opacity-80"
                style={{ color: "var(--tt-fg-mute)" }}
              >
                Powered by Coucou
              </a>
            </>
          ) : null}
        </footer>
      </main>
    </TenantTemplateProvider>
  );
}
