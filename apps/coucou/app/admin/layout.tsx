"use client";

import { useAuth, useOrganizationList, useUser } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { AdminShell } from "@coucou/ui/admin";
import { TenantTemplateProvider } from "@coucou/ui/tenant-template";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { CoucouLogoWordmark } from "@/components/coucou-logo";
import { MAISON_OBSCUR_TOAST_OPTIONS } from "@/lib/organization-navigation";
import { getCoucouOrganizationSlug } from "@/lib/workspace-config";

function AdminLoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-[13px]">
      <span style={{ color: "var(--tt-fg-dim)" }}>{label}</span>
    </div>
  );
}

function useMaisonBodyClass() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("maison-app-surface");
    return () => {
      document.body.classList.remove("maison-app-surface");
    };
  }, []);
}

function AdminGateSurface({ children }: { children: ReactNode }) {
  return (
    <TenantTemplateProvider
      siteConfigurationPreset="maison"
      className="maison-app-surface min-h-screen"
    >
      <div
        className="min-h-screen"
        style={{
          background: "var(--tt-bg)",
          color: "var(--tt-fg)",
          fontFamily: "var(--tt-text)",
        }}
      >
        {children}
      </div>
    </TenantTemplateProvider>
  );
}

function AdminSignedOutState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md space-y-6 text-center">
        <div
          className="text-[11px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          Authentication
        </div>
        <h1
          className="m-0"
          style={{
            fontFamily: "var(--tt-display)",
            fontSize: 26,
            color: "var(--tt-fg)",
          }}
        >
          Sign in to Coucou.
        </h1>
        <p
          className="m-0"
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--tt-fg-dim)",
          }}
        >
          Use the shared auth domain first, then choose the active organization or workspace.
        </p>
        <Link
          href="/admin/login?redirect_url=%2Fadmin"
          className="inline-flex items-center px-5 py-3 text-[13px] transition-opacity hover:opacity-80"
          style={{
            background: "transparent",
            color: "var(--tt-fg)",
            border: "1px solid var(--tt-fg)",
          }}
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

function AdminDeniedState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md space-y-3 text-center">
        <h1
          className="m-0"
          style={{
            fontFamily: "var(--tt-display)",
            fontSize: 26,
            color: "var(--tt-fg)",
          }}
        >
          Coucou organization required.
        </h1>
        <p className="m-0 text-[14px]" style={{ color: "var(--tt-fg-dim)" }}>
          This account is not a member of the Coucou organization.
        </p>
      </div>
    </div>
  );
}

function AdminActivationErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md space-y-3 text-center">
        <h1
          className="m-0"
          style={{
            fontFamily: "var(--tt-display)",
            fontSize: 26,
            color: "var(--tt-fg)",
          }}
        >
          Could not open Coucou admin.
        </h1>
        <p className="m-0 text-[14px]" style={{ color: "var(--tt-fg-dim)" }}>
          {message}
        </p>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

function AdminAccessGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, orgId } = useAuth();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const ensureOrganizationMembership = useAction(
    api.workspaceBootstrap.ensureCurrentUserOrganizationMembership,
  );
  const workspaceNavigationAccess = useQuery(
    api.workspaces.listAccessibleWorkspaceNavigationForUser,
    !isSignedIn || !isAuthenticated ? "skip" : {},
  );
  const [attemptedActivationOrganizationId, setAttemptedActivationOrganizationId] = useState<
    string | null
  >(null);
  const [activationErrorMessage, setActivationErrorMessage] = useState<string | null>(null);
  const [verifiedMembershipOrganizationId, setVerifiedMembershipOrganizationId] = useState<
    string | null
  >(null);
  const [membershipVerificationErrorMessage, setMembershipVerificationErrorMessage] = useState<
    string | null
  >(null);
  const [isVerifyingMembership, setIsVerifyingMembership] = useState(false);
  const membershipVerificationInFlightOrganizationIdRef = useRef<string | null>(null);
  const coucouSwitchToastIdentifierRef = useRef<string | number | null>(null);
  const coucouSwitchToastOrganizationIdRef = useRef<string | null>(null);
  const activationErrorToastMessageRef = useRef<string | null>(null);

  const coucouOrganizationSlug = getCoucouOrganizationSlug();
  const coucouMembership = useMemo(
    () =>
      (userMemberships?.data ?? []).find(
        (membership) => membership.organization.slug?.toLowerCase() === coucouOrganizationSlug,
      ) ?? null,
    [coucouOrganizationSlug, userMemberships?.data],
  );
  const coucouOrganizationId =
    workspaceNavigationAccess?.coucouOrganizationId ?? coucouMembership?.organization.id ?? null;
  const hasCoucouMembership =
    Boolean(workspaceNavigationAccess?.hasCoucouOrganizationAccess) || Boolean(coucouMembership);
  const isSwitchingToCoucouOrganization =
    Boolean(isLoaded) &&
    Boolean(isSignedIn) &&
    hasCoucouMembership &&
    Boolean(coucouOrganizationId) &&
    orgId !== coucouOrganizationId &&
    Boolean(setActive) &&
    !activationErrorMessage;
  const canVerifyCoucouMembership =
    !coucouOrganizationId ||
    orgId === coucouOrganizationId ||
    verifiedMembershipOrganizationId === coucouOrganizationId;

  useEffect(() => {
    if (!isSwitchingToCoucouOrganization || !coucouOrganizationId) {
      if (!activationErrorMessage && coucouSwitchToastIdentifierRef.current !== null) {
        toast.dismiss(coucouSwitchToastIdentifierRef.current);
        coucouSwitchToastIdentifierRef.current = null;
        coucouSwitchToastOrganizationIdRef.current = null;
      }
      return;
    }

    if (
      coucouSwitchToastIdentifierRef.current !== null &&
      coucouSwitchToastOrganizationIdRef.current === coucouOrganizationId
    ) {
      return;
    }

    if (coucouSwitchToastIdentifierRef.current !== null) {
      toast.dismiss(coucouSwitchToastIdentifierRef.current);
    }

    coucouSwitchToastIdentifierRef.current = toast.loading(
      "Switching workspace to Coucou...",
      MAISON_OBSCUR_TOAST_OPTIONS,
    );
    coucouSwitchToastOrganizationIdRef.current = coucouOrganizationId;
  }, [activationErrorMessage, coucouOrganizationId, isSwitchingToCoucouOrganization]);

  useEffect(() => {
    if (
      !activationErrorMessage ||
      activationErrorToastMessageRef.current === activationErrorMessage
    ) {
      return;
    }

    activationErrorToastMessageRef.current = activationErrorMessage;
    if (coucouSwitchToastIdentifierRef.current !== null) {
      toast.error(activationErrorMessage, {
        id: coucouSwitchToastIdentifierRef.current,
        ...MAISON_OBSCUR_TOAST_OPTIONS,
      });
      coucouSwitchToastIdentifierRef.current = null;
      coucouSwitchToastOrganizationIdRef.current = null;
      return;
    }

    toast.error(activationErrorMessage, MAISON_OBSCUR_TOAST_OPTIONS);
  }, [activationErrorMessage]);

  useEffect(() => {
    return () => {
      if (coucouSwitchToastIdentifierRef.current !== null) {
        toast.dismiss(coucouSwitchToastIdentifierRef.current);
        coucouSwitchToastIdentifierRef.current = null;
        coucouSwitchToastOrganizationIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      !isLoaded ||
      !isSignedIn ||
      !hasCoucouMembership ||
      !coucouOrganizationId ||
      orgId === coucouOrganizationId ||
      attemptedActivationOrganizationId === coucouOrganizationId ||
      activationErrorMessage ||
      !setActive
    ) {
      return;
    }

    setAttemptedActivationOrganizationId(coucouOrganizationId);
    void setActive({ organization: coucouOrganizationId }).catch(() => {
      setActivationErrorMessage("Unable to activate the Coucou organization.");
    });
  }, [
    activationErrorMessage,
    attemptedActivationOrganizationId,
    coucouOrganizationId,
    hasCoucouMembership,
    isLoaded,
    isSignedIn,
    orgId,
    setActive,
  ]);

  useEffect(() => {
    if (
      !isLoaded ||
      !isSignedIn ||
      !hasCoucouMembership ||
      !coucouOrganizationId ||
      !canVerifyCoucouMembership ||
      verifiedMembershipOrganizationId === coucouOrganizationId ||
      membershipVerificationInFlightOrganizationIdRef.current === coucouOrganizationId ||
      membershipVerificationErrorMessage
    ) {
      return;
    }

    membershipVerificationInFlightOrganizationIdRef.current = coucouOrganizationId;
    setIsVerifyingMembership(true);
    setMembershipVerificationErrorMessage(null);
    ensureOrganizationMembership({
      clerkOrganizationId: coucouOrganizationId,
      organizationName: coucouMembership?.organization.name,
      organizationSlug: coucouMembership?.organization.slug ?? undefined,
    })
      .then(() => {
        setVerifiedMembershipOrganizationId(coucouOrganizationId);
      })
      .catch((error: unknown) => {
        setMembershipVerificationErrorMessage(
          getErrorMessage(error, "Unable to verify Coucou membership."),
        );
      })
      .finally(() => {
        if (membershipVerificationInFlightOrganizationIdRef.current === coucouOrganizationId) {
          membershipVerificationInFlightOrganizationIdRef.current = null;
          setIsVerifyingMembership(false);
        }
      });
  }, [
    coucouMembership,
    coucouOrganizationId,
    canVerifyCoucouMembership,
    ensureOrganizationMembership,
    hasCoucouMembership,
    isLoaded,
    isSignedIn,
    membershipVerificationErrorMessage,
    verifiedMembershipOrganizationId,
  ]);

  if (!isLoaded) {
    return (
      <AdminGateSurface>
        <AdminLoadingState />
      </AdminGateSurface>
    );
  }

  if (!isSignedIn) {
    return (
      <AdminGateSurface>
        <AdminSignedOutState />
      </AdminGateSurface>
    );
  }

  if (
    isConvexAuthLoading ||
    !isAuthenticated ||
    workspaceNavigationAccess === undefined ||
    userMemberships === undefined
  ) {
    return (
      <AdminGateSurface>
        <AdminLoadingState label="Loading access…" />
      </AdminGateSurface>
    );
  }

  if (!hasCoucouMembership) {
    return (
      <AdminGateSurface>
        <AdminDeniedState />
      </AdminGateSurface>
    );
  }

  if (activationErrorMessage) {
    return (
      <AdminGateSurface>
        <AdminActivationErrorState message={activationErrorMessage} />
      </AdminGateSurface>
    );
  }

  if (membershipVerificationErrorMessage) {
    return (
      <AdminGateSurface>
        <AdminActivationErrorState message={membershipVerificationErrorMessage} />
      </AdminGateSurface>
    );
  }

  if (coucouOrganizationId && orgId !== coucouOrganizationId) {
    return (
      <AdminGateSurface>
        <AdminLoadingState label="Opening Coucou admin…" />
      </AdminGateSurface>
    );
  }

  if (
    coucouOrganizationId &&
    (isVerifyingMembership || verifiedMembershipOrganizationId !== coucouOrganizationId)
  ) {
    return (
      <AdminGateSurface>
        <AdminLoadingState label="Verifying Coucou access…" />
      </AdminGateSurface>
    );
  }

  return <>{children}</>;
}

function AdminAuthenticatedShell({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const operatorEmail = user?.primaryEmailAddress?.emailAddress ?? "operator";

  return (
    <AdminShell
      brand={<CoucouLogoWordmark markSize={20} />}
      sidebar={<AdminSidebar />}
      sidebarFooter={<>{operatorEmail} · staff</>}
    >
      {children}
    </AdminShell>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  useMaisonBodyClass();

  return (
    <AdminAccessGate>
      <AdminAuthenticatedShell>{children}</AdminAuthenticatedShell>
    </AdminAccessGate>
  );
}
