import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/events.ts": () => import("../convex/events"),
  "../convex/lib/qrCodeGenerator.ts": () => import("../convex/lib/qrCodeGenerator"),
  "../convex/qrDelivery.ts": () => import("../convex/qrDelivery"),
  "../convex/sms.ts": () => import("../convex/sms"),
  "../convex/smsActions.ts": () => import("../convex/smsActions"),
  "../convex/smsConversations.ts": () => import("../convex/smsConversations"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

const WORKSPACE_SLUG = "dojo-pomodoro";
const SITE_KEY = "dojo";
const CLERK_ORGANIZATION_ID = "org_dojo";

type TestBackend = ReturnType<typeof convexTest>;

async function seedQrRecipient(
  testBackend: TestBackend,
  args: {
    eventId: Id<"events">;
    clerkUserId: string;
    phone?: string;
    smsConsent: boolean;
    qrDeliveredAt?: number;
  },
): Promise<Id<"rsvps">> {
  return await testBackend.run(async (databaseContext) => {
    if (args.phone) {
      await databaseContext.db.insert("users", {
        clerkUserId: args.clerkUserId,
        firstName: args.clerkUserId,
        phone: args.phone,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    const rsvpId = await databaseContext.db.insert("rsvps", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: "vip",
      userName: args.clerkUserId,
      shareContact: true,
      smsConsent: args.smsConsent,
      status: "approved",
      approvalStatus: "approved",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await databaseContext.db.insert("redemptions", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: "vip",
      code: `ticket-${args.clerkUserId}`,
      qrDeliveredAt: args.qrDeliveredAt,
      unredeemHistory: [],
      createdAt: Date.now(),
    });
    return rsvpId;
  });
}

describe("QR delivery eligibility", () => {
  it("counts only consented, sendable, non-opted-out guests who have not received a QR", async () => {
    const testBackend = convexTest(schema, convexModules);
    const eventId = await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("workspaces", {
        slug: WORKSPACE_SLUG,
        name: "Dojo Pomodoro",
        clerkOrganizationId: CLERK_ORGANIZATION_ID,
        clerkOrganizationSlug: WORKSPACE_SLUG,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const insertedEventId = await databaseContext.db.insert("events", {
        workspaceSlug: WORKSPACE_SLUG,
        siteKey: SITE_KEY,
        name: "QR Night",
        location: "Test Venue",
        eventDate: Date.now() + 86_400_000,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await databaseContext.db.insert("listCredentials", {
        eventId: insertedEventId,
        listKey: "vip",
        generateQR: true,
        createdAt: Date.now(),
      });
      return insertedEventId;
    });
    const eligibleRsvpId = await seedQrRecipient(testBackend, {
      eventId,
      clerkUserId: "eligible",
      phone: "555-111-1001",
      smsConsent: true,
    });
    await seedQrRecipient(testBackend, {
      eventId,
      clerkUserId: "no-consent",
      phone: "555-111-1002",
      smsConsent: false,
    });
    await seedQrRecipient(testBackend, {
      eventId,
      clerkUserId: "no-phone",
      smsConsent: true,
    });
    const previouslyDeliveredRsvpId = await seedQrRecipient(testBackend, {
      eventId,
      clerkUserId: "already-delivered",
      phone: "555-111-1003",
      smsConsent: true,
      qrDeliveredAt: Date.now(),
    });
    await seedQrRecipient(testBackend, {
      eventId,
      clerkUserId: "opted-out",
      phone: "555-111-1004",
      smsConsent: true,
    });
    const optedOutPhone = await normalizeAndHashPhoneNumber("555-111-1004");
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("smsOptOuts", {
        phoneNumber: optedOutPhone.phoneHash,
        clerkUserId: "opted-out",
        optedOutAt: Date.now(),
        reason: "user_request",
      });
    });

    const hostBackend = testBackend.withIdentity({
      subject: "host_1",
      org_id: CLERK_ORGANIZATION_ID,
      role: "org:admin",
    } as unknown as Partial<UserIdentity>);
    const recipients = await hostBackend.query(api.qrDelivery.listPendingDeferredRecipients, {
      eventId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });
    const count = await hostBackend.query(api.qrDelivery.countPendingDeferredRecipients, {
      eventId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });
    const resendRecipients = await hostBackend.query(api.qrDelivery.listPendingDeferredRecipients, {
      eventId,
      rsvpId: previouslyDeliveredRsvpId,
      includePreviouslyDelivered: true,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });

    expect(count).toBe(1);
    expect(recipients.map((recipient) => recipient.rsvpId)).toEqual([eligibleRsvpId]);
    expect(resendRecipients.map((recipient) => recipient.rsvpId)).toEqual([
      previouslyDeliveredRsvpId,
    ]);
  });

  it("does not mark a QR delivered when the SMS provider rejects the send", async () => {
    const testBackend = convexTest(schema, convexModules);
    const eventId = await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("workspaces", {
        slug: WORKSPACE_SLUG,
        name: "Dojo Pomodoro",
        clerkOrganizationId: CLERK_ORGANIZATION_ID,
        clerkOrganizationSlug: WORKSPACE_SLUG,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const insertedEventId = await databaseContext.db.insert("events", {
        workspaceSlug: WORKSPACE_SLUG,
        siteKey: SITE_KEY,
        name: "QR Failure Night",
        location: "Test Venue",
        eventDate: Date.now() + 86_400_000,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await databaseContext.db.insert("listCredentials", {
        eventId: insertedEventId,
        listKey: "vip",
        generateQR: true,
        createdAt: Date.now(),
      });
      return insertedEventId;
    });
    const rsvpId = await seedQrRecipient(testBackend, {
      eventId,
      clerkUserId: "provider-failure",
      phone: "555-111-2001",
      smsConsent: true,
    });
    const hostBackend = testBackend.withIdentity({
      subject: "host_1",
      org_id: CLERK_ORGANIZATION_ID,
      role: "org:admin",
    } as unknown as Partial<UserIdentity>);
    const previousDevTwilioEnabled = process.env.DEV_TWILIO_ENABLED;
    process.env.DEV_TWILIO_ENABLED = "false";

    try {
      const result = await hostBackend.action(api.qrDelivery.sendQrToRsvp, {
        eventId,
        rsvpId,
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
      });
      expect(result.sent).toBe(false);
      expect(result.errorCode).toBe("TWILIO_DISABLED");
    } finally {
      if (previousDevTwilioEnabled === undefined) {
        delete process.env.DEV_TWILIO_ENABLED;
      } else {
        process.env.DEV_TWILIO_ENABLED = previousDevTwilioEnabled;
      }
    }

    const records = await testBackend.run(async (databaseContext) => {
      const redemption = await databaseContext.db
        .query("redemptions")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", eventId).eq("clerkUserId", "provider-failure"),
        )
        .first();
      const notifications = await databaseContext.db.query("smsNotifications").collect();
      const conversationMessages = await databaseContext.db
        .query("smsConversationMessages")
        .collect();
      return { redemption, notifications, conversationMessages };
    });

    expect(records.redemption?.qrDeliveredAt).toBeUndefined();
    expect(records.notifications[0]).toMatchObject({
      status: "failed",
      errorCode: "TWILIO_DISABLED",
    });
    expect(records.conversationMessages[0]).toMatchObject({
      providerStatus: "failed",
      errorCode: "TWILIO_DISABLED",
    });
  });
});
