"use client";

import { TenantTemplateProvider } from "@coucou/ui/tenant-template";
import { Menu, Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import {
  clearDashboardAppearance,
  initializeDashboardAppearance,
  useDashboardAppearance,
} from "@/hooks/use-dashboard-appearance";

/**
 * Applies the Linear-style dashboard theme to the document body while the
 * shell is mounted (used by surfaces that render outside the provider tree,
 * e.g. full-page loading states).
 */
export function useMaisonLinearBodyClass() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("maison-linear");
    initializeDashboardAppearance();
    return () => {
      document.body.classList.remove("maison-linear");
      clearDashboardAppearance();
    };
  }, []);
}

interface CoucouLinearShellProps {
  /**
   * Sidebar element rendered inside the shared SidebarProvider.
   */
  sidebar: ReactNode;
  children: ReactNode;
  mobileTitle?: string;
}

function DashboardMobileBar({ title }: { title: string }) {
  const { toggleSidebar } = useSidebar();
  const { isLightModeEnabled, toggleDashboardAppearance } = useDashboardAppearance();
  const dashboardAppearanceLabel = isLightModeEnabled
    ? "Switch to dark mode"
    : "Switch to light mode";

  return (
    <header className="grid h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 pt-[env(safe-area-inset-top)] md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 gap-2 px-3 text-[var(--text-primary)]"
        aria-label="Open navigation menu"
        onClick={toggleSidebar}
      >
        <Menu className="size-4" />
        <span>Menu</span>
      </Button>

      <div className="min-w-0 text-center leading-tight">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
          Dashboard
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 text-[var(--text-primary)]"
        aria-label={dashboardAppearanceLabel}
        aria-pressed={isLightModeEnabled}
        title={dashboardAppearanceLabel}
        onClick={toggleDashboardAppearance}
      >
        {isLightModeEnabled ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </header>
  );
}

function CloseMobileNavigationAfterRouteChange() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return null;
}

/**
 * Shared Linear-style dashboard chrome: collapsible icon sidebar on the left
 * and a rounded content card on the right, matching the organization
 * (workspace) dashboards. Themed with the Maison preset + `maison-linear`
 * surface tokens.
 */
export function CoucouLinearShell({
  sidebar,
  children,
  mobileTitle = "Coucou",
}: CoucouLinearShellProps) {
  return (
    <TenantTemplateProvider
      siteConfigurationPreset="maison"
      className="maison-linear h-dvh overflow-hidden antialiased"
      applyToBody={false}
    >
      <SidebarProvider className="maison-linear h-full min-h-0">
        {sidebar}
        <CloseMobileNavigationAfterRouteChange />
        <SidebarInset className="bg-background">
          <DashboardMobileBar title={mobileTitle} />
          <main className="flex flex-1 flex-col overflow-hidden p-2 md:p-3 md:in-data-[sidebar-state=collapsed]:pl-0">
            <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 pt-2 shadow-[var(--shadow-card)]">
              {children}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TenantTemplateProvider>
  );
}
