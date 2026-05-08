"use client";

import type { ReactNode } from "react";
import { TenantTemplateProvider } from "../tenant-template/provider";

export interface AdminShellProps {
  /**
   * Sidebar content — typically `<NavGroup>` blocks.
   */
  sidebar: ReactNode;
  /**
   * Footer content for the sidebar (operator email, build version, etc.).
   */
  sidebarFooter?: ReactNode;
  /**
   * Brand line at the top of the sidebar. Defaults to "Coucou".
   */
  brand?: ReactNode;
  /**
   * The main content (header + sections).
   */
  children: ReactNode;
}

/**
 * Two-column admin shell with a fixed-width sidebar on the left and the main
 * content area on the right. Themed with the Maison Obscur preset.
 * Mirrors the design's `admin.jsx` layout.
 */
export function AdminShell({
  sidebar,
  sidebarFooter,
  brand = "Coucou",
  children,
}: AdminShellProps) {
  return (
    <TenantTemplateProvider siteConfigurationPreset="maison" className="maison-app-surface">
      <div
        className="grid min-h-screen"
        style={{
          gridTemplateColumns: "220px 1fr",
          background: "var(--tt-bg)",
          color: "var(--tt-fg)",
          fontFamily: "var(--tt-text)",
        }}
      >
        <aside
          className="flex flex-col py-8"
          style={{
            borderRight: "1px solid var(--tt-rule)",
          }}
        >
          <div
            className="px-6 pb-12 text-[15px] font-medium tracking-[-0.005em]"
            style={{ color: "var(--tt-fg)" }}
          >
            {brand}
          </div>
          <div className="flex-1">{sidebar}</div>
          {sidebarFooter ? (
            <div
              className="px-6 pt-6 text-[12px]"
              style={{
                color: "var(--tt-fg-mute)",
                borderTop: "1px solid var(--tt-rule)",
              }}
            >
              {sidebarFooter}
            </div>
          ) : null}
        </aside>

        <main className="px-12 py-8">{children}</main>
      </div>
    </TenantTemplateProvider>
  );
}
