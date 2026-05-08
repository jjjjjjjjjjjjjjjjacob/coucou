import { getSiteOrigin, siteConfigurations } from "@coucou/sdk";
import type { SiteKey } from "@coucou/sdk/site-config";
import { normalizeDomainOrigin } from "./workspace-login-branding";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return LOCAL_HOSTNAMES.has(url.hostname) || url.hostname.endsWith(".local");
  } catch {
    return false;
  }
}

function isVercelPreviewOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return /\.vercel\.app$/.test(url.hostname);
  } catch {
    return false;
  }
}

interface AllowedOriginContext {
  /**
   * Origins observed on the inbound request — typically the parsed
   * origins of the `redirect_url` query param and the `Referer` header.
   * In non-production environments, candidates that look like local
   * dev (localhost / *.local) or Vercel preview hosts are folded into
   * the allow list so the redirect target naturally tracks whatever
   * environment the satellite is actually running on, without needing
   * to set explicit env vars.
   */
  candidateOrigins?: ReadonlyArray<string | null | undefined>;
}

/**
 * Allowed redirect origins for the dedicated `/clients/[siteKey]/sign-in`
 * route. Production deployments rely on the site-config production
 * origin + `COUCOU_DEV_ALLOWED_SATELLITE_ORIGINS`. Dev / preview deploys
 * additionally auto-trust localhost / `*.vercel.app` candidates derived
 * from the inbound request, so a locally-running satellite always lands
 * back on itself rather than the hard-coded production URL.
 */
export function buildClientAuthAllowedRedirectOrigins(
  siteKey: SiteKey,
  context: AllowedOriginContext = {},
): string[] {
  const allowed = new Set<string>();

  const siteConfig = siteConfigurations[siteKey];
  if (siteConfig) {
    allowed.add(getSiteOrigin(siteConfig));
  }

  for (const candidate of (process.env.COUCOU_DEV_ALLOWED_SATELLITE_ORIGINS ?? "").split(",")) {
    const normalized = normalizeDomainOrigin(candidate);
    if (normalized) {
      allowed.add(normalized);
    }
  }

  const isProduction = process.env.NODE_ENV === "production";
  const isVercelPreview = process.env.VERCEL_ENV === "preview";

  for (const candidate of context.candidateOrigins ?? []) {
    if (!candidate) continue;
    let candidateOrigin: string;
    try {
      candidateOrigin = new URL(candidate).origin;
    } catch {
      continue;
    }
    if (!isProduction && isLocalhostOrigin(candidateOrigin)) {
      allowed.add(candidateOrigin);
    } else if ((isVercelPreview || !isProduction) && isVercelPreviewOrigin(candidateOrigin)) {
      allowed.add(candidateOrigin);
    }
  }

  return [...allowed];
}

/**
 * Picks the satellite-home URL the user should bounce to after auth
 * when no usable `redirect_url` is provided. Prefers the live request's
 * own origin (parsed from candidates like the inbound `redirect_url`
 * query and `Referer` header) over the hard-coded production domain so
 * a locally-running satellite never gets shipped to production. The
 * production origin from `siteConfigurations` is the final fallback for
 * misconfigured environments.
 */
export function resolveSatelliteHomeUrl(
  siteKey: SiteKey,
  context: AllowedOriginContext = {},
): string {
  const allowedOrigins = buildClientAuthAllowedRedirectOrigins(siteKey, context);
  for (const candidate of context.candidateOrigins ?? []) {
    if (!candidate) continue;
    try {
      const candidateOrigin = new URL(candidate).origin;
      if (allowedOrigins.includes(candidateOrigin)) {
        return `${candidateOrigin}/`;
      }
    } catch {}
  }
  return `${getSiteOrigin(siteConfigurations[siteKey])}/`;
}
