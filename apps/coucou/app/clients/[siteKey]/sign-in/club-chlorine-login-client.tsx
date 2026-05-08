"use client";

import type { PresetKey } from "@coucou/sdk";
import type { SiteAuthConfiguration } from "@coucou/sdk/site-config";
import type { AuthBrandingOverrides } from "@coucou/ui/auth";
import { ChlorineAppShell } from "@coucou/ui/tenant-template";
import Link from "next/link";
import { SignInClient } from "../../../sign-in/[[...sign-in]]/sign-in-client";

interface ClubChlorineLoginClientProps {
  redirectUrl: string;
  tenantBaseUrl: string;
  preset: PresetKey;
  siteAuthConfiguration: SiteAuthConfiguration;
  eventThemeBackgroundColor?: string | null;
  eventThemeTextColor?: string | null;
  authBranding?: AuthBrandingOverrides | null;
  allowedRedirectOrigins?: readonly string[];
}

function trimmedOrFallback(value: string | null | undefined, fallback: string): string {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : fallback;
}

function buildTenantHref(tenantBaseUrl: string, pathname: string): string {
  return new URL(pathname, tenantBaseUrl).toString();
}

export function ClubChlorineLoginClient({
  redirectUrl,
  tenantBaseUrl,
  preset,
  siteAuthConfiguration,
  eventThemeBackgroundColor,
  eventThemeTextColor,
  authBranding,
  allowedRedirectOrigins,
}: ClubChlorineLoginClientProps) {
  const heading = trimmedOrFallback(authBranding?.heading, siteAuthConfiguration.heading);
  const sub = trimmedOrFallback(authBranding?.sub, siteAuthConfiguration.description);

  // No eyebrow — the user wants this surface to feel like opting into
  // text updates, not a sign-in card. The chlorine wordmark anchored top/
  // bottom IS the brand chrome; an "EVENT LOGIN" eyebrow above the form
  // contradicts the framing.

  // Collapsed shell — wordmark in the upper-left, form centered in the
  // body. Matches the shape of every post-landing chlorine page so the
  // user lands on coucou.events with the chrome already in its final
  // resting place. `skipAnimation` keeps the wordmark from playing any
  // entrance; the satellite has already settled into collapsed before
  // triggering the cross-domain redirect.
  return (
    <ChlorineAppShell
      mode="collapsed"
      linkComponent={Link}
      wordmarkHref={tenantBaseUrl}
      skipAnimation
      contentMaxWidthPx={390}
    >
      <section
        aria-labelledby="club-chlorine-login-heading"
        className="mx-auto flex w-full max-w-[360px] flex-col gap-6 text-center"
      >
        <div className="space-y-2">
          <h1
            id="club-chlorine-login-heading"
            className="m-0 text-[22px] leading-tight"
            style={{
              color: "var(--tt-fg)",
              fontFamily: "var(--tt-display)",
              fontWeight: 500,
            }}
          >
            {heading}
          </h1>
          <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--tt-fg-dim)" }}>
            {sub}
          </p>
        </div>

        <SignInClient
          redirectUrl={redirectUrl}
          preset={preset}
          siteAuthConfiguration={siteAuthConfiguration}
          eventThemeBackgroundColor={eventThemeBackgroundColor}
          eventThemeTextColor={eventThemeTextColor}
          authBranding={authBranding}
          allowedRedirectOrigins={allowedRedirectOrigins}
          brandMarkSlot={null}
          noShell
        />

        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center justify-center gap-4 text-[11px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          <a
            href={buildTenantHref(tenantBaseUrl, "/terms")}
            className="transition-opacity hover:opacity-80"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            Terms
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={buildTenantHref(tenantBaseUrl, "/privacy")}
            className="transition-opacity hover:opacity-80"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            Privacy
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={buildTenantHref(tenantBaseUrl, "/cookies")}
            className="transition-opacity hover:opacity-80"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            Cookies
          </a>
        </nav>
      </section>
    </ChlorineAppShell>
  );
}
