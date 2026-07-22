"use client";

import { Copy, ExternalLink, LayoutDashboard, MoreHorizontal, Pencil } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceDomainDialog } from "@/components/workspace-domain-dialog";
import { copyTextWithToast } from "@/lib/clipboard";

export interface DashboardWorkspaceEntry {
  slug: string;
  name: string;
  primaryDomain?: string | null;
  clerkOrganizationId?: string | null;
  clerkOrganizationSlug?: string | null;
  organizationId: string;
  organizationSlug?: string | null;
  membershipRole: string;
  isWorkspaceConfigured?: boolean;
}

export function formatWorkspaceRole(role: string): string {
  return role.replace(/^org:/, "").replace(/-/g, " ");
}

function getWorkspaceStatusMessage(workspace: DashboardWorkspaceEntry): string {
  if (workspace.primaryDomain) {
    return workspace.primaryDomain;
  }
  if (!workspace.isWorkspaceConfigured) {
    return "Clerk organization connected. Coucou workspace setup is pending.";
  }
  return "No primary URL set.";
}

interface WorkspaceListRowProps {
  workspace: DashboardWorkspaceEntry;
  dashboardHref: string;
  canWrite: boolean;
}

/**
 * Event-list-style card row for a tenant workspace on the coucou dashboard:
 * name + role badge, domain/status subtitle, hover actions, and a right-click
 * context menu.
 */
export function WorkspaceListRow({ workspace, dashboardHref, canWrite }: WorkspaceListRowProps) {
  const [isDomainDialogOpen, setIsDomainDialogOpen] = useState(false);
  const [primaryDomain, setPrimaryDomain] = useState(workspace.primaryDomain ?? null);

  const effectiveWorkspace: DashboardWorkspaceEntry = { ...workspace, primaryDomain };
  const statusMessage = getWorkspaceStatusMessage(effectiveWorkspace);

  const openDashboard = () => {
    window.location.assign(dashboardHref);
  };

  const openPublicSite = () => {
    if (!primaryDomain) return;
    window.open(`https://${primaryDomain}`, "_blank", "noopener,noreferrer");
  };

  const copyDomain = () => {
    if (!primaryDomain) return;
    void copyTextWithToast(primaryDomain, "Domain copied");
  };

  const handleRowClick = (clickEvent: MouseEvent<HTMLDivElement>) => {
    if (
      clickEvent.target instanceof Element &&
      clickEvent.target.closest("button, a, input, select, textarea, [role='menuitem']")
    ) {
      return;
    }
    openDashboard();
  };

  const handleRowKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.target !== keyboardEvent.currentTarget) return;
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      openDashboard();
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="link"
            tabIndex={0}
            aria-label={`Open ${workspace.name} dashboard`}
            onClick={handleRowClick}
            onKeyDown={handleRowKeyDown}
            className="group flex cursor-pointer items-center gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-[var(--tt-highlight)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)]/30"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={dashboardHref}
                  className="max-w-[24rem] truncate text-sm font-medium text-[var(--text-primary)] hover:underline"
                >
                  {workspace.name}
                </a>
                <StatusBadge
                  variant="default"
                  label={formatWorkspaceRole(workspace.membershipRole)}
                />
              </div>
              <div className="text-xs tabular-nums text-[var(--text-secondary)]">
                {statusMessage}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <div className="flex items-center gap-1">
                  {primaryDomain ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="size-8 border-[var(--border-subtle)] bg-transparent"
                      aria-label={`View public site for ${workspace.name}`}
                      onClick={openPublicSite}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  ) : null}

                  {canWrite ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="size-8 border-[var(--border-subtle)] bg-transparent"
                      aria-label={`Edit primary URL for ${workspace.name}`}
                      onClick={() => setIsDomainDialogOpen(true)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : null}

                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="hidden border-[var(--border-subtle)] bg-transparent sm:inline-flex"
                  >
                    <a href={dashboardHref}>
                      <LayoutDashboard className="h-4 w-4" /> Open dashboard
                    </a>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="size-8 border-[var(--border-subtle)] bg-transparent"
                        aria-label={`Open actions for ${workspace.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-56 border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]"
                    >
                      <DropdownMenuItem asChild>
                        <a href={dashboardHref}>
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          Open dashboard
                        </a>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        disabled={!primaryDomain}
                        onSelect={(selectEvent) => {
                          selectEvent.preventDefault();
                          openPublicSite();
                        }}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View public site
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        disabled={!primaryDomain}
                        onSelect={(selectEvent) => {
                          selectEvent.preventDefault();
                          copyDomain();
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy domain
                      </DropdownMenuItem>

                      {canWrite ? (
                        <>
                          <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />
                          <DropdownMenuItem onSelect={() => setIsDomainDialogOpen(true)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit primary URL
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-56 border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] shadow-[var(--shadow-card)]">
          <ContextMenuItem asChild>
            <a href={dashboardHref}>
              <LayoutDashboard className="h-4 w-4" />
              Open dashboard
            </a>
          </ContextMenuItem>

          <ContextMenuItem
            disabled={!primaryDomain}
            onSelect={(selectEvent) => {
              selectEvent.preventDefault();
              openPublicSite();
            }}
          >
            <ExternalLink className="h-4 w-4" />
            View public site
          </ContextMenuItem>

          <ContextMenuItem
            disabled={!primaryDomain}
            onSelect={(selectEvent) => {
              selectEvent.preventDefault();
              copyDomain();
            }}
          >
            <Copy className="h-4 w-4" />
            Copy domain
          </ContextMenuItem>

          {canWrite ? (
            <>
              <ContextMenuSeparator className="bg-[var(--border-subtle)]" />
              <ContextMenuItem onSelect={() => setIsDomainDialogOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit primary URL
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>

      <WorkspaceDomainDialog
        workspace={effectiveWorkspace}
        open={isDomainDialogOpen}
        onOpenChange={setIsDomainDialogOpen}
        onSaved={setPrimaryDomain}
      />
    </>
  );
}
