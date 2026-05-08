import { siteConfigurations } from "@coucou/sdk/site-config";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolvePublicBaseUrlForSite(siteKey?: string | null): string | null {
  const normalizedSiteKey = siteKey ?? "dojo";
  const siteConfiguration =
    siteConfigurations[normalizedSiteKey as keyof typeof siteConfigurations];

  if (siteConfiguration?.domain) {
    return trimTrailingSlash(siteConfiguration.domain);
  }

  const fallbackBaseUrl = process.env.APP_BASE_URL?.trim();
  return fallbackBaseUrl ? trimTrailingSlash(fallbackBaseUrl) : null;
}

export function resolvePublicBaseUrlForEvent(
  event: { siteKey?: string | null } | null,
): string | null {
  return resolvePublicBaseUrlForSite(event?.siteKey);
}
