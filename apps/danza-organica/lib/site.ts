import { siteConfigurations } from "@coucou/sdk/site-config";

export const siteConfiguration = siteConfigurations["danza-organica"];

export const coucouBaseUrl = (
  process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680"
).replace(/\/+$/, "");

/**
 * danzaorganica.coucou.events is a SUBDOMAIN of the primary Clerk domain
 * (coucou.events) — unlike the apex-domain tenants (dojopomodoro.club,
 * clubchlorine.party). Clerk session cookies are scoped to .coucou.events,
 * so requests from the production host share the primary session natively
 * and must NOT run in Clerk satellite mode (satellite mode forces a
 * handshake against clerk.danzaorganica.coucou.events, a Frontend API host
 * Clerk never provisions for primary-domain subdomains). Local dev
 * (localhost:5677 vs the primary on localhost:5680) still needs the
 * satellite handoff, as do non-coucou hosts like vercel.app previews.
 */
export function shouldUseClerkSatelliteModeForHost(
  requestHost: string,
  primaryBaseUrl: string = coucouBaseUrl,
): boolean {
  try {
    const primaryHost = new URL(primaryBaseUrl).host;
    const isPrimaryOrSubdomainHost =
      requestHost === primaryHost || requestHost.endsWith(`.${primaryHost}`);
    return !isPrimaryOrSubdomainHost;
  } catch {
    return true;
  }
}

const danzaOrganicaIconVersion = "danza-organica-v1";

function buildVersionedDanzaOrganicaIconPath(path: string) {
  return `${path}?v=${danzaOrganicaIconVersion}`;
}

export const danzaOrganicaIconPaths = {
  appleTouchIcon: buildVersionedDanzaOrganicaIconPath("/apple-touch-icon.png"),
  faviconIco: buildVersionedDanzaOrganicaIconPath("/favicon.ico"),
  faviconPng: buildVersionedDanzaOrganicaIconPath("/favicon.png"),
  icon192: buildVersionedDanzaOrganicaIconPath("/icon-192x192.png"),
  manifest: buildVersionedDanzaOrganicaIconPath("/manifest.json"),
  svg: buildVersionedDanzaOrganicaIconPath("/icon.svg"),
} as const;
