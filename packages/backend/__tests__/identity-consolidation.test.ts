import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { resolveCanonicalClerkUserId } from "../convex/lib/canonicalUserIdentity";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/identityConsolidation.ts": () => import("../convex/identityConsolidation"),
};

const aggregateComponentModules = {
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js"),
};

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

function platformIdentity(subject: string): Partial<UserIdentity> {
  return {
    subject,
    org_slug: "coucou",
    role: "org:admin",
  } as unknown as Partial<UserIdentity>;
}

describe("same-phone identity consolidation", () => {
  it("rolls up collisions, aliases, profiles, invitations, and dependent records idempotently", async () => {
    const testBackend = setupTestBackend();
    const authenticatedBackend = testBackend.withIdentity(platformIdentity("platform_admin"));
    const phoneResolution = await normalizeAndHashPhoneNumber("+15551234567");
    const seededIds = await testBackend.run(async (databaseContext) => {
      const workspaceId = await databaseContext.db.insert("workspaces", {
        slug: "club-chlorine",
        name: "Club Chlorine",
        clerkOrganizationId: "org_chlorine",
        createdAt: 1,
        updatedAt: 1,
      });
      const eventId = await databaseContext.db.insert("events", {
        workspaceSlug: "club-chlorine",
        siteKey: "club-chlorine",
        name: "Collision event",
        location: "Le Bain",
        eventDate: 10_000,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const otherEventId = await databaseContext.db.insert("events", {
        workspaceSlug: "club-chlorine",
        siteKey: "club-chlorine",
        name: "Canonical history",
        location: "Le Bain",
        eventDate: 20_000,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const canonicalUserId = await databaseContext.db.insert("users", {
        clerkUserId: "user_canonical",
        phone: phoneResolution.normalizedPhoneNumber,
        phoneHash: phoneResolution.phoneHash,
        firstName: "Jacob",
        lastName: "Stein",
        referralCode: "KEEP",
        createdAt: 100,
        updatedAt: 300,
      });
      const retiredUserId = await databaseContext.db.insert("users", {
        clerkUserId: "user_retired",
        phone: phoneResolution.normalizedPhoneNumber,
        phoneHash: phoneResolution.phoneHash,
        firstName: "JACOB",
        lastName: "STEIN",
        referralCode: "LEGACY",
        createdAt: 200,
        updatedAt: 400,
      });
      const canonicalRsvpId = await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "user_canonical",
        listKey: "ga",
        userName: "Jacob Stein",
        ticketStatus: "issued",
        shareContact: true,
        note: "First note",
        attendees: 1,
        smsConsent: true,
        smsConsentTimestamp: 300,
        customFieldValues: { city: "New York", diet: "vegetarian" },
        invitedByName: "Alice",
        invitedByNormalizedName: "alice",
        status: "pending",
        approvalStatus: "pending",
        attendanceStatus: "yes",
        createdAt: 100,
        updatedAt: 300,
      });
      await databaseContext.db.insert("rsvps", {
        eventId: otherEventId,
        clerkUserId: "user_canonical",
        listKey: "ga",
        userName: "Jacob Stein",
        shareContact: true,
        status: "approved",
        approvalStatus: "approved",
        createdAt: 50,
        updatedAt: 50,
      });
      const retiredRsvpId = await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "user_retired",
        listKey: "vip",
        userName: "Jacob Stein",
        ticketStatus: "redeemed",
        shareContact: false,
        note: "Second note",
        attendees: 3,
        smsConsent: false,
        smsConsentTimestamp: 400,
        customFieldValues: { city: "Paris", color: "blue" },
        invitedByName: "Bob",
        invitedByNormalizedName: "bob",
        status: "approved",
        approvalStatus: "approved",
        attendanceStatus: "no",
        createdAt: 200,
        updatedAt: 400,
      });
      const canonicalSocialProfileId = await databaseContext.db.insert("userSocialProfiles", {
        clerkUserId: "user_canonical",
        userId: canonicalUserId,
        platformKey: "instagram",
        handle: "jacobstein",
        normalizedHandle: "jacobstein",
        createdAt: 100,
        updatedAt: 100,
      });
      const retiredSocialProfileId = await databaseContext.db.insert("userSocialProfiles", {
        clerkUserId: "user_retired",
        userId: retiredUserId,
        platformKey: "instagram",
        handle: "@jacobstein",
        normalizedHandle: "jacobstein",
        createdAt: 200,
        updatedAt: 400,
      });
      await databaseContext.db.insert("rsvpSocialProfiles", {
        eventId,
        rsvpId: canonicalRsvpId,
        clerkUserId: "user_canonical",
        userSocialProfileId: canonicalSocialProfileId,
        platformKey: "instagram",
        handle: "old_handle",
        normalizedHandle: "old_handle",
        createdAt: 100,
        updatedAt: 100,
      });
      await databaseContext.db.insert("rsvpSocialProfiles", {
        eventId,
        rsvpId: retiredRsvpId,
        clerkUserId: "user_retired",
        userSocialProfileId: retiredSocialProfileId,
        platformKey: "instagram",
        handle: "jacobstein",
        normalizedHandle: "jacobstein",
        createdAt: 200,
        updatedAt: 400,
      });
      const canonicalFieldValueId = await databaseContext.db.insert("profileFieldValues", {
        clerkUserId: "user_canonical",
        userId: canonicalUserId,
        fieldKey: "social.instagram",
        value: "jacobstein",
        normalizedValue: "jacobstein",
        createdAt: 100,
        updatedAt: 100,
      });
      const retiredFieldValueId = await databaseContext.db.insert("profileFieldValues", {
        clerkUserId: "user_retired",
        userId: retiredUserId,
        fieldKey: "social.instagram",
        value: "@jacobstein",
        normalizedValue: "jacobstein",
        createdAt: 200,
        updatedAt: 400,
      });
      await databaseContext.db.insert("workspaceProfileValueGrants", {
        workspaceId,
        workspaceSlug: "club-chlorine",
        siteKey: "club-chlorine",
        clerkUserId: "user_canonical",
        fieldKey: "social.instagram",
        profileFieldValueId: canonicalFieldValueId,
        sourceEventId: eventId,
        sourceRsvpId: canonicalRsvpId,
        createdAt: 100,
        updatedAt: 100,
      });
      await databaseContext.db.insert("workspaceProfileValueGrants", {
        workspaceId,
        workspaceSlug: "club-chlorine",
        siteKey: "club-chlorine",
        clerkUserId: "user_retired",
        fieldKey: "social.instagram",
        profileFieldValueId: retiredFieldValueId,
        sourceEventId: eventId,
        sourceRsvpId: retiredRsvpId,
        createdAt: 200,
        updatedAt: 400,
      });
      await databaseContext.db.insert("redemptions", {
        eventId,
        clerkUserId: "user_canonical",
        listKey: "ga",
        code: "ISSUED",
        createdAt: 100,
        unredeemHistory: [],
      });
      await databaseContext.db.insert("redemptions", {
        eventId,
        clerkUserId: "user_retired",
        listKey: "vip",
        code: "REDEEMED",
        createdAt: 200,
        redeemedAt: 350,
        unredeemHistory: [],
      });
      await databaseContext.db.insert("approvals", {
        eventId,
        rsvpId: retiredRsvpId,
        clerkUserId: "user_retired",
        listKey: "vip",
        decision: "approved",
        decidedBy: "host",
        decidedAt: 400,
      });
      return { canonicalUserId, retiredUserId, canonicalRsvpId, retiredRsvpId, workspaceId };
    });

    const dryRun = await authenticatedBackend.mutation(
      api.identityConsolidation.processDuplicatePhoneGroups,
      { dryRun: true, batchSize: 5 },
    );
    expect(dryRun.reports).toEqual([
      expect.objectContaining({
        canonicalUserId: seededIds.canonicalUserId,
        rsvpCount: 3,
        rsvpCollisionCount: 1,
      }),
    ]);
    expect(
      await testBackend.run(
        async (databaseContext) => await databaseContext.db.get(seededIds.retiredUserId),
      ),
    ).not.toBeNull();

    const execution = await authenticatedBackend.mutation(
      api.identityConsolidation.processDuplicatePhoneGroups,
      {
        dryRun: false,
        batchSize: 1,
        confirmation: "CONSOLIDATE_SAME_PHONE_USERS",
        snapshotReference: "snapshot:test",
      },
    );
    expect(execution.reports[0]).toEqual(
      expect.objectContaining({
        canonicalUserId: seededIds.canonicalUserId,
        rsvpCollisionCount: 1,
      }),
    );

    const state = await testBackend.run(async (databaseContext) => {
      const users = await databaseContext.db
        .query("users")
        .withIndex("by_phoneHash", (queryBuilder) =>
          queryBuilder.eq("phoneHash", phoneResolution.phoneHash),
        )
        .collect();
      const canonicalRsvp = await databaseContext.db.get(seededIds.canonicalRsvpId);
      const retiredRsvp = await databaseContext.db.get(seededIds.retiredRsvpId);
      const alias = await databaseContext.db
        .query("userIdentityAliases")
        .withIndex("by_alias", (queryBuilder) =>
          queryBuilder.eq("aliasClerkUserId", "user_retired"),
        )
        .unique();
      const rsvpAlias = await databaseContext.db
        .query("rsvpIdentityAliases")
        .withIndex("by_retired", (queryBuilder) =>
          queryBuilder.eq("retiredRsvpId", seededIds.retiredRsvpId),
        )
        .unique();
      const socialProfiles = await databaseContext.db
        .query("userSocialProfiles")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", "user_canonical"))
        .collect();
      const fieldValues = await databaseContext.db
        .query("profileFieldValues")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", "user_canonical"))
        .collect();
      const grants = await databaseContext.db
        .query("workspaceProfileValueGrants")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", "user_canonical"))
        .collect();
      const contactProfile = await databaseContext.db
        .query("workspaceGuestProfiles")
        .withIndex("by_workspace_phoneHash", (queryBuilder) =>
          queryBuilder
            .eq("workspaceId", seededIds.workspaceId)
            .eq("guestPhoneHash", phoneResolution.phoneHash),
        )
        .unique();
      const redemption = await databaseContext.db
        .query("redemptions")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder
            .eq("eventId", canonicalRsvp?.eventId as Id<"events">)
            .eq("clerkUserId", "user_canonical"),
        )
        .unique();
      const resolvedAlias = await resolveCanonicalClerkUserId(databaseContext, "user_retired");
      return {
        users,
        canonicalRsvp,
        retiredRsvp,
        alias,
        rsvpAlias,
        socialProfiles,
        fieldValues,
        grants,
        contactProfile,
        redemption,
        resolvedAlias,
      };
    });

    expect(state.users).toHaveLength(1);
    expect(state.retiredRsvp).toBeNull();
    expect(state.alias?.canonicalUserId).toBe(seededIds.canonicalUserId);
    expect(state.rsvpAlias?.canonicalRsvpId).toBe(seededIds.canonicalRsvpId);
    expect(state.resolvedAlias).toBe("user_canonical");
    expect(state.canonicalRsvp).toEqual(
      expect.objectContaining({
        approvalStatus: "approved",
        listKey: "vip",
        attendees: 3,
        smsConsent: false,
        attendanceStatus: "no",
        invitedByName: "Bob",
        customFieldValues: { city: "Paris", diet: "vegetarian", color: "blue" },
        createdAt: 100,
      }),
    );
    expect(state.canonicalRsvp?.note).toContain("First note");
    expect(state.canonicalRsvp?.note).toContain("Second note");
    expect(state.redemption?.code).toBe("REDEEMED");
    expect(state.socialProfiles).toHaveLength(1);
    expect(state.fieldValues).toHaveLength(1);
    expect(state.grants).toHaveLength(1);
    expect(state.contactProfile?.invitedByHistory?.map((entry) => entry.displayName)).toEqual(
      expect.arrayContaining(["Alice", "Bob"]),
    );

    const repeatedExecution = await authenticatedBackend.mutation(
      api.identityConsolidation.processDuplicatePhoneGroups,
      {
        dryRun: false,
        batchSize: 1,
        confirmation: "CONSOLIDATE_SAME_PHONE_USERS",
        snapshotReference: "snapshot:test",
      },
    );
    expect(repeatedExecution.reports).toHaveLength(0);
    const idempotentCounts = await testBackend.run(async (databaseContext) => ({
      aliases: (await databaseContext.db.query("userIdentityAliases").collect()).length,
      socialProfiles: (await databaseContext.db.query("userSocialProfiles").collect()).length,
      grants: (await databaseContext.db.query("workspaceProfileValueGrants").collect()).length,
    }));
    expect(idempotentCounts).toEqual({ aliases: 1, socialProfiles: 1, grants: 1 });
  });

  it("selects newest account and then stable user ID when RSVP counts tie", async () => {
    const testBackend = setupTestBackend();
    const authenticatedBackend = testBackend.withIdentity(platformIdentity("platform_admin"));
    const firstPhone = await normalizeAndHashPhoneNumber("+15550000001");
    const secondPhone = await normalizeAndHashPhoneNumber("+15550000002");
    const ids = await testBackend.run(async (databaseContext) => {
      const olderUserId = await databaseContext.db.insert("users", {
        clerkUserId: "older",
        phone: firstPhone.normalizedPhoneNumber,
        phoneHash: firstPhone.phoneHash,
        createdAt: 1,
        updatedAt: 1,
      });
      const newerUserId = await databaseContext.db.insert("users", {
        clerkUserId: "newer",
        phone: firstPhone.normalizedPhoneNumber,
        phoneHash: firstPhone.phoneHash,
        createdAt: 2,
        updatedAt: 2,
      });
      const stableFirstUserId = await databaseContext.db.insert("users", {
        clerkUserId: "stable_first",
        phone: secondPhone.normalizedPhoneNumber,
        phoneHash: secondPhone.phoneHash,
        createdAt: 3,
        updatedAt: 3,
      });
      const stableSecondUserId = await databaseContext.db.insert("users", {
        clerkUserId: "stable_second",
        phone: secondPhone.normalizedPhoneNumber,
        phoneHash: secondPhone.phoneHash,
        createdAt: 3,
        updatedAt: 3,
      });
      return { olderUserId, newerUserId, stableFirstUserId, stableSecondUserId };
    });

    const dryRun = await authenticatedBackend.mutation(
      api.identityConsolidation.processDuplicatePhoneGroups,
      { dryRun: true, batchSize: 5 },
    );
    const firstGroup = dryRun.reports.find((report) => report.phoneHash === firstPhone.phoneHash);
    const secondGroup = dryRun.reports.find((report) => report.phoneHash === secondPhone.phoneHash);
    expect(firstGroup?.canonicalUserId).toBe(ids.newerUserId);
    expect(secondGroup?.canonicalUserId).toBe(
      [ids.stableFirstUserId, ids.stableSecondUserId].sort((firstId, secondId) =>
        String(firstId).localeCompare(String(secondId)),
      )[0],
    );
  });

  it("reports invalid phones without writing them", async () => {
    const testBackend = setupTestBackend();
    const authenticatedBackend = testBackend.withIdentity(platformIdentity("platform_admin"));
    const invalidUserId = await testBackend.run(
      async (databaseContext) =>
        await databaseContext.db.insert("users", {
          clerkUserId: "invalid_phone",
          phone: "12",
          createdAt: 1,
          updatedAt: 1,
        }),
    );
    const result = await authenticatedBackend.mutation(
      api.identityConsolidation.backfillUserPhoneHashes,
      { dryRun: false, batchSize: 10 },
    );
    expect(result.invalidPhones).toEqual([
      expect.objectContaining({ userId: invalidUserId, phone: "12" }),
    ]);
    const unchangedUser = await testBackend.run(
      async (databaseContext) => await databaseContext.db.get(invalidUserId),
    );
    expect(unchangedUser?.phoneHash).toBeUndefined();
  });
});
