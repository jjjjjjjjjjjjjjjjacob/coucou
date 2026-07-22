"use client";

import { TenantTemplateProvider } from "@coucou/ui/tenant-template";
import { type ReactNode, useEffect } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Applies the Linear-style dashboard theme to the document body while the
 * shell is mounted (used by surfaces that render outside the provider tree,
 * e.g. full-page loading states).
 */
export function useMaisonLinearBodyClass() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("maison-linear");
    return () => {
      document.body.classList.remove("maison-linear");
    };
  }, []);
}

interface CoucouLinearShellProps {
  /**
   * Sidebar element rendered inside the shared SidebarProvider.
   */
  sidebar: ReactNode;
  children: ReactNode;
}

/**
 * Shared Linear-style dashboard chrome: collapsible icon sidebar on the left
 * and a rounded content card on the right, matching the organization
 * (workspace) dashboards. Themed with the Maison preset + `maison-linear`
 * surface tokens.
 */
export function CoucouLinearShell({ sidebar, children }: CoucouLinearShellProps) {
  return (
    <TenantTemplateProvider
      siteConfigurationPreset="maison"
      className="maison-linear h-dvh overflow-hidden antialiased"
      applyToBody={false}
    >
      <SidebarProvider className="maison-linear h-full min-h-0">
        {sidebar}
        <SidebarInset className="bg-background">
          <main className="flex flex-1 flex-col overflow-hidden p-2 md:p-3 md:in-data-[sidebar-state=collapsed]:pl-0">
            <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 pt-2 shadow-[var(--shadow-card)]">
              {children}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TenantTemplateProvider>
  );
}
