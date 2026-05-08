import { siteConfigurations, type SiteKey } from "@coucou/sdk/site-config";

type WorkspaceSite = {
  siteKey: string;
  domain?: string;
  appKind?: string;
};

export type PublicUrlWorkspace = {
  primaryDomain?: string;
  sites?: WorkspaceSite[];
} | null;

function ensureProtocol(value: string): string {
  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildPublicEventUrl(
  workspace: PublicUrlWorkspace,
  eventId: string,
): string | null {
  if (!workspace) return null;

  if (workspace.primaryDomain) {
    const url = trimTrailingSlash(ensureProtocol(workspace.primaryDomain));
    return `${url}/events/${eventId}`;
  }

  const sites = workspace.sites ?? [];
  for (const site of sites) {
    const configuration =
      siteConfigurations[site.siteKey as SiteKey] ?? undefined;
    if (configuration?.appKind === "client" && configuration.domain) {
      return `${trimTrailingSlash(configuration.domain)}/events/${eventId}`;
    }
    if (site.domain && site.appKind !== "admin") {
      const url = trimTrailingSlash(ensureProtocol(site.domain));
      return `${url}/events/${eventId}`;
    }
  }

  return null;
}
