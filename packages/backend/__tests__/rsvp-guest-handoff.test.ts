import { afterAll, afterEach, describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/notifications.ts": () => import("../convex/notifications"),
  "../convex/rsvps.ts": () => import("../convex/rsvps"),
};

const originalDevTwilioEnabled = process.env.DEV_TWILIO_ENABLED;
process.env.DEV_TWILIO_ENABLED = "false";

afterAll(() => {
  if (originalDevTwilioEnabled === undefined) {
    delete process.env.DEV_TWILIO_ENABLED;
  } else {
    process.env.DEV_TWILIO_ENABLED = originalDevTwilioEnabled;
  }
});

type TestBackend = ReturnType<typeof convexTest>;

const aggregateComponentModules = {
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js"),
};

const activeTestBackends: TestBackend[] = [];

function setupTestBackend(): TestBackend {
  const testBackend = convexTest(schema, convexModules);
  testBackend.registerComponent(
    "rsvpAggregate",
    aggregateComponentSchema,
    aggregateComponentModules,
  );
  activeTestBackends.push(testBackend);
  return testBackend;
}

// Mutations here fire-and-forget SMS notification actions via the scheduler;
// drain them so their writes can't land after this file's backend is gone.
afterEach(async () => {
  for (const testBackend of activeTestBackends.splice(0)) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await testBackend.finishInProgressScheduledFunctions();
  }
});

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

    const scheduledFunctions = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.system.query("_scheduled_functions").collect();
    });
    expect(scheduledFunctions).toContainEqual(
      expect.objectContaining({
        name: "notifications:sendSmsConsentStatusMessage",
        args: [
          {
            eventId,
            clerkUserId: expect.stringMatching(/^guest:/),
            consentEnabled: true,
            phoneNumber: "+13104996272",
          },
        ],
      }),
    );

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
      lastName: "Green",
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
      lastName: "Green",
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
      expect(claimedRsvp?.userName).toBe("Ava Green");
      expect(claimedRsvp?.ticketStatus).toBe("issued");
      expect(claimedRsvp?.guestPhoneHash).toBeUndefined();

      const users = await databaseContext.db.query("users").collect();
      const claimedUser = users.find((userRecord) => userRecord.clerkUserId === "user_ava");
      expect(claimedUser?.firstName).toBe("Ava");
      expect(claimedUser?.lastName).toBe("Green");

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

  it("uses submitted authenticated names for new RSVP user records", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_authenticated_name", "+13104996272"),
    );

    await authedBackend.mutation(api.rsvps.submitRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Mina",
      lastName: "Park",
      phone: "+13104996272",
      shareContact: true,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    await testBackend.run(async (databaseContext) => {
      const rsvps = await databaseContext.db.query("rsvps").collect();
      const rsvp = rsvps.find(
        (rsvpRecord) =>
          rsvpRecord.eventId === eventId && rsvpRecord.clerkUserId === "user_authenticated_name",
      );
      expect(rsvp?.userName).toBe("Mina Park");

      const users = await databaseContext.db.query("users").collect();
      const user = users.find((userRecord) => userRecord.clerkUserId === "user_authenticated_name");
      expect(user?.firstName).toBe("Mina");
      expect(user?.lastName).toBe("Park");
      expect(user?.phone).toBe("+13104996272");
    });
  });

  it("carries SMS preference across events for the same organizer", async () => {
    const testBackend = setupTestBackend();
    const firstEventId = await seedActiveEvent(testBackend);
    const nextEventId = await seedActiveEvent(testBackend);
    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_sms_preference", "+13104996272"),
    );

    await authedBackend.mutation(api.rsvps.submitRequest, {
      eventId: firstEventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Mina",
      lastName: "Park",
      phone: "+13104996272",
      shareContact: true,
      attendees: 1,
      smsConsent: true,
      smsConsentIpAddress: "203.0.113.10",
      customFields: {},
      socialProfiles: [],
    });

    const enabledPreference = await authedBackend.query(api.rsvps.smsPreferenceForUserEvent, {
      eventId: nextEventId,
      siteKey: "club-chlorine",
    });
    expect(enabledPreference?.source).toBe("organizer");
    expect(enabledPreference?.smsConsent).toBe(true);
    expect(enabledPreference?.smsConsentIpAddress).toBe("203.0.113.10");

    const submittedRsvp = await testBackend.run(async (databaseContext) => {
      const rsvps = await databaseContext.db.query("rsvps").collect();
      return (
        rsvps.find(
          (rsvp) => rsvp.eventId === firstEventId && rsvp.clerkUserId === "user_sms_preference",
        ) ?? null
      );
    });
    if (!submittedRsvp) throw new Error("Expected submitted RSVP");

    await authedBackend.mutation(api.rsvps.updateSmsPreference, {
      rsvpId: submittedRsvp._id,
      smsConsent: false,
    });

    const disabledPreference = await authedBackend.query(api.rsvps.smsPreferenceForUserEvent, {
      eventId: nextEventId,
      siteKey: "club-chlorine",
    });
    expect(disabledPreference?.source).toBe("organizer");
    expect(disabledPreference?.smsConsent).toBe(false);

    await testBackend.run(async (databaseContext) => {
      const preferences = await databaseContext.db.query("userSmsOrganizerPreferences").collect();
      const userPreference = preferences.find(
        (preference) => preference.clerkUserId === "user_sms_preference",
      );
      expect(userPreference?.smsConsent).toBe(false);
      expect(userPreference?.sourceRsvpId).toBe(submittedRsvp._id);
    });
  });

  it("rejects RSVP submissions without both first and last names", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_missing_name", "+13104996272"),
    );

    await expect(
      authedBackend.mutation(api.rsvps.submitRequest, {
        eventId,
        siteKey: "club-chlorine",
        listKey: "ga",
        firstName: "Mina",
        lastName: "",
        phone: "+13104996272",
        shareContact: true,
        attendees: 1,
        customFields: {},
        socialProfiles: [],
      }),
    ).rejects.toThrow("Last name is required");

    await expect(
      testBackend.mutation(api.rsvps.submitGuestRequest, {
        eventId,
        siteKey: "club-chlorine",
        listKey: "ga",
        firstName: "Ava",
        lastName: "",
        phone: "+13104996272",
        shareContact: true,
        attendees: 1,
        customFields: {},
        socialProfiles: [],
      }),
    ).rejects.toThrow("Last name is required");
  });

  it("does not overwrite existing entered user names with later RSVP names", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_existing_name", "+13104996272"),
    );

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: "user_existing_name",
        phone: "+13104996272",
        firstName: "Existing",
        lastName: "Person",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await authedBackend.mutation(api.rsvps.submitRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Mina",
      lastName: "Park",
      phone: "+13104996272",
      shareContact: true,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    await testBackend.run(async (databaseContext) => {
      const users = await databaseContext.db.query("users").collect();
      const user = users.find((userRecord) => userRecord.clerkUserId === "user_existing_name");
      expect(user?.firstName).toBe("Existing");
      expect(user?.lastName).toBe("Person");

      const rsvps = await databaseContext.db.query("rsvps").collect();
      const rsvp = rsvps.find(
        (rsvpRecord) =>
          rsvpRecord.eventId === eventId && rsvpRecord.clerkUserId === "user_existing_name",
      );
      expect(rsvp?.userName).toBe("Existing Person");
    });
  });

  it("fills missing stored name pieces from RSVP submissions without later overwrites", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_partial_name", "+13104996272"),
    );

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: "user_partial_name",
        phone: "+13104996272",
        firstName: "Existing",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await authedBackend.mutation(api.rsvps.submitRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Mina",
      lastName: "Park",
      phone: "+13104996272",
      shareContact: true,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    await authedBackend.mutation(api.rsvps.submitRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Nova",
      lastName: "Stone",
      phone: "+13104996272",
      shareContact: true,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    await testBackend.run(async (databaseContext) => {
      const users = await databaseContext.db.query("users").collect();
      const user = users.find((userRecord) => userRecord.clerkUserId === "user_partial_name");
      expect(user?.firstName).toBe("Existing");
      expect(user?.lastName).toBe("Park");

      const rsvps = await databaseContext.db.query("rsvps").collect();
      const rsvp = rsvps.find(
        (rsvpRecord) =>
          rsvpRecord.eventId === eventId && rsvpRecord.clerkUserId === "user_partial_name",
      );
      expect(rsvp?.userName).toBe("Existing Park");
    });
  });

  it("does not let phone-like profile data overwrite a claimed guest RSVP name", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);

    const result = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Ava",
      lastName: "Green",
      phone: "+13104996272",
      shareContact: true,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: "user_phone_metadata",
        phone: "+13104996272",
        firstName: "+13104996272",
        metadata: { name: "+13104996272" },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_phone_metadata", "+13104996272"),
    );
    await authedBackend.mutation(api.rsvps.claimGuestRsvpsForCurrentUser, {});

    await testBackend.run(async (databaseContext) => {
      const claimedRsvp = await databaseContext.db.get(result.rsvpId);
      expect(claimedRsvp?.clerkUserId).toBe("user_phone_metadata");
      expect(claimedRsvp?.userName).toBe("Ava Green");

      const users = await databaseContext.db.query("users").collect();
      const user = users.find((userRecord) => userRecord.clerkUserId === "user_phone_metadata");
      expect(user?.firstName).toBe("Ava");
      expect(user?.lastName).toBe("Green");
      expect(user?.phone).toBe("+13104996272");
    });
  });
});
