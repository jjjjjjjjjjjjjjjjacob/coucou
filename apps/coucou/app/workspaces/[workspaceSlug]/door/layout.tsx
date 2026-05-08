import type { ReactNode } from "react";
import { WorkspaceDoorShell } from "@/components/workspace-door-shell";

export default async function WorkspaceDoorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <WorkspaceDoorShell workspaceSlug={workspaceSlug}>{children}</WorkspaceDoorShell>;
}
