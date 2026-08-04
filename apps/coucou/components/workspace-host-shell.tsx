"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { CoucouLinearShell, useMaisonLinearBodyClass } from "@/components/coucou-linear-shell";
import { WorkspaceAccessGate } from "@/components/workspace-access-gate";

interface WorkspaceHostShellProps {
  workspaceSlug: string;
  children: ReactNode;
}

export function WorkspaceHostShell({ workspaceSlug, children }: WorkspaceHostShellProps) {
  useMaisonLinearBodyClass();

  return (
    <WorkspaceAccessGate workspaceSlug={workspaceSlug} accessKind="host">
      {(workspaceAccessState) => (
        <CoucouLinearShell
          sidebar={<AppSidebar />}
          mobileTitle={workspaceAccessState.workspaceBrandName}
        >
          {children}
          <CommandPalette />
        </CoucouLinearShell>
      )}
    </WorkspaceAccessGate>
  );
}
