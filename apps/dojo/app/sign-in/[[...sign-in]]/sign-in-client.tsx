"use client";

import { PhoneAuthPage } from "@coucou/ui/auth";
import { useMemo } from "react";
import { siteConfiguration } from "@/lib/site";

interface SignInClientProps {
  redirectUrl: string;
  eventThemeBackgroundColor?: string | null;
  eventThemeTextColor?: string | null;
}

export function SignInClient({
  redirectUrl,
  eventThemeBackgroundColor,
  eventThemeTextColor,
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
      siteAuthConfiguration={siteConfiguration.auth}
      redirectUrl={redirectUrl}
      preset={siteConfiguration.preset}
      event={eventThemeOverride}
    />
  );
}
