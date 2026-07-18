import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import { countRsvpsWithAggregate } from "../convex/lib/rsvpAggregate";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/apiClients.ts": () => import("../convex/apiClients"),
  "../convex/apiV1.ts": () => import("../convex/apiV1"),
  "../convex/apiV1Data.ts": () => import("../convex/apiV1Data"),
  "../convex/http.ts": () => import("../convex/http"),
  "../convex/webhookDeliveries.ts": () => import("../convex/webhookDeliveries"),
  "../convex/webhookDispatch.ts": () => import("../convex/webhookDispatch"),
  "../convex/webhookEndpoints.ts": () => import("../convex/webhookEndpoints"),
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
const ENDPOINT_URL = "https://consumer.example.com/webhooks/coucou";

type TestBackend = ReturnType<typeof convexTest>;

let capturedWebhookRequestCount = 0;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  capturedWebhookRequestCount = 0;
  vi.useFakeTimers();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://consumer.example.com/")) {
      capturedWebhookRequestCount += 1;
      return new Response("", { status: 200 });
    }
    return originalFetch(input as never, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

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

async function drainScheduledFunctions(testBackend: TestBackend) {
  await testBackend.finishAllScheduledFunctions(vi.runAllTimers);
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
  options: { workspaceSlug?: string; shortId?: string; maxAttendees?: number } = {},
): Promise<Id<"events">> {
  const eventId = await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("events", {
      workspaceSlug: options.workspaceSlug ?? WORKSPACE_SLUG,
      siteKey: "dojo",
      shortId: options.shortId ?? "evt-write-api",
      name: "Write API Event",
      location: "Main Room",
      eventDate: Date.now() + 86_400_000,
      status: "active",
      lifecycle: "published",
      maxAttendees: options.maxAttendees ?? 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  await testBackend.run(async (databaseContext) => {
    await databaseContext.db.insert("listCredentials", {
      eventId,
      listKey: "ga",
      createdAt: Date.now(),
    });
  });
  return eventId;
}

async function issueApiKey(testBackend: TestBackend): Promise<string> {
  const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));
  const created = await hostBackend.mutation(api.apiClients.create, {
    workspaceSlug: WORKSPACE_SLUG,
    displayName: "Write key",
    scopes: ["rsvps:read", "rsvps:write"],
  });
  await testBackend.run(async (databaseContext) => {
    await databaseContext.db.patch(created.apiClientId, { lastUsedAt: Date.now() });
  });
  return created.plaintextKey;
}

function buildJsonRequest(plaintextKey: string, method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: {
      Authorization: `Bearer ${plaintextKey}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

describe("POST /api/v1/events/{eventRouteId}/rsvps", () => {
  it("creates a guest RSVP for an unknown phone", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    await seedEvent(testBackend);
    const plaintextKey = await issueApiKey(testBackend);

    const response = await testBackend.fetch(
      "/api/v1/events/evt-write-api/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230001",
        name: "Consumer Guest",
        listKey: "ga",
        attendanceStatus: "yes",
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.created).toBe(true);
    expect(body.rsvp.isGuest).toBe(true);
    expect(body.rsvp.approvalStatus).toBe("pending");

    const { phoneHash } = await normalizeAndHashPhoneNumber("+15551230001");
    const storedRsvp = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_guestPhoneHash", (queryBuilder) =>
          queryBuilder.eq("guestPhoneHash", phoneHash),
        )
        .unique();
    });
    expect(storedRsvp?.clerkUserId).toBe(`guest:${phoneHash}`);
    expect(storedRsvp?.apiClientId).toBeDefined();

    const guestContact = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("guestContacts")
        .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
        .unique();
    });
    expect(guestContact?.phoneNumber).toBe("+15551230001");

    const totalCount = await testBackend.run(async (databaseContext) => {
      return await countRsvpsWithAggregate(databaseContext, storedRsvp?.eventId as Id<"events">);
    });
    expect(totalCount).toBe(1);
  });

  it("attaches to an existing user matched by phone", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    await seedEvent(testBackend);
    const plaintextKey = await issueApiKey(testBackend);

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: "user_existing",
        phone: "+15551230002",
        firstName: "Jane",
        lastName: "Doe",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const response = await testBackend.fetch(
      "/api/v1/events/evt-write-api/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230002",
        name: "Jane Doe",
        listKey: "ga",
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.rsvp.isGuest).toBe(false);

    const storedRsvp = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", "user_existing"))
        .unique();
    });
    expect(storedRsvp).not.toBeNull();
    expect(storedRsvp?.guestPhoneHash).toBeUndefined();
  });

  it("is idempotent: re-POST updates instead of duplicating and emits no echo webhook", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const plaintextKey = await issueApiKey(testBackend);

    const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));
    await hostBackend.mutation(api.webhookEndpoints.create, {
      workspaceSlug: WORKSPACE_SLUG,
      url: ENDPOINT_URL,
      subscribedEventTypes: ["rsvp.created", "rsvp.updated", "rsvp.attendance_updated"],
    });

    const firstResponse = await testBackend.fetch(
      "/api/v1/events/evt-write-api/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230003",
        name: "Repeat Guest",
        listKey: "ga",
        attendanceStatus: "yes",
      }),
    );
    expect(firstResponse.status).toBe(201);
    await drainScheduledFunctions(testBackend);
    expect(capturedWebhookRequestCount).toBe(1); // rsvp.created

    // Identical re-POST: no field changes → 200, no new row, no webhook.
    const secondResponse = await testBackend.fetch(
      "/api/v1/events/evt-write-api/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230003",
        name: "Repeat Guest",
        listKey: "ga",
        attendanceStatus: "yes",
      }),
    );
    expect(secondResponse.status).toBe(200);
    const secondBody = await secondResponse.json();
    expect(secondBody.created).toBe(false);
    await drainScheduledFunctions(testBackend);
    expect(capturedWebhookRequestCount).toBe(1); // unchanged

    const rsvpCount = await testBackend.run(async (databaseContext) => {
      const rsvps = await databaseContext.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
        .collect();
      return rsvps.length;
    });
    expect(rsvpCount).toBe(1);

    // A changed attendance status does update and does emit.
    const thirdResponse = await testBackend.fetch(
      "/api/v1/events/evt-write-api/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230003",
        name: "Repeat Guest",
        listKey: "ga",
        attendanceStatus: "maybe",
      }),
    );
    expect(thirdResponse.status).toBe(200);
    await drainScheduledFunctions(testBackend);
    expect(capturedWebhookRequestCount).toBe(2); // rsvp.attendance_updated
  });

  it("rejects unknown lists, bad attendee counts, and never touches approval status", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    await seedEvent(testBackend); // maxAttendees: 2
    const plaintextKey = await issueApiKey(testBackend);

    const unknownListResponse = await testBackend.fetch(
      "/api/v1/events/evt-write-api/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230004",
        name: "Guest",
        listKey: "vip",
      }),
    );
    expect(unknownListResponse.status).toBe(400);

    const tooManyAttendeesResponse = await testBackend.fetch(
      "/api/v1/events/evt-write-api/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230004",
        name: "Guest",
        listKey: "ga",
        attendees: 3,
      }),
    );
    expect(tooManyAttendeesResponse.status).toBe(400);

    // approvalStatus in the body is simply ignored — not a writable field.
    const sneakyResponse = await testBackend.fetch(
      "/api/v1/events/evt-write-api/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230004",
        name: "Guest",
        listKey: "ga",
        approvalStatus: "approved",
        status: "approved",
      }),
    );
    expect(sneakyResponse.status).toBe(201);
    const sneakyBody = await sneakyResponse.json();
    expect(sneakyBody.rsvp.approvalStatus).toBe("pending");
  });

  it("404s for events in another workspace", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    await seedWorkspace(testBackend, OTHER_WORKSPACE_SLUG);
    await seedEvent(testBackend, {
      workspaceSlug: OTHER_WORKSPACE_SLUG,
      shortId: "evt-foreign-write",
    });
    const plaintextKey = await issueApiKey(testBackend);

    const response = await testBackend.fetch(
      "/api/v1/events/evt-foreign-write/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230005",
        name: "Guest",
        listKey: "ga",
      }),
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH and DELETE /api/v1/rsvps/{rsvpId}", () => {
  async function createRsvpViaApi(
    testBackend: TestBackend,
    plaintextKey: string,
  ): Promise<string> {
    const response = await testBackend.fetch(
      "/api/v1/events/evt-write-api/rsvps",
      buildJsonRequest(plaintextKey, "POST", {
        phone: "+15551230006",
        name: "Patch Target",
        listKey: "ga",
        attendanceStatus: "yes",
      }),
    );
    const body = await response.json();
    return body.rsvp.rsvpId;
  }

  it("updates attendance status and soft-cancels", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    await seedEvent(testBackend);
    const plaintextKey = await issueApiKey(testBackend);
    const rsvpId = await createRsvpViaApi(testBackend, plaintextKey);

    const patchResponse = await testBackend.fetch(
      `/api/v1/rsvps/${rsvpId}`,
      buildJsonRequest(plaintextKey, "PATCH", { attendanceStatus: "maybe" }),
    );
    expect(patchResponse.status).toBe(200);
    const patchBody = await patchResponse.json();
    expect(patchBody.rsvp.attendanceStatus).toBe("maybe");
    expect(patchBody.rsvp.approvalStatus).toBe("pending");

    const deleteResponse = await testBackend.fetch(
      `/api/v1/rsvps/${rsvpId}`,
      buildJsonRequest(plaintextKey, "DELETE"),
    );
    expect(deleteResponse.status).toBe(200);
    const deleteBody = await deleteResponse.json();
    expect(deleteBody.cancelled).toBe(true);
    expect(deleteBody.rsvp.attendanceStatus).toBe("no");

    // Soft cancel: the row still exists with approval status untouched.
    const storedRsvp = await testBackend.run(async (databaseContext) => {
      const normalizedRsvpId = databaseContext.db.normalizeId("rsvps", rsvpId);
      return normalizedRsvpId ? await databaseContext.db.get(normalizedRsvpId) : null;
    });
    expect(storedRsvp).not.toBeNull();
    expect(storedRsvp?.approvalStatus).toBe("pending");
  });

  it("404s for RSVPs in another workspace and unknown ids", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    await seedWorkspace(testBackend, OTHER_WORKSPACE_SLUG);
    await seedEvent(testBackend);
    const foreignEventId = await seedEvent(testBackend, {
      workspaceSlug: OTHER_WORKSPACE_SLUG,
      shortId: "evt-foreign-patch",
    });
    const plaintextKey = await issueApiKey(testBackend);

    const foreignRsvpId = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.insert("rsvps", {
        eventId: foreignEventId,
        clerkUserId: "user_foreign",
        listKey: "ga",
        status: "pending",
        approvalStatus: "pending",
        shareContact: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const crossWorkspaceResponse = await testBackend.fetch(
      `/api/v1/rsvps/${foreignRsvpId}`,
      buildJsonRequest(plaintextKey, "PATCH", { attendanceStatus: "no" }),
    );
    expect(crossWorkspaceResponse.status).toBe(404);

    const unknownIdResponse = await testBackend.fetch(
      "/api/v1/rsvps/not-a-real-id",
      buildJsonRequest(plaintextKey, "PATCH", { attendanceStatus: "no" }),
    );
    expect(unknownIdResponse.status).toBe(404);
  });
});
