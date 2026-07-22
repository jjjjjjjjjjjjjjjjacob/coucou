"use client";

import {
  BarChart3,
  Calendar,
  Code,
  DoorOpen,
  FileText,
  Home,
  MessageSquare,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { LinearSidebarFooter } from "@/components/linear-sidebar-footer";
import { SidebarTenantSwitcher } from "@/components/sidebar-tenant-switcher";
import {
  Sidebar,
  SidebarContent,
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

interface DashboardNavigationItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  access: DashboardNavigationAccess;
}

interface DashboardNavigationGroup {
  label: string;
  items: DashboardNavigationItem[];
}

export const navigationGroups: DashboardNavigationGroup[] = [
  {
    label: "general",
    items: [
      {
        title: "Overview",
        url: "/host",
        icon: Home,
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
    ],
  },
  {
    label: "events & guests",
    items: [
      {
        title: "Events",
        url: "/host/events",
        icon: Calendar,
        isActive: false,
        access: "write",
      },
      {
        title: "Guests",
        url: "/host/guests",
        icon: Users,
        isActive: false,
        access: "write",
      },
    ],
  },
  {
    label: "messaging",
    items: [
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
    ],
  },
  {
    label: "door",
    items: [
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
    ],
  },
  {
    label: "workspace",
    items: [
      {
        title: "Developers",
        url: "/host/developers",
        icon: Code,
        isActive: false,
        access: "write",
      },
      {
        title: "Settings",
        url: "/host/settings",
        icon: Settings,
        isActive: false,
        access: "read",
      },
    ],
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

  const visibleNavigationGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => canWrite || item.access === "read")
        .map((item) => {
          const url = resolveWorkspaceNavigationUrl(item.url);
          return {
            ...item,
            url,
            isActive: pathname === url,
          };
        }),
    }))
    .filter((group) => group.items.length > 0);

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
      <SidebarHeader className="md:pt-3">
        <SidebarTenantSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {visibleNavigationGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-2">
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
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
        ))}

        {updatedQuickActions.length > 0 ? (
          <SidebarGroup className="py-2">
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

      <LinearSidebarFooter showCommandPalette />

      <SidebarRail />
    </Sidebar>
  );
}
