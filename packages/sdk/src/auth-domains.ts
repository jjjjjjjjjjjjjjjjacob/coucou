import { type SiteConfiguration, type SiteKey, siteConfigurations } from "./site-config";

export const CLERK_SATELLITE_SYNC_PARAM = "__clerk_synced";
export const CLERK_SATELLITE_SYNC_VALUE = "false";

const localClientSiteOrigins: Partial<Record<SiteKey, string>> = {
  dojo: "http://localhost:5678",
  "club-chlorine": "http://localhost:5679",
};

export function getSiteOrigin(siteConfiguration: SiteConfiguration): string {
  return new URL(siteConfiguration.domain).origin;
}

export function getClientSiteRedirectOrigins(): string[] {
  const redirectOrigins = Object.values(siteConfigurations)
    .filter((siteConfiguration) => siteConfiguration.appKind === "client")
    .map(getSiteOrigin);
  if (process.env.NODE_ENV !== "production") {
    redirectOrigins.push(...Object.values(localClientSiteOrigins));
  }
  return [...new Set(redirectOrigins)];
}

export function buildSatelliteReturnUrl(baseUrl: string, redirectPath: string): string {
  const satelliteReturnUrl = new URL(redirectPath, baseUrl);
  satelliteReturnUrl.searchParams.set(CLERK_SATELLITE_SYNC_PARAM, CLERK_SATELLITE_SYNC_VALUE);
  return satelliteReturnUrl.toString();
}

export function buildTenantPrimarySignInUrl({
  primaryBaseUrl,
  siteConfiguration,
  redirectUrl,
}: {
  primaryBaseUrl: string;
  siteConfiguration: SiteConfiguration;
  redirectUrl?: string | null;
}): string {
  // Client/satellite auth handoff. Routes to the dedicated coucou
  // `/clients/[siteKey]/sign-in` surface — NOT `/workspaces/[slug]/login`
  // (which is org-gated for workspace operators and would trap event-
  // goers post-auth).
  const primarySignInUrl = new URL(`/clients/${siteConfiguration.siteKey}/sign-in`, primaryBaseUrl);

  if (redirectUrl) {
    primarySignInUrl.searchParams.set("redirect_url", redirectUrl);
  }

  return primarySignInUrl.toString();
}

export function buildTenantSatelliteSignInUrl({
  primaryBaseUrl,
  siteConfiguration,
  redirectPath,
}: {
  primaryBaseUrl: string;
  siteConfiguration: SiteConfiguration;
  redirectPath?: string | null;
}): string {
  const fallbackRedirectPath = siteConfiguration.auth.signInRedirectPath;
  const satelliteReturnUrl = buildSatelliteReturnUrl(
    getSiteOrigin(siteConfiguration),
    redirectPath ?? fallbackRedirectPath,
  );

  return buildTenantPrimarySignInUrl({
    primaryBaseUrl,
    siteConfiguration,
    redirectUrl: satelliteReturnUrl,
  });
}
