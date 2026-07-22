import { beforeEach, describe, expect, it } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import AdminLayout from "../app/admin/layout";

interface AdminLayoutTestGlobal {
  __setClerkTestState?: (
    nextState: Partial<{
      isLoaded: boolean;
      isSignedIn: boolean;
      userId: string | null;
      orgId: string | null;
      orgSlug: string | null;
    }>,
  ) => void;
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
  __getClerkSetActiveCalls?: () => Array<{ organization: string }>;
  __setClerkSetActiveDeferred?: (nextShouldDefer: boolean) => void;
  __resolveClerkSetActive?: () => void;
  __getConvexActionCalls?: () => unknown[];
  __getToastTestCalls?: () => Array<{
    kind: string;
    message: string;
    id?: string | number;
    className?: string;
  }>;
}

function getAdminLayoutTestGlobal(): typeof globalThis & AdminLayoutTestGlobal {
  return globalThis as typeof globalThis & AdminLayoutTestGlobal;
}

describe("AdminLayout", () => {
  beforeEach(() => {
    getAdminLayoutTestGlobal().__setConvexQueryResponse?.({
      hasCoucouOrganizationAccess: false,
      coucouOrganizationId: null,
      tenantWorkspaces: [],
    });
  });

  it("activates and verifies Coucou access before mounting admin content", async () => {
    getAdminLayoutTestGlobal().__setClerkTestState?.({
      orgId: "org_tenant",
      orgSlug: "tenant-partner",
    });
    getAdminLayoutTestGlobal().__setClerkTestMemberships?.([
      {
        id: "membership_coucou",
        role: "org:admin",
        organization: {
          id: "org_coucou",
          name: "Coucou",
          slug: "coucou",
        },
      },
    ]);
    getAdminLayoutTestGlobal().__setClerkSetActiveDeferred?.(true);

    const adminLayout = (
      <AdminLayout>
        <div>Admin loaded</div>
      </AdminLayout>
    );
    const { container, rerender } = render(adminLayout);

    expect(screen.queryByText("Admin loaded")).toBeNull();
    await waitFor(() => {
      expect(container.querySelector('[data-preset="maison"]')).toBeTruthy();
    });
    await waitFor(() => {
      expect(getAdminLayoutTestGlobal().__getClerkSetActiveCalls?.()).toEqual([
        { organization: "org_coucou" },
      ]);
    });
    expect(screen.getByText(/Opening Coucou admin/)).toBeTruthy();
    expect(getAdminLayoutTestGlobal().__getConvexActionCalls?.()).toEqual([]);

    await act(async () => {
      getAdminLayoutTestGlobal().__setClerkSetActiveDeferred?.(false);
      getAdminLayoutTestGlobal().__resolveClerkSetActive?.();
      getAdminLayoutTestGlobal().__setClerkTestState?.({
        orgId: "org_coucou",
        orgSlug: "coucou",
      });
      await Promise.resolve();
    });
    rerender(
      <AdminLayout>
        <div>Admin loaded</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(screen.getByText("Admin loaded")).toBeTruthy();
    });
    expect(getAdminLayoutTestGlobal().__getClerkSetActiveCalls?.()).toEqual([
      { organization: "org_coucou" },
    ]);
    expect(getAdminLayoutTestGlobal().__getConvexActionCalls?.()).toEqual([
      {
        clerkOrganizationId: "org_coucou",
        organizationName: "Coucou",
        organizationSlug: "coucou",
      },
    ]);
    const coucouSwitchToast =
      getAdminLayoutTestGlobal()
        .__getToastTestCalls?.()
        .find(
          (toastCall) =>
            toastCall.kind === "loading" &&
            toastCall.message === "Switching workspace to Coucou...",
        ) ?? null;
    expect(coucouSwitchToast?.id).toBe("toast_1");
    expect(coucouSwitchToast?.className).toBe("maison-obscur-toast");
  });
});
