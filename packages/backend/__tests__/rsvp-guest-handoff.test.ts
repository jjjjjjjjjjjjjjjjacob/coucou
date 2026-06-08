import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/rsvps.ts": () => import("../convex/rsvps"),
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

function setupTestBackend(): TestBackend {
  const testBackend = convexTest(schema, convexModules);
  testBackend.registerComponent(
    "rsvpAggregate",
    aggregateComponentSchema,
    aggregateComponentModules,
  );
  return testBackend;
}

function createPhoneIdentity(subject: string, phoneNumber: string): Partial<UserIdentity> {
  return {
    subject,
    phoneNumber,
  } as unknown as Partial<UserIdentity>;
}

async function seedActiveEvent(testBackend: TestBackend): Promise<Id<"events">> {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("events", {
      siteKey: "club-chlorine",
      shortId: "guest-rsvp",
      name: "Guest RSVP Night",
      hosts: ["Coucou"],
      location: "Main Room",
      eventDate: Date.now() + 60 * 60 * 1000,
      status: "active",
      maxAttendees: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function getRsvp(testBackend: TestBackend, rsvpId: Id<"rsvps">) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.get(rsvpId);
  });
}

describe("guest RSVP handoff", () => {
  it("creates a pending guest RSVP and resolves its handoff phone", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);

    const result = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Ava",
      lastName: "Green",
      phone: "(310) 499-6272",
      shareContact: true,
      attendees: 1,
      smsConsent: true,
      customFields: {},
      socialProfiles: [],
    });

    const rsvp = await getRsvp(testBackend, result.rsvpId);
    expect(rsvp?.status).toBe("pending");
    expect(rsvp?.clerkUserId.startsWith("guest:")).toBe(true);
    expect(rsvp?.userName).toBe("Ava Green");
    expect(rsvp?.guestPhoneObfuscated).toContain("6272");
    expect(result.rsvpHandoffToken).not.toContain("3104996272");

    const handoff = await testBackend.query(api.rsvps.resolveGuestRsvpHandoff, {
      token: result.rsvpHandoffToken,
    });
    expect(handoff?.phoneNumber).toBe("+13104996272");
    expect(handoff?.canAutoSendCode).toBe(false);
  });

  it("marks known handoff phones as auto-sendable", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: "user_known_phone",
        phone: "+13104996272",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Ava",
      phone: "(310) 499-6272",
      shareContact: true,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    const handoff = await testBackend.query(api.rsvps.resolveGuestRsvpHandoff, {
      token: result.rsvpHandoffToken,
    });
    expect(handoff?.phoneNumber).toBe("+13104996272");
    expect(handoff?.canAutoSendCode).toBe(true);
  });

  it("returns null for invalid and expired handoffs", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);

    const result = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Ava",
      phone: "3104996272",
      shareContact: true,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    expect(
      await testBackend.query(api.rsvps.resolveGuestRsvpHandoff, {
        token: "invalid-token",
      }),
    ).toBeNull();

    await testBackend.run(async (databaseContext) => {
      const handoffs = await databaseContext.db.query("rsvpGuestHandoffs").collect();
      const handoff = handoffs.find((handoffRecord) => handoffRecord.rsvpId === result.rsvpId);
      if (!handoff) throw new Error("Expected handoff");
      await databaseContext.db.patch(handoff._id, {
        expiresAt: Date.now() - 1,
      });
    });

    expect(
      await testBackend.query(api.rsvps.resolveGuestRsvpHandoff, {
        token: result.rsvpHandoffToken,
      }),
    ).toBeNull();
  });

  it("claims a guest RSVP and preserves approvals and tickets", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);

    const result = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "vip",
      firstName: "Ava",
      lastName: "Green",
      phone: "+13104996272",
      shareContact: false,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    const guestRsvp = await getRsvp(testBackend, result.rsvpId);
    if (!guestRsvp) throw new Error("Expected guest RSVP");

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(result.rsvpId, {
        ticketStatus: "issued",
      });
      await databaseContext.db.insert("approvals", {
        eventId,
        rsvpId: result.rsvpId,
        clerkUserId: guestRsvp.clerkUserId,
        listKey: "vip",
        decision: "approved",
        decidedBy: "host_1",
        decidedAt: Date.now(),
      });
      await databaseContext.db.insert("redemptions", {
        eventId,
        clerkUserId: guestRsvp.clerkUserId,
        listKey: "vip",
        code: "VIP12345",
        createdAt: Date.now(),
        unredeemHistory: [],
      });
    });

    const authedBackend = testBackend.withIdentity(createPhoneIdentity("user_ava", "+13104996272"));
    const claimResult = await authedBackend.mutation(api.rsvps.claimGuestRsvpsForCurrentUser, {});
    expect(claimResult.paired).toBe(1);

    await testBackend.run(async (databaseContext) => {
      const claimedRsvp = await databaseContext.db.get(result.rsvpId);
      expect(claimedRsvp?.clerkUserId).toBe("user_ava");
      expect(claimedRsvp?.ticketStatus).toBe("issued");
      expect(claimedRsvp?.guestPhoneHash).toBeUndefined();

      const approvals = await databaseContext.db.query("approvals").collect();
      const approval = approvals.find((approvalRecord) => approvalRecord.eventId === eventId);
      expect(approval?.clerkUserId).toBe("user_ava");
      expect(approval?.rsvpId).toBe(result.rsvpId);

      const redemptions = await databaseContext.db.query("redemptions").collect();
      const redemption = redemptions.find(
        (redemptionRecord) =>
          redemptionRecord.eventId === eventId && redemptionRecord.clerkUserId === "user_ava",
      );
      expect(redemption?.code).toBe("VIP12345");
    });
  });
});
