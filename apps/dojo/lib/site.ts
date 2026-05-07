import { siteConfigurations } from "@coucou/sdk/site-config";

export const siteConfiguration = siteConfigurations.dojo;

export const coucouBaseUrl = (
  process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680"
).replace(/\/+$/, "");
