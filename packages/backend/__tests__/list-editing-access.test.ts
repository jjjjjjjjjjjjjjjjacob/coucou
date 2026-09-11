import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import aggregateSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api, internal } from "../convex/_generated/api";
import { hashOpaqueValue } from "../convex/lib/phoneHash";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const aggregateModules = import.meta.glob(
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/**/*.js",
);
const scope = { siteKey: "dojo", workspaceSlug: "dojo-pomodoro" };
const phone = "+13104996272";
const backends: ReturnType<typeof convexTest<typeof schema>>[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("DEV_TWILIO_ENABLED", "false");
});
afterEach(async () => {
  for (const backend of backends.splice(0))
    await backend.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const backend = convexTest(schema, modules);
  backends.push(backend);
  backend.registerComponent("rsvpAggregate", aggregateSchema, aggregateModules);
  const host = backend.withIdentity({
    subject: "host",
    org_id: "org_dojo",
    role: "org:admin",
  } as Partial<UserIdentity>);
  const records = await backend.run(async (context) => {
    const now = Date.now();
    await context.db.insert("workspaces", {
      slug: scope.workspaceSlug,
      name: "Dojo",
      clerkOrganizationId: "org_dojo",
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await context.db.insert("events", {
      ...scope,
      name: "Night",
      hosts: ["Dojo"],
      location: "Room",
      status: "active",
      lifecycle: "published",
      eventDate: now + 3 * 86400000,
      createdAt: now,
      updatedAt: now,
      rsvpConfirmationMessageEnabled: false,
    });
    const firstId = await context.db.insert("listCredentials", {
      eventId,
      listKey: "vip",
      password: "original",
      passwordNormalized: "original",
      generateQR: true,
      createdAt: now,
    });
    const secondId = await context.db.insert("listCredentials", {
      eventId,
      listKey: "guest",
      password: "second",
      passwordNormalized: "second",
      createdAt: now,
    });
    return { eventId, firstId, secondId };
  });
  const verify = async (password = "original") => {
    const result = await backend.mutation(api.credentials.authorizeListAccess, {
      ...scope,
      eventId: records.eventId,
      password,
    });
    if (!result.ok) throw new Error("Expected valid list access");
    return result;
  };
  const submission = (accessToken: string) => ({
    siteKey: scope.siteKey,
    eventId: records.eventId,
    listKey: "vip",
    accessToken,
    firstName: "Ava",
    lastName: "Green",
    phone,
    shareContact: false,
    smsConsent: false,
    socialProfiles: [],
    customFields: {},
  });
  const snapshot = () =>
    backend.run(async (context) => ({
      event: await context.db.get(records.eventId),
      lists: await context.db.query("listCredentials").collect(),
      assignments: await context.db.query("listCodeAssignments").collect(),
      rsvps: await context.db.query("rsvps").collect(),
      redemptions: await context.db.query("redemptions").collect(),
    }));
  return { backend, host, verify, submission, snapshot, ...records };
}

describe("stable list editing and verified access", () => {
  it("renames only the label and preserves RSVPs, tickets and history", async () => {
    const { backend, host, eventId, firstId, secondId, snapshot } = await setup();
    await backend.run(async (context) => {
      const now = Date.now();
      await context.db.insert("rsvps", {
        eventId,
        clerkUserId: "guest",
        listKey: "vip",
        shareContact: false,
        status: "approved",
        approvalStatus: "approved",
        createdAt: now,
        updatedAt: now,
      });
      await context.db.insert("redemptions", {
        eventId,
        clerkUserId: "guest",
        listKey: "vip",
        code: "TICKET01",
        unredeemHistory: [],
        createdAt: now,
      });
    });
    const before = await snapshot();
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      expectedListsRevision: 0,
      lists: [
        { id: firstId, listKey: "vip", displayName: "Friends of Dojo" },
        { id: secondId, listKey: "guest" },
      ],
    });
    const after = await snapshot();
    expect(after.lists[0]).toEqual({ ...before.lists[0], displayName: "Friends of Dojo" });
    expect(after.lists[1]).toEqual(before.lists[1]);
    expect(after.rsvps).toEqual(before.rsvps);
    expect(after.redemptions).toEqual(before.redemptions);
    expect(after.assignments).toEqual(before.assignments);
    expect(await backend.query(api.redemptions.byCode, { code: "TICKET01" })).toMatchObject({
      status: "valid",
      listKey: "vip",
      listDisplayName: "Friends of Dojo",
    });
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      lists: [
        { id: firstId, listKey: "vip", archived: true },
        { id: secondId, listKey: "guest" },
      ],
    });
    expect(await backend.query(api.redemptions.byCode, { code: "TICKET01" })).toMatchObject({
      status: "valid",
    });
    await host.mutation(api.redemptions.redeem, { ...scope, code: "TICKET01" });
    expect(await backend.query(api.redemptions.byCode, { code: "TICKET01" })).toMatchObject({
      status: "redeemed",
    });
  });

  it("clears explicit approval overrides without changing access or other lists", async () => {
    const { backend, host, eventId, firstId, secondId, snapshot } = await setup();
    await backend.run((context) =>
      context.db.patch(firstId, {
        approvalMessage: "Old override",
        sendQrOnApproval: false,
        defersQrDelivery: true,
        includeTicketLinkOnApproval: false,
      }),
    );
    const before = await snapshot();
    const result = await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      expectedListsRevision: 0,
      lists: [
        {
          id: firstId,
          listKey: "vip",
          approvalMessage: "",
          sendQrOnApproval: null,
          includeTicketLinkOnApproval: null,
        },
        { id: secondId, listKey: "guest" },
      ],
    });
    const after = await snapshot();
    const {
      approvalMessage: _approvalMessage,
      sendQrOnApproval: _sendQrOnApproval,
      defersQrDelivery: _defersQrDelivery,
      includeTicketLinkOnApproval: _includeTicketLinkOnApproval,
      ...unchangedFields
    } = before.lists[0];
    expect(after.lists[0]).toEqual(unchangedFields);
    expect(after.lists[1]).toEqual(before.lists[1]);
    expect(after.assignments).toEqual(before.assignments);
    expect(result).toMatchObject({
      listsRevision: 1,
      lists: [
        { id: firstId, listKey: "vip" },
        { id: secondId, listKey: "guest" },
      ],
    });
  });

  it("rolls back event fields, lists, archives, assignments and revision on a late conflict", async () => {
    const { host, eventId, firstId, secondId, snapshot } = await setup();
    const before = await snapshot();
    await expect(
      host.action(api.eventsNode.update, {
        ...scope,
        eventId,
        expectedListsRevision: 0,
        patch: { name: "Must roll back" },
        lists: [
          { id: firstId, listKey: "vip", displayName: "Also rollback", password: "new-code" },
          { id: secondId, listKey: "guest", password: "new-code" },
        ],
      }),
    ).rejects.toThrow("SMS_CODE_CONFLICT");
    expect(await snapshot()).toEqual(before);
  });

  it("rejects the stale editor without overwriting the first host's save", async () => {
    const { host, eventId, firstId, secondId, snapshot } = await setup();
    const lists = [
      { id: firstId, listKey: "vip", displayName: "First host" },
      { id: secondId, listKey: "guest" },
    ];
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      expectedListsRevision: 0,
      lists,
    });
    const before = await snapshot();
    await expect(
      host.action(api.eventsNode.update, {
        ...scope,
        eventId,
        expectedListsRevision: 0,
        patch: { name: "Stale" },
        lists: [{ ...lists[0], displayName: "Stale" }, lists[1]],
      }),
    ).rejects.toThrow("STALE_LISTS");
    expect(await snapshot()).toEqual(before);
  });

  it("validates swaps against the final state and keeps keys unique across archived lists", async () => {
    const { host, eventId, firstId, secondId, snapshot } = await setup();
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      lists: [
        { id: firstId, listKey: "vip", password: "second" },
        { id: secondId, listKey: "guest", password: "original" },
      ],
    });
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      lists: [
        { id: firstId, listKey: "vip", archived: true },
        { id: secondId, listKey: "guest" },
        { listKey: "vip", password: "third" },
      ],
    });
    expect((await snapshot()).lists.map((list) => list.listKey)).toEqual(["vip", "guest", "vip-2"]);
  });

  it("stores only a hash and keeps an existing browser journey through rotation and archival", async () => {
    const { backend, host, eventId, firstId, secondId, verify, submission } = await setup();
    const verified = await verify();
    const grants = await backend.run((context) =>
      context.db.query("rsvpListAccessGrants").collect(),
    );
    expect(grants[0].tokenHash).toBe(await hashOpaqueValue(verified.accessToken));
    expect(JSON.stringify(grants)).not.toContain(verified.accessToken);
    expect(verified.expiresAt - grants[0].createdAt).toBe(24 * 60 * 60 * 1000);
    vi.advanceTimersByTime(60 * 60 * 1000);
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      lists: [
        { id: firstId, listKey: "vip", password: "rotated", archived: true, autoApproveLimit: 1 },
        { id: secondId, listKey: "guest" },
      ],
    });
    expect(
      await backend.mutation(api.credentials.authorizeListAccess, {
        ...scope,
        eventId,
        password: "original",
      }),
    ).toEqual({ ok: false });
    expect(
      await backend.mutation(api.credentials.authorizeListAccess, {
        ...scope,
        eventId,
        password: "rotated",
      }),
    ).toEqual({ ok: false });
    expect(
      await backend.mutation(api.credentials.authorizeListAccess, {
        ...scope,
        eventId,
        password: "original",
        accessToken: verified.accessToken,
      }),
    ).toMatchObject({ ok: true, listKey: "vip", expiresAt: verified.expiresAt });
    const prepared = await backend.mutation(
      api.rsvps.prepareGuestRequest,
      submission(verified.accessToken),
    );
    expect(prepared.expiresAt).toBe(verified.expiresAt);
    const signedIn = backend.withIdentity({ subject: "ava" });
    await signedIn.mutation(internal.rsvps.completeGuestRequest, {
      token: prepared.rsvpHandoffToken,
      verifiedPhoneNumbers: [phone],
    });
    const rsvps = await backend.run((context) => context.db.query("rsvps").collect());
    expect(rsvps).toHaveLength(1);
    expect(rsvps[0]).toMatchObject({
      listKey: "vip",
      approvalStatus: "approved",
      clerkUserId: "ava",
    });
    await expect(
      backend
        .withIdentity({ subject: "another" })
        .mutation(api.rsvps.submitRequest, submission(verified.accessToken)),
    ).rejects.toThrow("LIST_ACCESS_REQUIRED");
  });

  it("rejects missing, wrong-list, expired, and reused phone grants without consuming the original draft", async () => {
    const { backend, eventId, verify, submission } = await setup();
    const verified = await verify();
    await expect(
      backend.mutation(api.rsvps.prepareGuestRequest, {
        ...submission(verified.accessToken),
        accessToken: undefined,
      }),
    ).rejects.toThrow("LIST_ACCESS_REQUIRED");
    await expect(
      backend.mutation(api.rsvps.prepareGuestRequest, {
        ...submission(verified.accessToken),
        listKey: "guest",
      }),
    ).rejects.toThrow("LIST_ACCESS_REQUIRED");
    const prepared = await backend.mutation(
      api.rsvps.prepareGuestRequest,
      submission(verified.accessToken),
    );
    await expect(
      backend.mutation(api.rsvps.prepareGuestRequest, {
        ...submission(verified.accessToken),
        phone: "+12025550123",
      }),
    ).rejects.toThrow("LIST_ACCESS_REQUIRED");
    const handoffs = await backend.run((context) =>
      context.db.query("rsvpGuestHandoffs").collect(),
    );
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].submission).not.toHaveProperty("accessToken");
    expect(prepared.expiresAt).toBe(verified.expiresAt);
    vi.setSystemTime(verified.expiresAt);
    await expect(
      backend.mutation(api.rsvps.prepareGuestRequest, submission(verified.accessToken)),
    ).rejects.toThrow("LIST_ACCESS_REQUIRED");
    expect(
      (await backend.run((context) => context.db.get(eventId)))?.listsRevision,
    ).toBeUndefined();
  });

  it("binds an authenticated verification immediately", async () => {
    const { backend, eventId, submission } = await setup();
    const owner = backend.withIdentity({ subject: "first-guest" });
    const grant = await owner.mutation(api.credentials.authorizeListAccess, {
      ...scope,
      eventId,
      password: "original",
    });
    if (!grant.ok) throw new Error("Expected access");
    await expect(
      backend
        .withIdentity({ subject: "second-guest" })
        .mutation(api.rsvps.submitRequest, submission(grant.accessToken)),
    ).rejects.toThrow("LIST_ACCESS_REQUIRED");
  });

  it("permits archived password takeover, blocks active takeover, and restores without reclaiming the code", async () => {
    const { backend, host, eventId, firstId, secondId, verify, snapshot } = await setup();
    const oldJourney = await verify();
    await expect(
      host.action(api.eventsNode.update, {
        ...scope,
        eventId,
        lists: [
          { id: firstId, listKey: "vip" },
          { id: secondId, listKey: "guest", password: "original" },
        ],
      }),
    ).rejects.toThrow("SMS_CODE_CONFLICT");
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      lists: [
        { id: firstId, listKey: "vip", archived: true },
        { id: secondId, listKey: "guest", password: "original" },
      ],
    });
    expect(await verify()).toMatchObject({ listKey: "guest" });
    expect(
      await backend.mutation(api.credentials.authorizeListAccess, {
        ...scope,
        eventId,
        password: "original",
        accessToken: oldJourney.accessToken,
      }),
    ).toMatchObject({ listKey: "vip" });
    const before = await snapshot();
    await expect(
      host.action(api.eventsNode.update, {
        ...scope,
        eventId,
        lists: [
          { id: firstId, listKey: "vip", archived: false },
          { id: secondId, listKey: "guest" },
        ],
      }),
    ).rejects.toThrow("RESTORE_PASSWORD");
    expect(await snapshot()).toEqual(before);
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      lists: [
        { id: firstId, listKey: "vip", archived: false, password: "" },
        { id: secondId, listKey: "guest" },
      ],
    });
    expect(await verify()).toMatchObject({ listKey: "guest" });
    expect((await snapshot()).lists[0]).toMatchObject({ listKey: "vip", password: "" });
    expect((await snapshot()).lists[0].archivedAt).toBeUndefined();
  });
  it("allows a signed-in guest to prepare a phone-verification handoff on their own grant", async () => {
    const { backend, eventId, submission } = await setup();
    const signedIn = backend.withIdentity({ subject: "signed-in-guest" });
    const access = await signedIn.mutation(api.credentials.authorizeListAccess, {
      ...scope,
      eventId,
      password: "original",
    });
    if (!access.ok) throw new Error("Expected access");
    const handoff = await signedIn.mutation(
      api.rsvps.prepareGuestRequest,
      submission(access.accessToken),
    );
    expect(handoff.expiresAt).toBe(access.expiresAt);
    await signedIn.mutation(internal.rsvps.completeGuestRequest, {
      token: handoff.rsvpHandoffToken,
      verifiedPhoneNumbers: [phone],
    });
    expect((await backend.run((context) => context.db.query("rsvps").unique()))?.clerkUserId).toBe(
      "signed-in-guest",
    );
  });

  it("preserves a legacy prepared handoff with its original expiry after archival", async () => {
    const { backend, host, eventId, firstId, secondId, submission } = await setup();
    const legacyToken = "prepared-before-grants";
    const legacyExpiry = Date.now() + 15 * 60 * 1000;
    const { accessToken: ignoredToken, ...legacySubmission } = submission("unused");
    expect(ignoredToken).toBe("unused");
    const { normalizeAndHashPhoneNumber } = await import("../convex/lib/phoneHash");
    await backend.run(async (context) => {
      await context.db.insert("rsvpGuestHandoffs", {
        tokenHash: await hashOpaqueValue(legacyToken),
        submission: legacySubmission,
        phoneNumber: phone,
        phoneHash: (await normalizeAndHashPhoneNumber(phone)).phoneHash,
        createdAt: Date.now(),
        expiresAt: legacyExpiry,
      });
    });
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      lists: [
        { id: firstId, listKey: "vip", archived: true, password: "rotated" },
        { id: secondId, listKey: "guest" },
      ],
    });
    expect(
      (await backend.query(api.rsvps.resolveGuestRsvpHandoff, { token: legacyToken }))?.expiresAt,
    ).toBe(legacyExpiry);
    await backend
      .withIdentity({ subject: "legacy-guest" })
      .mutation(internal.rsvps.completeGuestRequest, {
        token: legacyToken,
        verifiedPhoneNumbers: [phone],
      });
    expect((await backend.run((context) => context.db.query("rsvps").unique()))?.listKey).toBe(
      "vip",
    );
  });

  it("validates a reopened event against its final passwords and preserves cross-event archive protection", async () => {
    const { backend, host, eventId, firstId, secondId } = await setup();
    await backend.run(async (context) => {
      const event = await context.db.get(eventId);
      if (!event) throw new Error("Expected event");
      const otherEvent = await context.db.insert("events", {
        ...scope,
        name: "Other",
        location: "Room",
        lifecycle: "published",
        eventDate: event.eventDate,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await context.db.insert("listCredentials", {
        eventId: otherEvent,
        listKey: "private",
        password: "original",
        passwordNormalized: "original",
        archivedAt: Date.now(),
        createdAt: Date.now(),
      });
      await context.db.patch(eventId, { lifecycle: "draft" });
    });
    await expect(
      host.action(api.eventsNode.update, {
        ...scope,
        eventId,
        lists: [
          { id: firstId, listKey: "vip", password: "free" },
          { id: secondId, listKey: "guest", password: "original" },
        ],
      }),
    ).rejects.toThrow("SMS_CODE_CONFLICT");
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      patch: { lifecycle: "published" },
      lists: [
        { id: firstId, listKey: "vip", password: "free" },
        { id: secondId, listKey: "guest" },
      ],
    });
    expect(
      await backend.query(api.credentials.resolveListByPassword, {
        ...scope,
        eventId,
        password: "free",
      }),
    ).toMatchObject({ ok: true, listKey: "vip" });
  });
  it("creates distinct internal keys while preserving explicitly supplied display names", async () => {
    const { backend, host } = await setup();
    const result = await host.action(api.eventsNode.create, {
      ...scope,
      name: "New event",
      location: "Room",
      eventDate: Date.now() + 86400000,
      lists: [
        { listKey: "guest", displayName: "First group", password: "create-first" },
        { listKey: "guest", displayName: "Second group", password: "create-second" },
      ],
    });
    const lists = await backend.query(api.credentials.getCredsForEvent, {
      ...scope,
      eventId: result.eventId,
    });
    expect(lists.map((list) => [list.listKey, list.displayName])).toEqual([
      ["guest", "First group"],
      ["guest-2", "Second group"],
    ]);
  });

  it("rechecks cross-event conflicts when an already-owned blast code becomes a public password", async () => {
    const { backend, host, eventId, firstId, secondId, snapshot } = await setup();
    await backend.run(async (context) => {
      const now = Date.now();
      await context.db.insert("listCodeAssignments", {
        eventId,
        normalizedCode: "shared",
        listCredentialId: firstId,
        assignedAt: now,
      });
      const otherEventId = await context.db.insert("events", {
        ...scope,
        name: "Other active event",
        location: "Room",
        lifecycle: "published",
        eventDate: now + 86400000,
        createdAt: now,
        updatedAt: now,
      });
      await context.db.insert("listCredentials", {
        eventId: otherEventId,
        listKey: "private",
        password: "shared",
        passwordNormalized: "shared",
        createdAt: now,
      });
    });
    await host.action(api.eventsNode.update, {
      ...scope,
      eventId,
      lists: [
        { id: firstId, listKey: "vip", displayName: "Renamed" },
        { id: secondId, listKey: "guest" },
      ],
    });
    const before = await snapshot();
    await expect(
      host.action(api.eventsNode.update, {
        ...scope,
        eventId,
        lists: [
          { id: firstId, listKey: "vip", password: "shared" },
          { id: secondId, listKey: "guest" },
        ],
      }),
    ).rejects.toThrow("SMS_CODE_CONFLICT");
    expect(await snapshot()).toEqual(before);
  });
});
