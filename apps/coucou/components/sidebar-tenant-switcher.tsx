"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { resolvePreset } from "@coucou/sdk";

import { api } from "@convex/_generated/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  buildRoleAwareDashboardPath,
  hasWorkspaceReadAccess,
  hasWorkspaceWriteAccess,
} from "@/lib/workspace-roles";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { CoucouLogoMark } from "@/components/coucou-logo";

const MAISON_STYLE_VARS = resolvePreset({
  siteConfigurationPreset: "maison",
}).styleVars;

interface AccessibleWorkspace {
  slug: string;
  name: string;
  role: string;
}

export function hasHostAccess(role: string | undefined): boolean {
  return hasWorkspaceWriteAccess(role);
}

export function hasDoorAccess(role: string | undefined): boolean {
  return hasWorkspaceReadAccess(role);
}

function useAccessibleWorkspaces(): AccessibleWorkspace[] {
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const workspaceNavigationAccess = useQuery(
    api.workspaces.listAccessibleWorkspaceNavigationForUser,
    !isSignedIn || !isAuthenticated ? "skip" : {},
  );

  return useMemo(() => {
    const tenantWorkspaces = Array.isArray(
      workspaceNavigationAccess?.tenantWorkspaces,
    )
      ? workspaceNavigationAccess.tenantWorkspaces
      : [];

    return tenantWorkspaces.flatMap((workspace) => {
      if (!hasWorkspaceReadAccess(workspace.membershipRole)) return [];
      return [
        {
          slug: workspace.slug,
          name: workspace.name,
          role: workspace.membershipRole,
        },
      ];
    });
  }, [workspaceNavigationAccess]);
}

export function brandInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "C";
}

interface SquareMarkProps {
  initial: string;
  logo?: boolean;
  size?: "sm" | "md";
}

export function SquareMark({
  initial,
  logo = false,
  size = "md",
}: SquareMarkProps) {
  const dimension = size === "sm" ? 24 : 32;
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center"
      style={{
        width: dimension,
        height: dimension,
        border: "1px solid var(--tt-rule-strong)",
        borderRadius: 2,
        color: "var(--tt-fg)",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: size === "sm" ? 13 : 16,
        lineHeight: 1,
      }}
    >
      {logo ? <CoucouLogoMark size={size === "sm" ? 14 : 20} /> : initial}
    </div>
  );
}

export function SidebarTenantSwitcher() {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const workspaceScope = useWorkspaceScope();
  const accessibleWorkspaces = useAccessibleWorkspaces();

  const currentBrandName = workspaceScope?.brandName ?? "Coucou";
  const currentSlug = workspaceScope?.workspaceSlug ?? null;

  const handleSelect = (slug: string, role: string) => {
    if (slug === currentSlug) return;
    router.push(buildRoleAwareDashboardPath(slug, role));
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <SquareMark
                initial={brandInitial(currentBrandName)}
                logo={currentBrandName === "Coucou"}
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {currentBrandName}
                </span>
                <span className="truncate text-xs">Dashboard</span>
              </div>
              <ChevronsUpDown
                className="ml-auto size-4"
                style={{ color: "var(--tt-fg-dim)" }}
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="maison-app-surface z-50 w-(--radix-dropdown-menu-trigger-width) min-w-64"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
            style={{
              ...MAISON_STYLE_VARS,
              backgroundColor: "var(--tt-bg)",
              color: "var(--tt-fg)",
              borderColor: "var(--tt-rule-strong)",
            }}
          >
            <DropdownMenuLabel
              className="text-xs"
              style={{ color: "var(--tt-fg-mute)" }}
            >
              Workspaces
            </DropdownMenuLabel>
            {accessibleWorkspaces.length === 0 ? (
              <DropdownMenuItem
                disabled
                style={{ color: "var(--tt-fg-dim)" }}
              >
                No other workspaces
              </DropdownMenuItem>
            ) : (
              accessibleWorkspaces.map((workspace) => {
                const isCurrent = workspace.slug === currentSlug;
                return (
                  <DropdownMenuItem
                    key={workspace.slug}
                    onSelect={() => handleSelect(workspace.slug, workspace.role)}
                    className="gap-2"
                  >
                    <SquareMark initial={brandInitial(workspace.name)} size="sm" />
                    <span className="truncate flex-1">{workspace.name}</span>
                    {isCurrent ? <Check className="size-4" /> : null}
                  </DropdownMenuItem>
                );
              })
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => router.push("/dashboard")}
              className="gap-2"
            >
              <Sparkles className="size-4" />
              <span className="flex-1">Go to Coucou</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => router.push("/orgs/select")}
              style={{ color: "var(--tt-fg-dim)" }}
            >
              Manage workspaces
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
