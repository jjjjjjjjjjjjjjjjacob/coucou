import {
  resolvePublicOriginEnvironment,
  resolvePublicSiteOrigin,
} from "@coucou/sdk/shared/event-routes";
import { siteConfigurations } from "@coucou/sdk/site-config";

export const siteConfiguration = siteConfigurations.dojo;

export const coucouBaseUrl = (
  process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680"
).replace(/\/+$/, "");

export function resolveCoucouBaseUrl(
  currentOrigin: string,
  configuredOrigin = process.env.NEXT_PUBLIC_COUCOU_BASE_URL,
): string {
  const environment = resolvePublicOriginEnvironment({ currentOrigin });
  if (
    configuredOrigin &&
    resolvePublicOriginEnvironment({ currentOrigin: configuredOrigin }) === environment
  ) {
    return new URL(configuredOrigin).origin;
  }
  return resolvePublicSiteOrigin({ siteConfiguration: siteConfigurations.coucou, currentOrigin });
}
