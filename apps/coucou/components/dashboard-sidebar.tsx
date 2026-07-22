"use client";

import { useAuth, useClerk, useOrganizationList } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Building2, Home, LogOut, Mail, Settings, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import {
  activateOrganizationBeforeNavigation,
  MAISON_OBSCUR_TOAST_OPTIONS,
} from "@/lib/organization-navigation";
import { buildWorkspaceOperationHref } from "@/lib/workspace-config";
import {
  buildRoleAwareDashboardPath,
  hasWorkspaceReadAccess,
  hasWorkspaceWriteAccess,
} from "@/lib/workspace-roles";

interface AccessibleWorkspaceEntry {
  slug: string;
  name: string;
  membershipRole: string;
}

function useDashboardNavigationAccess(): {
  accessibleWorkspaces: AccessibleWorkspaceEntry[];
  hasCoucouAdminAccess: boolean;
  coucouOrganizationId: string | null;
} {
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const workspaceNavigationAccess = useQuery(
    api.workspaces.listAccessibleWorkspaceNavigationForUser,
    !isSignedIn || !isAuthenticated ? "skip" : {},
  );

  return React.useMemo(() => {
    const tenantWorkspaces = Array.isArray(workspaceNavigationAccess?.tenantWorkspaces)
      ? workspaceNavigationAccess.tenantWorkspaces
      : [];
    const accessibleWorkspaces = tenantWorkspaces.flatMap((workspace) => {
      if (!hasWorkspaceReadAccess(workspace.membershipRole)) return [];
      return [
        {
          slug: workspace.slug,
          name: workspace.name,
          membershipRole: workspace.membershipRole,
        },
      ];
    });

    return {
      accessibleWorkspaces,
      hasCoucouAdminAccess: Boolean(workspaceNavigationAccess?.hasCoucouOrganizationAccess),
      coucouOrganizationId: workspaceNavigationAccess?.coucouOrganizationId ?? null,
    };
  }, [workspaceNavigationAccess]);
}

export function DashboardSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { setActive } = useOrganizationList();
  const { signOut } = useClerk();
  const { accessibleWorkspaces, hasCoucouAdminAccess, coucouOrganizationId } =
    useDashboardNavigationAccess();

  const navigateToOrganizationPath = React.useCallback(
    async (
      organizationId: string | null | undefined,
      href: string,
      loadingMessage: string,
      useMaisonToast = false,
    ) => {
      await activateOrganizationBeforeNavigation({
        organizationId,
        href,
        setActive,
        fallbackNavigate: (nextHref) => router.push(nextHref),
        toastMessages: {
          loading: loadingMessage,
          ...(useMaisonToast ? MAISON_OBSCUR_TOAST_OPTIONS : {}),
        },
      });
    },
    [router, setActive],
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="md:pt-3">
        <SidebarTenantSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-2">
          <SidebarGroupLabel>dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard"} tooltip="Home">
                  <Link href="/dashboard">
                    <Home className="h-4 w-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Inquire">
                  <a href="mailto:hello@coucou.events">
                    <Mail className="h-4 w-4" />
                    <span>Inquire</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {accessibleWorkspaces.length > 0 ? (
          <SidebarGroup className="py-2">
            <SidebarGroupLabel>organizations</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {accessibleWorkspaces.map((workspace) => {
                  const path = buildRoleAwareDashboardPath(
                    workspace.slug,
                    workspace.membershipRole,
                  );
                  const href = buildWorkspaceOperationHref(
                    workspace.slug,
                    "dashboard",
                    hasWorkspaceWriteAccess(workspace.membershipRole) ? "" : "rsvps",
                  );
                  return (
                    <SidebarMenuItem key={`${workspace.slug}-dashboard`}>
                      <SidebarMenuButton
                        asChild
                        isActive={Boolean(pathname?.startsWith(path))}
                        tooltip={workspace.name}
                      >
                        <a href={href}>
                          <Building2 className="h-4 w-4" />
                          <span>{workspace.name}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {hasCoucouAdminAccess ? (
          <SidebarGroup className="py-2">
            <SidebarGroupLabel>coucou</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    tooltip="Admin"
                    isActive={Boolean(pathname?.startsWith("/admin"))}
                    onClick={() =>
                      void navigateToOrganizationPath(
                        coucouOrganizationId,
                        "/admin",
                        "Switching workspace to Coucou...",
                        true,
                      ).catch(() => undefined)
                    }
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup className="py-2">
          <SidebarGroupLabel>account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/profile"} tooltip="Profile">
                  <Link href="/profile">
                    <User className="h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/account"}
                  tooltip="Account settings"
                >
                  <Link href="/account">
                    <Settings className="h-4 w-4" />
                    <span>Account settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  tooltip="Sign out"
                  onClick={() => void signOut({ redirectUrl: "/" })}
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <LinearSidebarFooter />

      <SidebarRail />
    </Sidebar>
  );
}
