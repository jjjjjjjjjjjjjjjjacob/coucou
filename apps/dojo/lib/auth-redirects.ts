export function buildRedirectPathWithSearch(pathname: string, search: string): string {
  let normalizedSearch = "";
  if (search) {
    normalizedSearch = search.startsWith("?") ? search : `?${search}`;
  }
  return `${pathname}${normalizedSearch}`;
}

import { resolvePublicOriginEnvironment } from "@coucou/sdk/shared/event-routes";
import { siteConfiguration } from "./site";

export function resolveRequestSatelliteContext(headersList: Headers): {
  host: string;
  origin: string;
} {
  function firstHeaderValue(name: string) {
    return headersList.get(name)?.split(",")[0]?.trim();
  }
  const requestHost = [firstHeaderValue("x-forwarded-host"), firstHeaderValue("host")].find(
    (candidate) => candidate && !/[\s/\\]/.test(candidate),
  );
  const host = requestHost ?? new URL(siteConfiguration.domain).host;
  const forwardedProtocol = firstHeaderValue("x-forwarded-proto");
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : resolvePublicOriginEnvironment({ currentOrigin: `http://${host}` }) === "local"
        ? "http"
        : "https";
  return { host, origin: `${protocol}://${host}` };
}
