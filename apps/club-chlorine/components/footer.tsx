import Image from "next/image";
import { siteConfiguration } from "@/lib/site";
import { TenantLegalFooter } from "@coucou/ui/tenant-template";

/**
 * Club Chlorine's footer is the shared editorial scaffolding. The legal
 * links + brand line are themed via the chlorine preset's --tt-* tokens.
 * The swimmer mark sits in the right slot so the brand carries through to
 * the bottom of the page.
 */
export function Footer() {
  return (
    <TenantLegalFooter
      preset={siteConfiguration.preset}
      brandName={siteConfiguration.brandName}
      contact={
        <Image
          src="/icon.svg"
          width={36}
          height={21}
          alt={siteConfiguration.brandName}
          priority={false}
        />
      }
    />
  );
}
