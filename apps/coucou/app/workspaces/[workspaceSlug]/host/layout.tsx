import type { ReactNode } from "react";
import { WorkspaceHostShell } from "@/components/workspace-host-shell";

export default async function WorkspaceHostLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <WorkspaceHostShell workspaceSlug={workspaceSlug}>{children}</WorkspaceHostShell>;
}
