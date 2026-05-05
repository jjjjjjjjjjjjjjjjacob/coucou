"use client";

import type { ReactNode } from "react";
import type { PresetKey } from "@coucou/sdk";
import { TenantTemplateProvider } from "../provider";
import { TenantShell } from "./tenant-shell";
import { Eyebrow } from "./primitives/eyebrow";
import { usePreset } from "../use-preset";

export interface LegalPageProps {
  /**
   * The active preset for the host tenant. Each app passes its
   * `siteConfiguration.preset`.
   */
  preset: PresetKey;
  /**
   * Optional override for the masthead brand line. Defaults to the preset's
   * `name`.
   */
  brandName?: string;
  /**
   * The page title — "Terms of Service", "Privacy Policy", etc.
   */
  title: string;
  /**
   * Eyebrow label above the title — defaults to "Legal".
   */
  eyebrow?: string;
  /**
   * Last-updated date as a formatted string.
   */
  lastUpdated?: string;
  /**
   * Lede paragraph under the title.
   */
  intro?: ReactNode;
  /**
   * Footer contact line for the masthead/footer.
   */
  footerContact?: string;
  /**
   * The body content (sections, paragraphs, lists). Rendered inside the
   * editorial column with preset typography applied via a class on a wrapper.
   */
  children: ReactNode;
}

/**
 * Tenant-themed wrapper for legal pages (terms / privacy / cookies / data).
 * Supplies the masthead, editorial column with appropriate width, h1, lede,
 * and the preset's footer chrome. Body content is the caller's
 * responsibility — they can use any markup; preset CSS vars resolve via the
 * surrounding TenantTemplateProvider.
 */
export function LegalPage({
  preset,
  brandName,
  title,
  eyebrow = "Legal",
  lastUpdated,
  intro,
  footerContact,
  children,
}: LegalPageProps) {
  return (
    <TenantTemplateProvider siteConfigurationPreset={preset}>
      <TenantShell>
        <LegalBody
          title={title}
          eyebrow={eyebrow}
          lastUpdated={lastUpdated}
          intro={intro}
        >
          {children}
        </LegalBody>
      </TenantShell>
    </TenantTemplateProvider>
  );
}

interface LegalBodyProps {
  title: string;
  eyebrow: string;
  lastUpdated?: string;
  intro?: ReactNode;
  children: ReactNode;
}

function LegalBody({
  title,
  eyebrow,
  lastUpdated,
  intro,
  children,
}: LegalBodyProps) {
  const { presetKey, preset } = usePreset();
  return (
    <article
      className="mx-auto"
      style={{
        maxWidth: 720,
        padding: "80px 0 96px",
        fontFamily: "var(--tt-text)",
      }}
    >
      <Eyebrow>{preset.upper ? eyebrow.toUpperCase() : eyebrow}</Eyebrow>
      <h1
        className="m-0 mb-6"
        style={{
          fontFamily: "var(--tt-display)",
          fontWeight: presetKey === "dojo" ? 700 : 500,
          fontSize: 36,
          lineHeight: 1.15,
          letterSpacing: preset.upper ? "0.01em" : "-0.005em",
          color: "var(--tt-fg)",
        }}
      >
        {preset.upper ? title.toUpperCase() : title}
      </h1>
      {lastUpdated ? (
        <p
          className="m-0 mb-6 text-[12px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          Last updated · {lastUpdated}
        </p>
      ) : null}
      {intro ? (
        <p
          className="m-0 mb-12 max-w-[600px]"
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--tt-fg-dim)",
          }}
        >
          {intro}
        </p>
      ) : null}
      <div className="legal-body" style={{ color: "var(--tt-fg)" }}>
        {children}
      </div>
    </article>
  );
}
