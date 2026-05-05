import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "bun:test";
import { WorkspaceAccessGate } from "../components/workspace-access-gate";

interface WorkspaceAccessGateTestGlobal {
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
  __getToastTestCalls?: () => Array<{
    kind: string;
    message: string;
    id?: string | number;
  }>;
  __getClerkSetActiveCalls?: () => Array<{ organization: string }>;
}

function getWorkspaceAccessGateTestGlobal(): typeof globalThis &
  WorkspaceAccessGateTestGlobal {
  return globalThis as typeof globalThis & WorkspaceAccessGateTestGlobal;
}

describe("WorkspaceAccessGate", () => {
  beforeEach(() => {
    getWorkspaceAccessGateTestGlobal().__setClerkTestMemberships?.([
      {
        id: "membership_dojo",
        role: "org:admin",
        organization: {
          id: "org_123",
          name: "Dojo Pomodoro",
          slug: "dojo-pomodoro",
        },
      },
    ]);
  });

  it("opens after successful bootstrap without workspace switch toasts", async () => {
    getWorkspaceAccessGateTestGlobal().__setConvexQueryResponse?.({
      _id: "workspace_123",
      slug: "dojo-pomodoro",
      name: "Dojo Pomodoro",
      kind: "client",
      sites: [],
    });

    render(
      <WorkspaceAccessGate workspaceSlug="dojo-pomodoro" accessKind="host">
        <div>Workspace loaded</div>
      </WorkspaceAccessGate>,
    );

    expect(screen.getByText("Preparing Dojo Pomodoro...")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Workspace loaded")).toBeTruthy();
    });
    expect(
      getWorkspaceAccessGateTestGlobal().__getToastTestCalls?.(),
    ).toEqual([]);
  });

  it("uses a toast while the target organization is switching", async () => {
    getWorkspaceAccessGateTestGlobal().__setClerkTestState?.({
      orgId: "org_other",
      orgSlug: "other",
    });
    getWorkspaceAccessGateTestGlobal().__setClerkTestMemberships?.([
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
    getWorkspaceAccessGateTestGlobal().__setConvexQueryResponse?.({
      _id: "workspace_123",
      slug: "dojo-pomodoro",
      name: "Dojo Pomodoro",
      kind: "client",
      clerkOrganizationId: "org_dojo",
      clerkOrganizationSlug: "dojo-pomodoro",
      sites: [],
    });

    render(
      <WorkspaceAccessGate workspaceSlug="dojo-pomodoro" accessKind="host">
        <div>Workspace loaded</div>
      </WorkspaceAccessGate>,
    );

    await waitFor(() => {
      expect(screen.getByText("Workspace loaded")).toBeTruthy();
    });
    expect(screen.queryByText("Opening Dojo Pomodoro...")).toBeNull();
    expect(
      getWorkspaceAccessGateTestGlobal().__getClerkSetActiveCalls?.(),
    ).toEqual([{ organization: "org_dojo" }]);
    await waitFor(() => {
      expect(
        getWorkspaceAccessGateTestGlobal().__getToastTestCalls?.(),
      ).toContainEqual({
        kind: "loading",
        message: "Switching workspace to Dojo Pomodoro...",
        id: "toast_1",
      });
    });
  });

  it("allows Coucou platform members to open tenant dashboards without tenant membership", async () => {
    getWorkspaceAccessGateTestGlobal().__setClerkTestState?.({
      orgId: "org_coucou",
      orgSlug: "coucou",
    });
    getWorkspaceAccessGateTestGlobal().__setClerkTestMemberships?.([
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
    getWorkspaceAccessGateTestGlobal().__setConvexQueryResponse?.({
      _id: "workspace_123",
      slug: "dojo-pomodoro",
      name: "Dojo Pomodoro",
      kind: "client",
      clerkOrganizationId: "org_dojo",
      clerkOrganizationSlug: "dojo-pomodoro",
      sites: [],
    });

    render(
      <WorkspaceAccessGate workspaceSlug="dojo-pomodoro" accessKind="host">
        {(workspaceAccessState) => (
          <div>
            <span>Workspace loaded</span>
            <span>{workspaceAccessState.canWrite ? "write" : "read"}</span>
          </div>
        )}
      </WorkspaceAccessGate>,
    );

    await waitFor(() => {
      expect(screen.getByText("Workspace loaded")).toBeTruthy();
    });
    expect(screen.getByText("write")).toBeTruthy();
    expect(
      getWorkspaceAccessGateTestGlobal().__getClerkSetActiveCalls?.(),
    ).toEqual([]);
  });
});
