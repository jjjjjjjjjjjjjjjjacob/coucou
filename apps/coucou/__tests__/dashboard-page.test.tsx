import { beforeEach, describe, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DashboardClient } from "../app/dashboard/dashboard-client";
import { HapticProvider } from "../contexts/haptic-context";

function renderDashboardClient() {
  return render(
    <HapticProvider>
      <DashboardClient />
    </HapticProvider>,
  );
}

interface DashboardTestGlobal {
  __setClerkTestMemberships?: (
    nextMemberships: Array<{
      id: string;
      role: string;
      organization: {
        id: string;
        name: string;
        slug: string | null;
      };
    }>,
  ) => void;
  __setConvexQueryResponse?: (nextResponse: unknown) => void;
  __getConvexMutationCalls?: () => unknown[];
  __clearConvexMutationCalls?: () => void;
  __getToastTestCalls?: () => Array<{
    kind: string;
    message: string;
    id?: string | number;
    className?: string;
  }>;
  __getClerkSetActiveCalls?: () => Array<{ organization: string }>;
  __getLocationAssignCalls?: () => string[];
  __getRouterPushCalls?: () => string[];
}

function getDashboardTestGlobal(): typeof globalThis & DashboardTestGlobal {
  return globalThis as typeof globalThis & DashboardTestGlobal;
}

function setDashboardAccessResponse(nextResponse: unknown) {
  getDashboardTestGlobal().__setConvexQueryResponse?.(nextResponse);
}

function getConvexMutationCalls(): unknown[] {
  return getDashboardTestGlobal().__getConvexMutationCalls?.() ?? [];
}

function getToastTestCalls() {
  return getDashboardTestGlobal().__getToastTestCalls?.() ?? [];
}

function getClerkSetActiveCalls() {
  return getDashboardTestGlobal().__getClerkSetActiveCalls?.() ?? [];
}

function getLocationAssignCalls(): string[] {
  return getDashboardTestGlobal().__getLocationAssignCalls?.() ?? [];
}

function getRouterPushCalls(): string[] {
  return getDashboardTestGlobal().__getRouterPushCalls?.() ?? [];
}

describe("DashboardClient", () => {
  beforeEach(() => {
    getDashboardTestGlobal().__clearConvexMutationCalls?.();
  });

  it("shows Coucou admin access without tenant workspaces", () => {
    setDashboardAccessResponse({
      hasCoucouOrganizationAccess: true,
      tenantWorkspaces: [],
    });

    const { container } = renderDashboardClient();

    expect(screen.getByText("Your organizations.")).toBeTruthy();
    expect(container.querySelector('[data-preset="maison"]')).toBeTruthy();
    expect(screen.getByText("Coucou Admin")).toBeTruthy();
    expect(
      screen.getByText("No tenant organizations are connected to this account yet."),
    ).toBeTruthy();
  });

  it("activates the Coucou organization before entering admin", async () => {
    getDashboardTestGlobal().__setClerkTestMemberships?.([
      {
        id: "membership_coucou",
        role: "org:admin",
        organization: { id: "org_coucou", name: "Coucou", slug: "coucou" },
      },
    ]);
    setDashboardAccessResponse({
      hasCoucouOrganizationAccess: true,
      tenantWorkspaces: [],
    });

    renderDashboardClient();

    fireEvent.click(screen.getByRole("button", { name: /Open admin/ }));

    await waitFor(() => {
      expect(getClerkSetActiveCalls()).toEqual([{ organization: "org_coucou" }]);
      expect(getLocationAssignCalls()).toEqual(["/admin"]);
    });
    const coucouSwitchToast =
      getToastTestCalls().find(
        (toastCall) =>
          toastCall.kind === "loading" && toastCall.message === "Switching workspace to Coucou...",
      ) ?? null;
    expect(coucouSwitchToast?.id).toBe("toast_1");
    expect(coucouSwitchToast?.className).toBe("maison-obscur-toast");
    expect(getRouterPushCalls()).toEqual([]);
  });

  it("shows one tenant dashboard entry point for tenant admins", () => {
    getDashboardTestGlobal().__setClerkTestMemberships?.([
      {
        id: "membership_coucou",
        role: "org:admin",
        organization: { id: "org_coucou", name: "Coucou", slug: "coucou" },
      },
      {
        id: "membership_dojo",
        role: "org:admin",
        organization: {
          id: "org_dojo",
          name: "Dojo Pomodoro",
          slug: "dojo-pomodoro",
        },
      },
    ]);
    setDashboardAccessResponse({
      hasCoucouOrganizationAccess: true,
      tenantWorkspaces: [
        {
          slug: "dojo-pomodoro",
          name: "Dojo Pomodoro",
          primaryDomain: "dojopomodoro.club",
          clerkOrganizationId: "org_dojo",
          clerkOrganizationSlug: "dojo-pomodoro",
          organizationId: "org_dojo",
          membershipRole: "org:admin",
        },
      ],
    });

    renderDashboardClient();

    expect(screen.getAllByText("Dojo Pomodoro").length).toBeGreaterThan(0);
    expect(screen.getByText("dojopomodoro.club")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open dashboard/ })).toHaveAttribute(
      "href",
      "http://localhost:3000/workspaces/dojo-pomodoro/dashboard",
    );
    expect(screen.queryByRole("button", { name: /Host/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Door/ })).toBeNull();
  });

  it("opens tenant dashboards from Coucou without switching into the tenant organization", async () => {
    getDashboardTestGlobal().__setClerkTestMemberships?.([
      {
        id: "membership_coucou",
        role: "org:admin",
        organization: { id: "org_coucou", name: "Coucou", slug: "coucou" },
      },
      {
        id: "membership_dojo",
        role: "org:admin",
        organization: {
          id: "org_dojo",
          name: "Dojo Pomodoro",
          slug: "dojo-pomodoro",
        },
      },
    ]);
    setDashboardAccessResponse({
      hasCoucouOrganizationAccess: true,
      tenantWorkspaces: [
        {
          slug: "dojo-pomodoro",
          name: "Dojo Pomodoro",
          primaryDomain: "dojopomodoro.club",
          clerkOrganizationId: "org_dojo",
          clerkOrganizationSlug: "dojo-pomodoro",
          organizationId: "org_dojo",
          membershipRole: "org:admin",
          isWorkspaceConfigured: true,
        },
      ],
    });

    renderDashboardClient();

    const openDashboardLink = screen.getByRole("link", { name: /Open dashboard/ });
    expect(openDashboardLink).toHaveAttribute(
      "href",
      "http://localhost:3000/workspaces/dojo-pomodoro/dashboard",
    );
    fireEvent.click(openDashboardLink);

    expect(getClerkSetActiveCalls()).toEqual([]);
    expect(getLocationAssignCalls()).toEqual([]);
    expect(getRouterPushCalls()).toEqual([]);
  });

  it("opens tenant dashboards as direct links for tenant-only dashboard navigation", () => {
    getDashboardTestGlobal().__setClerkTestMemberships?.([
      {
        id: "membership_dojo",
        role: "org:admin",
        organization: {
          id: "org_dojo",
          name: "Dojo Pomodoro",
          slug: "dojo-pomodoro",
        },
      },
    ]);
    setDashboardAccessResponse({
      hasCoucouOrganizationAccess: false,
      tenantWorkspaces: [
        {
          slug: "dojo-pomodoro",
          name: "Dojo Pomodoro",
          primaryDomain: "dojopomodoro.club",
          clerkOrganizationId: "org_dojo",
          clerkOrganizationSlug: "dojo-pomodoro",
          organizationId: "org_dojo",
          membershipRole: "org:admin",
          isWorkspaceConfigured: true,
        },
      ],
    });

    renderDashboardClient();

    const openDashboardLink = screen.getByRole("link", { name: /Open dashboard/ });
    expect(openDashboardLink).toHaveAttribute(
      "href",
      "http://localhost:3000/workspaces/dojo-pomodoro/dashboard",
    );
    fireEvent.click(openDashboardLink);

    expect(getClerkSetActiveCalls()).toEqual([]);
    expect(getLocationAssignCalls()).toEqual([]);
    expect(getRouterPushCalls()).toEqual([]);
  });

  it("shows tenant members an open dashboard action without URL editing", () => {
    getDashboardTestGlobal().__setClerkTestMemberships?.([
      {
        id: "membership_dojo",
        role: "org:member",
        organization: {
          id: "org_dojo",
          name: "Dojo Pomodoro",
          slug: "dojo-pomodoro",
        },
      },
    ]);
    setDashboardAccessResponse({
      hasCoucouOrganizationAccess: false,
      tenantWorkspaces: [
        {
          slug: "dojo-pomodoro",
          name: "Dojo Pomodoro",
          primaryDomain: "dojopomodoro.club",
          clerkOrganizationId: "org_dojo",
          clerkOrganizationSlug: "dojo-pomodoro",
          organizationId: "org_dojo",
          membershipRole: "org:member",
          isWorkspaceConfigured: true,
        },
      ],
    });

    renderDashboardClient();

    expect(screen.getByRole("link", { name: /Open dashboard/ })).toHaveAttribute(
      "href",
      "http://localhost:3000/workspaces/dojo-pomodoro/dashboard/rsvps",
    );
    expect(screen.queryByLabelText("Primary URL")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit primary URL for Dojo Pomodoro" })).toBeNull();
  });

  it("lets tenant admins update the primary URL", async () => {
    getDashboardTestGlobal().__setClerkTestMemberships?.([
      {
        id: "membership_dojo",
        role: "org:admin",
        organization: {
          id: "org_dojo",
          name: "Dojo Pomodoro",
          slug: "dojo-pomodoro",
        },
      },
    ]);
    setDashboardAccessResponse({
      hasCoucouOrganizationAccess: false,
      tenantWorkspaces: [
        {
          slug: "dojo-pomodoro",
          name: "Dojo Pomodoro",
          primaryDomain: "dojopomodoro.club",
          clerkOrganizationId: "org_dojo",
          clerkOrganizationSlug: "dojo-pomodoro",
          organizationId: "org_dojo",
          membershipRole: "org:admin",
          isWorkspaceConfigured: true,
        },
      ],
    });

    renderDashboardClient();

    fireEvent.click(screen.getByRole("button", { name: "Edit primary URL for Dojo Pomodoro" }));
    fireEvent.change(screen.getByLabelText("Primary URL"), {
      target: { value: "events.dojopomodoro.club" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save URL/ }));

    await waitFor(() => {
      expect(getConvexMutationCalls()).toEqual([
        {
          slug: "dojo-pomodoro",
          clerkOrganizationId: "org_dojo",
          primaryDomain: "events.dojopomodoro.club",
        },
      ]);
    });
    expect(getToastTestCalls()).toContainEqual({
      kind: "loading",
      message: "Saving tenant URL...",
      id: "toast_1",
    });
    expect(getToastTestCalls()).toContainEqual({
      kind: "success",
      message: "Tenant URL updated",
      id: "toast_1",
    });
  });

  it("submits tenant onboarding requests", async () => {
    setDashboardAccessResponse({
      hasCoucouOrganizationAccess: true,
      tenantWorkspaces: [],
    });

    renderDashboardClient();

    fireEvent.click(screen.getByRole("button", { name: /New tenant/ }));
    fireEvent.change(screen.getByLabelText("Tenant name"), {
      target: { value: "Club Chlorine" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "Los Angeles" },
    });
    fireEvent.change(screen.getByLabelText("Operator email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Launch next month." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit request/ }));

    await waitFor(() => {
      expect(getConvexMutationCalls()).toEqual([
        {
          name: "Club Chlorine",
          city: "Los Angeles",
          operator: "Test User",
          operatorEmail: "test@example.com",
          body: "Launch next month.",
        },
      ]);
    });
    expect(screen.queryByText("Request submitted for Coucou review.")).toBeNull();
    expect(getToastTestCalls()).toContainEqual({
      kind: "loading",
      message: "Submitting tenant request...",
      id: "toast_1",
    });
    expect(getToastTestCalls()).toContainEqual({
      kind: "success",
      message: "Tenant request submitted",
      id: "toast_1",
    });
  });
});
