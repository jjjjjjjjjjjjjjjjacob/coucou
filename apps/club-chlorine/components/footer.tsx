import { TenantLegalFooter } from "@coucou/ui/tenant-template";
import { siteConfiguration } from "@/lib/site";

/**
 * Club Chlorine's footer is the shared editorial scaffolding. The legal
 * links are themed via the chlorine preset's --tt-* tokens. The brand line
 * and swimmer mark are intentionally hidden so the bottom of the page only
 * carries the legal nav.
 */
export function Footer() {
  return <TenantLegalFooter preset={siteConfiguration.preset} showBrand={false} />;
}
