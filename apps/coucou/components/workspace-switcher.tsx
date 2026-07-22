"use client";

import { Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  brandInitial,
  SquareMark,
  useAccessibleWorkspaces,
} from "@/components/sidebar-tenant-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { buildRoleAwareDashboardPath } from "@/lib/workspace-roles";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const workspaceScope = useWorkspaceScope();
  const accessibleWorkspaces = useAccessibleWorkspaces();

  const currentBrandName = workspaceScope?.brandName ?? "Coucou";
  const currentSlug = workspaceScope?.workspaceSlug ?? null;

  const handleSelect = (slug: string, role: string) => {
    if (slug === currentSlug) return;
    router.push(buildRoleAwareDashboardPath(slug, role));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex h-9 items-center gap-2 px-2 text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
        >
          <SquareMark
            initial={brandInitial(currentBrandName)}
            logo={currentBrandName === "Coucou"}
            size="sm"
          />
          <div className="hidden min-w-0 flex-col items-start text-left sm:flex">
            <span className="truncate text-sm font-semibold">{currentBrandName}</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">Workspace</span>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="z-50 w-64 border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]"
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-xs text-[var(--text-tertiary)]">
          Workspaces
        </DropdownMenuLabel>
        {accessibleWorkspaces.length === 0 ? (
          <DropdownMenuItem disabled className="text-[var(--text-secondary)]">
            No other workspaces
          </DropdownMenuItem>
        ) : (
          accessibleWorkspaces.map((workspace) => {
            const isCurrent = workspace.slug === currentSlug;
            return (
              <DropdownMenuItem
                key={workspace.slug}
                onSelect={() => handleSelect(workspace.slug, workspace.role)}
                className="gap-2 text-[var(--text-primary)] focus:bg-[var(--surface-3)] focus:text-[var(--text-primary)]"
              >
                <SquareMark initial={brandInitial(workspace.name)} size="sm" />
                <span className="truncate flex-1">{workspace.name}</span>
                {isCurrent ? <Check className="h-4 w-4" /> : null}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />
        <DropdownMenuItem
          onSelect={() => router.push("/dashboard")}
          className="gap-2 text-[var(--text-primary)] focus:bg-[var(--surface-3)] focus:text-[var(--text-primary)]"
        >
          <Sparkles className="h-4 w-4" />
          <span className="flex-1">Go to Coucou</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => router.push("/orgs/select")}
          className="text-[var(--text-secondary)] focus:bg-[var(--surface-3)] focus:text-[var(--text-primary)]"
        >
          Manage workspaces
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
