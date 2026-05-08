"use client";

import { useAuth } from "@clerk/nextjs";
import type { EventThemeColorSource, PresetKey } from "@coucou/sdk";
import { resolveSafeRedirectUrl } from "@coucou/sdk/routes";
import type { SiteAuthConfiguration } from "@coucou/sdk/site-config";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { type AuthBrandingOverrides, AuthShell } from "./auth-shell";
import { PhoneAuthFlow } from "./phone-auth-flow";

function isExternalAbsoluteUrl(value: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return new URL(value).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export interface PhoneAuthPageProps {
  preset: PresetKey;
  siteAuthConfiguration: SiteAuthConfiguration;
  /**
   * Where to send the user once auth completes. Defaults to "/" — most apps
   * pass the inbound `redirect_url` query param so guests land on the page
   * they came from.
   */
  redirectUrl?: string;
  /**
   * Most sign-in pages can use App Router navigation. Admin login uses a full
   * document replace so Clerk session cookies are visible to server middleware
   * on the next request.
   */
  postAuthNavigation?: "router" | "document-replace";
  /**
   * Optional per-workspace overrides (heading copy, brand mark style,
   * powered-by toggle). Wired up later via the organizer CMS.
   */
  authBranding?: AuthBrandingOverrides | null;
  /**
   * Optional replacement for the default preset mark.
   */
  brandMarkSlot?: ReactNode;
  /**
   * Absolute origins that may receive a post-auth redirect. Primary Coucou
   * auth uses this for verified tenant satellite domains.
   */
  allowedRedirectOrigins?: readonly string[];
  /**
   * Optional event-takeover styling. When the user reaches sign-in via
   * redirect from an event page (the layout's `EventThemeProvider` resolved
   * a custom themeBackgroundColor / themeTextColor), pass that event here
   * so the auth surface picks up the same takeover.
   */
  event?: EventThemeColorSource | null;
  /**
   * Optional `onSuccess` override. If unset, the page navigates to
   * `redirectUrl` (or `/`) using the Next.js router.
   */
  onSuccess?: () => void;
  /**
   * When true, skip the inner `AuthShell` chrome (brand mark, heading, sub,
   * footer). The bare `PhoneAuthFlow` is rendered directly. Use when the
   * parent already provides chrome — e.g. the Club Chlorine split shell
   * supplies its own wordmark and footer.
   */
  noShell?: boolean;
}

/**
 * Tenant-branded sign-in page. Mounts inside each tenant app's
 * /sign-in/[[...sign-in]] route. The Clerk plumbing happens behind the
 * scenes via `usePhoneAuthFlow`; the visible chrome looks like the tenant
 * (Dojo / Club Chlorine / Coucou).
 */
export function PhoneAuthPage({
  preset,
  siteAuthConfiguration,
  redirectUrl,
  postAuthNavigation = "router",
  authBranding,
  brandMarkSlot,
  allowedRedirectOrigins = [],
  event,
  onSuccess,
  noShell = false,
}: PhoneAuthPageProps) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const hasTriggeredAuthenticatedRedirectRef = useRef(false);

  const authenticatedRedirectPath = useMemo(
    () =>
      resolveSafeRedirectUrl(
        redirectUrl,
        siteAuthConfiguration.signInRedirectPath || "/",
        allowedRedirectOrigins,
      ),
    [allowedRedirectOrigins, redirectUrl, siteAuthConfiguration.signInRedirectPath],
  );

  const navigateToAuthenticatedRedirectPath = useCallback(() => {
    if (isExternalAbsoluteUrl(authenticatedRedirectPath)) {
      window.location.replace(authenticatedRedirectPath);
      return;
    }

    if (postAuthNavigation === "document-replace" && typeof window !== "undefined") {
      window.location.replace(authenticatedRedirectPath);
      return;
    }

    router.replace(authenticatedRedirectPath);
  }, [authenticatedRedirectPath, postAuthNavigation, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || hasTriggeredAuthenticatedRedirectRef.current) {
      return;
    }

    hasTriggeredAuthenticatedRedirectRef.current = true;
    navigateToAuthenticatedRedirectPath();
  }, [isLoaded, isSignedIn, navigateToAuthenticatedRedirectPath]);

  const handleSuccess = useCallback(() => {
    if (onSuccess) {
      onSuccess();
      return;
    }
    navigateToAuthenticatedRedirectPath();
  }, [navigateToAuthenticatedRedirectPath, onSuccess]);

  if (isLoaded && isSignedIn) {
    const redirectingNotice = (
      <div
        role="status"
        className="rounded-md border px-4 py-3 text-center text-sm"
        style={{
          borderColor: "var(--tt-rule)",
          color: "var(--tt-fg-dim)",
        }}
      >
        Redirecting...
      </div>
    );
    if (noShell) return redirectingNotice;
    return (
      <AuthShell
        preset={preset}
        siteAuthConfiguration={siteAuthConfiguration}
        authBranding={authBranding}
        brandMarkSlot={brandMarkSlot}
        event={event}
      >
        {redirectingNotice}
      </AuthShell>
    );
  }

  if (noShell) {
    return <PhoneAuthFlow onSuccess={handleSuccess} />;
  }

  return (
    <AuthShell
      preset={preset}
      siteAuthConfiguration={siteAuthConfiguration}
      authBranding={authBranding}
      brandMarkSlot={brandMarkSlot}
      event={event}
    >
      <PhoneAuthFlow onSuccess={handleSuccess} />
    </AuthShell>
  );
}
