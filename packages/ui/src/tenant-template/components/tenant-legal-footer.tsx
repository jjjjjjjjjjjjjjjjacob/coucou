"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { PresetKey } from "@coucou/sdk";
import { TenantTemplateProvider } from "../provider";
import { usePreset } from "../use-preset";

export interface TenantLegalFooterProps {
  preset: PresetKey;
  /**
   * Brand wordmark in the footer.
   */
  brandName?: string;
  /**
   * Optional contact line (email or short note) shown on the right.
   */
  contact?: ReactNode;
  /**
   * Override the legal links shown in the middle. Defaults to the standard
   * Terms · Privacy · Cookies · Data set.
   */
  links?: Array<{ href: string; label: string }>;
}

const DEFAULT_LINKS: Array<{ href: string; label: string }> = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/data", label: "Data" },
];

/**
 * Editorial footer for the maison/coucou-preset tenant chrome. Hairline
 * border on top, brand on the left, legal links in the middle, optional
 * contact on the right. Self-themes via the active preset's --tt-* tokens.
 */
export function TenantLegalFooter({
  preset,
  brandName,
  contact,
  links = DEFAULT_LINKS,
}: TenantLegalFooterProps) {
  return (
    <TenantTemplateProvider siteConfigurationPreset={preset} applyToBody>
      <LegalFooterInner
        brandName={brandName}
        contact={contact}
        links={links}
      />
    </TenantTemplateProvider>
  );
}

interface LegalFooterInnerProps {
  brandName?: string;
  contact?: ReactNode;
  links: Array<{ href: string; label: string }>;
}

function LegalFooterInner({ brandName, contact, links }: LegalFooterInnerProps) {
  const { preset } = usePreset();
  const resolvedBrand = brandName ?? preset.name;

  return (
    <footer
      style={{
        background: "var(--tt-bg)",
        color: "var(--tt-fg)",
        fontFamily: "var(--tt-text)",
        borderTop: "1px solid var(--tt-rule)",
      }}
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-[12px] sm:px-12">
        <span style={{ color: "var(--tt-fg)" }}>
          {(preset.upper ? resolvedBrand.toUpperCase() : resolvedBrand)} ·
          MMXXVI
        </span>
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center gap-5 text-[11px] uppercase tracking-[0.06em]"
        >
          {links.map((link, index) => (
            <span key={link.href} className="flex items-center gap-5">
              <Link
                href={link.href}
                className="transition-opacity hover:opacity-80"
                style={{ color: "var(--tt-fg-mute)" }}
              >
                {link.label}
              </Link>
              {index < links.length - 1 ? (
                <span aria-hidden="true" style={{ color: "var(--tt-fg-mute)" }}>
                  ·
                </span>
              ) : null}
            </span>
          ))}
        </nav>
        {contact ? (
          <span style={{ color: "var(--tt-fg-dim)" }}>{contact}</span>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </footer>
  );
}
