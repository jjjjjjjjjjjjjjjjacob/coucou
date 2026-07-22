"use client";

import { Eyebrow, TenantTemplateProvider, useMobile } from "@coucou/ui/tenant-template";
import Link from "next/link";

function NotFoundContent() {
  const isMobile = useMobile();

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{
        background: "var(--tt-bg)",
        color: "var(--tt-fg)",
        fontFamily: "var(--tt-text)",
        padding: isMobile ? "0 24px" : "0 64px",
      }}
    >
      <section
        className="w-full max-w-[540px]"
        style={{ padding: isMobile ? "60px 0" : "100px 0" }}
      >
        <Eyebrow>404</Eyebrow>
        <h1
          className="m-0 mb-8"
          style={{
            fontFamily: "var(--tt-display)",
            fontWeight: 400,
            fontSize: isMobile ? 22 : 26,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
            color: "var(--tt-fg)",
          }}
        >
          Page not found.
        </h1>

        <p
          className="m-0"
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--tt-fg-dim)",
          }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div
          className="mt-12 flex flex-wrap items-center gap-6 pt-8"
          style={{ borderTop: "1px solid var(--tt-rule)" }}
        >
          <Link
            href="/"
            className="text-[14px]"
            style={{
              color: "var(--tt-fg)",
              borderBottom: "1px solid var(--tt-fg)",
              paddingBottom: 1,
              textDecoration: "none",
            }}
          >
            Go home
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function NotFound() {
  return (
    <TenantTemplateProvider siteConfigurationPreset="coucou">
      <NotFoundContent />
    </TenantTemplateProvider>
  );
}
