"use client";

import type { PresetKey } from "@coucou/sdk";
import Link from "next/link";
import type { ReactNode } from "react";
import { TenantTemplateProvider } from "../provider";
import { usePreset } from "../use-preset";

export interface TenantMastheadProps {
  preset: PresetKey;
  /**
   * Brand name shown on the left edge of the bar. Falls back to the preset's
   * `name` if omitted.
   */
  brandName?: string;
  /**
   * Tagline shown to the right of the spacer. Falls back to the preset's
   * `tagline`. Pass an empty string to drop the tagline entirely.
   */
  tagline?: string;
  /**
   * Optional slot for tenant-specific actions (auth menu, sign-in link).
   * Rendered after the tagline with a clear gap so the two pieces of right-
   * side chrome don't crowd each other.
   */
  rightSlot?: ReactNode;
  /**
   * When true, applies a sticky position so the masthead stays at the top of
   * the viewport on scroll. Defaults to false (static).
   */
  sticky?: boolean;
  /**
   * Where the brand wordmark links to. Defaults to "/" so users can always
   * click home from anywhere.
   */
  homeHref?: string;
  /**
   * When provided, replaces the brand text on the left edge of the masthead.
   * The brand text remains the accessible name via `aria-label`. Use for
   * tenants with bespoke wordmarks (e.g. Club Chlorine) so the masthead
   * shows the actual logo instead of plain text.
   */
  logoSlot?: ReactNode;
}

/**
 * Editorial masthead for tenant apps that use the maison preset. Coucou
 * uses the same component but with `tagline=""` and an Inquire link in the
 * rightSlot so the chrome reads as platform-marketing instead of
 * event-editorial.
 *
 * Layout: brand (left) · flex spacer · trailing (right). The trailing cell
 * holds the tagline + rightSlot with their own internal gap so they breathe
 * regardless of viewport.
 *
 * Apps using the dojo preset render their own fab-style chrome instead.
 */
export function TenantMasthead({
  preset,
  brandName,
  tagline,
  rightSlot,
  sticky = false,
  homeHref = "/",
  logoSlot,
}: TenantMastheadProps) {
  return (
    <TenantTemplateProvider siteConfigurationPreset={preset} applyToBody>
      <MastheadInner
        brandName={brandName}
        tagline={tagline}
        rightSlot={rightSlot}
        sticky={sticky}
        homeHref={homeHref}
        logoSlot={logoSlot}
      />
    </TenantTemplateProvider>
  );
}

interface MastheadInnerProps {
  brandName?: string;
  tagline?: string;
  rightSlot?: ReactNode;
  sticky?: boolean;
  homeHref: string;
  logoSlot?: ReactNode;
}

function MastheadInner({
  brandName,
  tagline,
  rightSlot,
  sticky,
  homeHref,
  logoSlot,
}: MastheadInnerProps) {
  const { preset, presetKey } = usePreset();
  const resolvedBrand = brandName ?? preset.name;
  // Empty string is intentional (Coucou drops the tagline). Only fall back
  // to the preset default when the prop is undefined.
  const resolvedTagline = tagline === undefined ? preset.tagline : tagline;
  const showTagline = Boolean(resolvedTagline && resolvedTagline.length > 0);

  return (
    <header
      className={sticky ? "sticky top-0 z-30" : ""}
      style={{
        background: "var(--tt-bg)",
        color: "var(--tt-fg)",
        fontFamily: "var(--tt-text)",
        borderBottom: "1px solid var(--tt-rule)",
      }}
    >
      <div
        className="flex w-full items-center px-6 py-5 text-[13px] sm:px-12"
        style={{ gap: 16, minHeight: 32 }}
      >
        <Link
          href={homeHref}
          aria-label={`${resolvedBrand} home`}
          className="transition-opacity hover:opacity-80 inline-flex items-center"
          style={{
            color: "var(--tt-fg)",
            fontWeight: presetKey === "dojo" ? 600 : 500,
            letterSpacing: preset.upper ? "0.02em" : "-0.005em",
            textDecoration: "none",
            height: 32,
            lineHeight: 1,
          }}
        >
          {logoSlot ?? (preset.upper ? resolvedBrand.toUpperCase() : resolvedBrand)}
        </Link>

        <div className="ml-auto flex items-center" style={{ gap: 24, height: 32 }}>
          {showTagline ? (
            <span
              className="inline-flex items-center"
              style={{
                color: "var(--tt-fg-dim)",
                height: 32,
                lineHeight: 1,
              }}
            >
              {resolvedTagline}
            </span>
          ) : null}
          {rightSlot ? (
            <span className="flex items-center" style={{ gap: 16, height: 32 }}>
              {rightSlot}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
