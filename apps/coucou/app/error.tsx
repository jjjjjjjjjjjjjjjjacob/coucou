"use client";

import {
  Eyebrow,
  TenantButton,
  TenantTemplateProvider,
  useMobile,
} from "@coucou/ui/tenant-template";
import { useEffect } from "react";

function ErrorContent({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
        <Eyebrow>Error</Eyebrow>
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
          Something went wrong.
        </h1>

        <p
          className="m-0"
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--tt-fg-dim)",
          }}
        >
          An unexpected error interrupted this page. Try again — if it persists, write to{" "}
          <a
            href="mailto:hello@coucou.events"
            style={{
              color: "var(--tt-fg)",
              borderBottom: "1px solid var(--tt-fg)",
              paddingBottom: 1,
              textDecoration: "none",
            }}
          >
            hello@coucou.events
          </a>
          .
        </p>

        {process.env.NODE_ENV === "development" && (
          <details className="mt-10">
            <summary
              className="cursor-pointer text-[12px] uppercase tracking-[0.06em]"
              style={{ color: "var(--tt-fg-mute)" }}
            >
              Error details (development only)
            </summary>
            <pre
              className="mt-4 overflow-auto p-4 text-[12px]"
              style={{
                background: "var(--tt-bg-2)",
                border: "1px solid var(--tt-rule)",
                color: "var(--tt-fg-dim)",
                lineHeight: 1.6,
              }}
            >
              {error.message}
              {error.stack && (
                <>
                  {"\n\nStack trace:\n"}
                  {error.stack}
                </>
              )}
            </pre>
          </details>
        )}

        <div
          className="mt-12 flex flex-wrap items-center gap-6 pt-8"
          style={{ borderTop: "1px solid var(--tt-rule)" }}
        >
          <TenantButton onClick={reset}>Try again</TenantButton>
          <a
            href="/"
            className="text-[14px]"
            style={{ color: "var(--tt-fg-dim)", textDecoration: "none" }}
          >
            Go home
          </a>
        </div>
      </section>
    </div>
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <TenantTemplateProvider siteConfigurationPreset="coucou">
      <ErrorContent error={error} reset={reset} />
    </TenantTemplateProvider>
  );
}
