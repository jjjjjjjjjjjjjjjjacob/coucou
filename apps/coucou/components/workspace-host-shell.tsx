"use client";

import { resolvePreset } from "@coucou/sdk";
import { TenantTemplateProvider } from "@coucou/ui/tenant-template";
import { type ReactNode, useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceAccessGate } from "@/components/workspace-access-gate";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { buildWorkspaceOperationPath } from "@/lib/workspace-config";

const MAISON_STYLE_VARS = resolvePreset({
  siteConfigurationPreset: "maison",
}).styleVars;

function useMaisonBodyClass() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("maison-app-surface");
    return () => {
      document.body.classList.remove("maison-app-surface");
    };
  }, []);
}

interface WorkspaceHostShellProps {
  workspaceSlug: string;
  children: ReactNode;
}

export function WorkspaceHostShell({ workspaceSlug, children }: WorkspaceHostShellProps) {
  const workspaceScope = useWorkspaceScope();
  useMaisonBodyClass();

  return (
    <WorkspaceAccessGate workspaceSlug={workspaceSlug} accessKind="host">
      <TenantTemplateProvider
        siteConfigurationPreset="maison"
        className="maison-app-surface min-h-dvh"
      >
        <SidebarProvider className="maison-app-surface" style={MAISON_STYLE_VARS}>
          <AppSidebar />
          <SidebarInset className="bg-background">
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href={buildWorkspaceOperationPath(workspaceSlug, "host")}>
                        {workspaceScope?.brandName ?? "Workspace"} Dashboard
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className="mt-4 flex flex-1 flex-col gap-4">{children}</div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TenantTemplateProvider>
    </WorkspaceAccessGate>
  );
}
