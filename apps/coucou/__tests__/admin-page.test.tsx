import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "bun:test";
import CoucouAdminPage from "../app/admin/page";

interface AdminPageTestGlobal {
  __setConvexQueryResponse?: (nextResponse: unknown) => void;
  __getRouterPushCalls?: () => string[];
  __clearRouterPushCalls?: () => void;
}

function getAdminPageTestGlobal(): typeof globalThis & AdminPageTestGlobal {
  return globalThis as typeof globalThis & AdminPageTestGlobal;
}

function createTenanciesQueryResponse() {
  return {
    page: [
      {
        _id: "workspace_dojo",
        slug: "dojo-pomodoro",
        name: "Dojo Pomodoro",
        kind: "client",
        primaryDomain: "dojopomodoro.club",
        clerkOrganizationId: "org_dojo",
        clerkOrganizationSlug: "dojo-pomodoro",
        eventCount: 4,
        guestCount: 120,
        plan: { tier: "pro", billingStatus: "active" },
      },
    ],
    nextCursor: null,
    isDone: true,
    totalCount: 1,
    length: 0,
    slice: () => [],
  };
}

describe("CoucouAdminPage", () => {
  beforeEach(() => {
    getAdminPageTestGlobal().__clearRouterPushCalls?.();
  });

  it("opens tenant dashboards from Tenancies rows", async () => {
    getAdminPageTestGlobal().__setConvexQueryResponse?.(
      createTenanciesQueryResponse(),
    );

    render(<CoucouAdminPage />);

    fireEvent.click(screen.getByText("Dojo Pomodoro"));

    await waitFor(() => {
      expect(getAdminPageTestGlobal().__getRouterPushCalls?.()).toEqual([
        "/workspaces/dojo-pomodoro/dashboard",
      ]);
    });
  });
});
