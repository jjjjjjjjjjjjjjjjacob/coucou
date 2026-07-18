import type { SiteConfiguration, SiteKey } from "../site-config";

export const REFERRAL_QUERY_PARAM = "ref";

export interface PublicEventRouteRecord {
  _id: string;
  shortId?: string | null;
}

export type PublicOriginEnvironment = "local" | "development" | "production";

export interface ResolvePublicSiteOriginOptions {
  siteConfiguration: SiteConfiguration;
  currentOrigin?: string | null;
  domain?: string | null;
  localOrigin?: string | null;
  vercelEnvironment?: string | null;
}

export interface BuildPublicEventUrlOptions extends ResolvePublicSiteOriginOptions {
  event: PublicEventRouteRecord;
}

const localSiteOrigins: Record<SiteKey, string> = {
  dojo: "http://localhost:5678",
  "club-chlorine": "http://localhost:5679",
  coucou: "http://localhost:5680",
};

const localHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function ensureProtocol(value: string): string {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseOrigin(value: string | null | undefined): URL | null {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;
  try {
    return new URL(ensureProtocol(trimmedValue));
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  return localHostnames.has(hostname) || hostname.endsWith(".localhost");
}

function isDevelopmentHostname(hostname: string): boolean {
  return hostname.startsWith("dev.") || hostname.endsWith(".vercel.app");
}

function normalizeOrigin(value: string): string {
  const parsedUrl = parseOrigin(value);
  if (parsedUrl) {
    return parsedUrl.origin;
  }
  return trimTrailingSlash(ensureProtocol(value));
}

function resolveMatchingConfiguredCurrentOrigin(
  siteConfiguration: SiteConfiguration,
  currentOrigin: string | null | undefined,
): string | null {
  const parsedCurrentOrigin = parseOrigin(currentOrigin);
  if (!parsedCurrentOrigin) return null;

  const configuredOrigins = [
    siteConfiguration.domain,
    ...(siteConfiguration.domainAliases ?? []),
  ].map((configuredDomain) => normalizeOrigin(configuredDomain));

  return configuredOrigins.includes(parsedCurrentOrigin.origin) ? parsedCurrentOrigin.origin : null;
}

function buildDevelopmentOrigin(domain: string): string {
  const parsedUrl = parseOrigin(domain);
  if (!parsedUrl) {
    return normalizeOrigin(`dev.${domain}`);
  }

  if (!parsedUrl.hostname.startsWith("dev.")) {
    parsedUrl.hostname = `dev.${parsedUrl.hostname}`;
  }
  parsedUrl.pathname = "";
  parsedUrl.search = "";
  parsedUrl.hash = "";
  return parsedUrl.origin;
}

export function resolvePublicOriginEnvironment({
  currentOrigin,
  vercelEnvironment,
}: {
  currentOrigin?: string | null;
  vercelEnvironment?: string | null;
}): PublicOriginEnvironment {
  const currentOriginUrl = parseOrigin(currentOrigin);
  if (currentOriginUrl && isLocalHostname(currentOriginUrl.hostname)) {
    return "local";
  }

  const normalizedVercelEnvironment = vercelEnvironment?.trim().toLowerCase();
  if (normalizedVercelEnvironment && normalizedVercelEnvironment !== "production") {
    return "development";
  }

  if (currentOriginUrl && isDevelopmentHostname(currentOriginUrl.hostname)) {
    return "development";
  }

  return "production";
}

export function resolvePublicSiteOrigin({
  siteConfiguration,
  currentOrigin,
  domain,
  localOrigin,
  vercelEnvironment,
}: ResolvePublicSiteOriginOptions): string {
  const originEnvironment = resolvePublicOriginEnvironment({
    currentOrigin,
    vercelEnvironment,
  });

  if (originEnvironment === "local") {
    return normalizeOrigin(localOrigin ?? localSiteOrigins[siteConfiguration.siteKey]);
  }

  const configuredDomain = domain?.trim();
  const productionDomain =
    configuredDomain ??
    resolveMatchingConfiguredCurrentOrigin(siteConfiguration, currentOrigin) ??
    siteConfiguration.domain;
  if (originEnvironment === "development") {
    return buildDevelopmentOrigin(productionDomain);
  }

  return normalizeOrigin(productionDomain);
}

export function getEventRouteId(event: PublicEventRouteRecord): string {
  const trimmedShortId = event.shortId?.trim();
  return trimmedShortId && trimmedShortId.length > 0 ? trimmedShortId : event._id;
}

export function buildEventPath(event: PublicEventRouteRecord, suffix = ""): string {
  const normalizedSuffix = suffix ? (suffix.startsWith("/") ? suffix : `/${suffix}`) : "";
  return `/events/${getEventRouteId(event)}${normalizedSuffix}`;
}

export function buildEventPathFromRouteId(eventRouteId: string, suffix = ""): string {
  const normalizedSuffix = suffix ? (suffix.startsWith("/") ? suffix : `/${suffix}`) : "";
  return `/events/${eventRouteId}${normalizedSuffix}`;
}

export function buildPublicEventUrl({
  event,
  siteConfiguration,
  currentOrigin,
  domain,
  localOrigin,
  vercelEnvironment,
}: BuildPublicEventUrlOptions): string {
  const origin = resolvePublicSiteOrigin({
    siteConfiguration,
    currentOrigin,
    domain,
    localOrigin,
    vercelEnvironment,
  });
  return `${origin}/events/${getEventRouteId(event)}`;
}

export function buildReferralUrl(baseUrl: string, referralCode: string): string {
  const trimmedReferralCode = referralCode.trim();
  if (!trimmedReferralCode) {
    return baseUrl;
  }

  try {
    const parsedUrl = new URL(baseUrl);
    parsedUrl.searchParams.set(REFERRAL_QUERY_PARAM, trimmedReferralCode);
    return parsedUrl.toString();
  } catch {
    const parsedUrl = new URL(baseUrl, "https://coucou.local");
    parsedUrl.searchParams.set(REFERRAL_QUERY_PARAM, trimmedReferralCode);
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  }
}
