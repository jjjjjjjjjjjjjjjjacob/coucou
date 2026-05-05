"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TenantTemplateProvider } from "@coucou/ui/tenant-template";
import { resolvePreset } from "@coucou/sdk";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import {
  WorkspaceAccessGate,
  type WorkspaceAccessState,
} from "@/components/workspace-access-gate";
import { Spinner } from "@/components/ui/spinner";

const MAISON_STYLE_VARS = resolvePreset({
  siteConfigurationPreset: "maison",
}).styleVars;

const WRITE_ONLY_DASHBOARD_SEGMENTS = new Set([
  "events",
  "new",
  "text-blasts",
  "texts",
  "users",
  "analytics",
]);

function useMaisonBodyClass() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("maison-app-surface");
    return () => {
      document.body.classList.remove("maison-app-surface");
    };
  }, []);
}

function getDashboardSegment(
  pathname: string | null,
  workspaceSlug: string,
): string {
  const dashboardPrefix = `/workspaces/${workspaceSlug}/dashboard`;
  if (!pathname || !pathname.startsWith(dashboardPrefix)) {
    return "";
  }

  return pathname
    .slice(dashboardPrefix.length)
    .replace(/^\/+/, "")
    .split("/")[0] ?? "";
}

function AccessRequiredState({
  workspaceAccessState,
}: {
  workspaceAccessState: WorkspaceAccessState;
}) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-3xl flex-col justify-center gap-2 p-6">
      <h1 className="text-xl font-semibold">Dashboard write access required</h1>
      <p className="text-sm text-foreground/70">
        Your {workspaceAccessState.workspaceBrandName} role can view RSVPs,
        door tools, and settings, but it cannot open this dashboard section.
      </p>
    </main>
  );
}

function WorkspaceDashboardChrome({
  workspaceAccessState,
  children,
}: {
  workspaceAccessState: WorkspaceAccessState;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const dashboardSegment = getDashboardSegment(
    pathname,
    workspaceAccessState.workspaceSlug,
  );
  const readOnlyDashboardRoot =
    dashboardSegment === "" && !workspaceAccessState.canWrite;
  const writeOnlyRoute =
    !workspaceAccessState.canWrite &&
    WRITE_ONLY_DASHBOARD_SEGMENTS.has(dashboardSegment);

  useEffect(() => {
    if (!readOnlyDashboardRoot) {
      return;
    }

    router.replace(
      `/workspaces/${workspaceAccessState.workspaceSlug}/dashboard/rsvps`,
    );
  }, [readOnlyDashboardRoot, router, workspaceAccessState.workspaceSlug]);

  if (readOnlyDashboardRoot) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-6 text-primary">
        <Spinner />
      </main>
    );
  }

  return (
    <TenantTemplateProvider
      siteConfigurationPreset="maison"
      className="maison-app-surface min-h-dvh"
    >
      <SidebarProvider
        className="maison-app-surface"
        style={MAISON_STYLE_VARS}
      >
        <AppSidebar canWrite={workspaceAccessState.canWrite} />
        <SidebarInset className="bg-background">
          <div className="flex flex-1 flex-col p-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink
                      href={`/workspaces/${workspaceAccessState.workspaceSlug}/dashboard`}
                    >
                      {workspaceAccessState.workspaceBrandName} Dashboard
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="mt-4 flex flex-1 flex-col gap-4">
              {writeOnlyRoute ? (
                <AccessRequiredState
                  workspaceAccessState={workspaceAccessState}
                />
              ) : (
                children
              )}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TenantTemplateProvider>
  );
}

interface WorkspaceDashboardShellProps {
  workspaceSlug: string;
  children: ReactNode;
}

export function WorkspaceDashboardShell({
  workspaceSlug,
  children,
}: WorkspaceDashboardShellProps) {
  useMaisonBodyClass();

  return (
    <WorkspaceAccessGate workspaceSlug={workspaceSlug} accessKind="read">
      {(workspaceAccessState) => (
        <WorkspaceDashboardChrome
          workspaceAccessState={workspaceAccessState}
        >
          {children}
        </WorkspaceDashboardChrome>
      )}
    </WorkspaceAccessGate>
  );
}
