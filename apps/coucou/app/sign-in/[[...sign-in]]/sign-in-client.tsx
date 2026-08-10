"use client";

import { getClientSiteRedirectOrigins, type PresetKey } from "@coucou/sdk";
import type { SiteAuthConfiguration } from "@coucou/sdk/site-config";
import { type AuthBrandingOverrides, PhoneAuthPage, type PhoneAuthStep } from "@coucou/ui/auth";
import { type ReactNode, useMemo } from "react";
import { CoucouLogoMark } from "@/components/coucou-logo";
import { siteConfiguration } from "@/lib/site";

interface SignInClientProps {
  redirectUrl: string;
  eventThemeBackgroundColor?: string | null;
  eventThemeTextColor?: string | null;
  eventThemeAccentColor?: string | null;
  preset?: PresetKey;
  siteAuthConfiguration?: SiteAuthConfiguration;
  authBranding?: AuthBrandingOverrides | null;
  brandMarkSlot?: ReactNode;
  postAuthNavigation?: "router" | "document-replace";
  noShell?: boolean;
  initialPhoneNumber?: string | null;
  autoSendInitialCode?: boolean;
  onPhoneAuthStepChange?: (step: PhoneAuthStep) => void;
  /**
   * Origins the post-auth redirect is allowed to point at. The workspace
   * login route resolves this server-side from the workspace's site
   * domains plus the dev env-var allow-list and forwards it here so the
   * client-side `resolveSafeRedirectUrl` agrees with the server about
   * which satellite origins are valid (otherwise localhost / preview
   * deploys would be silently rejected and the user would stay on
   * coucou after sign-in).
   */
  allowedRedirectOrigins?: readonly string[];
}

export function SignInClient({
  redirectUrl,
  eventThemeBackgroundColor,
  eventThemeTextColor,
  eventThemeAccentColor,
  preset = siteConfiguration.preset,
  siteAuthConfiguration = siteConfiguration.auth,
  authBranding = null,
  brandMarkSlot,
  postAuthNavigation = "router",
  noShell = false,
  allowedRedirectOrigins: allowedRedirectOriginsOverride,
  initialPhoneNumber,
  autoSendInitialCode = false,
  onPhoneAuthStepChange,
}: SignInClientProps) {
  // When the user reaches sign-in via redirect from an event page, the
  // server-side page.tsx hands us the event's theme override pair so the
  // entire auth surface picks up the takeover styling.
  const eventThemeOverride = useMemo(() => {
    if (!eventThemeBackgroundColor && !eventThemeTextColor && !eventThemeAccentColor) return null;
    return {
      themeBackgroundColor: eventThemeBackgroundColor ?? undefined,
      themeTextColor: eventThemeTextColor ?? undefined,
      themeAccentColor: eventThemeAccentColor ?? undefined,
    };
  }, [eventThemeAccentColor, eventThemeBackgroundColor, eventThemeTextColor]);
  const isCoucouPlatformAuthentication = siteAuthConfiguration === siteConfiguration.auth;
  const resolvedBrandMarkSlot =
    brandMarkSlot ?? (isCoucouPlatformAuthentication ? <CoucouLogoMark size={64} /> : undefined);
  const allowedRedirectOrigins = useMemo(() => {
    if (allowedRedirectOriginsOverride && allowedRedirectOriginsOverride.length > 0) {
      // Merge with the default client-site origins so satellites still
      // work even if the server only forwarded a workspace-specific
      // subset (and so the dev env-var origins land here client-side).
      const merged = new Set<string>([
        ...allowedRedirectOriginsOverride,
        ...getClientSiteRedirectOrigins(),
      ]);
      return [...merged];
    }
    return getClientSiteRedirectOrigins();
  }, [allowedRedirectOriginsOverride]);

  return (
    <PhoneAuthPage
      siteAuthConfiguration={siteAuthConfiguration}
      redirectUrl={redirectUrl}
      preset={preset}
      authBranding={authBranding}
      brandMarkSlot={resolvedBrandMarkSlot}
      allowedRedirectOrigins={allowedRedirectOrigins}
      event={eventThemeOverride}
      postAuthNavigation={postAuthNavigation}
      initialPhoneNumber={initialPhoneNumber}
      autoSendInitialCode={autoSendInitialCode}
      onPhoneAuthStepChange={onPhoneAuthStepChange}
      noShell={noShell}
    />
  );
}
