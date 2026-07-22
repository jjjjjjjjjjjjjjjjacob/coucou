import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { buildGuestClerkUserId } from "../convex/lib/guestIdentity";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/guestDirectory.ts": () => import("../convex/guestDirectory"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

type TestBackend = ReturnType<typeof convexTest>;

const aggregateComponentModules = {
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js"),
};

const WORKSPACE_SLUG = "dojo-pomodoro";
const SITE_KEY = "dojo";
const CLERK_ORGANIZATION_ID = "org_dojo";

const scopeArgs = { siteKey: SITE_KEY, workspaceSlug: WORKSPACE_SLUG };

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

function createMemberIdentity(subject: string): Partial<UserIdentity> {
  return {
    subject,
    org_id: CLERK_ORGANIZATION_ID,
    role: "org:member",
  } as unknown as Partial<UserIdentity>;
}

async function seedWorkspace(testBackend: TestBackend) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("workspaces", {
      slug: WORKSPACE_SLUG,
      name: "Dojo Pomodoro",
      clerkOrganizationId: CLERK_ORGANIZATION_ID,
      clerkOrganizationSlug: WORKSPACE_SLUG,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedEvent(
  testBackend: TestBackend,
  name: string,
  eventDateOffsetMs: number,
  customFields?: Array<{ key: string; label: string }>,
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("events", {
      workspaceSlug: WORKSPACE_SLUG,
      siteKey: SITE_KEY,
      name,
      location: "Test Venue",
      eventDate: Date.now() + eventDateOffsetMs,
      status: "active",
      customFields,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedUser(
  testBackend: TestBackend,
  clerkUserId: string,
  firstName: string,
  phone?: string,
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("users", {
      clerkUserId,
      phone,
      firstName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedRsvp(
  testBackend: TestBackend,
  args: {
    eventId: Id<"events">;
    clerkUserId: string;
    listKey?: string;
    userName?: string;
    status?: "pending" | "approved" | "denied";
    smsConsent?: boolean;
    smsConsentTimestamp?: number;
    guestPhoneHash?: string;
    customFieldValues?: Record<string, string>;
    createdAt?: number;
  },
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("rsvps", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey ?? "vip",
      userName: args.userName ?? args.clerkUserId,
      guestPhoneHash: args.guestPhoneHash,
      shareContact: true,
      smsConsent: args.smsConsent,
      smsConsentTimestamp: args.smsConsentTimestamp,
      customFieldValues: args.customFieldValues,
      status: args.status ?? "approved",
      approvalStatus: args.status ?? "approved",
      createdAt: args.createdAt ?? Date.now(),
      updatedAt: args.createdAt ?? Date.now(),
    });
  });
}

async function seedSentBlastWithDelivery(
  testBackend: TestBackend,
  args: { eventId: Id<"events">; name: string; phoneHash: string },
) {
  return await testBackend.run(async (databaseContext) => {
    const textBlastId = await databaseContext.db.insert("textBlasts", {
      eventId: args.eventId,
      targetEventIds: [args.eventId],
      name: args.name,
      message: "Test",
      targetLists: ["vip"],
      deliveryTrackingEnabled: true,
      recipientCount: 1,
      sentCount: 1,
      failedCount: 0,
      sentBy: "host_1",
      status: "sent",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await databaseContext.db.insert("textBlastRecipients", {
      textBlastId,
      phoneHash: args.phoneHash,
      status: "sent",
      sourceEventIds: [args.eventId],
      sourceRsvpIds: [],
      sourceListKeys: ["vip"],
      recipientClerkUserIds: [],
      sentAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return textBlastId;
  });
}

async function listDirectory(hostBackend: TestBackend, extraArgs: Record<string, unknown> = {}) {
  return await hostBackend.query(api.guestDirectory.listGuestDirectoryPaginated, {
    ...scopeArgs,
    ...extraArgs,
  });
}

describe("guestDirectory.listGuestDirectoryPaginated", () => {
  it("merges guest and claimed RSVPs for the same phone into one person with all events", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const pastEventId = await seedEvent(testBackend, "Past Party", -7 * 86_400_000);
    const latestEventId = await seedEvent(testBackend, "Latest Party", -1 * 86_400_000);

    const { phoneHash } = await normalizeAndHashPhoneNumber("+15551230001");
    const guestClerkUserId = buildGuestClerkUserId(phoneHash);
    await seedRsvp(testBackend, {
      eventId: pastEventId,
      clerkUserId: guestClerkUserId,
      guestPhoneHash: phoneHash,
      userName: "Casey Guest",
    });
    await seedUser(testBackend, "user_casey", "Casey", "+15551230001");
    await seedRsvp(testBackend, {
      eventId: latestEventId,
      clerkUserId: "user_casey",
      userName: "Casey Claimed",
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    const result = await listDirectory(hostBackend);

    expect(result.pagination.totalCount).toBe(1);
    const person = result.people[0];
    expect(person.personKey).toBe(`phone:${phoneHash}`);
    expect(person.eventCount).toBe(2);
    expect(person.events.map((eventEntry) => eventEntry.eventName).sort()).toEqual([
      "Latest Party",
      "Past Party",
    ]);
    expect(person.clerkUserIds.sort()).toEqual([guestClerkUserId, "user_casey"].sort());
    expect(person.primaryClerkUserId).toBe("user_casey");
    expect(person.name).toBe("Casey");
    expect(person.rsvpedToLatestEvent).toBe(true);
  });

  it("keys people without phones by clerkUserId and keeps them separate", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "Solo Event", -86_400_000);
    await seedUser(testBackend, "user_nophone", "Nadia");
    await seedRsvp(testBackend, { eventId, clerkUserId: "user_nophone", userName: "Nadia" });
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_other",
      userName: "Other Person",
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    const result = await listDirectory(hostBackend);

    expect(result.pagination.totalCount).toBe(2);
    const personKeys = result.people.map((person) => person.personKey).sort();
    expect(personKeys).toEqual(["user:user_nophone", "user:user_other"]);
    expect(result.people.every((person) => person.hasPhone === false)).toBe(true);
  });

  it("computes and filters by rsvpedToLatestEvent", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const olderEventId = await seedEvent(testBackend, "Older", -14 * 86_400_000);
    const latestEventId = await seedEvent(testBackend, "Latest", -86_400_000);
    // A future event should not count as the "latest" event.
    await seedEvent(testBackend, "Future", 14 * 86_400_000);

    await seedRsvp(testBackend, { eventId: latestEventId, clerkUserId: "user_current" });
    await seedRsvp(testBackend, { eventId: olderEventId, clerkUserId: "user_lapsed" });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));

    const allPeople = await listDirectory(hostBackend);
    expect(allPeople.latestEvent?.eventName).toBe("Latest");

    const currentPeople = await listDirectory(hostBackend, { rsvpedToLatestEvent: "yes" });
    expect(currentPeople.people.map((person) => person.personKey)).toEqual(["user:user_current"]);

    const lapsedPeople = await listDirectory(hostBackend, { rsvpedToLatestEvent: "no" });
    expect(lapsedPeople.people.map((person) => person.personKey)).toEqual(["user:user_lapsed"]);
  });

  it("rolls up SMS consent from RSVPs, opt-outs, and organizer preferences", async () => {
    const testBackend = setupTestBackend();
    const workspaceId = await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "Consent Event", -86_400_000);

    const { phoneHash: consentedPhoneHash } = await normalizeAndHashPhoneNumber("+15551230002");
    await seedUser(testBackend, "user_consented", "Cora", "+15551230002");
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_consented",
      smsConsent: true,
      smsConsentTimestamp: Date.now() - 1000,
    });

    const { phoneHash: optedOutPhoneHash } = await normalizeAndHashPhoneNumber("+15551230003");
    await seedUser(testBackend, "user_opted_out", "Otto", "+15551230003");
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_opted_out",
      smsConsent: true,
      smsConsentTimestamp: Date.now() - 1000,
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("smsOptOuts", {
        phoneNumber: optedOutPhoneHash,
        clerkUserId: "user_opted_out",
        optedOutAt: Date.now(),
      });
    });

    await seedUser(testBackend, "user_pref_revoked", "Rhea", "+15551230004");
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_pref_revoked",
      smsConsent: true,
      smsConsentTimestamp: Date.now() - 10_000,
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("userSmsOrganizerPreferences", {
        clerkUserId: "user_pref_revoked",
        organizerKey: `workspace:${workspaceId}`,
        workspaceId,
        smsConsent: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));

    const consentedPeople = await listDirectory(hostBackend, { smsConsentFilter: "consented" });
    expect(consentedPeople.people.map((person) => person.personKey)).toEqual([
      `phone:${consentedPhoneHash}`,
    ]);
    expect(consentedPeople.people[0]?.smsConsent).toBe(true);

    const notConsentedPeople = await listDirectory(hostBackend, {
      smsConsentFilter: "not_consented",
    });
    const { phoneHash: revokedPhoneHash } = await normalizeAndHashPhoneNumber("+15551230004");
    const notConsentedKeys = notConsentedPeople.people.map((person) => person.personKey).sort();
    expect(notConsentedKeys).toEqual(
      [`phone:${optedOutPhoneHash}`, `phone:${revokedPhoneHash}`].sort(),
    );
    expect(notConsentedPeople.pagination.totalCount).toBe(2);
    const optedOutPerson = notConsentedPeople.people.find(
      (person) => person.personKey === `phone:${optedOutPhoneHash}`,
    );
    expect(optedOutPerson?.hasOptedOut).toBe(true);
  });

  it("counts received texts and filters by recipient history", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "Blast Event", -86_400_000);

    const { phoneHash: receivedPhoneHash } = await normalizeAndHashPhoneNumber("+15551230005");
    await seedUser(testBackend, "user_received", "Rae", "+15551230005");
    await seedRsvp(testBackend, { eventId, clerkUserId: "user_received", smsConsent: true });

    await seedUser(testBackend, "user_not_received", "Nico", "+15551230006");
    await seedRsvp(testBackend, { eventId, clerkUserId: "user_not_received", smsConsent: true });

    const textBlastId = await seedSentBlastWithDelivery(testBackend, {
      eventId,
      name: "Launch Blast",
      phoneHash: receivedPhoneHash,
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));

    const receivedPeople = await listDirectory(hostBackend, {
      recipientHistoryFilter: { type: "received_any", textBlastIds: [textBlastId] },
    });
    expect(receivedPeople.people.map((person) => person.personKey)).toEqual([
      `phone:${receivedPhoneHash}`,
    ]);
    expect(receivedPeople.people[0]?.receivedTextCount).toBe(1);

    const notReceivedPeople = await listDirectory(hostBackend, {
      recipientHistoryFilter: { type: "not_received_any", textBlastIds: [textBlastId] },
    });
    expect(notReceivedPeople.people.map((person) => person.personKey)).toEqual([
      "phone:" + (await normalizeAndHashPhoneNumber("+15551230006")).phoneHash,
    ]);
    expect(notReceivedPeople.people[0]?.receivedTextCount).toBe(0);
  });

  it("applies audience segment filters at the person level", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "Segment Event", -86_400_000, [
      { key: "instagram", label: "Instagram" },
    ]);

    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_pending",
      status: "pending",
      customFieldValues: { instagram: "@pending" },
    });
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_approved_missing_field",
      status: "approved",
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));

    const pendingPeople = await listDirectory(hostBackend, {
      recipientFilter: JSON.stringify({ type: "status", status: "pending" }),
    });
    expect(pendingPeople.people.map((person) => person.personKey)).toEqual(["user:user_pending"]);

    const missingFieldPeople = await listDirectory(hostBackend, {
      recipientFilter: JSON.stringify({ type: "custom_field_missing", fieldKey: "instagram" }),
    });
    expect(missingFieldPeople.people.map((person) => person.personKey)).toEqual([
      "user:user_approved_missing_field",
    ]);
  });

  it("filters by source events, tags, search text, and paginates", async () => {
    const testBackend = setupTestBackend();
    const workspaceId = await seedWorkspace(testBackend);
    const firstEventId = await seedEvent(testBackend, "First Event", -10 * 86_400_000);
    const secondEventId = await seedEvent(testBackend, "Second Event", -86_400_000);

    await seedRsvp(testBackend, {
      eventId: firstEventId,
      clerkUserId: "user_first_only",
      userName: "Fiona First",
    });
    await seedRsvp(testBackend, {
      eventId: secondEventId,
      clerkUserId: "user_second_only",
      userName: "Sasha Second",
    });

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("workspaceGuestProfiles", {
        workspaceId,
        clerkUserId: "user_first_only",
        tags: ["vip-alumni"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));

    const firstEventPeople = await listDirectory(hostBackend, { eventIds: [firstEventId] });
    expect(firstEventPeople.people.map((person) => person.personKey)).toEqual([
      "user:user_first_only",
    ]);

    const taggedPeople = await listDirectory(hostBackend, { tags: ["vip-alumni"] });
    expect(taggedPeople.people.map((person) => person.personKey)).toEqual(["user:user_first_only"]);
    expect(taggedPeople.people[0]?.tags).toEqual(["vip-alumni"]);

    const searchedPeople = await listDirectory(hostBackend, { searchText: "sasha" });
    expect(searchedPeople.people.map((person) => person.personKey)).toEqual([
      "user:user_second_only",
    ]);

    const firstPage = await listDirectory(hostBackend, {
      page: 0,
      pageSize: 1,
      sortBy: "name",
      sortDirection: "asc",
    });
    expect(firstPage.pagination.totalCount).toBe(2);
    expect(firstPage.pagination.totalPages).toBe(2);
    expect(firstPage.people).toHaveLength(1);
    expect(firstPage.people[0]?.name).toBe("Fiona First");

    const secondPage = await listDirectory(hostBackend, {
      page: 1,
      pageSize: 1,
      sortBy: "name",
      sortDirection: "asc",
    });
    expect(secondPage.people[0]?.name).toBe("Sasha Second");
  });

  it("overlays organization roles", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "Role Event", -86_400_000);
    await seedUser(testBackend, "user_host", "Hana", "+15551230007");
    await seedRsvp(testBackend, { eventId, clerkUserId: "user_host" });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("orgMemberships", {
        clerkUserId: "user_host",
        organizationId: CLERK_ORGANIZATION_ID,
        role: "org:host",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    const result = await listDirectory(hostBackend);

    expect(result.people[0]?.role).toBe("org:host");
    expect(result.people[0]?.hasOrganizationMembership).toBe(true);
  });

  it("rejects identities without host access", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);

    const memberBackend = testBackend.withIdentity(createMemberIdentity("member_1"));
    await expect(listDirectory(memberBackend)).rejects.toThrow(/Forbidden/);

    const anonymousBackend = testBackend;
    await expect(listDirectory(anonymousBackend)).rejects.toThrow(/Unauthorized/);
  });
});

describe("guestDirectory profiles", () => {
  it("upserts a profile by phone hash and heals identifiers on claim", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);

    const { phoneHash } = await normalizeAndHashPhoneNumber("+15551230008");
    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));

    await hostBackend.mutation(api.guestDirectory.upsertGuestProfile, {
      ...scopeArgs,
      personKey: { guestPhoneHash: phoneHash },
      tags: ["  VIP ", "vip", "friends"],
      notes: "Always brings a crowd",
    });

    // Later the same person is matched by phone hash even when a clerk id is provided.
    await hostBackend.mutation(api.guestDirectory.upsertGuestProfile, {
      ...scopeArgs,
      personKey: { guestPhoneHash: phoneHash, clerkUserId: "user_claimed" },
      defaultListKey: "VIP",
    });

    const profiles = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.query("workspaceGuestProfiles").collect();
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.tags).toEqual(["vip", "friends"]);
    expect(profiles[0]?.notes).toBe("Always brings a crowd");
    expect(profiles[0]?.defaultListKey).toBe("vip");
    expect(profiles[0]?.clerkUserId).toBe("user_claimed");
    expect(profiles[0]?.guestPhoneHash).toBe(phoneHash);
    expect(profiles[0]?.updatedByClerkUserId).toBe("host_1");
  });

  it("bulk adds and removes tags across people", async () => {
    const testBackend = setupTestBackend();
    const workspaceId = await seedWorkspace(testBackend);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("workspaceGuestProfiles", {
        workspaceId,
        clerkUserId: "user_existing",
        tags: ["old-tag", "keep-tag"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    const result = await hostBackend.mutation(api.guestDirectory.bulkUpdateGuestProfiles, {
      ...scopeArgs,
      personKeys: [{ clerkUserId: "user_existing" }, { clerkUserId: "user_new" }],
      addTags: ["Summer-2026"],
      removeTags: ["old-tag"],
    });

    expect(result.updatedCount).toBe(2);
    const profiles = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.query("workspaceGuestProfiles").collect();
    });
    expect(profiles).toHaveLength(2);
    const existingProfile = profiles.find((profile) => profile.clerkUserId === "user_existing");
    expect(existingProfile?.tags?.sort()).toEqual(["keep-tag", "summer-2026"]);
    const newProfile = profiles.find((profile) => profile.clerkUserId === "user_new");
    expect(newProfile?.tags).toEqual(["summer-2026"]);
  });

  it("suggests the default list only when the event has a matching list", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventWithVipId = await seedEvent(testBackend, "Has VIP", -86_400_000);
    const eventWithoutVipId = await seedEvent(testBackend, "No VIP", -86_400_000);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("listCredentials", {
        eventId: eventWithVipId,
        listKey: "VIP",
        createdAt: Date.now(),
      });
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    await hostBackend.mutation(api.guestDirectory.upsertGuestProfile, {
      ...scopeArgs,
      personKey: { clerkUserId: "user_vip" },
      defaultListKey: "vip",
    });

    const suggestion = await hostBackend.query(api.guestDirectory.getDefaultListSuggestion, {
      ...scopeArgs,
      eventId: eventWithVipId,
      personKey: { clerkUserId: "user_vip" },
    });
    expect(suggestion?.suggestedListKey).toBe("VIP");

    const noSuggestion = await hostBackend.query(api.guestDirectory.getDefaultListSuggestion, {
      ...scopeArgs,
      eventId: eventWithoutVipId,
      personKey: { clerkUserId: "user_vip" },
    });
    expect(noSuggestion).toBeNull();
  });
});

describe("guestDirectory.getGuestDirectoryFacets", () => {
  it("returns distinct tags, list keys, events, and custom field options", async () => {
    const testBackend = setupTestBackend();
    const workspaceId = await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "Facet Event", -86_400_000, [
      { key: "instagram", label: "Instagram" },
    ]);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "VIP",
        createdAt: Date.now(),
      });
      await databaseContext.db.insert("workspaceGuestProfiles", {
        workspaceId,
        clerkUserId: "user_tagged",
        tags: ["regular", "photographer"],
        defaultListKey: "vip",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    const facets = await hostBackend.query(api.guestDirectory.getGuestDirectoryFacets, scopeArgs);

    expect(facets.tags).toEqual(["photographer", "regular"]);
    expect(facets.defaultListKeys).toEqual(["vip"]);
    expect(facets.workspaceListKeys).toEqual(["vip"]);
    expect(facets.events.map((eventOption) => eventOption.eventName)).toEqual(["Facet Event"]);
    expect(facets.customFieldOptions).toEqual([{ key: "instagram", label: "Instagram" }]);
  });
});

describe("guestDirectory.getGuestProfileByUserReference", () => {
  it("finds a phone-hash-keyed profile from a users-id reference", async () => {
    const testBackend = setupTestBackend();
    const workspaceId = await seedWorkspace(testBackend);
    const { phoneHash } = await normalizeAndHashPhoneNumber("+15551230010");
    const userId = await seedUser(testBackend, "user_hash_only", "Hana", "+15551230010");
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("workspaceGuestProfiles", {
        workspaceId,
        guestPhoneHash: phoneHash,
        tags: ["photographer"],
        notes: "Shot last season's recap",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    const result = await hostBackend.query(api.guestDirectory.getGuestProfileByUserReference, {
      ...scopeArgs,
      userReference: userId,
    });

    expect(result.personKey).toEqual({ clerkUserId: "user_hash_only", guestPhoneHash: phoneHash });
    expect(result.profile?.tags).toEqual(["photographer"]);
    expect(result.profile?.notes).toBe("Shot last season's recap");
  });

  it("resolves rsvp~ references and returns null profile when none exists", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "Ref Event", -86_400_000);
    const { phoneHash } = await normalizeAndHashPhoneNumber("+15551230011");
    const guestClerkUserId = buildGuestClerkUserId(phoneHash);
    const rsvpId = await seedRsvp(testBackend, {
      eventId,
      clerkUserId: guestClerkUserId,
      guestPhoneHash: phoneHash,
      userName: "Phone Only",
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    const result = await hostBackend.query(api.guestDirectory.getGuestProfileByUserReference, {
      ...scopeArgs,
      userReference: `rsvp~${rsvpId}`,
    });

    expect(result.personKey).toEqual({
      clerkUserId: guestClerkUserId,
      guestPhoneHash: phoneHash,
    });
    expect(result.profile).toBeNull();
  });

  it("heals a clerkUserId-only upsert onto the phone-hash key", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const { phoneHash } = await normalizeAndHashPhoneNumber("+15551230012");
    await seedUser(testBackend, "user_heal", "Hal", "+15551230012");

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    await hostBackend.mutation(api.guestDirectory.upsertGuestProfile, {
      ...scopeArgs,
      personKey: { clerkUserId: "user_heal" },
      tags: ["healer"],
    });

    const profiles = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.query("workspaceGuestProfiles").collect();
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.clerkUserId).toBe("user_heal");
    expect(profiles[0]?.guestPhoneHash).toBe(phoneHash);
  });
});

describe("guestDirectory.searchGuestDirectory", () => {
  it("finds workspace guests by identity and organizer annotations", async () => {
    const testBackend = setupTestBackend();
    const workspaceId = await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "Summer Opening", 86_400_000);
    const userId = await seedUser(testBackend, "user_riley", "Riley", "+15551230021");
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_riley",
      userName: "Riley Park",
      listKey: "artist",
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("workspaceGuestProfiles", {
        workspaceId,
        clerkUserId: "user_riley",
        tags: ["photographer"],
        notes: "Prefers the courtyard entrance",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    const nameResults = await hostBackend.query(api.guestDirectory.searchGuestDirectory, {
      ...scopeArgs,
      searchText: "riley",
    });
    const annotationResults = await hostBackend.query(api.guestDirectory.searchGuestDirectory, {
      ...scopeArgs,
      searchText: "photographer",
    });

    expect(nameResults).toHaveLength(1);
    expect(nameResults[0]).toMatchObject({
      detailReference: userId,
      name: "Riley",
      eventCount: 1,
      latestEventName: "Summer Opening",
      tags: ["photographer"],
    });
    expect(annotationResults.map((person) => person.detailReference)).toEqual([userId]);
  });

  it("requires a host-capable workspace role", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const memberBackend = testBackend.withIdentity(createMemberIdentity("member_1"));

    await expect(
      memberBackend.query(api.guestDirectory.searchGuestDirectory, {
        ...scopeArgs,
        searchText: "guest",
      }),
    ).rejects.toThrow("host role required");
  });
});

describe("guestDirectory events attended count", () => {
  async function seedRedemption(
    testBackend: TestBackend,
    args: {
      eventId: Id<"events">;
      clerkUserId: string;
      redeemedAt?: number;
      disabledAt?: number;
    },
  ) {
    return await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.insert("redemptions", {
        eventId: args.eventId,
        clerkUserId: args.clerkUserId,
        listKey: "vip",
        code: `code-${args.clerkUserId}-${args.eventId}`,
        redeemedAt: args.redeemedAt,
        disabledAt: args.disabledAt,
        unredeemHistory: [],
        createdAt: Date.now(),
      });
    });
  }

  it("counts only redeemed, non-disabled events and dedupes merged identities", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const attendedEventId = await seedEvent(testBackend, "Attended", -10 * 86_400_000);
    const issuedOnlyEventId = await seedEvent(testBackend, "Issued Only", -5 * 86_400_000);
    const disabledEventId = await seedEvent(testBackend, "Disabled", -2 * 86_400_000);

    const { phoneHash } = await normalizeAndHashPhoneNumber("+15551230013");
    const guestClerkUserId = buildGuestClerkUserId(phoneHash);
    await seedUser(testBackend, "user_attendee", "Ada", "+15551230013");

    // Same person under two identities: guest rsvp + claimed rsvp on the same
    // attended event must count once.
    await seedRsvp(testBackend, {
      eventId: attendedEventId,
      clerkUserId: guestClerkUserId,
      guestPhoneHash: phoneHash,
    });
    await seedRsvp(testBackend, { eventId: attendedEventId, clerkUserId: "user_attendee" });
    await seedRsvp(testBackend, { eventId: issuedOnlyEventId, clerkUserId: "user_attendee" });
    await seedRsvp(testBackend, { eventId: disabledEventId, clerkUserId: "user_attendee" });

    await seedRedemption(testBackend, {
      eventId: attendedEventId,
      clerkUserId: "user_attendee",
      redeemedAt: Date.now(),
    });
    await seedRedemption(testBackend, {
      eventId: issuedOnlyEventId,
      clerkUserId: "user_attendee",
    });
    await seedRedemption(testBackend, {
      eventId: disabledEventId,
      clerkUserId: "user_attendee",
      redeemedAt: Date.now(),
      disabledAt: Date.now(),
    });

    const hostBackend = testBackend.withIdentity(createHostIdentity("host_1"));
    const result = await listDirectory(hostBackend);

    expect(result.pagination.totalCount).toBe(1);
    expect(result.people[0]?.eventCount).toBe(3);
    expect(result.people[0]?.eventsAttendedCount).toBe(1);
  });
});
