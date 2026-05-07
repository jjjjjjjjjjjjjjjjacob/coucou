import {
  siteConfigurations,
  type SiteConfiguration,
} from "./site-config";

export const CLERK_SATELLITE_SYNC_PARAM = "__clerk_synced";
export const CLERK_SATELLITE_SYNC_VALUE = "false";

export function getSiteOrigin(siteConfiguration: SiteConfiguration): string {
  return new URL(siteConfiguration.domain).origin;
}

export function getClientSiteRedirectOrigins(): string[] {
  return Object.values(siteConfigurations)
    .filter((siteConfiguration) => siteConfiguration.appKind === "client")
    .map(getSiteOrigin);
}

export function buildSatelliteReturnUrl(
  baseUrl: string,
  redirectPath: string,
): string {
  const satelliteReturnUrl = new URL(redirectPath, baseUrl);
  satelliteReturnUrl.searchParams.set(
    CLERK_SATELLITE_SYNC_PARAM,
    CLERK_SATELLITE_SYNC_VALUE,
  );
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
  const primarySignInUrl = new URL(
    `/workspaces/${siteConfiguration.workspaceSlug}/login`,
    primaryBaseUrl,
  );

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
