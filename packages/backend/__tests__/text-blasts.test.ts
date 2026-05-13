import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/lib/qrCodeGenerator.ts": () => import("../convex/lib/qrCodeGenerator"),
  "../convex/sms.ts": () => import("../convex/sms"),
  "../convex/smsActions.ts": () => import("../convex/smsActions"),
  "../convex/textBlasts.ts": () => import("../convex/textBlasts"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

type TestBackend = ReturnType<typeof convexTest>;

const WORKSPACE_SLUG = "dojo-pomodoro";
const SITE_KEY = "dojo";
const CLERK_ORGANIZATION_ID = "org_dojo";

function createWorkspaceIdentity(subject: string): Partial<UserIdentity> {
  return {
    subject,
    org_id: CLERK_ORGANIZATION_ID,
    role: "org:admin",
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

async function seedEvent(testBackend: TestBackend, name: string) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("events", {
      workspaceSlug: WORKSPACE_SLUG,
      siteKey: SITE_KEY,
      name,
      location: "Test Venue",
      eventDate: Date.now() + 86_400_000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedUser(
  testBackend: TestBackend,
  clerkUserId: string,
  phone: string,
  firstName: string,
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
    listKey: string;
    status?: "pending" | "approved" | "denied";
    smsConsent?: boolean;
    customFieldValues?: Record<string, string>;
    createdAt?: number;
  },
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("rsvps", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey,
      userName: args.clerkUserId,
      shareContact: true,
      smsConsent: args.smsConsent ?? true,
      customFieldValues: args.customFieldValues,
      status: args.status ?? "approved",
      approvalStatus: args.status ?? "approved",
      createdAt: args.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedTextBlast(testBackend: TestBackend, eventId: Id<"events">, name: string) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("textBlasts", {
      eventId,
      targetEventIds: [eventId],
      name,
      message: "Test",
      targetLists: ["vip"],
      includeQrCodes: false,
      deliveryTrackingEnabled: true,
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      sentBy: "host_1",
      status: "sent",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedDelivery(
  testBackend: TestBackend,
  args: {
    textBlastId: Id<"textBlasts">;
    phone: string;
    status: "pending" | "sent" | "failed";
    eventId: Id<"events">;
    rsvpId: Id<"rsvps">;
    clerkUserId: string;
    listKey: string;
  },
) {
  const { phoneHash } = await normalizeAndHashPhoneNumber(args.phone);
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("textBlastRecipients", {
      textBlastId: args.textBlastId,
      phoneHash,
      status: args.status,
      sourceEventIds: [args.eventId],
      sourceRsvpIds: [args.rsvpId],
      sourceListKeys: [args.listKey],
      recipientClerkUserIds: [args.clerkUserId],
      sentAt: args.status === "sent" ? Date.now() : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedApprovalSmsNotification(
  testBackend: TestBackend,
  args: {
    eventId: Id<"events">;
    clerkUserId: string;
    status: "pending" | "sent" | "failed";
  },
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("smsNotifications", {
      eventId: args.eventId,
      recipientClerkUserId: args.clerkUserId,
      recipientPhoneObfuscated: "+1-***-***-0000",
      type: "approval",
      message: "Approved",
      status: args.status,
      sentAt: args.status === "sent" ? Date.now() : undefined,
      createdAt: Date.now(),
    });
  });
}

async function seedRedemption(
  testBackend: TestBackend,
  args: {
    eventId: Id<"events">;
    clerkUserId: string;
    listKey: string;
    code: string;
  },
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("redemptions", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey,
      code: args.code,
      unredeemHistory: [],
      createdAt: Date.now(),
    });
  });
}

async function seedMultiEventRecipients(testBackend: TestBackend) {
  const firstEventId = await seedEvent(testBackend, "First Event");
  const secondEventId = await seedEvent(testBackend, "Second Event");
  await seedUser(testBackend, "user_same", "555-111-2222", "Same");
  await seedUser(testBackend, "user_shared_phone", "(555) 111-2222", "Shared");
  await seedUser(testBackend, "user_unique", "555-333-4444", "Unique");
  await seedUser(testBackend, "user_retry", "555-444-5555", "Retry");

  const firstRsvpId = await seedRsvp(testBackend, {
    eventId: firstEventId,
    clerkUserId: "user_same",
    listKey: "vip",
  });
  await seedRsvp(testBackend, {
    eventId: secondEventId,
    clerkUserId: "user_same",
    listKey: "vip",
  });
  await seedRsvp(testBackend, {
    eventId: secondEventId,
    clerkUserId: "user_shared_phone",
    listKey: "vip",
  });
  const uniqueRsvpId = await seedRsvp(testBackend, {
    eventId: secondEventId,
    clerkUserId: "user_unique",
    listKey: "ga",
  });
  const retryRsvpId = await seedRsvp(testBackend, {
    eventId: firstEventId,
    clerkUserId: "user_retry",
    listKey: "vip",
  });

  return {
    firstEventId,
    secondEventId,
    firstRsvpId,
    uniqueRsvpId,
    retryRsvpId,
  };
}

describe("text blast recipient selection", () => {
  it("dedupes multi-event recipients by normalized phone across users and events", async () => {
    const testBackend = convexTest(schema, convexModules);
    const { firstEventId, secondEventId } = await seedMultiEventRecipients(testBackend);

    const vipRecipientCount = await testBackend.query(internal.textBlasts.countRecipientsInternal, {
      eventId: firstEventId,
      targetEventIds: [firstEventId, secondEventId],
      targetLists: ["vip"],
    });
    const allRecipientCount = await testBackend.query(internal.textBlasts.countRecipientsInternal, {
      eventId: firstEventId,
      targetEventIds: [firstEventId, secondEventId],
      targetLists: ["vip", "ga"],
    });

    expect(vipRecipientCount).toBe(2);
    expect(allRecipientCount).toBe(3);
  });

  it("targets approved RSVPs with a sent approval SMS for the same event", async () => {
    const testBackend = convexTest(schema, convexModules);
    const eventId = await seedEvent(testBackend, "Approval SMS Event");

    await seedUser(testBackend, "user_sent", "555-100-0001", "Sent");
    await seedUser(testBackend, "user_failed", "555-100-0002", "Failed");
    await seedUser(testBackend, "user_pending", "555-100-0003", "Pending");
    await seedUser(testBackend, "user_denied", "555-100-0004", "Denied");

    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_sent",
      listKey: "vip",
    });
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_failed",
      listKey: "vip",
    });
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_pending",
      listKey: "vip",
    });
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_denied",
      listKey: "vip",
      status: "denied",
    });
    await seedApprovalSmsNotification(testBackend, {
      eventId,
      clerkUserId: "user_sent",
      status: "sent",
    });
    await seedApprovalSmsNotification(testBackend, {
      eventId,
      clerkUserId: "user_failed",
      status: "failed",
    });
    await seedApprovalSmsNotification(testBackend, {
      eventId,
      clerkUserId: "user_pending",
      status: "pending",
    });
    await seedApprovalSmsNotification(testBackend, {
      eventId,
      clerkUserId: "user_denied",
      status: "sent",
    });

    const withApprovalSmsCount = await testBackend.query(
      internal.textBlasts.countRecipientsInternal,
      {
        eventId,
        targetLists: ["vip"],
        recipientFilter: "approved_with_approval_sms",
      },
    );
    const withoutApprovalSmsCount = await testBackend.query(
      internal.textBlasts.countRecipientsInternal,
      {
        eventId,
        targetLists: ["vip"],
        recipientFilter: "approved_no_approval_sms",
      },
    );

    expect(withApprovalSmsCount).toBe(1);
    expect(withoutApprovalSmsCount).toBe(2);
  });

  it("dedupes multi-event approved-with-approval-SMS recipients when any selected RSVP qualifies", async () => {
    const testBackend = convexTest(schema, convexModules);
    const { firstEventId, secondEventId } = await seedMultiEventRecipients(testBackend);
    await seedApprovalSmsNotification(testBackend, {
      eventId: secondEventId,
      clerkUserId: "user_same",
      status: "sent",
    });

    const recipientCount = await testBackend.query(internal.textBlasts.countRecipientsInternal, {
      eventId: firstEventId,
      targetEventIds: [firstEventId, secondEventId],
      targetLists: ["vip"],
      recipientFilter: "approved_with_approval_sms",
    });

    expect(recipientCount).toBe(1);
  });

  it("filters history by sent delivery rows only", async () => {
    const testBackend = convexTest(schema, convexModules);
    const { firstEventId, secondEventId, firstRsvpId, uniqueRsvpId } =
      await seedMultiEventRecipients(testBackend);
    const trackedBlastId = await seedTextBlast(testBackend, firstEventId, "Tracked blast");
    await seedDelivery(testBackend, {
      textBlastId: trackedBlastId,
      phone: "555-111-2222",
      status: "sent",
      eventId: firstEventId,
      rsvpId: firstRsvpId,
      clerkUserId: "user_same",
      listKey: "vip",
    });
    await seedDelivery(testBackend, {
      textBlastId: trackedBlastId,
      phone: "555-333-4444",
      status: "failed",
      eventId: secondEventId,
      rsvpId: uniqueRsvpId,
      clerkUserId: "user_unique",
      listKey: "ga",
    });

    const receivedAnyCount = await testBackend.query(internal.textBlasts.countRecipientsInternal, {
      eventId: firstEventId,
      targetEventIds: [firstEventId, secondEventId],
      targetLists: ["vip", "ga"],
      recipientHistoryFilter: {
        type: "received_any",
        textBlastIds: [trackedBlastId],
      },
    });
    const notReceivedAnyCount = await testBackend.query(
      internal.textBlasts.countRecipientsInternal,
      {
        eventId: firstEventId,
        targetEventIds: [firstEventId, secondEventId],
        targetLists: ["vip", "ga"],
        recipientHistoryFilter: {
          type: "not_received_any",
          textBlastIds: [trackedBlastId],
        },
      },
    );

    expect(receivedAnyCount).toBe(1);
    expect(notReceivedAnyCount).toBe(2);
  });

  it("skips phone hashes already marked sent when preparing a retry", async () => {
    const testBackend = convexTest(schema, convexModules);
    const { firstEventId, secondEventId, firstRsvpId, uniqueRsvpId } =
      await seedMultiEventRecipients(testBackend);
    const retryBlastId = await seedTextBlast(testBackend, firstEventId, "Retry blast");
    await seedDelivery(testBackend, {
      textBlastId: retryBlastId,
      phone: "555-111-2222",
      status: "sent",
      eventId: firstEventId,
      rsvpId: firstRsvpId,
      clerkUserId: "user_same",
      listKey: "vip",
    });
    await seedDelivery(testBackend, {
      textBlastId: retryBlastId,
      phone: "555-333-4444",
      status: "failed",
      eventId: secondEventId,
      rsvpId: uniqueRsvpId,
      clerkUserId: "user_unique",
      listKey: "ga",
    });

    const retryRecipients = await testBackend.action(
      internal.textBlasts.getRecipientsWithPhonesInternal,
      {
        eventId: firstEventId,
        targetEventIds: [firstEventId, secondEventId],
        targetLists: ["vip", "ga"],
        textBlastId: retryBlastId,
        skipAlreadySentForBlast: true,
      },
    );

    expect(retryRecipients.map((recipient) => recipient.phoneObfuscated).sort()).toEqual([
      "+1-***-***-4444",
      "+1-***-***-5555",
    ]);
  });

  it("stores single-event drafts with QR enabled when the message contains the QR URL variable", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "QR Draft Event");
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    const draftId = await hostBackend.mutation(api.textBlasts.createDraft, {
      eventId,
      targetEventIds: [eventId],
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
      name: "QR draft",
      message: "Your ticket: {{ qrCodeUrl }}",
      targetLists: ["vip"],
      includeQrCodes: false,
    });
    const initialDraft = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.get(draftId);
    });

    expect(initialDraft?.includeQrCodes).toBe(true);

    const plainDraftId = await hostBackend.mutation(api.textBlasts.createDraft, {
      eventId,
      targetEventIds: [eventId],
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
      name: "Plain draft",
      message: "No QR yet",
      targetLists: ["vip"],
      includeQrCodes: false,
    });
    await hostBackend.mutation(api.textBlasts.updateDraft, {
      blastId: plainDraftId,
      eventId,
      targetEventIds: [eventId],
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
      name: "Plain draft",
      message: "Updated ticket: {{qrCodeUrl}}",
      targetLists: ["vip"],
      includeQrCodes: false,
    });
    const updatedDraft = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.get(plainDraftId);
    });

    expect(updatedDraft?.includeQrCodes).toBe(true);
  });

  it("rejects multi-event drafts that contain the QR URL variable", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedWorkspace(testBackend);
    const firstEventId = await seedEvent(testBackend, "First QR Event");
    const secondEventId = await seedEvent(testBackend, "Second QR Event");
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    await expect(
      hostBackend.mutation(api.textBlasts.createDraft, {
        eventId: firstEventId,
        targetEventIds: [firstEventId, secondEventId],
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
        name: "Invalid QR draft",
        message: "Your ticket: {{ qrCodeUrl }}",
        targetLists: ["vip"],
        includeQrCodes: false,
      }),
    ).rejects.toThrow("Multi-event text blasts can only use {{firstName}}");
  });

  it("sends direct single-event blasts with QR enabled when the message contains the QR URL variable", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "QR Send Event");
    await seedUser(testBackend, "user_qr", "555-777-8888", "Quinn");
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_qr",
      listKey: "vip",
    });
    await seedRedemption(testBackend, {
      eventId,
      clerkUserId: "user_qr",
      listKey: "vip",
      code: "qr-test-code",
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));
    const previousDevTwilioEnabled = process.env.DEV_TWILIO_ENABLED;
    process.env.DEV_TWILIO_ENABLED = "false";

    try {
      await expect(
        hostBackend.action(api.textBlasts.sendBlastDirect, {
          eventId,
          targetEventIds: [eventId],
          siteKey: SITE_KEY,
          workspaceSlug: WORKSPACE_SLUG,
          name: "QR direct send",
          message: "Hi {{firstName}}, your ticket is {{ qrCodeUrl }}",
          targetLists: ["vip"],
          includeQrCodes: false,
        }),
      ).rejects.toThrow("Failed to send text blast");
    } finally {
      if (previousDevTwilioEnabled === undefined) {
        delete process.env.DEV_TWILIO_ENABLED;
      } else {
        process.env.DEV_TWILIO_ENABLED = previousDevTwilioEnabled;
      }
    }

    const sendState = await testBackend.run(async (databaseContext) => {
      const blasts = await databaseContext.db.query("textBlasts").collect();
      const notifications = await databaseContext.db.query("smsNotifications").collect();
      return { blasts, notifications };
    });

    expect(sendState.blasts).toHaveLength(1);
    expect(sendState.blasts[0].includeQrCodes).toBe(true);
    expect(sendState.notifications[0].message).toContain(
      "https://dojopomodoro.club/redeem/qr-test-code",
    );
  });
});
