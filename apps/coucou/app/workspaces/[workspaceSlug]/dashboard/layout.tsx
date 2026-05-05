import type { ReactNode } from "react";
import { WorkspaceDashboardShell } from "@/components/workspace-dashboard-shell";

export default async function WorkspaceDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <WorkspaceDashboardShell workspaceSlug={workspaceSlug}>
      {children}
    </WorkspaceDashboardShell>
  );
}
