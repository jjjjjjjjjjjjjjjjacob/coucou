import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/dashboardPreferences.ts": () => import("../convex/dashboardPreferences"),
};

async function createWorkspace(testBackend: ReturnType<typeof convexTest>) {
  return await testBackend.run(async (ctx) => {
    return await ctx.db.insert("workspaces", {
      slug: "dojo-pomodoro",
      name: "Dojo Pomodoro",
      clerkOrganizationId: "org_dojo",
      createdAt: 1,
      updatedAt: 1,
    });
  });
}

function createWorkspaceIdentity(subject: string): Partial<UserIdentity> {
  return {
    subject,
    org_id: "org_dojo",
    role: "org:admin",
  } as unknown as Partial<UserIdentity>;
}

describe("dashboard table preferences", () => {
  it("requires authentication before reading preferences", async () => {
    const testBackend = convexTest(schema, convexModules);
    await createWorkspace(testBackend);

    await expect(
      testBackend.query(api.dashboardPreferences.getCurrentUserTablePreference, {
        workspaceSlug: "dojo-pomodoro",
        tableKey: "host.rsvps",
        scopeKey: "event_123",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("stores RSVP table preferences per user, workspace, table, and scope", async () => {
    const testBackend = convexTest(schema, convexModules);
    await createWorkspace(testBackend);
    const adminBackend = testBackend.withIdentity(createWorkspaceIdentity("user_admin"));

    const firstPreferenceId = await adminBackend.mutation(
      api.dashboardPreferences.upsertCurrentUserTablePreference,
      {
        workspaceSlug: "dojo-pomodoro",
        tableKey: "host.rsvps",
        scopeKey: "event_123",
        columnOrder: ["guest", "listKey", "guest", "approvalStatus"],
        hiddenColumnIds: ["noteForHosts", "noteForHosts"],
      },
    );
    const savedPreference = await adminBackend.query(
      api.dashboardPreferences.getCurrentUserTablePreference,
      {
        workspaceSlug: "dojo-pomodoro",
        tableKey: "host.rsvps",
        scopeKey: "event_123",
      },
    );

    expect(savedPreference?.columnOrder).toEqual(["guest", "listKey", "approvalStatus"]);
    expect(savedPreference?.hiddenColumnIds).toEqual(["noteForHosts"]);

    const secondPreferenceId = await adminBackend.mutation(
      api.dashboardPreferences.upsertCurrentUserTablePreference,
      {
        workspaceSlug: "dojo-pomodoro",
        tableKey: "host.rsvps",
        scopeKey: "event_123",
        columnOrder: ["approvalStatus", "guest"],
        hiddenColumnIds: ["smsConsent"],
      },
    );
    expect(secondPreferenceId).toBe(firstPreferenceId);

    const updatedPreference = await adminBackend.query(
      api.dashboardPreferences.getCurrentUserTablePreference,
      {
        workspaceSlug: "dojo-pomodoro",
        tableKey: "host.rsvps",
        scopeKey: "event_123",
      },
    );
    expect(updatedPreference?.columnOrder).toEqual(["approvalStatus", "guest"]);
    expect(updatedPreference?.hiddenColumnIds).toEqual(["smsConsent"]);

    const otherUserBackend = testBackend.withIdentity(createWorkspaceIdentity("user_other"));
    await expect(
      otherUserBackend.query(api.dashboardPreferences.getCurrentUserTablePreference, {
        workspaceSlug: "dojo-pomodoro",
        tableKey: "host.rsvps",
        scopeKey: "event_123",
      }),
    ).resolves.toBeNull();
  });

  it("stores panel state per user and workspace", async () => {
    const testBackend = convexTest(schema, convexModules);
    await createWorkspace(testBackend);
    const adminBackend = testBackend.withIdentity(createWorkspaceIdentity("user_admin"));

    await expect(
      adminBackend.query(api.dashboardPreferences.getCurrentUserPanelPreference, {
        workspaceSlug: "dojo-pomodoro",
        panelKey: "event-details",
      }),
    ).resolves.toBeNull();

    const firstPreferenceId = await adminBackend.mutation(
      api.dashboardPreferences.upsertCurrentUserPanelPreference,
      {
        workspaceSlug: "dojo-pomodoro",
        panelKey: "event-details",
        isOpen: true,
      },
    );

    await expect(
      adminBackend.query(api.dashboardPreferences.getCurrentUserPanelPreference, {
        workspaceSlug: "dojo-pomodoro",
        panelKey: "event-details",
      }),
    ).resolves.toBe(true);

    const secondPreferenceId = await adminBackend.mutation(
      api.dashboardPreferences.upsertCurrentUserPanelPreference,
      {
        workspaceSlug: "dojo-pomodoro",
        panelKey: "event-details",
        isOpen: false,
      },
    );

    expect(secondPreferenceId).toBe(firstPreferenceId);
    await expect(
      adminBackend.query(api.dashboardPreferences.getCurrentUserPanelPreference, {
        workspaceSlug: "dojo-pomodoro",
        panelKey: "event-details",
      }),
    ).resolves.toBe(false);

    const otherUserBackend = testBackend.withIdentity(createWorkspaceIdentity("user_other"));
    await expect(
      otherUserBackend.query(api.dashboardPreferences.getCurrentUserPanelPreference, {
        workspaceSlug: "dojo-pomodoro",
        panelKey: "event-details",
      }),
    ).resolves.toBeNull();
  });
});
