import { siteConfiguration } from "@/lib/site";
import { TenantLegalFooter } from "@coucou/ui/tenant-template";

/**
 * Club Chlorine's footer is the shared editorial scaffolding. The legal
 * links + brand line are themed via the maison preset's --tt-* tokens.
 */
export function Footer() {
  return (
    <TenantLegalFooter
      preset={siteConfiguration.preset}
      brandName={siteConfiguration.brandName}
    />
  );
}
