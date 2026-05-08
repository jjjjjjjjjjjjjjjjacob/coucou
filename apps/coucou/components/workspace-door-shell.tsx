"use client";

import { resolvePreset } from "@coucou/sdk";
import { TenantTemplateProvider } from "@coucou/ui/tenant-template";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface WorkspaceDoorShellProps {
  workspaceSlug: string;
  children: ReactNode;
}

export function WorkspaceDoorShell({ workspaceSlug, children }: WorkspaceDoorShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const workspaceScope = useWorkspaceScope();
  const currentTab = pathname?.includes("/list")
    ? "list"
    : pathname?.includes("/ticket")
      ? "ticket"
      : "scan";
  useMaisonBodyClass();

  return (
    <WorkspaceAccessGate workspaceSlug={workspaceSlug} accessKind="door">
      <TenantTemplateProvider
        siteConfigurationPreset="maison"
        className="maison-app-surface min-h-dvh"
        style={MAISON_STYLE_VARS}
      >
        <main className="mx-auto max-w-6xl space-y-6 p-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold">
              {workspaceScope?.brandName ?? "Workspace"} Door
            </h1>
            <p className="text-sm text-foreground/70">
              Validate and redeem guest entries, view tickets, and check guest lists.
            </p>
          </header>
          <Tabs
            value={currentTab}
            onValueChange={(value) =>
              router.push(buildWorkspaceOperationPath(workspaceSlug, "door", value))
            }
          >
            <TabsList>
              <TabsTrigger value="scan">Scan</TabsTrigger>
              <TabsTrigger value="ticket">Get Ticket</TabsTrigger>
              <TabsTrigger value="list">Guest List</TabsTrigger>
            </TabsList>
          </Tabs>
          {children}
          <Button
            variant="outline"
            onClick={() => router.push(buildWorkspaceOperationPath(workspaceSlug, "host"))}
          >
            Dashboard
          </Button>
        </main>
      </TenantTemplateProvider>
    </WorkspaceAccessGate>
  );
}
