"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { CoucouLinearShell, useMaisonLinearBodyClass } from "@/components/coucou-linear-shell";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceAccessGate, type WorkspaceAccessState } from "@/components/workspace-access-gate";

const WRITE_ONLY_DASHBOARD_SEGMENTS = new Set([
  "events",
  "new",
  "text-blasts",
  "texts",
  "users",
  "analytics",
]);

function getDashboardSegment(pathname: string | null, workspaceSlug: string): string {
  const dashboardPrefix = `/workspaces/${workspaceSlug}/dashboard`;
  if (!pathname || !pathname.startsWith(dashboardPrefix)) {
    return "";
  }

  return pathname.slice(dashboardPrefix.length).replace(/^\/+/, "").split("/")[0] ?? "";
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
        Your {workspaceAccessState.workspaceBrandName} role can view RSVPs, door tools, and
        settings, but it cannot open this dashboard section.
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
  const dashboardSegment = getDashboardSegment(pathname, workspaceAccessState.workspaceSlug);
  const readOnlyDashboardRoot = dashboardSegment === "" && !workspaceAccessState.canWrite;
  const writeOnlyRoute =
    !workspaceAccessState.canWrite && WRITE_ONLY_DASHBOARD_SEGMENTS.has(dashboardSegment);

  useEffect(() => {
    if (!readOnlyDashboardRoot) {
      return;
    }

    router.replace(`/workspaces/${workspaceAccessState.workspaceSlug}/dashboard/rsvps`);
  }, [readOnlyDashboardRoot, router, workspaceAccessState.workspaceSlug]);

  if (readOnlyDashboardRoot) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-6 text-primary">
        <Spinner />
      </main>
    );
  }

  return (
    <CoucouLinearShell
      sidebar={<AppSidebar canWrite={workspaceAccessState.canWrite} />}
      mobileTitle={workspaceAccessState.workspaceBrandName}
    >
      {writeOnlyRoute ? (
        <AccessRequiredState workspaceAccessState={workspaceAccessState} />
      ) : (
        children
      )}
      <CommandPalette />
    </CoucouLinearShell>
  );
}

interface WorkspaceDashboardShellProps {
  workspaceSlug: string;
  children: ReactNode;
}

export function WorkspaceDashboardShell({ workspaceSlug, children }: WorkspaceDashboardShellProps) {
  useMaisonLinearBodyClass();

  return (
    <WorkspaceAccessGate workspaceSlug={workspaceSlug} accessKind="read">
      {(workspaceAccessState) => (
        <WorkspaceDashboardChrome workspaceAccessState={workspaceAccessState}>
          {children}
        </WorkspaceDashboardChrome>
      )}
    </WorkspaceAccessGate>
  );
}
