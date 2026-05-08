"use client";

import { useAuth, useOrganizationList, useUser } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { AdminEmptyState, AdminHeader, AdminSection } from "@coucou/ui/admin";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowRight, Loader2, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CoucouLogoMark } from "@/components/coucou-logo";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  activateOrganizationBeforeNavigation,
  MAISON_OBSCUR_TOAST_OPTIONS,
} from "@/lib/organization-navigation";
import { getToastErrorMessage, runMutationWithToast } from "@/lib/toast-mutation";
import { getCoucouOrganizationSlug } from "@/lib/workspace-config";
import { buildRoleAwareDashboardPath, hasWorkspaceWriteAccess } from "@/lib/workspace-roles";

interface DashboardMembership {
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  role: string;
}

interface DashboardTenantWorkspace {
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

function formatRole(role: string): string {
  return role.replace(/^org:/, "").replace(/-/g, " ");
}

function optionalString(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function readPrimaryDomainFromMutationResult(mutationResult: unknown): string | null | undefined {
  if (typeof mutationResult !== "object" || mutationResult === null) {
    return undefined;
  }

  const resultRecord = mutationResult as { primaryDomain?: unknown };
  if (typeof resultRecord.primaryDomain === "string") {
    return resultRecord.primaryDomain;
  }
  if (resultRecord.primaryDomain === null) {
    return null;
  }
  return undefined;
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
  const submitApplication = useMutation(api.tenantApplications.submitApplication);
  const setTenantWorkspacePrimaryDomain = useMutation(
    api.workspaces.setTenantWorkspacePrimaryDomain,
  );
  const [activatingTarget, setActivatingTarget] = useState<string | null>(null);
  const [savingDomainTarget, setSavingDomainTarget] = useState<string | null>(null);
  const [domainDraftsByWorkspaceSlug, setDomainDraftsByWorkspaceSlug] = useState<
    Record<string, string>
  >({});
  const [tenantName, setTenantName] = useState("");
  const [tenantCity, setTenantCity] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [operatorEmail, setOperatorEmail] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestStatusMessage, setRequestStatusMessage] = useState<string | null>(null);

  const clerkMemberships = userMemberships?.data;
  const profileMemberships = useMemo(
    () => user?.organizationMemberships ?? [],
    [user?.organizationMemberships],
  );
  const coucouOrganizationSlug = getCoucouOrganizationSlug();
  const primaryEmailAddress = user?.primaryEmailAddress?.emailAddress ?? "";
  const defaultOperatorName = user?.fullName?.trim() || primaryEmailAddress || "Coucou user";

  useEffect(() => {
    if (!operatorName && defaultOperatorName) {
      setOperatorName(defaultOperatorName);
    }
  }, [defaultOperatorName, operatorName]);

  useEffect(() => {
    if (!operatorEmail && primaryEmailAddress) {
      setOperatorEmail(primaryEmailAddress);
    }
  }, [operatorEmail, primaryEmailAddress]);

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

  const tenantWorkspaces = useMemo<DashboardTenantWorkspace[]>(
    () => dashboardAccess?.tenantWorkspaces ?? [],
    [dashboardAccess?.tenantWorkspaces],
  );
  const hasCoucouOrganizationAccess =
    Boolean(coucouMembership) || Boolean(dashboardAccess?.hasCoucouOrganizationAccess);

  useEffect(() => {
    setDomainDraftsByWorkspaceSlug((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      let hasChanges = false;
      for (const workspace of tenantWorkspaces) {
        if (!(workspace.slug in nextDrafts)) {
          nextDrafts[workspace.slug] = workspace.primaryDomain ?? "";
          hasChanges = true;
        }
      }
      return hasChanges ? nextDrafts : currentDrafts;
    });
  }, [tenantWorkspaces]);

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

  async function handleTenantRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTenantName = tenantName.trim();
    const trimmedOperatorName = operatorName.trim() || defaultOperatorName;

    if (!trimmedTenantName) {
      setRequestStatusMessage("Tenant name is required.");
      return;
    }

    setIsSubmittingRequest(true);
    setRequestStatusMessage(null);
    try {
      await runMutationWithToast(
        () =>
          submitApplication({
            name: trimmedTenantName,
            city: optionalString(tenantCity),
            operator: trimmedOperatorName,
            operatorEmail: optionalString(operatorEmail),
            body: optionalString(requestDetails),
          }),
        {
          loading: "Submitting tenant request...",
          success: "Tenant request submitted",
        },
      );
      setTenantName("");
      setTenantCity("");
      setRequestDetails("");
      setRequestStatusMessage("Request submitted for Coucou review.");
    } catch (error) {
      const errorMessage = getToastErrorMessage(error);
      setRequestStatusMessage(errorMessage);
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function handleTenantDomainSubmit(
    event: FormEvent<HTMLFormElement>,
    workspace: DashboardTenantWorkspace,
  ) {
    event.preventDefault();

    const clerkOrganizationId = workspace.organizationId ?? workspace.clerkOrganizationId;
    if (!clerkOrganizationId) {
      toast.error("Workspace organization is not configured.");
      return;
    }

    const primaryDomain = optionalString(domainDraftsByWorkspaceSlug[workspace.slug] ?? "");
    if (!primaryDomain) {
      toast.error("Primary URL is required.");
      return;
    }

    const targetKey = `${workspace.slug}:domain`;
    setSavingDomainTarget(targetKey);
    try {
      const mutationResult = await runMutationWithToast(
        () =>
          setTenantWorkspacePrimaryDomain({
            slug: workspace.slug,
            clerkOrganizationId,
            primaryDomain,
          }),
        {
          loading: "Saving tenant URL...",
          success: "Tenant URL updated",
        },
      );
      if (setActive) {
        void setActive({ organization: clerkOrganizationId }).catch(() => undefined);
      }
      const savedPrimaryDomain = readPrimaryDomainFromMutationResult(mutationResult);
      if (savedPrimaryDomain !== undefined) {
        setDomainDraftsByWorkspaceSlug((currentDrafts) => ({
          ...currentDrafts,
          [workspace.slug]: savedPrimaryDomain ?? "",
        }));
      }
      router.refresh();
    } catch {
      // Error toast is handled by runMutationWithToast.
    } finally {
      setSavingDomainTarget(null);
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
        status={<span>{tenantWorkspaces.length} tenant workspaces</span>}
      />

      {hasCoucouOrganizationAccess ? (
        <AdminSection title="Coucou" meta="platform access">
          <div
            className="flex flex-wrap items-center justify-between gap-4 py-5 text-[13px]"
            style={{ borderBottom: "1px solid var(--tt-rule)" }}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2" style={{ color: "var(--tt-fg)" }}>
                <CoucouLogoMark size={20} />
                <span>Coucou Admin</span>
              </div>
              <div
                className="max-w-2xl text-[12px] leading-relaxed"
                style={{ color: "var(--tt-fg-dim)" }}
              >
                Super-admin views for tenant review, billing, delivery, and platform operations.
              </div>
            </div>
            <Button
              type="button"
              className="h-8 rounded-none px-3 text-[12px]"
              onClick={() =>
                openOrganizationPath(
                  coucouMembership?.organizationId,
                  "/admin",
                  "coucou-admin",
                  "Switching workspace to Coucou...",
                )
              }
              disabled={activatingTarget === "coucou-admin"}
            >
              {activatingTarget === "coucou-admin" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              Open admin
            </Button>
          </div>
        </AdminSection>
      ) : null}

      <AdminSection title="Tenant workspaces" meta={`${tenantWorkspaces.length} available`}>
        {tenantWorkspaces.length > 0 ? (
          <div role="table">
            <div
              role="row"
              className="hidden grid-cols-[minmax(180px,1.4fr)_120px_minmax(220px,1.5fr)_150px] gap-4 py-4 text-[11px] uppercase tracking-[0.06em] md:grid"
              style={{
                borderBottom: "1px solid var(--tt-rule)",
                color: "var(--tt-fg-mute)",
              }}
            >
              <div role="columnheader">Workspace</div>
              <div role="columnheader">Role</div>
              <div role="columnheader">Primary URL</div>
              <div role="columnheader" className="text-right">
                Action
              </div>
            </div>
            {tenantWorkspaces.map((workspace) => {
              const dashboardHref = buildRoleAwareDashboardPath(
                workspace.slug,
                workspace.membershipRole,
              );
              const organizationId =
                workspace.organizationId ?? workspace.clerkOrganizationId ?? undefined;
              const dashboardTargetKey = `${workspace.slug}:dashboard`;
              const domainTargetKey = `${workspace.slug}:domain`;
              const canEditWorkspaceDomain = hasWorkspaceWriteAccess(workspace.membershipRole);
              const workspaceStatus = workspace.primaryDomain
                ? workspace.primaryDomain
                : !workspace.isWorkspaceConfigured
                  ? "Clerk organization connected. Coucou workspace setup is pending."
                  : "No primary URL set.";

              return (
                <div
                  key={workspace.slug}
                  role="row"
                  className="grid gap-4 py-4 text-[13px] md:grid-cols-[minmax(180px,1.4fr)_120px_minmax(220px,1.5fr)_150px]"
                  style={{
                    borderBottom: "1px solid var(--tt-rule)",
                    color: "var(--tt-fg)",
                  }}
                >
                  <div role="cell" className="space-y-1">
                    <div>{workspace.name}</div>
                    <div
                      className="text-[12px] leading-relaxed"
                      style={{ color: "var(--tt-fg-dim)" }}
                    >
                      {workspaceStatus}
                    </div>
                    <div
                      className="text-[12px] leading-relaxed md:hidden"
                      style={{ color: "var(--tt-fg-dim)" }}
                    >
                      Role: {formatRole(workspace.membershipRole)}
                    </div>
                  </div>
                  <div
                    role="cell"
                    className="hidden md:block"
                    style={{ color: "var(--tt-fg-dim)" }}
                  >
                    {formatRole(workspace.membershipRole)}
                  </div>
                  <div role="cell">
                    {canEditWorkspaceDomain ? (
                      <form
                        className="space-y-2"
                        onSubmit={(event) => handleTenantDomainSubmit(event, workspace)}
                      >
                        <Label
                          htmlFor={`primary-domain-${workspace.slug}`}
                          className="text-[11px] uppercase tracking-[0.06em] md:sr-only"
                          style={{ color: "var(--tt-fg-mute)" }}
                        >
                          Primary URL
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id={`primary-domain-${workspace.slug}`}
                            value={domainDraftsByWorkspaceSlug[workspace.slug] ?? ""}
                            onChange={(event) =>
                              setDomainDraftsByWorkspaceSlug((currentDrafts) => ({
                                ...currentDrafts,
                                [workspace.slug]: event.target.value,
                              }))
                            }
                            placeholder="dojopomodoro.club"
                            inputMode="url"
                            required
                            className="h-8 rounded-none border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0"
                            style={{
                              borderBottom: "1px solid var(--tt-rule)",
                              color: "var(--tt-fg)",
                            }}
                          />
                          <Button
                            type="submit"
                            size="icon"
                            className="size-8 rounded-none"
                            aria-label={`Save URL for ${workspace.name}`}
                            disabled={savingDomainTarget === domainTargetKey}
                          >
                            <Save className="size-4" />
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <span style={{ color: "var(--tt-fg-dim)" }}>{workspaceStatus}</span>
                    )}
                  </div>
                  <div role="cell" className="flex md:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 rounded-none px-3 text-[12px]"
                      onClick={() =>
                        openOrganizationPath(
                          organizationId,
                          dashboardHref,
                          dashboardTargetKey,
                          `Switching workspace to ${workspace.name}...`,
                        )
                      }
                      disabled={activatingTarget === dashboardTargetKey}
                    >
                      {activatingTarget === dashboardTargetKey ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ArrowRight className="size-4" />
                      )}
                      Open dashboard
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <AdminEmptyState
            title="No tenant workspaces."
            description="No tenant organizations are connected to this account yet."
          />
        )}
      </AdminSection>

      <AdminSection title="Request a new tenant" meta="Coucou review">
        <form className="grid gap-5 py-6 md:grid-cols-2" onSubmit={handleTenantRequestSubmit}>
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Tenant name</Label>
            <Input
              id="tenant-name"
              value={tenantName}
              onChange={(event) => setTenantName(event.target.value)}
              placeholder="Dojo Pomodoro"
              required
              className="rounded-none border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0"
              style={{
                borderBottom: "1px solid var(--tt-rule)",
                color: "var(--tt-fg)",
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-city">City</Label>
            <Input
              id="tenant-city"
              value={tenantCity}
              onChange={(event) => setTenantCity(event.target.value)}
              placeholder="New York"
              className="rounded-none border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0"
              style={{
                borderBottom: "1px solid var(--tt-rule)",
                color: "var(--tt-fg)",
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operator-name">Operator</Label>
            <Input
              id="operator-name"
              value={operatorName}
              onChange={(event) => setOperatorName(event.target.value)}
              required
              className="rounded-none border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0"
              style={{
                borderBottom: "1px solid var(--tt-rule)",
                color: "var(--tt-fg)",
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operator-email">Operator email</Label>
            <Input
              id="operator-email"
              type="email"
              value={operatorEmail}
              onChange={(event) => setOperatorEmail(event.target.value)}
              placeholder="operator@example.com"
              className="rounded-none border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0"
              style={{
                borderBottom: "1px solid var(--tt-rule)",
                color: "var(--tt-fg)",
              }}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="request-details">Notes</Label>
            <Textarea
              id="request-details"
              value={requestDetails}
              onChange={(event) => setRequestDetails(event.target.value)}
              placeholder="Audience, launch timing, or setup details."
              className="min-h-24 rounded-none border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0"
              style={{
                borderBottom: "1px solid var(--tt-rule)",
                color: "var(--tt-fg)",
              }}
            />
          </div>
          {requestStatusMessage ? (
            <p className="text-[13px] md:col-span-2" style={{ color: "var(--tt-fg-dim)" }}>
              {requestStatusMessage}
            </p>
          ) : null}
          <div className="md:col-span-2">
            <Button
              type="submit"
              className="h-9 rounded-none px-4 text-[12px]"
              disabled={isSubmittingRequest}
              aria-busy={isSubmittingRequest}
            >
              <Plus className="size-4" />
              Submit request
            </Button>
          </div>
        </form>
      </AdminSection>
    </DashboardShell>
  );
}
