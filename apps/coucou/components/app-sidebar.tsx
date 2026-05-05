"use client";

import * as React from "react";
import {
  Calendar,
  Users,
  Settings,
  BarChart3,
  Home,
  Plus,
  User,
  MessageSquare,
  DoorOpen,
  FileText,
} from "lucide-react";

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
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  buildWorkspaceOperationPath,
  type WorkspaceOperationSurface,
} from "@/lib/workspace-config";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { SidebarTenantSwitcher } from "@/components/sidebar-tenant-switcher";

type DashboardNavigationAccess = "read" | "write";

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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  canWrite?: boolean;
}

export function AppSidebar({ canWrite = true, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const workspaceScope = useWorkspaceScope();

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
                  <span className="truncate font-semibold">
                    {user?.firstName || "Host"}
                  </span>
                  <span className="truncate text-xs">
                    {user?.emailAddresses?.[0]?.emailAddress ||
                      "host@example.com"}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
