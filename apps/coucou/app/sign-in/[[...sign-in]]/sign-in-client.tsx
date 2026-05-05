"use client";

import React, { useMemo } from "react";
import { PhoneAuthPage, type AuthBrandingOverrides } from "@coucou/ui/auth";
import type { PresetKey } from "@coucou/sdk";
import type { SiteAuthConfiguration } from "@coucou/sdk/site-config";
import { siteConfiguration } from "@/lib/site";

interface SignInClientProps {
  redirectUrl: string;
  eventThemeBackgroundColor?: string | null;
  eventThemeTextColor?: string | null;
  preset?: PresetKey;
  siteAuthConfiguration?: SiteAuthConfiguration;
  authBranding?: AuthBrandingOverrides | null;
  postAuthNavigation?: "router" | "document-replace";
}

export function SignInClient({
  redirectUrl,
  eventThemeBackgroundColor,
  eventThemeTextColor,
  preset = siteConfiguration.preset,
  siteAuthConfiguration = siteConfiguration.auth,
  authBranding = null,
  postAuthNavigation = "router",
}: SignInClientProps) {
  // When the user reaches sign-in via redirect from an event page, the
  // server-side page.tsx hands us the event's theme override pair so the
  // entire auth surface picks up the takeover styling.
  const eventThemeOverride = useMemo(() => {
    if (!eventThemeBackgroundColor && !eventThemeTextColor) return null;
    return {
      themeBackgroundColor: eventThemeBackgroundColor ?? undefined,
      themeTextColor: eventThemeTextColor ?? undefined,
    };
  }, [eventThemeBackgroundColor, eventThemeTextColor]);

  return (
    <PhoneAuthPage
      siteAuthConfiguration={siteAuthConfiguration}
      redirectUrl={redirectUrl}
      preset={preset}
      authBranding={authBranding}
      event={eventThemeOverride}
      postAuthNavigation={postAuthNavigation}
    />
  );
}
