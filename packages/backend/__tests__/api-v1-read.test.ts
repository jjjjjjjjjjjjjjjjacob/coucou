import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/apiClients.ts": () => import("../convex/apiClients"),
  "../convex/apiV1.ts": () => import("../convex/apiV1"),
  "../convex/apiV1Data.ts": () => import("../convex/apiV1Data"),
  "../convex/http.ts": () => import("../convex/http"),
  "../convex/webhooks.ts": () => import("../convex/webhooks"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

const aggregateComponentModules = {
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js"),
};

const WORKSPACE_SLUG = "dojo-pomodoro";
const OTHER_WORKSPACE_SLUG = "other-workspace";
const CLERK_ORGANIZATION_ID = "org_dojo";

type TestBackend = ReturnType<typeof convexTest>;

function setupTestBackend(): TestBackend {
  const testBackend = convexTest(schema, convexModules);
  testBackend.registerComponent(
    "rsvpAggregate",
    aggregateComponentSchema,
    aggregateComponentModules,
  );
  return testBackend;
}

function createHostIdentity(subject: string): Partial<UserIdentity> {
  return {
    subject,
    org_id: CLERK_ORGANIZATION_ID,
    role: "org:admin",
  } as unknown as Partial<UserIdentity>;
}

async function seedWorkspace(testBackend: TestBackend, slug = WORKSPACE_SLUG) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("workspaces", {
      slug,
      name: slug,
      clerkOrganizationId: slug === WORKSPACE_SLUG ? CLERK_ORGANIZATION_ID : `org_${slug}`,
      clerkOrganizationSlug: slug,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedEvent(
  testBackend: TestBackend,
  options: { workspaceSlug?: string; shortId?: string; lifecycle?: "draft" | "published" } = {},
): Promise<Id<"events">> {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("events", {
      workspaceSlug: options.workspaceSlug ?? WORKSPACE_SLUG,
      siteKey: "dojo",
      shortId: options.shortId ?? "evt-read-api",
      name: "Partner API Event",
      location: "Main Room",
      eventDate: Date.now() + 86_400_000,
      status: "active",
      lifecycle: options.lifecycle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function issueApiKey(
  testBackend: TestBackend,
  scopes: ("events:read" | "rsvps:read" | "rsvps:write")[],
): Promise<string> {
  const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));
  const created = await hostBackend.mutation(api.apiClients.create, {
    workspaceSlug: WORKSPACE_SLUG,
    displayName: "Test key",
    scopes,
  });
  // Keep lastUsedAt fresh so authenticateApiRequest never schedules its
  // fire-and-forget refresh — scheduled functions would leak across tests.
  await testBackend.run(async (databaseContext) => {
    await databaseContext.db.patch(created.apiClientId, { lastUsedAt: Date.now() });
  });
  return created.plaintextKey;
}

function buildAuthorizedRequest(plaintextKey: string): RequestInit {
  return { headers: { Authorization: `Bearer ${plaintextKey}` } };
}


describe("GET /api/v1/events", () => {
  it("returns 401 without an API key", async () => {
    const testBackend = setupTestBackend();
    const response = await testBackend.fetch("/api/v1/events", { method: "GET" });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("unauthorized");
  });

  it("returns 401 for an unknown key and 403 for a key missing the scope", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);

    const unknownKeyResponse = await testBackend.fetch("/api/v1/events", {
      method: "GET",
      headers: { Authorization: "Bearer coucou_sk_notarealkeyatall" },
    });
    expect(unknownKeyResponse.status).toBe(401);

    const wrongScopeKey = await issueApiKey(testBackend, ["rsvps:read"]);
    const wrongScopeResponse = await testBackend.fetch(
      "/api/v1/events",
      { method: "GET", ...buildAuthorizedRequest(wrongScopeKey) },
    );
    expect(wrongScopeResponse.status).toBe(403);
  });

  it("lists only this workspace's published events by default", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    await seedWorkspace(testBackend, OTHER_WORKSPACE_SLUG);

    await seedEvent(testBackend, { shortId: "evt-published", lifecycle: "published" });
    await seedEvent(testBackend, { shortId: "evt-draft", lifecycle: "draft" });
    await seedEvent(testBackend, {
      workspaceSlug: OTHER_WORKSPACE_SLUG,
      shortId: "evt-other-workspace",
      lifecycle: "published",
    });

    const plaintextKey = await issueApiKey(testBackend, ["events:read"]);
    const response = await testBackend.fetch(
      "/api/v1/events",
      { method: "GET", ...buildAuthorizedRequest(plaintextKey) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const shortIds = body.data.map((event: { shortId: string }) => event.shortId);
    expect(shortIds).toContain("evt-published");
    expect(shortIds).not.toContain("evt-draft");
    expect(shortIds).not.toContain("evt-other-workspace");
  });

  it("includes drafts when status=all", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    await seedEvent(testBackend, { shortId: "evt-draft", lifecycle: "draft" });

    const plaintextKey = await issueApiKey(testBackend, ["events:read"]);
    const response = await testBackend.fetch(
      "/api/v1/events?status=all",
      { method: "GET", ...buildAuthorizedRequest(plaintextKey) },
    );
    const body = await response.json();
    expect(body.data.map((event: { shortId: string }) => event.shortId)).toContain("evt-draft");
  });
});

describe("GET /api/v1/events/{eventRouteId}", () => {
  it("resolves by shortId and includes lists and attendance counts", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, { shortId: "evt-detail" });

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "vip",
        passwordNormalized: "secret",
        password: "secret",
        createdAt: Date.now(),
      });
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "ga",
        createdAt: Date.now(),
      });
      await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "user_attendee",
        listKey: "vip",
        status: "approved",
        approvalStatus: "approved",
        shareContact: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "user_pending",
        listKey: "ga",
        status: "pending",
        approvalStatus: "pending",
        shareContact: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const plaintextKey = await issueApiKey(testBackend, ["events:read"]);
    const response = await testBackend.fetch(
      "/api/v1/events/evt-detail",
      { method: "GET", ...buildAuthorizedRequest(plaintextKey) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("Partner API Event");
    expect(body.lists).toEqual(
      expect.arrayContaining([
        { listKey: "vip", isPasswordProtected: true },
        { listKey: "ga", isPasswordProtected: false },
      ]),
    );
    expect(body.attendanceCounts.approved).toBe(1);
    expect(body.attendanceCounts.pending).toBe(1);
    expect(body.attendanceCounts.total).toBe(2);
  });

  it("404s for events in another workspace", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    await seedWorkspace(testBackend, OTHER_WORKSPACE_SLUG);
    await seedEvent(testBackend, {
      workspaceSlug: OTHER_WORKSPACE_SLUG,
      shortId: "evt-foreign",
    });

    const plaintextKey = await issueApiKey(testBackend, ["events:read"]);
    const response = await testBackend.fetch(
      "/api/v1/events/evt-foreign",
      { method: "GET", ...buildAuthorizedRequest(plaintextKey) },
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /api/v1/events/{eventRouteId}/rsvps/lookup", () => {
  it("finds an RSVP for a user matched by phone", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, { shortId: "evt-lookup" });

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: "user_phone",
        phone: "+15551234567",
        firstName: "Jane",
        lastName: "Doe",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "user_phone",
        listKey: "ga",
        userName: "Jane Doe",
        status: "approved",
        approvalStatus: "approved",
        attendanceStatus: "yes",
        shareContact: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const plaintextKey = await issueApiKey(testBackend, ["rsvps:read"]);
    const response = await testBackend.fetch(
      "/api/v1/events/evt-lookup/rsvps/lookup?phone=%2B15551234567",
      { method: "GET", ...buildAuthorizedRequest(plaintextKey) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.approvalStatus).toBe("approved");
    expect(body.attendanceStatus).toBe("yes");
    expect(body.name).toBe("Jane Doe");
    expect(body.isGuest).toBe(false);
  });

  it("finds a guest RSVP by phone hash and 404s when nothing matches", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, { shortId: "evt-guest-lookup" });

    const { normalizeAndHashPhoneNumber } = await import("../convex/lib/phoneHash");
    const { phoneHash } = await normalizeAndHashPhoneNumber("+15559876543");

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: `guest:${phoneHash}`,
        listKey: "ga",
        userName: "Guest Person",
        guestPhoneHash: phoneHash,
        status: "pending",
        approvalStatus: "pending",
        shareContact: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const plaintextKey = await issueApiKey(testBackend, ["rsvps:read"]);
    const guestResponse = await testBackend.fetch(
      "/api/v1/events/evt-guest-lookup/rsvps/lookup?phone=%2B15559876543",
      { method: "GET", ...buildAuthorizedRequest(plaintextKey) },
    );
    expect(guestResponse.status).toBe(200);
    const guestBody = await guestResponse.json();
    expect(guestBody.isGuest).toBe(true);

    const missingResponse = await testBackend.fetch(
      "/api/v1/events/evt-guest-lookup/rsvps/lookup?phone=%2B15550000000",
      { method: "GET", ...buildAuthorizedRequest(plaintextKey) },
    );
    expect(missingResponse.status).toBe(404);
  });
});
