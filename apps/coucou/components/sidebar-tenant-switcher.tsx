"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { CoucouLogoMark } from "@/components/coucou-logo";
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
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import {
  buildRoleAwareDashboardPath,
  hasWorkspaceReadAccess,
  hasWorkspaceWriteAccess,
} from "@/lib/workspace-roles";

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

export function useAccessibleWorkspaces(): AccessibleWorkspace[] {
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const workspaceNavigationAccess = useQuery(
    api.workspaces.listAccessibleWorkspaceNavigationForUser,
    !isSignedIn || !isAuthenticated ? "skip" : {},
  );

  return useMemo(() => {
    const tenantWorkspaces = Array.isArray(workspaceNavigationAccess?.tenantWorkspaces)
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

export function SquareMark({ initial, logo = false, size = "md" }: SquareMarkProps) {
  const dimension = size === "sm" ? 24 : 32;
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: dimension,
        height: dimension,
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        backgroundColor: "var(--tt-bg)",
        color: "var(--text-primary)",
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
                <span className="truncate font-semibold">{currentBrandName}</span>
                <span className="truncate text-xs">Dashboard</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-[var(--text-tertiary)]" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="z-50 min-w-64 w-(--radix-dropdown-menu-trigger-width) border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-primary)]"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-[var(--text-tertiary)]">
              Workspaces
            </DropdownMenuLabel>
            {accessibleWorkspaces.length === 0 ? (
              <DropdownMenuItem disabled className="text-[var(--text-tertiary)]">
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
            <DropdownMenuItem onSelect={() => router.push("/dashboard")} className="gap-2">
              <Sparkles className="size-4" />
              <span className="flex-1">Go to Coucou</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => router.push("/orgs/select")}
              className="text-[var(--text-tertiary)]"
            >
              Manage workspaces
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
