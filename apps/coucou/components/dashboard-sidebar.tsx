"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { SignOutButton, useAuth, useOrganizationList } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { NavGroup, NavLink } from "@coucou/ui/admin";
import {
  activateOrganizationBeforeNavigation,
  MAISON_OBSCUR_TOAST_OPTIONS,
} from "@/lib/organization-navigation";
import {
  buildRoleAwareDashboardPath,
  hasWorkspaceReadAccess,
} from "@/lib/workspace-roles";

interface AccessibleWorkspaceEntry {
  slug: string;
  name: string;
  organizationId: string | null | undefined;
  membershipRole: string;
}

interface AdminSidebarButtonProps {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  count?: React.ReactNode;
  onClick: () => void;
}

function getAdminNavigationItemStyle(active?: boolean): React.CSSProperties {
  return {
    color: active ? "var(--tt-fg)" : "var(--tt-fg-dim)",
    borderLeft: active
      ? "1px solid var(--tt-fg)"
      : "1px solid transparent",
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

function AdminSidebarAnchor({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
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
    const tenantWorkspaces = Array.isArray(
      workspaceNavigationAccess?.tenantWorkspaces,
    )
      ? workspaceNavigationAccess.tenantWorkspaces
      : [];
    const accessibleWorkspaces = tenantWorkspaces.flatMap((workspace) => {
      if (!hasWorkspaceReadAccess(workspace.membershipRole)) return [];
      return [
        {
          slug: workspace.slug,
          name: workspace.name,
          organizationId:
            workspace.organizationId ?? workspace.clerkOrganizationId,
          membershipRole: workspace.membershipRole,
        },
      ];
    });

    return {
      accessibleWorkspaces,
      hasCoucouAdminAccess: Boolean(
        workspaceNavigationAccess?.hasCoucouOrganizationAccess,
      ),
      coucouOrganizationId:
        workspaceNavigationAccess?.coucouOrganizationId ?? null,
    };
  }, [workspaceNavigationAccess]);
}

export function DashboardSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { setActive } = useOrganizationList();
  const {
    accessibleWorkspaces,
    hasCoucouAdminAccess,
    coucouOrganizationId,
  } = useDashboardNavigationAccess();

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
        <AdminSidebarAnchor href="mailto:hello@coucou.events">
          Inquire
        </AdminSidebarAnchor>
      </NavGroup>

      {accessibleWorkspaces.length > 0 ? (
        <NavGroup label="Organization access">
          {accessibleWorkspaces.map((workspace) => {
            const href = buildRoleAwareDashboardPath(
              workspace.slug,
              workspace.membershipRole,
            );
            return (
              <AdminSidebarButton
                key={`${workspace.slug}-dashboard`}
                active={pathname?.startsWith(
                  `/workspaces/${workspace.slug}/dashboard`,
                )}
                onClick={() =>
                  void navigateToOrganizationPath(
                    workspace.organizationId,
                    href,
                    `Switching workspace to ${workspace.name}...`,
                  ).catch(() => undefined)
                }
              >
                {workspace.name}
              </AdminSidebarButton>
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
