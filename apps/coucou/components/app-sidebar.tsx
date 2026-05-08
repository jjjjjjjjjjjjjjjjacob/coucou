"use client";

import { useUser } from "@clerk/nextjs";
import {
  BarChart3,
  Calendar,
  DoorOpen,
  FileText,
  Home,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { SidebarTenantSwitcher } from "@/components/sidebar-tenant-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import {
  buildWorkspaceOperationPath,
  type WorkspaceOperationSurface,
} from "@/lib/workspace-config";

type DashboardNavigationAccess = "read" | "write";
type DashboardAppearance = "dark" | "light";

const DASHBOARD_APPEARANCE_STORAGE_KEY = "coucou-dashboard-appearance";
const DASHBOARD_LIGHT_MODE_CLASS_NAME = "maison-dashboard-light";

interface DashboardNavigationItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  access: DashboardNavigationAccess;
}

export const navigationItems: DashboardNavigationItem[] = [
  {
    title: "Overview",
    url: "/host",
    icon: Home,
    isActive: false,
    access: "write",
  },
  {
    title: "Events",
    url: "/host/events",
    icon: Calendar,
    isActive: false,
    access: "write",
  },
  {
    title: "RSVPs",
    url: "/host/rsvps",
    icon: Users,
    isActive: false,
    access: "read",
  },
  {
    title: "Text Blasts",
    url: "/host/text-blasts",
    icon: MessageSquare,
    isActive: false,
    access: "write",
  },
  {
    title: "Texts",
    url: "/host/texts",
    icon: FileText,
    isActive: false,
    access: "write",
  },
  {
    title: "Users",
    url: "/host/users",
    icon: User,
    isActive: false,
    access: "write",
  },
  {
    title: "Analytics",
    url: "/host/analytics",
    icon: BarChart3,
    isActive: false,
    access: "write",
  },
  {
    title: "Door Scan",
    url: "/door/scan",
    icon: DoorOpen,
    isActive: false,
    access: "read",
  },
  {
    title: "Door List",
    url: "/door/list",
    icon: DoorOpen,
    isActive: false,
    access: "read",
  },
  {
    title: "Settings",
    url: "/host/settings",
    icon: Settings,
    isActive: false,
    access: "read",
  },
];

export const quickActions: DashboardNavigationItem[] = [
  {
    title: "New Event",
    url: "/host/new",
    icon: Plus,
    isActive: false,
    access: "write",
  },
];

function isDashboardAppearance(value: string | null): value is DashboardAppearance {
  return value === "dark" || value === "light";
}

function getStoredDashboardAppearance(): DashboardAppearance {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const storedDashboardAppearance = window.localStorage.getItem(DASHBOARD_APPEARANCE_STORAGE_KEY);

    return isDashboardAppearance(storedDashboardAppearance) ? storedDashboardAppearance : "dark";
  } catch {
    return "dark";
  }
}

function applyDashboardAppearance(dashboardAppearance: DashboardAppearance) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.toggle(
    DASHBOARD_LIGHT_MODE_CLASS_NAME,
    dashboardAppearance === "light",
  );
  document.documentElement.dataset.dashboardAppearance = dashboardAppearance;
}

function clearDashboardAppearance() {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.remove(DASHBOARD_LIGHT_MODE_CLASS_NAME);
  delete document.documentElement.dataset.dashboardAppearance;
}

function storeDashboardAppearance(dashboardAppearance: DashboardAppearance) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DASHBOARD_APPEARANCE_STORAGE_KEY, dashboardAppearance);
  } catch {
    return;
  }
}

function normalizeUserBadgeText(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  canWrite?: boolean;
}

export function AppSidebar({ canWrite = true, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const workspaceScope = useWorkspaceScope();
  const [dashboardAppearance, setDashboardAppearance] = React.useState<DashboardAppearance>("dark");

  React.useEffect(() => {
    const storedDashboardAppearance = getStoredDashboardAppearance();
    setDashboardAppearance(storedDashboardAppearance);
    applyDashboardAppearance(storedDashboardAppearance);
    return clearDashboardAppearance;
  }, []);

  const resolveWorkspaceNavigationUrl = React.useCallback(
    (url: string) => {
      if (!workspaceScope) {
        return url;
      }

      const match = url.match(/^\/(host|door)(?:\/(.*))?$/);
      if (!match) {
        return url;
      }

      return buildWorkspaceOperationPath(
        workspaceScope.workspaceSlug,
        match[1] as WorkspaceOperationSurface,
        match[2] ?? "",
      );
    },
    [workspaceScope],
  );

  // Update active states based on current path
  const updatedNavItems = navigationItems
    .filter((item) => canWrite || item.access === "read")
    .map((item) => {
      const url = resolveWorkspaceNavigationUrl(item.url);
      return {
        ...item,
        url,
        isActive: pathname === url,
      };
    });

  const updatedQuickActions = quickActions
    .filter((item) => canWrite || item.access === "read")
    .map((item) => {
      const url = resolveWorkspaceNavigationUrl(item.url);
      return {
        ...item,
        url,
        isActive: pathname === url,
      };
    });

  const userEmailAddress =
    normalizeUserBadgeText(user?.primaryEmailAddress?.emailAddress) ??
    normalizeUserBadgeText(
      user?.emailAddresses?.find((emailAddress) => emailAddress.id === user?.primaryEmailAddressId)
        ?.emailAddress,
    ) ??
    normalizeUserBadgeText(user?.emailAddresses?.[0]?.emailAddress);
  const userNameParts = [
    normalizeUserBadgeText(user?.firstName),
    normalizeUserBadgeText(user?.lastName),
  ].filter((namePart): namePart is string => Boolean(namePart));
  const userDisplayName =
    normalizeUserBadgeText(user?.fullName) ??
    (userNameParts.length > 0 ? userNameParts.join(" ") : null);
  const userPrimaryText = userDisplayName ?? userEmailAddress;
  const userSecondaryText = userDisplayName ? userEmailAddress : null;
  const shouldShowUserBadge = Boolean(userPrimaryText);
  const isLightModeEnabled = dashboardAppearance === "light";
  const nextDashboardAppearance = isLightModeEnabled ? "dark" : "light";
  const dashboardAppearanceLabel = isLightModeEnabled
    ? "Switch to dark mode"
    : "Switch to light mode";

  function handleDashboardAppearanceToggle() {
    setDashboardAppearance(nextDashboardAppearance);
    storeDashboardAppearance(nextDashboardAppearance);
    applyDashboardAppearance(nextDashboardAppearance);
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarTenantSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {updatedNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={item.isActive}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {updatedQuickActions.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {updatedQuickActions.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={item.isActive}>
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              aria-label={dashboardAppearanceLabel}
              aria-pressed={isLightModeEnabled}
              tooltip={dashboardAppearanceLabel}
              onClick={handleDashboardAppearanceToggle}
            >
              {isLightModeEnabled ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>Light mode</span>
              <span className="ml-auto text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                {isLightModeEnabled ? "On" : "Off"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {shouldShowUserBadge ? (
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="Go to Coucou">
                <Link href="/dashboard" className="flex items-center gap-2">
                  <div
                    className="flex aspect-square size-8 items-center justify-center"
                    style={{
                      border: "1px solid var(--tt-rule-strong)",
                      borderRadius: 2,
                      color: "var(--tt-fg)",
                    }}
                  >
                    <User className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{userPrimaryText}</span>
                    {userSecondaryText ? (
                      <span className="truncate text-xs">{userSecondaryText}</span>
                    ) : null}
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
