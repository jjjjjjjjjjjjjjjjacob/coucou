import { siteConfiguration } from "@/lib/site";
import { TenantLegalFooter } from "@coucou/ui/tenant-template";

/**
 * Coucou's footer is the shared editorial scaffolding with the platform's
 * actual contact email surfaced on the right edge — the design's landing
 * page footer pattern.
 */
export function Footer() {
  return (
    <TenantLegalFooter
      preset={siteConfiguration.preset}
      brandName={siteConfiguration.brandName}
      contact={
        <a
          href="mailto:hello@coucou.house"
          className="transition-opacity hover:opacity-80"
          style={{ color: "var(--tt-fg-dim)" }}
        >
          hello@coucou.house
        </a>
      }
    />
  );
}
