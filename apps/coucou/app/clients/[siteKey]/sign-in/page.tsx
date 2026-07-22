import { auth } from "@clerk/nextjs/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { siteConfigurations } from "@coucou/sdk";
import { resolveSafeRedirectUrl } from "@coucou/sdk/routes";
import type { SiteKey } from "@coucou/sdk/site-config";
import type { AuthBrandingOverrides } from "@coucou/ui/auth";
import { fetchQuery } from "convex/nextjs";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  buildClientAuthAllowedRedirectOrigins,
  resolveSatelliteHomeUrl,
} from "@/lib/client-auth-origins";
import { extractEventIdFromRedirectUrl } from "@/lib/workspace-login-branding";
import { SignInClient } from "../../../sign-in/[[...sign-in]]/sign-in-client";
import { ClubChlorineLoginClient } from "./club-chlorine-login-client";

type RawSearchParams = Record<string, string | string[] | undefined>;

interface ClientAuthPageParams {
  siteKey: string;
}

type ThemedEvent = {
  _id: Id<"events">;
  themeBackgroundColor?: string | null;
  themeTextColor?: string | null;
};

type RsvpHandoffResolution = {
  phoneNumber: string;
  expiresAt: number;
  canAutoSendCode: boolean;
} | null;

function ensureString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function isClientSiteKey(value: string): value is SiteKey {
  if (
    value !== "dojo" &&
    value !== "club-chlorine" &&
    value !== "danza-organica" &&
    value !== "coucou"
  ) {
    return false;
  }
  return siteConfigurations[value as SiteKey].appKind === "client";
}

function mapEventToThemedEvent(event: {
  _id: Id<"events">;
  themeBackgroundColor?: string | null;
  themeTextColor?: string | null;
}): ThemedEvent {
  return {
    _id: event._id,
    themeBackgroundColor: event.themeBackgroundColor ?? null,
    themeTextColor: event.themeTextColor ?? null,
  };
}

async function loadEventForTheme({
  eventId,
  siteKey,
}: {
  eventId: string | null;
  siteKey: SiteKey;
}): Promise<ThemedEvent | null> {
  if (!eventId) return null;

  try {
    const event = await fetchQuery(api.events.getByRouteId, {
      eventRouteId: eventId,
      siteKey,
    });
    return event ? mapEventToThemedEvent(event) : null;
  } catch (error) {
    console.error("Failed to load event for client sign-in theme", error);
    return null;
  }
}

async function resolveRsvpHandoffPhone(token: string | undefined): Promise<RsvpHandoffResolution> {
  if (!token) return null;

  try {
    return await fetchQuery(api.rsvps.resolveGuestRsvpHandoff, {
      token,
    });
  } catch (error) {
    console.error("Failed to resolve RSVP auth handoff", error);
    return null;
  }
}

/**
 * Dedicated client/satellite auth handoff. Lives outside `/workspaces/...`
 * so post-auth navigation never falls back to a workspace dashboard
 * (which is org-gated). The fallback for an authenticated user without a
 * valid `redirect_url` is the satellite's home origin — this surface
 * exists strictly to bounce event-goers back to the site they came from.
 */
export default async function ClientAuthSignInPage({
  params,
  searchParams,
}: {
  params: Promise<ClientAuthPageParams>;
  searchParams?: Promise<RawSearchParams>;
}) {
  const { siteKey: rawSiteKey } = await params;
  if (!isClientSiteKey(rawSiteKey)) {
    notFound();
  }
  const siteKey = rawSiteKey;
  const siteConfiguration = siteConfigurations[siteKey];
  const siteAuthConfiguration = siteConfiguration.auth;

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const redirectUrlParam = ensureString(resolvedSearchParams.redirect_url);
  const rsvpHandoffToken = ensureString(resolvedSearchParams.rsvp_handoff);

  // Pull the inbound origin signals so the allow-list and satellite-
  // home fallback track whatever environment the satellite is actually
  // running on (localhost / preview / production). Hard-coded
  // `siteConfiguration.domain` is only used as a last-resort fallback
  // when no live signal matches.
  const headersList = await headers();
  const refererHeader = headersList.get("referer");
  const candidateOrigins = [redirectUrlParam, refererHeader] as const;

  const allowedRedirectOrigins = buildClientAuthAllowedRedirectOrigins(siteKey, {
    candidateOrigins,
  });
  const satelliteHomeUrl = resolveSatelliteHomeUrl(siteKey, {
    candidateOrigins,
  });

  const redirectUrl = resolveSafeRedirectUrl(
    redirectUrlParam,
    satelliteHomeUrl,
    allowedRedirectOrigins,
  );

  const authObject = await auth();
  if (authObject.userId) {
    redirect(redirectUrl);
  }

  const themedEvent = await loadEventForTheme({
    eventId: extractEventIdFromRedirectUrl(redirectUrl),
    siteKey,
  });
  const rsvpHandoff = await resolveRsvpHandoffPhone(rsvpHandoffToken);
  const shouldAutoSendInitialCode = Boolean(
    rsvpHandoff?.phoneNumber && rsvpHandoff.canAutoSendCode,
  );

  // No workspace authBranding overrides — those were a workspace-document
  // concept that doesn't apply to client/satellite handoffs. Defaults
  // come straight from the site auth configuration.
  const loginAuthBranding: AuthBrandingOverrides = {
    heading: siteAuthConfiguration.heading,
    sub: siteAuthConfiguration.description,
    eyebrow: undefined,
    brandMarkStyle: "square-serif",
    showCoucouAttribution: true,
  };

  if (siteKey === "club-chlorine") {
    return (
      <ClubChlorineLoginClient
        redirectUrl={redirectUrl}
        tenantBaseUrl={satelliteHomeUrl}
        preset={siteConfiguration.preset}
        siteAuthConfiguration={siteAuthConfiguration}
        eventThemeBackgroundColor={themedEvent?.themeBackgroundColor ?? null}
        eventThemeTextColor={themedEvent?.themeTextColor ?? null}
        authBranding={loginAuthBranding}
        allowedRedirectOrigins={allowedRedirectOrigins}
        initialPhoneNumber={rsvpHandoff?.phoneNumber ?? null}
        autoSendInitialCode={shouldAutoSendInitialCode}
      />
    );
  }

  return (
    <SignInClient
      redirectUrl={redirectUrl}
      preset={siteConfiguration.preset}
      siteAuthConfiguration={siteAuthConfiguration}
      eventThemeBackgroundColor={themedEvent?.themeBackgroundColor ?? null}
      eventThemeTextColor={themedEvent?.themeTextColor ?? null}
      authBranding={loginAuthBranding}
      allowedRedirectOrigins={allowedRedirectOrigins}
      initialPhoneNumber={rsvpHandoff?.phoneNumber ?? null}
      autoSendInitialCode={shouldAutoSendInitialCode}
    />
  );
}
