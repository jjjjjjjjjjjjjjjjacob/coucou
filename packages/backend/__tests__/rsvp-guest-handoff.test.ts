import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  vi.useFakeTimers();
});

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

async function settleScheduledFunctionWork() {
  for (let yieldIteration = 0; yieldIteration < 20; yieldIteration++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function drainScheduledFunctions(testBackend: TestBackend) {
  for (let drainIteration = 0; drainIteration < 100; drainIteration++) {
    await settleScheduledFunctionWork();
    await testBackend.finishInProgressScheduledFunctions();
    await settleScheduledFunctionWork();
    if (vi.getTimerCount() === 0) {
      return;
    }
    vi.advanceTimersToNextTimer();
  }
  throw new Error("drainScheduledFunctions: too many iterations");
}

// Mutations here fire-and-forget SMS notification actions via the scheduler.
// Keep those timers under test control and drain them serially so no write can
// land after this file's convex-test backend has been replaced.
afterEach(async () => {
  try {
    for (const testBackend of activeTestBackends.splice(0)) {
      await drainScheduledFunctions(testBackend);
    }
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
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

async function seedWorkspaceActiveEvent(
  testBackend: TestBackend,
  {
    workspaceSlug,
    workspaceName,
    siteKey,
  }: {
    workspaceSlug: string;
    workspaceName: string;
    siteKey: string;
  },
): Promise<Id<"events">> {
  return await testBackend.run(async (databaseContext) => {
    const now = Date.now();
    const workspaceId = await databaseContext.db.insert("workspaces", {
      slug: workspaceSlug,
      name: workspaceName,
      createdAt: now,
      updatedAt: now,
    });
    await databaseContext.db.insert("workspaceSites", {
      workspaceId,
      siteKey,
      domain: `${workspaceSlug}.example.com`,
      appKind: "test",
      createdAt: now,
      updatedAt: now,
    });
    return await databaseContext.db.insert("events", {
      workspaceSlug,
      siteKey,
      shortId: `${workspaceSlug}-event`,
      name: `${workspaceName} Event`,
      hosts: [workspaceName],
      location: "Main Room",
      eventDate: now + 60 * 60 * 1000,
      status: "active",
      maxAttendees: 2,
      createdAt: now,
      updatedAt: now,
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
            organizerName: "Club Chlorine",
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

  it("sends configured RSVP confirmations without repeating organizer opt-in confirmation", async () => {
    const testBackend = setupTestBackend();
    const firstEventId = await seedActiveEvent(testBackend);
    const secondEventId = await seedActiveEvent(testBackend);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(firstEventId, {
        name: "First Guest Night",
        rsvpConfirmationMessage: "Hi {{firstName}}, we received your RSVP for {{eventName}}.",
      });
      await databaseContext.db.patch(secondEventId, {
        name: "Second Guest Night",
        rsvpConfirmationMessage: "Welcome back, {{firstName}}. Your {{eventName}} RSVP is pending.",
      });
    });

    const submissionArgs = {
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Ava",
      lastName: "Green",
      phone: "(310) 499-6272",
      shareContact: true,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    };
    await testBackend.mutation(api.rsvps.submitGuestRequest, {
      ...submissionArgs,
      eventId: firstEventId,
      smsConsent: true,
    });
    await testBackend.mutation(api.rsvps.submitGuestRequest, {
      ...submissionArgs,
      eventId: secondEventId,
    });

    const scheduledFunctions = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.system.query("_scheduled_functions").collect();
    });
    const consentStatusMessages = scheduledFunctions.filter(
      (scheduledFunction) => scheduledFunction.name === "notifications:sendSmsConsentStatusMessage",
    );
    const rsvpConfirmationMessages = scheduledFunctions.filter(
      (scheduledFunction) => scheduledFunction.name === "notifications:sendRsvpConfirmationSms",
    );

    expect(consentStatusMessages).toHaveLength(1);
    expect(rsvpConfirmationMessages).toHaveLength(2);
    const secondEventRsvp = await testBackend.run(async (databaseContext) => {
      const rsvps = await databaseContext.db.query("rsvps").collect();
      return rsvps.find((rsvp) => rsvp.eventId === secondEventId) ?? null;
    });
    expect(secondEventRsvp?.smsConsent).toBe(true);
    expect(rsvpConfirmationMessages.map((scheduledFunction) => scheduledFunction.args)).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            eventId: firstEventId,
            message: "CLUB CHLORINE: Hi Ava, we received your RSVP for First Guest Night.",
          }),
        ],
        [
          expect.objectContaining({
            eventId: secondEventId,
            message: "CLUB CHLORINE: Welcome back, Ava. Your Second Guest Night RSVP is pending.",
          }),
        ],
      ]),
    );
  });

  it("auto-approves only the first configured submissions across signed-in and guest web flows", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    const listCredentialId = await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "manually_approved_user",
        listKey: "ga",
        userName: "Manual Guest",
        shareContact: false,
        attendees: 1,
        status: "approved",
        approvalStatus: "approved",
        attendanceStatus: "yes",
        createdAt: now,
        updatedAt: now,
      });
      return await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "ga",
        autoApproveLimit: 2,
        createdAt: now,
      });
    });

    const firstSubmission = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "First",
      lastName: "Guest",
      phone: "+13104996271",
      shareContact: false,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });
    const signedInBackend = testBackend.withIdentity(
      createPhoneIdentity("signed_in_auto_approval", "+13104996272"),
    );
    await signedInBackend.mutation(api.rsvps.submitRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Second",
      lastName: "Guest",
      phone: "+13104996272",
      shareContact: false,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });
    const thirdSubmission = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Third",
      lastName: "Guest",
      phone: "+13104996273",
      shareContact: false,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    await testBackend.run(async (databaseContext) => {
      const firstRsvp = await databaseContext.db.get(firstSubmission.rsvpId);
      const thirdRsvp = await databaseContext.db.get(thirdSubmission.rsvpId);
      const allRsvps = await databaseContext.db.query("rsvps").collect();
      const signedInRsvp = allRsvps.find(
        (rsvp) => rsvp.eventId === eventId && rsvp.clerkUserId === "signed_in_auto_approval",
      );
      const listCredential = await databaseContext.db.get(listCredentialId);
      const automaticApprovals = (await databaseContext.db.query("approvals").collect()).filter(
        (approval) => approval.decidedBy === "system:auto-approve",
      );
      const redemptions = await databaseContext.db.query("redemptions").collect();

      expect(firstRsvp?.approvalStatus).toBe("approved");
      expect(firstRsvp?.ticketStatus).toBe("issued");
      expect(signedInRsvp?.approvalStatus).toBe("approved");
      expect(signedInRsvp?.ticketStatus).toBe("issued");
      expect(thirdRsvp?.approvalStatus).toBe("pending");
      expect(thirdRsvp?.ticketStatus).toBe("not-issued");
      expect(listCredential?.autoApprovedCount).toBe(2);
      expect(automaticApprovals).toHaveLength(2);
      expect(redemptions).toHaveLength(2);
    });
  });

  it("keeps an RSVP pending until its configured auto-approval delay elapses", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    const listCredentialId = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "ga",
        autoApproveLimit: 1,
        autoApproveDelayMinutes: 15,
        createdAt: Date.now(),
      });
    });

    const submission = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Delayed",
      lastName: "Guest",
      phone: "+13104996281",
      shareContact: false,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    expect((await getRsvp(testBackend, submission.rsvpId))?.approvalStatus).toBe("pending");
    expect(
      await testBackend.run(async (databaseContext) => {
        return (await databaseContext.db.get(listCredentialId))?.autoApprovedCount;
      }),
    ).toBe(1);

    await vi.advanceTimersByTimeAsync(14 * 60 * 1000);
    await settleScheduledFunctionWork();
    await testBackend.finishInProgressScheduledFunctions();
    expect((await getRsvp(testBackend, submission.rsvpId))?.approvalStatus).toBe("pending");

    await vi.advanceTimersByTimeAsync(60 * 1000);
    await settleScheduledFunctionWork();
    await testBackend.finishInProgressScheduledFunctions();

    const approvedRsvp = await getRsvp(testBackend, submission.rsvpId);
    expect(approvedRsvp?.approvalStatus).toBe("approved");
    expect(approvedRsvp?.ticketStatus).toBe("issued");
  });

  it("caps a delayed auto-approval at the event start time", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "ga",
        autoApproveLimit: 1,
        autoApproveDelayMinutes: 120,
        createdAt: Date.now(),
      });
    });

    const submission = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Event",
      lastName: "Start",
      phone: "+13104996282",
      shareContact: false,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
    await settleScheduledFunctionWork();
    await testBackend.finishInProgressScheduledFunctions();
    expect((await getRsvp(testBackend, submission.rsvpId))?.approvalStatus).toBe("pending");

    await vi.advanceTimersByTimeAsync(60 * 1000);
    await settleScheduledFunctionWork();
    await testBackend.finishInProgressScheduledFunctions();
    expect((await getRsvp(testBackend, submission.rsvpId))?.approvalStatus).toBe("approved");
  });

  it("does not reopen an automatic-approval slot when an approved RSVP is deleted", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "ga",
        autoApproveLimit: 1,
        createdAt: Date.now(),
      });
    });

    const firstSubmission = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "First",
      lastName: "Guest",
      phone: "+13104996274",
      shareContact: false,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.delete(firstSubmission.rsvpId);
    });
    const secondSubmission = await testBackend.mutation(api.rsvps.submitGuestRequest, {
      eventId,
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Later",
      lastName: "Guest",
      phone: "+13104996275",
      shareContact: false,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    });

    const secondRsvp = await getRsvp(testBackend, secondSubmission.rsvpId);
    expect(secondRsvp?.approvalStatus).toBe("pending");
  });

  it("does not exceed the list limit when submissions arrive concurrently", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    const listCredentialId = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "ga",
        autoApproveLimit: 1,
        createdAt: Date.now(),
      });
    });

    const submissionArguments = [
      { firstName: "Concurrent", lastName: "One", phone: "+13104996276" },
      { firstName: "Concurrent", lastName: "Two", phone: "+13104996277" },
    ] as const;
    const submissionResults = await Promise.all(
      submissionArguments.map((submission) =>
        testBackend.mutation(api.rsvps.submitGuestRequest, {
          eventId,
          siteKey: "club-chlorine",
          listKey: "ga",
          ...submission,
          shareContact: false,
          attendees: 1,
          customFields: {},
          socialProfiles: [],
        }),
      ),
    );

    await testBackend.run(async (databaseContext) => {
      const submittedRsvps = await Promise.all(
        submissionResults.map((submission) => databaseContext.db.get(submission.rsvpId)),
      );
      const listCredential = await databaseContext.db.get(listCredentialId);
      expect(submittedRsvps.filter((rsvp) => rsvp?.approvalStatus === "approved")).toHaveLength(1);
      expect(submittedRsvps.filter((rsvp) => rsvp?.approvalStatus === "pending")).toHaveLength(1);
      expect(listCredential?.autoApprovedCount).toBe(1);
    });
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

  it("sends enrollment again after an organizer opt-out and re-enrollment", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedActiveEvent(testBackend);
    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_sms_reenrollment", "+13104996272"),
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
      smsConsent: true,
      customFields: {},
      socialProfiles: [],
    });
    const rsvp = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", eventId).eq("clerkUserId", "user_sms_reenrollment"),
        )
        .unique();
    });
    if (!rsvp) throw new Error("Expected RSVP for SMS re-enrollment test");

    await authedBackend.mutation(api.rsvps.updateSmsPreference, {
      rsvpId: rsvp._id,
      smsConsent: false,
    });
    await authedBackend.mutation(api.rsvps.updateSmsPreference, {
      rsvpId: rsvp._id,
      smsConsent: true,
    });

    const consentTransitions = await testBackend.run(async (databaseContext) => {
      const scheduledFunctions = await databaseContext.db.system
        .query("_scheduled_functions")
        .collect();
      return scheduledFunctions
        .filter(
          (scheduledFunction) =>
            scheduledFunction.name === "notifications:sendSmsConsentStatusMessage",
        )
        .map((scheduledFunction) => scheduledFunction.args[0]?.consentEnabled);
    });
    expect(consentTransitions).toEqual([true, false, true]);
  });

  it("does not repeat enrollment when another event has stale per-event consent", async () => {
    const testBackend = setupTestBackend();
    const firstEventId = await seedActiveEvent(testBackend);
    const secondEventId = await seedActiveEvent(testBackend);
    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_stale_event_consent", "+13104996272"),
    );
    const submissionArgs = {
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Mina",
      lastName: "Park",
      phone: "+13104996272",
      shareContact: true,
      attendees: 1,
      smsConsent: false,
      customFields: {},
      socialProfiles: [],
    };

    await authedBackend.mutation(api.rsvps.submitRequest, {
      ...submissionArgs,
      eventId: firstEventId,
    });
    await authedBackend.mutation(api.rsvps.submitRequest, {
      ...submissionArgs,
      eventId: secondEventId,
    });
    const [firstRsvp, secondRsvp] = await testBackend.run(async (databaseContext) => {
      const rsvps = await databaseContext.db.query("rsvps").collect();
      return [
        rsvps.find((rsvp) => rsvp.eventId === firstEventId),
        rsvps.find((rsvp) => rsvp.eventId === secondEventId),
      ];
    });
    if (!firstRsvp || !secondRsvp) throw new Error("Expected both workspace RSVPs");

    await authedBackend.mutation(api.rsvps.updateSmsPreference, {
      rsvpId: firstRsvp._id,
      smsConsent: true,
    });
    await authedBackend.mutation(api.rsvps.updateSmsPreference, {
      rsvpId: secondRsvp._id,
      smsConsent: true,
    });

    const enabledMessages = await testBackend.run(async (databaseContext) => {
      const scheduledFunctions = await databaseContext.db.system
        .query("_scheduled_functions")
        .collect();
      return scheduledFunctions.filter(
        (scheduledFunction) =>
          scheduledFunction.name === "notifications:sendSmsConsentStatusMessage" &&
          scheduledFunction.args[0]?.consentEnabled === true,
      );
    });
    expect(enabledMessages).toHaveLength(1);
  });

  it("keeps enrollment independent between workspaces", async () => {
    const testBackend = setupTestBackend();
    const clubEventId = await seedWorkspaceActiveEvent(testBackend, {
      workspaceSlug: "club-chlorine",
      workspaceName: "Club Chlorine",
      siteKey: "club-chlorine",
    });
    const danzaEventId = await seedWorkspaceActiveEvent(testBackend, {
      workspaceSlug: "danza-organica",
      workspaceName: "Danza Organica",
      siteKey: "danza-organica",
    });
    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_multi_workspace", "+13104996272"),
    );
    const submissionArgs = {
      listKey: "ga",
      firstName: "Mina",
      lastName: "Park",
      phone: "+13104996272",
      shareContact: true,
      attendees: 1,
      smsConsent: true,
      customFields: {},
      socialProfiles: [],
    };

    await authedBackend.mutation(api.rsvps.submitRequest, {
      ...submissionArgs,
      eventId: clubEventId,
      siteKey: "club-chlorine",
    });
    await authedBackend.mutation(api.rsvps.submitRequest, {
      ...submissionArgs,
      eventId: danzaEventId,
      siteKey: "danza-organica",
    });

    const organizerNames = await testBackend.run(async (databaseContext) => {
      const scheduledFunctions = await databaseContext.db.system
        .query("_scheduled_functions")
        .collect();
      return scheduledFunctions
        .filter(
          (scheduledFunction) =>
            scheduledFunction.name === "notifications:sendSmsConsentStatusMessage" &&
            scheduledFunction.args[0]?.consentEnabled === true,
        )
        .map((scheduledFunction) => scheduledFunction.args[0]?.organizerName);
    });
    expect(organizerNames).toEqual(["Club Chlorine", "Danza Organica"]);
  });

  it("inherits organizer SMS consent only when a future-event RSVP is submitted", async () => {
    const testBackend = setupTestBackend();
    const firstEventId = await seedActiveEvent(testBackend);
    const futureEventId = await seedActiveEvent(testBackend);
    const optedOutEventId = await seedActiveEvent(testBackend);
    const authedBackend = testBackend.withIdentity(
      createPhoneIdentity("user_future_sms_preference", "+13104996272"),
    );
    const submissionArgs = {
      siteKey: "club-chlorine",
      listKey: "ga",
      firstName: "Mina",
      lastName: "Park",
      phone: "+13104996272",
      shareContact: true,
      attendees: 1,
      customFields: {},
      socialProfiles: [],
    };

    await authedBackend.mutation(api.rsvps.submitRequest, {
      ...submissionArgs,
      eventId: firstEventId,
      smsConsent: true,
      smsConsentIpAddress: "203.0.113.10",
    });

    const futureRsvpBeforeSubmission = await testBackend.run(async (databaseContext) => {
      const rsvps = await databaseContext.db.query("rsvps").collect();
      return rsvps.find((rsvp) => rsvp.eventId === futureEventId) ?? null;
    });
    expect(futureRsvpBeforeSubmission).toBeNull();

    await authedBackend.mutation(api.rsvps.submitRequest, {
      ...submissionArgs,
      eventId: futureEventId,
    });
    const inheritedFutureRsvp = await testBackend.run(async (databaseContext) => {
      const rsvps = await databaseContext.db.query("rsvps").collect();
      return rsvps.find((rsvp) => rsvp.eventId === futureEventId) ?? null;
    });
    expect(inheritedFutureRsvp?.smsConsent).toBe(true);
    expect(inheritedFutureRsvp?.smsConsentIpAddress).toBe("203.0.113.10");

    await authedBackend.mutation(api.rsvps.submitRequest, {
      ...submissionArgs,
      eventId: optedOutEventId,
      smsConsent: false,
    });
    const explicitlyOptedOutRsvp = await testBackend.run(async (databaseContext) => {
      const rsvps = await databaseContext.db.query("rsvps").collect();
      return rsvps.find((rsvp) => rsvp.eventId === optedOutEventId) ?? null;
    });
    const organizerPreference = await authedBackend.query(api.rsvps.smsPreferenceForUserEvent, {
      eventId: futureEventId,
      siteKey: "club-chlorine",
    });

    expect(explicitlyOptedOutRsvp?.smsConsent).toBe(false);
    expect(organizerPreference?.smsConsent).toBe(false);
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
