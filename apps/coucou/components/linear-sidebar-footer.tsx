"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from "lucide-react";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useDashboardAppearance } from "@/hooks/use-dashboard-appearance";

interface LinearSidebarFooterProps {
  /**
   * Whether to show the command palette entry. Only enable on surfaces that
   * also mount the workspace-scoped <CommandPalette /> dialog.
   */
  showCommandPalette?: boolean;
}

function CommandPaletteMenuItem() {
  const { open: openCommandPalette } = useCommandPalette();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        aria-label="Open command palette"
        tooltip="Open command palette"
        onClick={() => openCommandPalette()}
      >
        <Search className="h-4 w-4" />
        <span>Command palette</span>
        <kbd className="ml-auto hidden rounded border border-[var(--border-subtle)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-tertiary)] group-data-[collapsible=icon]:hidden">
          ⌘K
        </kbd>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Shared Linear-style sidebar footer: command palette (optional), appearance
 * toggle, sidebar collapse toggle, and the signed-in user. Used by the
 * workspace, coucou dashboard, and coucou admin sidebars.
 */
export function LinearSidebarFooter({ showCommandPalette = false }: LinearSidebarFooterProps) {
  const { isLightModeEnabled, toggleDashboardAppearance } = useDashboardAppearance();
  const { user, isSignedIn } = useUser();
  const { state: sidebarState, toggleSidebar } = useSidebar();
  const userDisplayName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Host";

  const dashboardAppearanceLabel = isLightModeEnabled
    ? "Switch to dark mode"
    : "Switch to light mode";
  const sidebarToggleLabel = sidebarState === "expanded" ? "Collapse sidebar" : "Expand sidebar";

  return (
    <SidebarFooter className="border-t border-[var(--border-subtle)]/50">
      <SidebarMenu className="gap-1">
        {showCommandPalette ? <CommandPaletteMenuItem /> : null}

        <SidebarMenuItem>
          <SidebarMenuButton
            type="button"
            aria-label={dashboardAppearanceLabel}
            aria-pressed={isLightModeEnabled}
            tooltip={dashboardAppearanceLabel}
            onClick={toggleDashboardAppearance}
          >
            {isLightModeEnabled ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{isLightModeEnabled ? "Light mode" : "Dark mode"}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            type="button"
            aria-label={sidebarToggleLabel}
            tooltip={sidebarToggleLabel}
            onClick={toggleSidebar}
          >
            {sidebarState === "expanded" ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
            <span>{sidebarToggleLabel}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {isSignedIn ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="h-9 min-h-9"
              aria-label={`Signed in as ${userDisplayName}`}
              tooltip={`Signed in as ${userDisplayName}`}
            >
              <div className="flex w-full items-center gap-2">
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "size-6 rounded-sm",
                    },
                  }}
                />
                <span className="truncate text-sm">{userDisplayName}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
      </SidebarMenu>
    </SidebarFooter>
  );
}
