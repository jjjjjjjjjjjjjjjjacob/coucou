import { siteConfigurations } from "@coucou/sdk/site-config";

export const siteConfiguration = siteConfigurations["danza-organica"];

export const coucouBaseUrl = (
  process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680"
).replace(/\/+$/, "");

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
