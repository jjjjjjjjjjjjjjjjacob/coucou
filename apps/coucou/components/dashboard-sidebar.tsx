"use client";

import { SignOutButton, useAuth, useOrganizationList } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { NavGroup, NavLink } from "@coucou/ui/admin";
import { useConvexAuth, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
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

interface AdminSidebarButtonProps {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  count?: React.ReactNode;
  onClick: () => void;
}

interface AdminSidebarLinkProps {
  children: React.ReactNode;
  active?: boolean;
  href: string;
}

function getAdminNavigationItemStyle(active?: boolean): React.CSSProperties {
  return {
    color: active ? "var(--tt-fg)" : "var(--tt-fg-dim)",
    borderLeft: active ? "1px solid var(--tt-fg)" : "1px solid transparent",
  };
}

function AdminSidebarButton({
  children,
  active,
  disabled,
  count,
  onClick,
}: AdminSidebarButtonProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between px-6 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={getAdminNavigationItemStyle(active)}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{children}</span>
      {count !== undefined && count !== null ? (
        <span style={{ color: "var(--tt-fg-mute)" }}>{count}</span>
      ) : null}
    </button>
  );
}

function AdminSidebarLink({ children, active, href }: AdminSidebarLinkProps) {
  return (
    <a
      href={href}
      className="flex w-full items-center justify-between px-6 py-2 text-left text-[13px] transition-colors"
      style={getAdminNavigationItemStyle(active)}
    >
      <span>{children}</span>
    </a>
  );
}

function AdminSidebarAnchor({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between px-6 py-2 text-[13px] transition-colors"
      style={getAdminNavigationItemStyle(false)}
    >
      <span>{children}</span>
    </a>
  );
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
    <>
      <NavGroup label="Dashboard">
        <NavLink href="/dashboard" active={pathname === "/dashboard"}>
          Home
        </NavLink>
        <AdminSidebarAnchor href="mailto:hello@coucou.events">Inquire</AdminSidebarAnchor>
      </NavGroup>

      {accessibleWorkspaces.length > 0 ? (
        <NavGroup label="Organization access">
          {accessibleWorkspaces.map((workspace) => {
            const path = buildRoleAwareDashboardPath(workspace.slug, workspace.membershipRole);
            const href = buildWorkspaceOperationHref(
              workspace.slug,
              "dashboard",
              hasWorkspaceWriteAccess(workspace.membershipRole) ? "" : "rsvps",
            );
            return (
              <AdminSidebarLink
                key={`${workspace.slug}-dashboard`}
                href={href}
                active={pathname?.startsWith(path)}
              >
                {workspace.name}
              </AdminSidebarLink>
            );
          })}
        </NavGroup>
      ) : null}

      {hasCoucouAdminAccess ? (
        <NavGroup label="Coucou">
          <AdminSidebarButton
            active={pathname?.startsWith("/admin")}
            onClick={() =>
              void navigateToOrganizationPath(
                coucouOrganizationId,
                "/admin",
                "Switching workspace to Coucou...",
                true,
              ).catch(() => undefined)
            }
          >
            Admin
          </AdminSidebarButton>
        </NavGroup>
      ) : null}

      <NavGroup label="Account">
        <NavLink href="/profile" active={pathname === "/profile"}>
          Profile
        </NavLink>
        <NavLink href="/account" active={pathname === "/account"}>
          Account settings
        </NavLink>
        <SignOutButton>
          <AdminSidebarButton onClick={() => undefined}>Sign out</AdminSidebarButton>
        </SignOutButton>
      </NavGroup>
    </>
  );
}
