"use client";

import { useAuth, useOrganizationList, useUser } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { AdminEmptyState, AdminHeader, AdminSection } from "@coucou/ui/admin";
import { useConvexAuth, useQuery } from "convex/react";
import { ArrowRight, Loader2, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, type MouseEvent, useMemo, useState } from "react";
import { CoucouLogoMark } from "@/components/coucou-logo";
import { DashboardShell } from "@/components/dashboard-shell";
import { TenantRequestDialog } from "@/components/tenant-request-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { type DashboardWorkspaceEntry, WorkspaceListRow } from "@/components/workspace-list-row";
import {
  activateOrganizationBeforeNavigation,
  MAISON_OBSCUR_TOAST_OPTIONS,
} from "@/lib/organization-navigation";
import { buildWorkspaceOperationHref, getCoucouOrganizationSlug } from "@/lib/workspace-config";
import { hasWorkspaceWriteAccess } from "@/lib/workspace-roles";

interface DashboardMembership {
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  role: string;
}

function CoucouAdminCard({
  onOpenAdmin,
  isActivating,
}: {
  onOpenAdmin: () => void;
  isActivating: boolean;
}) {
  const handleRowClick = (clickEvent: MouseEvent<HTMLDivElement>) => {
    if (
      clickEvent.target instanceof Element &&
      clickEvent.target.closest("button, a, input, select, textarea, [role='menuitem']")
    ) {
      return;
    }
    onOpenAdmin();
  };

  const handleRowKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.target !== keyboardEvent.currentTarget) return;
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      onOpenAdmin();
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="link"
          tabIndex={0}
          aria-label="Open Coucou admin"
          onClick={handleRowClick}
          onKeyDown={handleRowKeyDown}
          className="group flex cursor-pointer items-center gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-[var(--tt-highlight)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)]/30"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CoucouLogoMark size={16} />
              <span className="text-sm font-medium text-[var(--text-primary)]">Coucou Admin</span>
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              Super-admin views for tenant review, billing, delivery, and platform operations.
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-[var(--border-subtle)] bg-transparent"
                onClick={onOpenAdmin}
                disabled={isActivating}
              >
                {isActivating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                Open admin
              </Button>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] shadow-[var(--shadow-card)]">
        <ContextMenuItem onSelect={onOpenAdmin}>
          <ShieldCheck className="h-4 w-4" />
          Open admin
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function DashboardClient() {
  const router = useRouter();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexAuthLoading } =
    useConvexAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const [activatingTarget, setActivatingTarget] = useState<string | null>(null);
  const [isTenantRequestOpen, setIsTenantRequestOpen] = useState(false);

  const clerkMemberships = userMemberships?.data;
  const profileMemberships = useMemo(
    () => user?.organizationMemberships ?? [],
    [user?.organizationMemberships],
  );
  const coucouOrganizationSlug = getCoucouOrganizationSlug();
  const primaryEmailAddress = user?.primaryEmailAddress?.emailAddress ?? "";
  const defaultOperatorName = user?.fullName?.trim() || primaryEmailAddress || "Coucou user";

  const dashboardMemberships = useMemo<DashboardMembership[]>(() => {
    const membershipByOrganizationId = new Map<string, DashboardMembership>();
    for (const membership of [...profileMemberships, ...(clerkMemberships ?? [])]) {
      membershipByOrganizationId.set(membership.organization.id, {
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        organizationSlug: membership.organization.slug ?? undefined,
        role: membership.role,
      });
    }

    return Array.from(membershipByOrganizationId.values());
  }, [clerkMemberships, profileMemberships]);

  const coucouMembership = useMemo(
    () =>
      dashboardMemberships.find(
        (membership) => membership.organizationSlug?.toLowerCase() === coucouOrganizationSlug,
      ) ?? null,
    [dashboardMemberships, coucouOrganizationSlug],
  );

  const dashboardAccess = useQuery(
    api.workspaces.getDashboardWorkspaceAccess,
    !isSignedIn || !isUserLoaded || !isConvexAuthenticated
      ? "skip"
      : { memberships: dashboardMemberships },
  );

  const tenantWorkspaces = useMemo<DashboardWorkspaceEntry[]>(
    () => dashboardAccess?.tenantWorkspaces ?? [],
    [dashboardAccess?.tenantWorkspaces],
  );
  const hasCoucouOrganizationAccess =
    Boolean(coucouMembership) || Boolean(dashboardAccess?.hasCoucouOrganizationAccess);

  async function openOrganizationPath(
    organizationId: string | undefined,
    href: string,
    targetKey: string,
    loadingMessage: string,
  ) {
    setActivatingTarget(targetKey);
    try {
      await activateOrganizationBeforeNavigation({
        organizationId,
        href,
        setActive,
        fallbackNavigate: (nextHref) => router.push(nextHref),
        toastMessages: {
          loading: loadingMessage,
          ...(targetKey === "coucou-admin" ? MAISON_OBSCUR_TOAST_OPTIONS : {}),
        },
      });
    } catch {
      setActivatingTarget(null);
    }
  }

  if (
    !isAuthLoaded ||
    (isSignedIn &&
      (!isUserLoaded ||
        isConvexAuthLoading ||
        !isConvexAuthenticated ||
        dashboardAccess === undefined))
  ) {
    return (
      <DashboardShell>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading dashboard
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (!isSignedIn) {
    return (
      <DashboardShell>
        <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-semibold">Sign in to continue</h1>
          <p className="text-sm text-muted-foreground">
            Your dashboard shows Coucou admin access and tenant organizations.
          </p>
          <Button asChild>
            <Link href="/sign-in?redirect_url=%2Fdashboard">Sign in</Link>
          </Button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <AdminHeader
        eyebrow="Dashboard"
        title="Your organizations."
        status={
          <Button type="button" size="sm" onClick={() => setIsTenantRequestOpen(true)}>
            <Plus className="size-4" />
            New tenant
          </Button>
        }
      />

      {hasCoucouOrganizationAccess ? (
        <AdminSection title="Coucou" meta="platform access">
          <div className="pt-4">
            <CoucouAdminCard
              isActivating={activatingTarget === "coucou-admin"}
              onOpenAdmin={() =>
                openOrganizationPath(
                  coucouMembership?.organizationId,
                  "/admin",
                  "coucou-admin",
                  "Switching workspace to Coucou...",
                )
              }
            />
          </div>
        </AdminSection>
      ) : null}

      <AdminSection title="Tenant workspaces" meta={`${tenantWorkspaces.length} available`}>
        {tenantWorkspaces.length > 0 ? (
          <div className="flex flex-col gap-3 pt-4">
            {tenantWorkspaces.map((workspace) => (
              <WorkspaceListRow
                key={workspace.slug}
                workspace={workspace}
                dashboardHref={buildWorkspaceOperationHref(
                  workspace.slug,
                  "dashboard",
                  hasWorkspaceWriteAccess(workspace.membershipRole) ? "" : "rsvps",
                )}
                canWrite={hasWorkspaceWriteAccess(workspace.membershipRole)}
              />
            ))}
          </div>
        ) : (
          <AdminEmptyState
            title="No tenant workspaces."
            description="No tenant organizations are connected to this account yet."
          />
        )}
      </AdminSection>

      <TenantRequestDialog
        open={isTenantRequestOpen}
        onOpenChange={setIsTenantRequestOpen}
        defaultOperatorName={defaultOperatorName}
        defaultOperatorEmail={primaryEmailAddress}
      />
    </DashboardShell>
  );
}
