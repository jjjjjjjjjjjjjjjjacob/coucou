import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/twilioCredentials.ts": () => import("../convex/twilioCredentials"),
};

const WORKSPACE_SLUG = "dojo-pomodoro";
const CLERK_ORGANIZATION_ID = "org_dojo";
const WORKSPACE_ACCOUNT_SID = `AC${"1".repeat(32)}`;
const WORKSPACE_AUTH_TOKEN = "2".repeat(32);
const EVENT_ACCOUNT_SID = `AC${"3".repeat(32)}`;
const EVENT_AUTH_TOKEN = "4".repeat(32);

function createHostIdentity(subject: string): Partial<UserIdentity> {
  return {
    subject,
    org_id: CLERK_ORGANIZATION_ID,
    role: "org:admin",
  } as unknown as Partial<UserIdentity>;
}

describe("Twilio credential resolution", () => {
  it("resolves event override, organizer default, then no stored credentials", async () => {
    const testBackend = convexTest(schema, convexModules);
    const { firstEventId, secondEventId } = await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("workspaces", {
        slug: WORKSPACE_SLUG,
        name: "Dojo Pomodoro",
        clerkOrganizationId: CLERK_ORGANIZATION_ID,
        clerkOrganizationSlug: WORKSPACE_SLUG,
        createdAt: now,
        updatedAt: now,
      });
      const firstEventId = await databaseContext.db.insert("events", {
        workspaceSlug: WORKSPACE_SLUG,
        name: "First event",
        location: "Main room",
        eventDate: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      const secondEventId = await databaseContext.db.insert("events", {
        workspaceSlug: WORKSPACE_SLUG,
        name: "Second event",
        location: "Side room",
        eventDate: now + 172_800_000,
        createdAt: now,
        updatedAt: now,
      });
      return { firstEventId, secondEventId };
    });
    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));

    await hostBackend.mutation(api.twilioCredentials.upsert, {
      workspaceSlug: WORKSPACE_SLUG,
      accountSid: WORKSPACE_ACCOUNT_SID,
      authToken: WORKSPACE_AUTH_TOKEN,
      fromPhoneNumber: "+15551230001",
    });
    await hostBackend.mutation(api.twilioCredentials.upsert, {
      workspaceSlug: WORKSPACE_SLUG,
      eventId: firstEventId,
      accountSid: EVENT_ACCOUNT_SID,
      authToken: EVENT_AUTH_TOKEN,
      fromPhoneNumber: "+15551230002",
    });

    await expect(
      testBackend.query(internal.twilioCredentials.resolveForEvent, {
        eventId: firstEventId,
      }),
    ).resolves.toEqual({
      accountSid: EVENT_ACCOUNT_SID,
      authToken: EVENT_AUTH_TOKEN,
      fromPhoneNumber: "+15551230002",
      source: "event",
    });
    await expect(
      testBackend.query(internal.twilioCredentials.resolveForEvent, {
        eventId: secondEventId,
      }),
    ).resolves.toEqual({
      accountSid: WORKSPACE_ACCOUNT_SID,
      authToken: WORKSPACE_AUTH_TOKEN,
      fromPhoneNumber: "+15551230001",
      source: "workspace",
    });

    const dashboardSummary = await hostBackend.query(api.twilioCredentials.listForWorkspace, {
      workspaceSlug: WORKSPACE_SLUG,
    });
    expect(dashboardSummary.workspace?.fromPhoneNumber).toBe("+15551230001");
    expect(dashboardSummary.events).toHaveLength(1);
    expect(JSON.stringify(dashboardSummary)).not.toContain(WORKSPACE_AUTH_TOKEN);
    expect(JSON.stringify(dashboardSummary)).not.toContain(EVENT_AUTH_TOKEN);

    await hostBackend.mutation(api.twilioCredentials.remove, {
      workspaceSlug: WORKSPACE_SLUG,
      eventId: firstEventId,
    });
    await expect(
      testBackend.query(internal.twilioCredentials.resolveForEvent, {
        eventId: firstEventId,
      }),
    ).resolves.toMatchObject({ source: "workspace", accountSid: WORKSPACE_ACCOUNT_SID });

    await hostBackend.mutation(api.twilioCredentials.remove, {
      workspaceSlug: WORKSPACE_SLUG,
    });
    await expect(
      testBackend.query(internal.twilioCredentials.resolveForEvent, {
        eventId: firstEventId,
      }),
    ).resolves.toBeNull();
  });

  it("keeps auth tokens server-only and rejects unauthenticated writes", async () => {
    const testBackend = convexTest(schema, convexModules);
    await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("workspaces", {
        slug: WORKSPACE_SLUG,
        name: "Dojo Pomodoro",
        clerkOrganizationId: CLERK_ORGANIZATION_ID,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      testBackend.mutation(api.twilioCredentials.upsert, {
        workspaceSlug: WORKSPACE_SLUG,
        accountSid: WORKSPACE_ACCOUNT_SID,
        authToken: WORKSPACE_AUTH_TOKEN,
        fromPhoneNumber: "+15551230001",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("returns the matching stored auth token for webhook verification", async () => {
    const testBackend = convexTest(schema, convexModules);
    await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      const workspaceId = await databaseContext.db.insert("workspaces", {
        slug: WORKSPACE_SLUG,
        name: "Dojo Pomodoro",
        clerkOrganizationId: CLERK_ORGANIZATION_ID,
        createdAt: now,
        updatedAt: now,
      });
      await databaseContext.db.insert("twilioCredentials", {
        workspaceId,
        accountSid: WORKSPACE_ACCOUNT_SID,
        authToken: WORKSPACE_AUTH_TOKEN,
        fromPhoneNumber: "+15551230001",
        updatedByClerkUserId: "host_1",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      testBackend.query(internal.twilioCredentials.listWebhookAuthTokensForPhoneNumber, {
        phoneNumber: "+1 (555) 123-0001",
      }),
    ).resolves.toEqual([WORKSPACE_AUTH_TOKEN]);
    await expect(
      testBackend.query(internal.twilioCredentials.listWebhookAuthTokensForPhoneNumber, {
        phoneNumber: "+15551239999",
      }),
    ).resolves.toEqual([]);
  });
});
