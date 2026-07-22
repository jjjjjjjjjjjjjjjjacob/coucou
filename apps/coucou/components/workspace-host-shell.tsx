"use client";

import { TenantTemplateProvider } from "@coucou/ui/tenant-template";
import { type ReactNode, useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { WorkspaceAccessGate } from "@/components/workspace-access-gate";

function useMaisonBodyClass() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("maison-linear");
    return () => {
      document.body.classList.remove("maison-linear");
    };
  }, []);
}

interface WorkspaceHostShellProps {
  workspaceSlug: string;
  children: ReactNode;
}

export function WorkspaceHostShell({ workspaceSlug, children }: WorkspaceHostShellProps) {
  useMaisonBodyClass();

  return (
    <WorkspaceAccessGate workspaceSlug={workspaceSlug} accessKind="host">
      <TenantTemplateProvider
        siteConfigurationPreset="maison"
        className="maison-linear h-dvh overflow-hidden antialiased"
        applyToBody={false}
      >
        <SidebarProvider className="maison-linear h-full min-h-0">
          <AppSidebar />
          <SidebarInset className="bg-background">
            <main className="flex flex-1 flex-col overflow-hidden p-2 md:p-3 md:in-data-[sidebar-state=collapsed]:pl-0">
              <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 pt-2 shadow-[var(--shadow-card)]">
                {children}
              </div>
            </main>
          </SidebarInset>
        </SidebarProvider>
        <CommandPalette />
      </TenantTemplateProvider>
    </WorkspaceAccessGate>
  );
}
