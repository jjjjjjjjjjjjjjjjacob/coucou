"use client";

import { TenantTemplateProvider } from "@coucou/ui/tenant-template";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { siteConfiguration } from "@/lib/site";
import HeaderClient from "./header-client";

/**
 * Account and profile host wider Clerk surfaces and own their own internal
 * max-widths, so the editorial column constraint is dropped there. Every
 * other guest surface (landing, event detail, RSVP, status, ticket) shares
 * the 650px column so pages stay aligned as users move through the flow.
 */
export function resolveContentMaxWidthPx(pathname: string | null | undefined): number | undefined {
  const isWideContentRoute = pathname === "/account" || pathname === "/profile";
  return isWideContentRoute ? undefined : 650;
}

/**
 * Danza Organica's chrome is deliberately minimal — the Dojo Pomodoro
 * treatment recolored teal/black: a floating menu, a centered editorial
 * column, and the shared legal footer. The
 * `TenantTemplateProvider` here is what puts the danza preset's `--tt-*`
 * variables (and the teal body background) in scope for every route,
 * including the shared rsvp/status/ticket components from
 * `@coucou/ui/tenant-template`.
 */
export function AppChrome({
  children,
  satelliteOrigin,
}: {
  children: ReactNode;
  satelliteOrigin: string;
}) {
  const pathname = usePathname();
  const contentMaxWidthPx = resolveContentMaxWidthPx(pathname);

  return (
    <TenantTemplateProvider
      siteConfigurationPreset={siteConfiguration.preset}
      applyToBody
      className="flex flex-1 flex-col"
    >
      <HeaderClient initialSatelliteOrigin={satelliteOrigin} />
      <main className="flex min-h-screen w-full items-center justify-center">
        <div
          style={{
            width: "100%",
            maxWidth: contentMaxWidthPx,
            margin: "0 auto",
            padding: "96px 24px",
            boxSizing: "border-box",
          }}
        >
          {children}
        </div>
      </main>
      <Footer />
    </TenantTemplateProvider>
  );
}
