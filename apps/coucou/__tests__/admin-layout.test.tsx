import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "bun:test";
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
  __getToastTestCalls?: () => Array<{
    kind: string;
    message: string;
    id?: string | number;
    className?: string;
  }>;
}

function getAdminLayoutTestGlobal(): typeof globalThis &
  AdminLayoutTestGlobal {
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
      orgSlug: "tenant-house",
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

    const { container } = render(
      <AdminLayout>
        <div>Admin loaded</div>
      </AdminLayout>,
    );

    expect(screen.queryByText("Admin loaded")).toBeNull();
    await waitFor(() => {
      expect(container.querySelector('[data-preset="maison"]')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText("Admin loaded")).toBeTruthy();
    });
    expect(
      getAdminLayoutTestGlobal().__getClerkSetActiveCalls?.(),
    ).toEqual([{ organization: "org_coucou" }]);
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
