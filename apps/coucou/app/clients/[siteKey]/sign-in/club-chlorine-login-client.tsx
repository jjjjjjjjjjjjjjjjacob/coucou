"use client";

import type { PresetKey } from "@coucou/sdk";
import type { SiteAuthConfiguration } from "@coucou/sdk/site-config";
import type { AuthBrandingOverrides, PhoneAuthStep } from "@coucou/ui/auth";
import { ChlorineAppShell } from "@coucou/ui/tenant-template";
import Link from "next/link";
import { useState } from "react";
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
  initialPhoneNumber?: string | null;
  autoSendInitialCode?: boolean;
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
  initialPhoneNumber,
  autoSendInitialCode = false,
}: ClubChlorineLoginClientProps) {
  const [phoneAuthStep, setPhoneAuthStep] = useState<PhoneAuthStep>(() =>
    autoSendInitialCode && initialPhoneNumber ? "verification" : "phone",
  );
  const heading =
    phoneAuthStep === "verification" || phoneAuthStep === "completing"
      ? "Enter your verification code"
      : phoneAuthStep === "captcha"
        ? "Captcha verification"
        : trimmedOrFallback(authBranding?.heading, siteAuthConfiguration.heading);

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
  const legalLinks = [
    { href: buildTenantHref(tenantBaseUrl, "/terms"), label: "Terms" },
    { href: buildTenantHref(tenantBaseUrl, "/privacy"), label: "Privacy" },
    { href: buildTenantHref(tenantBaseUrl, "/data"), label: "Data" },
  ];

  return (
    <ChlorineAppShell
      mode="collapsed"
      linkComponent={Link}
      wordmarkHref={tenantBaseUrl}
      skipAnimation
      contentMaxWidthPx={390}
      legalLinks={legalLinks}
      yearLabel=""
    >
      <section
        aria-labelledby="club-chlorine-login-heading"
        className="mx-auto flex w-full max-w-[360px] flex-col gap-4 text-center"
      >
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

        <SignInClient
          redirectUrl={redirectUrl}
          preset={preset}
          siteAuthConfiguration={siteAuthConfiguration}
          eventThemeBackgroundColor={eventThemeBackgroundColor}
          eventThemeTextColor={eventThemeTextColor}
          authBranding={authBranding}
          allowedRedirectOrigins={allowedRedirectOrigins}
          initialPhoneNumber={initialPhoneNumber}
          autoSendInitialCode={autoSendInitialCode}
          onPhoneAuthStepChange={setPhoneAuthStep}
          brandMarkSlot={null}
          noShell
        />
      </section>
    </ChlorineAppShell>
  );
}
