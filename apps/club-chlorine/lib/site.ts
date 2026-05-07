import { siteConfigurations } from "@coucou/sdk/site-config";

export const siteConfiguration = siteConfigurations["club-chlorine"];

export const coucouBaseUrl = (
  process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680"
).replace(/\/+$/, "");

const clubChlorineIconVersion = "club-chlorine-swimmer-v1";

function buildVersionedClubChlorineIconPath(path: string) {
  return `${path}?v=${clubChlorineIconVersion}`;
}

export const clubChlorineIconPaths = {
  appleTouchIcon: buildVersionedClubChlorineIconPath("/apple-touch-icon.png"),
  faviconIco: buildVersionedClubChlorineIconPath("/favicon.ico"),
  faviconPng: buildVersionedClubChlorineIconPath("/favicon.png"),
  icon192: buildVersionedClubChlorineIconPath("/icon-192x192.png"),
  manifest: buildVersionedClubChlorineIconPath("/manifest.json"),
  svg: buildVersionedClubChlorineIconPath("/icon.svg"),
} as const;
