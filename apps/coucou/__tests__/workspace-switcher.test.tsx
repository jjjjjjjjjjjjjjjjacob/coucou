import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SidebarProvider } from "../components/ui/sidebar";

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceScope: () => ({
    brandName: "Dojo Pomodoro",
    clerkOrganizationId: "org_dojo",
    clerkOrganizationSlug: "dojo-pomodoro",
    primaryDomain: "dojopomodoro.club",
    queryArgs: {
      siteKey: "dojo-pomodoro",
      workspaceSlug: "dojo-pomodoro",
    },
    siteKey: "dojo-pomodoro",
    workspaceSlug: "dojo-pomodoro",
  }),
}));

const { SidebarTenantSwitcher } = await import("../components/sidebar-tenant-switcher");

interface WorkspaceSwitcherTestGlobal {
  __getRouterPushCalls?: () => string[];
  __setClerkTestMemberships?: (
    nextMemberships: Array<{
      id: string;
      organization: {
        id: string;
        name: string;
        slug: string;
      };
      role: string;
    }>,
  ) => void;
  __setConvexQueryResponse?: (nextResponse: unknown) => void;
}

function getWorkspaceSwitcherTestGlobal(): typeof globalThis & WorkspaceSwitcherTestGlobal {
  return globalThis as typeof globalThis & WorkspaceSwitcherTestGlobal;
}

describe("SidebarTenantSwitcher", () => {
  it("shows unvisited platform workspaces and routes them to the full dashboard", async () => {
    getWorkspaceSwitcherTestGlobal().__setClerkTestMemberships?.([
      {
        id: "membership_coucou",
        organization: {
          id: "org_coucou",
          name: "Coucou",
          slug: "coucou",
        },
        role: "org:admin",
      },
    ]);
    getWorkspaceSwitcherTestGlobal().__setConvexQueryResponse?.({
      coucouOrganizationId: "org_coucou",
      hasCoucouOrganizationAccess: true,
      tenantWorkspaces: [
        {
          membershipRole: "org:admin",
          name: "Club Chlorine",
          slug: "club-chlorine",
        },
        {
          membershipRole: "org:admin",
          name: "Dojo Pomodoro",
          slug: "dojo-pomodoro",
        },
      ],
    });

    render(
      <SidebarProvider>
        <SidebarTenantSwitcher />
      </SidebarProvider>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: /Dojo Pomodoro Dashboard/ }), {
      button: 0,
      ctrlKey: false,
    });

    const currentWorkspaceMenuItem = await screen.findByRole("menuitem", {
      name: /Dojo Pomodoro/,
    });
    expect(screen.getByRole("menuitem", { name: /Club Chlorine/ })).toBeTruthy();
    expect(currentWorkspaceMenuItem.querySelector(".lucide-check")).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: /Club Chlorine/ }));

    await waitFor(() => {
      expect(getWorkspaceSwitcherTestGlobal().__getRouterPushCalls?.()).toEqual([
        "/workspaces/club-chlorine/dashboard",
      ]);
    });
  });
});
