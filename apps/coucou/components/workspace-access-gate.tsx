"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth, useOrganizationList, useUser } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  buildWorkspaceLoginPath,
  getCoucouOrganizationSlug,
  isCoucouWorkspaceSlug,
} from "@/lib/workspace-config";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  hasWorkspaceReadAccess,
  hasWorkspaceWriteAccess,
} from "@/lib/workspace-roles";

type WorkspaceAccessKind = "host" | "door" | "read" | "write" | "admin";

export interface WorkspaceAccessState {
  workspaceSlug: string;
  siteKey: string;
  workspaceBrandName: string;
  primaryDomain?: string | null;
  clerkOrganizationSlug?: string | null;
  membershipRole: string;
  clerkOrganizationId: string;
  queryArgs: {
    siteKey: string;
    workspaceSlug: string;
  };
  canRead: boolean;
  canWrite: boolean;
  canUseDoor: boolean;
}

interface WorkspaceAccessGateProps {
  workspaceSlug: string;
  accessKind: WorkspaceAccessKind;
  children:
    | ReactNode
    | ((workspaceAccessState: WorkspaceAccessState) => ReactNode);
}

interface BasicOrganizationMembership {
  role: string;
  organization: {
    id: string;
    name: string;
    slug?: string | null;
  };
}

const WorkspaceAccessContext = createContext<WorkspaceAccessState | null>(null);

export function useWorkspaceAccess(): WorkspaceAccessState | null {
  return useContext(WorkspaceAccessContext);
}

function membershipHasRequiredRole(
  membershipRole: string,
  accessKind: WorkspaceAccessKind,
): boolean {
  if (accessKind === "host" || accessKind === "write" || accessKind === "admin") {
    return hasWorkspaceWriteAccess(membershipRole);
  }

  return hasWorkspaceReadAccess(membershipRole);
}

function getAccessLabel(accessKind: WorkspaceAccessKind): string {
  if (accessKind === "host" || accessKind === "write" || accessKind === "admin") {
    return "dashboard write";
  }

  return "workspace";
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function WorkspaceAccessGate({
  workspaceSlug,
  accessKind,
  children,
}: WorkspaceAccessGateProps) {
  const pathname = usePathname();
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    orgId,
    orgSlug,
  } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const [activationErrorMessage, setActivationErrorMessage] = useState<
    string | null
  >(null);
  const [isActivatingOrganization, setIsActivatingOrganization] =
    useState(false);
  const [membershipVerificationErrorMessage, setMembershipVerificationErrorMessage] =
    useState<string | null>(null);
  const [isVerifyingMembership, setIsVerifyingMembership] = useState(false);
  const [
    verifiedMembershipOrganizationId,
    setVerifiedMembershipOrganizationId,
  ] = useState<string | null>(null);
  const [workspaceBootstrapErrorMessage, setWorkspaceBootstrapErrorMessage] =
    useState<string | null>(null);
  const [isBootstrappingWorkspace, setIsBootstrappingWorkspace] =
    useState(false);
  const [completedWorkspaceBootstrapKey, setCompletedWorkspaceBootstrapKey] =
    useState<string | null>(null);
  const workspaceBootstrapInFlightKeyRef = useRef<string | null>(null);
  const membershipVerificationInFlightOrganizationIdRef = useRef<
    string | null
  >(null);
  const workspaceSwitchToastIdentifierRef = useRef<string | number | null>(
    null,
  );
  const workspaceSwitchToastWorkspaceRef = useRef<string | null>(null);
  const activationErrorToastMessageRef = useRef<string | null>(null);

  const ensureTenantWorkspace = useAction(
    api.workspaceBootstrap.ensureTenantWorkspaceForOrganizationMembership,
  );
  const ensureOrganizationMembership = useAction(
    api.workspaceBootstrap.ensureCurrentUserOrganizationMembership,
  );
  const workspace = useQuery(api.workspaces.getWorkspaceBySlug, {
    slug: workspaceSlug,
  });
  const normalizedWorkspaceSlug = workspaceSlug.toLowerCase();
  const memberships = useMemo(() => {
    const membershipByOrganizationId = new Map<
      string,
      BasicOrganizationMembership
    >();
    for (const membership of userMemberships?.data ?? []) {
      membershipByOrganizationId.set(membership.organization.id, membership);
    }
    for (const membership of user?.organizationMemberships ?? []) {
      if (!membershipByOrganizationId.has(membership.organization.id)) {
        membershipByOrganizationId.set(membership.organization.id, membership);
      }
    }
    return Array.from(membershipByOrganizationId.values());
  }, [user?.organizationMemberships, userMemberships?.data]);
  const coucouOrganizationSlug = getCoucouOrganizationSlug();
  const hasCoucouPlatformAccess =
    orgSlug?.toLowerCase() === coucouOrganizationSlug ||
    memberships.some(
      (membership) =>
        membership.organization.slug?.toLowerCase() === coucouOrganizationSlug,
    );
  const workspaceConfiguration =
    workspace &&
    !isCoucouWorkspaceSlug(workspace.slug) &&
    workspace.kind !== "admin"
      ? {
          workspaceSlug: workspace.slug,
          siteKey: workspace.sites?.[0]?.siteKey ?? workspace.slug,
          brandName: workspace.name,
          primaryDomain: workspace.primaryDomain ?? null,
          clerkOrganizationId: workspace.clerkOrganizationId ?? "",
          clerkOrganizationSlug: workspace.clerkOrganizationSlug ?? null,
        }
      : null;
  const targetMembership =
    memberships.find((membership) => {
      if (
        workspaceConfiguration?.clerkOrganizationId &&
        membership.organization.id === workspaceConfiguration.clerkOrganizationId
      ) {
        return true;
      }
      return (
        membership.organization.slug?.toLowerCase() === normalizedWorkspaceSlug
      );
    }) ?? null;
  const targetOrganizationId =
    workspaceConfiguration?.clerkOrganizationId ||
    targetMembership?.organization.id ||
    "";
  const workspaceBrandName =
    workspaceConfiguration?.brandName ??
    targetMembership?.organization.name ??
    workspaceSlug;
  const needsWorkspaceBootstrap =
    Boolean(targetMembership) &&
    (!workspaceConfiguration ||
      !workspace ||
      !workspace.clerkOrganizationId ||
      workspace.clerkOrganizationId !== targetMembership?.organization.id);
  const workspaceBootstrapKey = targetMembership
    ? `${workspaceSlug}:${targetMembership.organization.id}`
    : null;
  const shouldBootstrapWorkspace =
    needsWorkspaceBootstrap &&
    workspaceBootstrapKey !== completedWorkspaceBootstrapKey;
  const isWorkspaceSwitching =
    Boolean(targetMembership) &&
    Boolean(targetOrganizationId) &&
    orgId !== targetOrganizationId &&
    Boolean(setActive) &&
    !activationErrorMessage;
  const hasUsableWorkspaceAuthorization =
    (Boolean(targetOrganizationId) &&
      (orgId === targetOrganizationId ||
        verifiedMembershipOrganizationId === targetOrganizationId)) ||
    (Boolean(workspaceConfiguration) && hasCoucouPlatformAccess);

  useEffect(() => {
    if (
      !targetMembership ||
      !targetOrganizationId ||
      orgId === targetOrganizationId ||
      isActivatingOrganization ||
      activationErrorMessage ||
      !setActive
    ) {
      return;
    }

    let isCurrent = true;
    setIsActivatingOrganization(true);
    setActivationErrorMessage(null);
    setActive({
      organization: targetOrganizationId,
    })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Unable to activate organization.";
        setActivationErrorMessage(message);
      })
      .finally(() => {
        if (isCurrent) {
          setIsActivatingOrganization(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [
    activationErrorMessage,
    isActivatingOrganization,
    orgId,
    setActive,
    targetMembership,
    targetOrganizationId,
  ]);

  useEffect(() => {
    if (
      !targetMembership ||
      !shouldBootstrapWorkspace ||
      !workspaceBootstrapKey ||
      workspaceBootstrapInFlightKeyRef.current === workspaceBootstrapKey
    ) {
      return;
    }

    workspaceBootstrapInFlightKeyRef.current = workspaceBootstrapKey;
    setIsBootstrappingWorkspace(true);
    setWorkspaceBootstrapErrorMessage(null);
    ensureTenantWorkspace({
      slug: workspaceSlug,
      name: targetMembership.organization.name,
      clerkOrganizationId: targetMembership.organization.id,
      clerkOrganizationSlug: targetMembership.organization.slug ?? undefined,
    })
      .then(() => {
        setCompletedWorkspaceBootstrapKey(workspaceBootstrapKey);
        setVerifiedMembershipOrganizationId(targetMembership.organization.id);
      })
      .catch((error: unknown) => {
        setWorkspaceBootstrapErrorMessage(
          getErrorMessage(error, "Unable to prepare workspace."),
        );
      })
      .finally(() => {
        if (workspaceBootstrapInFlightKeyRef.current === workspaceBootstrapKey) {
          workspaceBootstrapInFlightKeyRef.current = null;
          setIsBootstrappingWorkspace(false);
        }
      });
  }, [
    ensureTenantWorkspace,
    shouldBootstrapWorkspace,
    targetMembership,
    workspaceBootstrapKey,
    workspaceSlug,
  ]);

  useEffect(() => {
    if (
      !targetMembership ||
      !targetOrganizationId ||
      shouldBootstrapWorkspace ||
      isBootstrappingWorkspace ||
      verifiedMembershipOrganizationId === targetOrganizationId ||
      membershipVerificationInFlightOrganizationIdRef.current ===
        targetOrganizationId ||
      membershipVerificationErrorMessage
    ) {
      return;
    }

    membershipVerificationInFlightOrganizationIdRef.current =
      targetOrganizationId;
    setIsVerifyingMembership(true);
    setMembershipVerificationErrorMessage(null);
    ensureOrganizationMembership({
      clerkOrganizationId: targetOrganizationId,
      organizationName: targetMembership.organization.name,
      organizationSlug: targetMembership.organization.slug ?? undefined,
    })
      .then(() => {
        setVerifiedMembershipOrganizationId(targetOrganizationId);
      })
      .catch((error: unknown) => {
        setMembershipVerificationErrorMessage(
          getErrorMessage(error, "Unable to verify organization membership."),
        );
      })
      .finally(() => {
        if (
          membershipVerificationInFlightOrganizationIdRef.current ===
          targetOrganizationId
        ) {
          membershipVerificationInFlightOrganizationIdRef.current = null;
          setIsVerifyingMembership(false);
        }
      });
  }, [
    ensureOrganizationMembership,
    isBootstrappingWorkspace,
    membershipVerificationErrorMessage,
    shouldBootstrapWorkspace,
    targetMembership,
    targetOrganizationId,
    verifiedMembershipOrganizationId,
  ]);

  useEffect(() => {
    if (!isWorkspaceSwitching) {
      if (workspaceSwitchToastIdentifierRef.current !== null) {
        toast.dismiss(workspaceSwitchToastIdentifierRef.current);
        workspaceSwitchToastIdentifierRef.current = null;
        workspaceSwitchToastWorkspaceRef.current = null;
      }
      return;
    }

    if (
      workspaceSwitchToastIdentifierRef.current !== null &&
      workspaceSwitchToastWorkspaceRef.current === workspaceBrandName
    ) {
      return;
    }

    if (workspaceSwitchToastIdentifierRef.current !== null) {
      toast.dismiss(workspaceSwitchToastIdentifierRef.current);
    }

    workspaceSwitchToastIdentifierRef.current = toast.loading(
      `Switching workspace to ${workspaceBrandName}...`,
    );
    workspaceSwitchToastWorkspaceRef.current = workspaceBrandName;
  }, [isWorkspaceSwitching, workspaceBrandName]);

  useEffect(() => {
    if (
      !activationErrorMessage ||
      activationErrorToastMessageRef.current === activationErrorMessage
    ) {
      return;
    }

    activationErrorToastMessageRef.current = activationErrorMessage;
    toast.error(activationErrorMessage);
  }, [activationErrorMessage]);

  useEffect(() => {
    return () => {
      if (workspaceSwitchToastIdentifierRef.current !== null) {
        toast.dismiss(workspaceSwitchToastIdentifierRef.current);
        workspaceSwitchToastIdentifierRef.current = null;
        workspaceSwitchToastWorkspaceRef.current = null;
      }
    };
  }, []);

  if (workspace === undefined) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-6 text-primary">
        <Spinner />
      </main>
    );
  }

  if (!isAuthLoaded || !isUserLoaded) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-6 text-primary">
        <Spinner />
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">
          Sign in to access {workspaceBrandName}
        </h1>
        <Button asChild>
          <Link href={buildWorkspaceLoginPath(workspaceSlug, pathname)}>
            Sign in with Coucou
          </Link>
        </Button>
      </main>
    );
  }

  if (
    userMemberships === undefined &&
    memberships.length === 0 &&
    !hasCoucouPlatformAccess
  ) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-6 text-primary">
        <Spinner />
      </main>
    );
  }

  if (!workspaceConfiguration && !targetMembership) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Workspace not found</h1>
      </main>
    );
  }

  const hasCoucouSuperadminWorkspaceAccess =
    Boolean(workspaceConfiguration) && hasCoucouPlatformAccess;

  if (!targetMembership && !hasCoucouSuperadminWorkspaceAccess) {
    return (
      <main className="mx-auto max-w-3xl space-y-2 p-6">
        <h1 className="text-xl font-semibold">Organization access required</h1>
        <p className="text-sm text-foreground/70">
          This account is not a member of {workspaceBrandName}.
        </p>
      </main>
    );
  }

  if (
    targetMembership &&
    !hasCoucouSuperadminWorkspaceAccess &&
    !membershipHasRequiredRole(targetMembership.role, accessKind)
  ) {
    return (
      <main className="mx-auto max-w-3xl space-y-2 p-6">
        <h1 className="text-xl font-semibold">
          {getAccessLabel(accessKind)} access required
        </h1>
        <p className="text-sm text-foreground/70">
          Your {workspaceBrandName} role does not include this
          workspace area.
        </p>
      </main>
    );
  }

  if (
    workspaceBootstrapErrorMessage ||
    shouldBootstrapWorkspace ||
    isBootstrappingWorkspace
  ) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-3xl flex-col items-center justify-center gap-3 p-6 text-center">
        {workspaceBootstrapErrorMessage ? (
          <>
            <h1 className="text-xl font-semibold">
              Could not open workspace
            </h1>
            <p className="text-sm text-foreground/70">
              {workspaceBootstrapErrorMessage}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground/70">
              Preparing {workspaceBrandName}...
            </p>
          </>
        )}
      </main>
    );
  }

  if (
    !hasUsableWorkspaceAuthorization &&
    (membershipVerificationErrorMessage ||
      isVerifyingMembership ||
      verifiedMembershipOrganizationId !== targetOrganizationId)
  ) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-3xl flex-col items-center justify-center gap-3 p-6 text-center">
        {membershipVerificationErrorMessage ? (
          <>
            <h1 className="text-xl font-semibold">
              Could not verify workspace access
            </h1>
            <p className="text-sm text-foreground/70">
              {membershipVerificationErrorMessage}
            </p>
          </>
        ) : (
          <p className="text-sm text-foreground/70">
            Verifying {workspaceBrandName} access...
          </p>
        )}
      </main>
    );
  }

  const workspaceAccessState: WorkspaceAccessState = {
    workspaceSlug: workspaceConfiguration?.workspaceSlug ?? workspaceSlug,
    siteKey: workspaceConfiguration?.siteKey ?? workspaceSlug,
    workspaceBrandName,
    primaryDomain: workspaceConfiguration?.primaryDomain ?? null,
    clerkOrganizationSlug:
      workspaceConfiguration?.clerkOrganizationSlug ??
      targetMembership?.organization.slug ??
      null,
    membershipRole: hasCoucouSuperadminWorkspaceAccess
      ? "org:admin"
      : targetMembership?.role ?? "org:admin",
    clerkOrganizationId:
      targetOrganizationId || workspaceConfiguration?.clerkOrganizationId || "",
    queryArgs: {
      siteKey: workspaceConfiguration?.siteKey ?? workspaceSlug,
      workspaceSlug: workspaceConfiguration?.workspaceSlug ?? workspaceSlug,
    },
    canRead:
      hasCoucouSuperadminWorkspaceAccess ||
      hasWorkspaceReadAccess(targetMembership?.role),
    canWrite:
      hasCoucouSuperadminWorkspaceAccess ||
      hasWorkspaceWriteAccess(targetMembership?.role),
    canUseDoor:
      hasCoucouSuperadminWorkspaceAccess ||
      hasWorkspaceReadAccess(targetMembership?.role),
  };

  return (
    <WorkspaceAccessContext.Provider value={workspaceAccessState}>
      {typeof children === "function" ? children(workspaceAccessState) : children}
    </WorkspaceAccessContext.Provider>
  );
}
