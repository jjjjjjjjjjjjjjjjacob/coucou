import {
  buildPublicEventUrl as buildSitePublicEventUrl,
  getEventRouteId,
  type PublicEventRouteRecord,
} from "@coucou/sdk/shared/event-routes";
import { type SiteKey, siteConfigurations } from "@coucou/sdk/site-config";

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
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

type PublicEventIdentifier = string | PublicEventRouteRecord;

interface PublicEventUrlOptions {
  currentOrigin?: string | null;
  vercelEnvironment?: string | null;
}

function resolvePublicEventRouteId(event: PublicEventIdentifier): string {
  return typeof event === "string" ? event : getEventRouteId(event);
}

function isSiteKey(value: string): value is SiteKey {
  return value in siteConfigurations;
}

function resolveClientWorkspaceSite(workspace: PublicUrlWorkspace): WorkspaceSite | null {
  const sites = workspace?.sites ?? [];
  for (const site of sites) {
    if (isSiteKey(site.siteKey) && siteConfigurations[site.siteKey].appKind === "client") {
      return site;
    }
    if (!isSiteKey(site.siteKey) && site.appKind !== "admin") {
      return site;
    }
  }
  return null;
}

export function buildPublicEventUrl(
  workspace: PublicUrlWorkspace,
  event: PublicEventIdentifier,
  options: PublicEventUrlOptions = {},
): string | null {
  if (!workspace) return null;
  const eventRouteId = resolvePublicEventRouteId(event);
  const clientWorkspaceSite = resolveClientWorkspaceSite(workspace);
  const clientSiteKey = clientWorkspaceSite?.siteKey;

  if (clientSiteKey && isSiteKey(clientSiteKey)) {
    return buildSitePublicEventUrl({
      event: { _id: eventRouteId },
      siteConfiguration: siteConfigurations[clientSiteKey],
      currentOrigin: options.currentOrigin,
      domain: workspace.primaryDomain ?? clientWorkspaceSite?.domain ?? null,
      vercelEnvironment: options.vercelEnvironment,
    });
  }

  if (workspace.primaryDomain) {
    const url = trimTrailingSlash(ensureProtocol(workspace.primaryDomain));
    return `${url}/events/${eventRouteId}`;
  }

  if (clientWorkspaceSite?.domain) {
    const url = trimTrailingSlash(ensureProtocol(clientWorkspaceSite.domain));
    return `${url}/events/${eventRouteId}`;
  }

  return null;
}
