import {
  getSiteOrigin,
  siteConfigurations,
  type SiteConfiguration,
} from "@coucou/sdk";
import type { SiteKey } from "@coucou/sdk/site-config";

interface WorkspaceSiteLike {
  siteKey: string;
  domain: string;
}

interface WorkspaceLike {
  primaryDomain?: string | null;
  sites: readonly WorkspaceSiteLike[];
}

export function isSiteKey(value: string | null | undefined): value is SiteKey {
  return (
    value === "dojo" || value === "club-chlorine" || value === "coucou"
  );
}

export function normalizeDomainOrigin(
  domain: string | null | undefined,
): string | null {
  const trimmedDomain = domain?.trim();
  if (!trimmedDomain) {
    return null;
  }

  try {
    const domainUrl = new URL(
      trimmedDomain.match(/^https?:\/\//)
        ? trimmedDomain
        : `https://${trimmedDomain}`,
    );
    return domainUrl.origin;
  } catch {
    return null;
  }
}

export function resolvePrimaryClientSiteConfiguration(
  workspaceSites: readonly WorkspaceSiteLike[],
): SiteConfiguration | null {
  for (const workspaceSite of workspaceSites) {
    if (!isSiteKey(workspaceSite.siteKey)) {
      continue;
    }

    const siteConfiguration = siteConfigurations[workspaceSite.siteKey];
    if (siteConfiguration.appKind === "client") {
      return siteConfiguration;
    }
  }

  return null;
}

export function buildWorkspaceAllowedRedirectOrigins(
  workspace: WorkspaceLike,
): string[] {
  const allowedRedirectOrigins = new Set<string>();
  const workspacePrimaryOrigin = normalizeDomainOrigin(workspace.primaryDomain);
  if (workspacePrimaryOrigin) {
    allowedRedirectOrigins.add(workspacePrimaryOrigin);
  }

  for (const workspaceSite of workspace.sites) {
    const workspaceSiteOrigin = normalizeDomainOrigin(workspaceSite.domain);
    if (workspaceSiteOrigin) {
      allowedRedirectOrigins.add(workspaceSiteOrigin);
    }

    if (isSiteKey(workspaceSite.siteKey)) {
      allowedRedirectOrigins.add(
        getSiteOrigin(siteConfigurations[workspaceSite.siteKey]),
      );
    }
  }

  return [...allowedRedirectOrigins];
}

export function extractEventIdFromRedirectUrl(
  redirectUrl: string | undefined,
): string | null {
  if (!redirectUrl) {
    return null;
  }

  try {
    const parsedRedirectUrl = new URL(redirectUrl);
    const match = parsedRedirectUrl.pathname.match(/\/events\/([^/]+)/);
    return match?.[1] ?? null;
  } catch {
    const match = redirectUrl.match(/\/events\/([^/?#]+)/);
    return match?.[1] ?? null;
  }
}
