import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
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

function setupTestBackend(): TestBackend {
  const testBackend = convexTest(schema, convexModules);
  testBackend.registerComponent(
    "rsvpAggregate",
    aggregateComponentSchema,
    aggregateComponentModules,
  );
  return testBackend;
}

async function finishQueuedFunctions(testBackend: TestBackend) {
  for (let drainIteration = 0; drainIteration < 100; drainIteration++) {
    await settleAsyncWork();
    await testBackend.finishInProgressScheduledFunctions();
    await settleAsyncWork();
    if (vi.getTimerCount() === 0) {
      return;
    }
    vi.advanceTimersToNextTimer();
  }
  throw new Error("finishQueuedFunctions: too many iterations");
}

async function settleAsyncWork() {
  for (let yieldIteration = 0; yieldIteration < 20; yieldIteration++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

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
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedEventWithCustomFields(
  testBackend: TestBackend,
  name: string,
  customFields: Array<{
    key: string;
    label: string;
    required?: boolean;
    trimWhitespace?: boolean;
  }>,
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("events", {
      workspaceSlug: WORKSPACE_SLUG,
      siteKey: SITE_KEY,
      name,
      location: "Test Venue",
      eventDate: Date.now() + 86_400_000,
      status: "active",
      customFields,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedListCredential(
  testBackend: TestBackend,
  args: {
    eventId: Id<"events">;
    listKey: string;
    password?: string;
    autoApproveLimit?: number;
  },
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("listCredentials", {
      eventId: args.eventId,
      listKey: args.listKey,
      password: args.password,
      passwordNormalized: args.password?.trim().toLowerCase(),
      autoApproveLimit: args.autoApproveLimit,
      createdAt: Date.now(),
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
    shareContact?: boolean;
  },
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("rsvps", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey,
      userName: args.clerkUserId,
      shareContact: args.shareContact ?? true,
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

async function seedQueuedTextBlast(
  testBackend: TestBackend,
  args: {
    eventId: Id<"events">;
    name: string;
    message: string;
    targetLists?: string[];
    includeQrCodes?: boolean;
    recipientCount?: number;
  },
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("textBlasts", {
      eventId: args.eventId,
      targetEventIds: [args.eventId],
      name: args.name,
      message: args.message,
      targetLists: args.targetLists ?? ["vip"],
      includeQrCodes: args.includeQrCodes ?? false,
      deliveryTrackingEnabled: true,
      recipientCount: args.recipientCount ?? 0,
      sentCount: 0,
      failedCount: 0,
      sentBy: "host_1",
      status: "sending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sentAt: Date.now(),
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

async function seedReplyAction(
  testBackend: TestBackend,
  args: {
    textBlastId: Id<"textBlasts">;
    replyCode: string;
    targetEventId: Id<"events">;
    targetListKey: string;
    isEnabled?: boolean;
  },
) {
  return await testBackend.run(async (databaseContext) => {
    const replyCodeNormalized = args.replyCode.trim().toLowerCase();
    return await databaseContext.db.insert("textBlastReplyActions", {
      textBlastId: args.textBlastId,
      replyCode: args.replyCode,
      replyCodeNormalized,
      targetEventId: args.targetEventId,
      targetListKey: args.targetListKey,
      isEnabled: args.isEnabled ?? true,
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
  it("stores reply actions on a draft and rejects reserved reply codes", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const sourceEventId = await seedEvent(testBackend, "Source Event");
    const targetEventId = await seedEvent(testBackend, "Target Event");
    await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
      password: "invite",
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    const draftId = await hostBackend.mutation(api.textBlasts.createDraft, {
      eventId: sourceEventId,
      targetEventIds: [sourceEventId],
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
      name: "Reply draft",
      message: "Reply RETURN to join the next one",
      targetLists: ["vip"],
      replyActions: [
        {
          replyCode: "RETURN",
          targetEventId,
          targetListKey: "ga",
          isEnabled: true,
        },
      ],
    });

    const storedReplyActions = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("textBlastReplyActions")
        .withIndex("by_text_blast", (queryBuilder) => queryBuilder.eq("textBlastId", draftId))
        .collect();
    });

    expect(storedReplyActions).toHaveLength(1);
    expect(storedReplyActions[0]?.replyCodeNormalized).toBe("return");

    await expect(
      hostBackend.mutation(api.textBlasts.updateDraft, {
        blastId: draftId,
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
        replyActions: [
          {
            replyCode: "INVITE",
            targetEventId,
            targetListKey: "ga",
            isEnabled: true,
          },
        ],
      }),
    ).rejects.toThrow("unavailable");

    await expect(
      hostBackend.mutation(api.textBlasts.updateDraft, {
        blastId: draftId,
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
        replyActions: [
          {
            replyCode: "STOP",
            targetEventId,
            targetListKey: "ga",
            isEnabled: true,
          },
        ],
      }),
    ).rejects.toThrow("reserved");
  });

  it("allows action-code reuse only for disjoint recipient phone sets", async () => {
    const testBackend = setupTestBackend();
    const targetEventId = await seedEvent(testBackend, "Claim Target");
    await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
    });
    const firstBlastId = await seedTextBlast(testBackend, targetEventId, "First claim blast");
    const secondBlastId = await seedTextBlast(testBackend, targetEventId, "Second claim blast");
    await seedReplyAction(testBackend, {
      textBlastId: firstBlastId,
      replyCode: "Return",
      targetEventId,
      targetListKey: "ga",
    });
    await seedReplyAction(testBackend, {
      textBlastId: secondBlastId,
      replyCode: "RETURN",
      targetEventId,
      targetListKey: "ga",
    });
    const firstPhone = await normalizeAndHashPhoneNumber("+15551234001");
    const secondPhone = await normalizeAndHashPhoneNumber("+15551234002");

    await testBackend.mutation(internal.textBlasts.reserveQueuedReplyActionClaims, {
      blastId: firstBlastId,
      phoneHashes: [firstPhone.phoneHash],
    });
    await expect(
      testBackend.mutation(internal.textBlasts.reserveQueuedReplyActionClaims, {
        blastId: secondBlastId,
        phoneHashes: [firstPhone.phoneHash],
      }),
    ).rejects.toThrow("unavailable");

    await testBackend.mutation(internal.textBlasts.reserveQueuedReplyActionClaims, {
      blastId: secondBlastId,
      phoneHashes: [secondPhone.phoneHash],
    });
    const claims = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("smsCodeClaims")
        .withIndex("by_code", (queryBuilder) => queryBuilder.eq("normalizedCode", "return"))
        .collect();
    });
    expect(claims).toHaveLength(2);
  });

  it("releases failed action reservations and reclaims expired reservations", async () => {
    const testBackend = setupTestBackend();
    const targetEventId = await seedEvent(testBackend, "Reservation Target");
    await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
    });
    const firstBlastId = await seedTextBlast(testBackend, targetEventId, "First reservation");
    const secondBlastId = await seedTextBlast(testBackend, targetEventId, "Second reservation");
    await seedReplyAction(testBackend, {
      textBlastId: firstBlastId,
      replyCode: "REUSE",
      targetEventId,
      targetListKey: "ga",
    });
    const secondReplyActionId = await seedReplyAction(testBackend, {
      textBlastId: secondBlastId,
      replyCode: "reuse",
      targetEventId,
      targetListKey: "ga",
    });
    const failedPhone = await normalizeAndHashPhoneNumber("+15551234004");
    const expiredPhone = await normalizeAndHashPhoneNumber("+15551234005");

    await testBackend.mutation(internal.textBlasts.reserveQueuedReplyActionClaims, {
      blastId: firstBlastId,
      phoneHashes: [failedPhone.phoneHash, expiredPhone.phoneHash],
    });
    await testBackend.mutation(internal.textBlasts.releaseQueuedReplyActionClaims, {
      blastId: firstBlastId,
      phoneHashes: [failedPhone.phoneHash],
    });
    await testBackend.run(async (databaseContext) => {
      const expiredClaims = await databaseContext.db
        .query("smsCodeClaims")
        .withIndex("by_code_phone", (queryBuilder) =>
          queryBuilder.eq("normalizedCode", "reuse").eq("phoneHash", expiredPhone.phoneHash),
        )
        .collect();
      for (const expiredClaim of expiredClaims) {
        await databaseContext.db.patch(expiredClaim._id, {
          reservationExpiresAt: Date.now() - 1,
        });
      }
    });

    await testBackend.mutation(internal.textBlasts.reserveQueuedReplyActionClaims, {
      blastId: secondBlastId,
      phoneHashes: [failedPhone.phoneHash, expiredPhone.phoneHash],
    });
    const claims = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("smsCodeClaims")
        .withIndex("by_reply_action", (queryBuilder) =>
          queryBuilder.eq("replyActionId", secondReplyActionId),
        )
        .collect();
    });
    expect(claims.map((claim) => claim.phoneHash).sort()).toEqual(
      [failedPhone.phoneHash, expiredPhone.phoneHash].sort(),
    );
  });

  it("freezes delivered action routing while allowing enable toggles", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const sourceEventId = await seedEvent(testBackend, "Freeze Source");
    const targetEventId = await seedEvent(testBackend, "Freeze Target");
    await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
    });
    await seedUser(testBackend, "freeze_guest", "+15551234003", "Freeze");
    const sourceRsvpId = await seedRsvp(testBackend, {
      eventId: sourceEventId,
      clerkUserId: "freeze_guest",
      listKey: "vip",
    });
    const blastId = await seedTextBlast(testBackend, sourceEventId, "Frozen blast");
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(blastId, { sentCount: 1 });
    });
    await seedReplyAction(testBackend, {
      textBlastId: blastId,
      replyCode: "FREEZE",
      targetEventId,
      targetListKey: "ga",
    });
    await seedDelivery(testBackend, {
      textBlastId: blastId,
      phone: "+15551234003",
      status: "sent",
      eventId: sourceEventId,
      rsvpId: sourceRsvpId,
      clerkUserId: "freeze_guest",
      listKey: "vip",
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    await expect(
      hostBackend.mutation(api.textBlasts.updateReplyActions, {
        blastId,
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
        replyActions: [
          {
            replyCode: "CHANGED",
            targetEventId,
            targetListKey: "ga",
            isEnabled: true,
          },
        ],
      }),
    ).rejects.toThrow("frozen");

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(targetEventId, {
        status: "inactive",
        updatedAt: Date.now(),
      });
    });
    await hostBackend.mutation(api.textBlasts.updateReplyActions, {
      blastId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
      replyActions: [
        {
          replyCode: "FREEZE",
          targetEventId,
          targetListKey: "ga",
          isEnabled: false,
        },
      ],
    });
    const storedAction = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("textBlastReplyActions")
        .withIndex("by_text_blast", (queryBuilder) => queryBuilder.eq("textBlastId", blastId))
        .unique();
    });
    expect(storedAction?.isEnabled).toBe(false);
  });

  it("brands Club Chlorine reply-action errors and includes the opt-out reminder", async () => {
    const testBackend = setupTestBackend();
    const sourceEventId = await seedEvent(testBackend, "Club Chlorine Source Event");
    const targetEventId = await seedEvent(testBackend, "Club Chlorine Target Event");
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(sourceEventId, { siteKey: "club-chlorine" });
      await databaseContext.db.patch(targetEventId, { siteKey: "club-chlorine" });
    });
    await seedUser(testBackend, "user_club_reply", "555-555-0199", "Casey");
    const sourceRsvpId = await seedRsvp(testBackend, {
      eventId: sourceEventId,
      clerkUserId: "user_club_reply",
      listKey: "vip",
    });
    const textBlastId = await seedTextBlast(
      testBackend,
      sourceEventId,
      "Club Chlorine reply blast",
    );
    await seedDelivery(testBackend, {
      textBlastId,
      phone: "555-555-0199",
      status: "sent",
      eventId: sourceEventId,
      rsvpId: sourceRsvpId,
      clerkUserId: "user_club_reply",
      listKey: "vip",
    });
    await seedReplyAction(testBackend, {
      textBlastId,
      replyCode: "RETURN",
      targetEventId,
      targetListKey: "ga",
    });

    const result = await testBackend.mutation(internal.textBlasts.processIncomingSmsReply, {
      fromPhoneNumber: "555-555-0199",
      messageBody: "NOT-A-MATCH",
    });

    expect(result).toEqual({
      shouldRespond: true,
      status: "invalid_code",
      responseMessage:
        "CLUB CHLORINE: We could not match that reply code. Check the text and try again.\n\nReply STOP to opt out.",
    });
  });

  it("submits a pending RSVP from a matching text blast reply action", async () => {
    const testBackend = setupTestBackend();
    const sourceEventId = await seedEvent(testBackend, "Source Event");
    const targetEventId = await seedEventWithCustomFields(testBackend, "Target Event", [
      { key: "shirt", label: "Shirt size", required: true },
      { key: "diet", label: "Diet" },
    ]);
    await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
      password: "return",
    });
    await seedUser(testBackend, "user_reply", "555-555-0100", "Riley");
    const sourceRsvpId = await seedRsvp(testBackend, {
      eventId: sourceEventId,
      clerkUserId: "user_reply",
      listKey: "vip",
      customFieldValues: { shirt: " Large ", ignored: "not copied" },
    });
    const textBlastId = await seedTextBlast(testBackend, sourceEventId, "Reply blast");
    await seedDelivery(testBackend, {
      textBlastId,
      phone: "555-555-0100",
      status: "sent",
      eventId: sourceEventId,
      rsvpId: sourceRsvpId,
      clerkUserId: "user_reply",
      listKey: "vip",
    });
    await seedReplyAction(testBackend, {
      textBlastId,
      replyCode: "RETURN",
      targetEventId,
      targetListKey: "ga",
    });

    const result = await testBackend.mutation(internal.textBlasts.processIncomingSmsReply, {
      fromPhoneNumber: "555-555-0100",
      messageBody: " return ",
      messageSid: "SM_reply",
      receivedAt: Date.now(),
    });
    const targetRsvp = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", targetEventId).eq("clerkUserId", "user_reply"),
        )
        .unique();
    });
    const { phoneHash } = await normalizeAndHashPhoneNumber("555-555-0100");
    const conversationMessages = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("smsConversationMessages")
        .withIndex("by_event_phone", (queryBuilder) =>
          queryBuilder.eq("eventId", targetEventId).eq("phoneHash", phoneHash),
        )
        .collect();
    });

    expect(result.status).toBe("submitted");
    expect(result.shouldRespond).toBe(true);
    expect(result.responseMessage).toBe(
      "RSVP submitted for Target Event. Your request is pending approval.",
    );
    expect(targetRsvp?.approvalStatus).toBe("pending");
    expect(targetRsvp?.listKey).toBe("ga");
    expect(targetRsvp?.smsConsent).toBe(true);
    expect(targetRsvp?.customFieldValues).toEqual({ shirt: "Large" });
    expect(conversationMessages.map((message) => message.direction)).toEqual(["inbound", "system"]);
    expect(conversationMessages[0]?.body).toBe("return");
    expect(conversationMessages[1]?.body).toContain("Reply action submitted");
  });

  it("auto-approves a text-reply RSVP when the target list has an available slot", async () => {
    const testBackend = setupTestBackend();
    const sourceEventId = await seedEvent(testBackend, "Auto Source Event");
    const targetEventId = await seedEvent(testBackend, "Auto Target Event");
    const targetListCredentialId = await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
      password: "auto",
      autoApproveLimit: 1,
    });
    await seedUser(testBackend, "user_auto_reply", "555-555-0101", "Avery");
    const sourceRsvpId = await seedRsvp(testBackend, {
      eventId: sourceEventId,
      clerkUserId: "user_auto_reply",
      listKey: "vip",
      shareContact: false,
    });
    const textBlastId = await seedTextBlast(testBackend, sourceEventId, "Auto reply blast");
    await seedDelivery(testBackend, {
      textBlastId,
      phone: "555-555-0101",
      status: "sent",
      eventId: sourceEventId,
      rsvpId: sourceRsvpId,
      clerkUserId: "user_auto_reply",
      listKey: "vip",
    });
    await seedReplyAction(testBackend, {
      textBlastId,
      replyCode: "AUTO",
      targetEventId,
      targetListKey: "ga",
    });

    const result = await testBackend.mutation(internal.textBlasts.processIncomingSmsReply, {
      fromPhoneNumber: "555-555-0101",
      messageBody: "AUTO",
      messageSid: "SM_auto_reply",
      receivedAt: Date.now(),
    });

    await testBackend.run(async (databaseContext) => {
      const allRsvps = await databaseContext.db.query("rsvps").collect();
      const targetRsvp = allRsvps.find(
        (rsvp) => rsvp.eventId === targetEventId && rsvp.clerkUserId === "user_auto_reply",
      );
      const listCredential = await databaseContext.db.get(targetListCredentialId);
      const allRedemptions = await databaseContext.db.query("redemptions").collect();
      const redemption = allRedemptions.find(
        (redemptionRecord) =>
          redemptionRecord.eventId === targetEventId &&
          redemptionRecord.clerkUserId === "user_auto_reply",
      );

      expect(result.status).toBe("submitted");
      expect(result.shouldRespond).toBe(false);
      expect(result.responseMessage).toBeUndefined();
      expect(targetRsvp?.approvalStatus).toBe("approved");
      expect(targetRsvp?.ticketStatus).toBe("issued");
      expect(listCredential?.autoApprovedCount).toBe(1);
      expect(redemption).not.toBeNull();
    });
  });

  it("uses custom RSVP confirmation text for matching reply action submissions", async () => {
    const testBackend = setupTestBackend();
    const sourceEventId = await seedEvent(testBackend, "Custom Confirmation Source");
    const targetEventId = await seedEvent(testBackend, "Custom Confirmation Target");
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(targetEventId, {
        rsvpConfirmationMessage:
          "Hi {{firstName}}, we received your RSVP for {{eventName}} at {{eventLocation}}.",
      });
    });
    await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
      password: "return",
    });
    await seedUser(testBackend, "user_custom_confirmation", "555-555-0103", "Riley");
    const sourceRsvpId = await seedRsvp(testBackend, {
      eventId: sourceEventId,
      clerkUserId: "user_custom_confirmation",
      listKey: "vip",
    });
    const textBlastId = await seedTextBlast(
      testBackend,
      sourceEventId,
      "Custom confirmation reply blast",
    );
    await seedDelivery(testBackend, {
      textBlastId,
      phone: "555-555-0103",
      status: "sent",
      eventId: sourceEventId,
      rsvpId: sourceRsvpId,
      clerkUserId: "user_custom_confirmation",
      listKey: "vip",
    });
    await seedReplyAction(testBackend, {
      textBlastId,
      replyCode: "RETURN",
      targetEventId,
      targetListKey: "ga",
    });

    const result = await testBackend.mutation(internal.textBlasts.processIncomingSmsReply, {
      fromPhoneNumber: "555-555-0103",
      messageBody: "RETURN",
    });

    expect(result.status).toBe("submitted");
    expect(result.shouldRespond).toBe(true);
    expect(result.responseMessage).toBe(
      "Hi Riley, we received your RSVP for Custom Confirmation Target at Test Venue.",
    );
  });

  it("submits reply action RSVPs without responding when initial confirmation is disabled", async () => {
    const testBackend = setupTestBackend();
    const sourceEventId = await seedEvent(testBackend, "Disabled Confirmation Source");
    const targetEventId = await seedEvent(testBackend, "Disabled Confirmation Target");
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(targetEventId, {
        rsvpConfirmationMessageEnabled: false,
        rsvpConfirmationMessage: "This text should not be returned.",
      });
    });
    await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
      password: "return",
    });
    await seedUser(testBackend, "user_disabled_confirmation", "555-555-0104", "Drew");
    const sourceRsvpId = await seedRsvp(testBackend, {
      eventId: sourceEventId,
      clerkUserId: "user_disabled_confirmation",
      listKey: "vip",
    });
    const textBlastId = await seedTextBlast(
      testBackend,
      sourceEventId,
      "Disabled confirmation reply blast",
    );
    await seedDelivery(testBackend, {
      textBlastId,
      phone: "555-555-0104",
      status: "sent",
      eventId: sourceEventId,
      rsvpId: sourceRsvpId,
      clerkUserId: "user_disabled_confirmation",
      listKey: "vip",
    });
    await seedReplyAction(testBackend, {
      textBlastId,
      replyCode: "RETURN",
      targetEventId,
      targetListKey: "ga",
    });

    const result = await testBackend.mutation(internal.textBlasts.processIncomingSmsReply, {
      fromPhoneNumber: "555-555-0104",
      messageBody: "RETURN",
    });
    const targetRsvp = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", targetEventId).eq("clerkUserId", "user_disabled_confirmation"),
        )
        .unique();
    });

    expect(result.status).toBe("submitted");
    expect(result.shouldRespond).toBe(false);
    expect(result.responseMessage).toBeUndefined();
    expect(targetRsvp?.approvalStatus).toBe("pending");
  });

  it("keeps an existing destination RSVP unchanged for reply actions", async () => {
    const testBackend = setupTestBackend();
    const sourceEventId = await seedEvent(testBackend, "Existing Source Event");
    const targetEventId = await seedEvent(testBackend, "Existing Target Event");
    await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
      password: "return",
    });
    await seedUser(testBackend, "user_existing", "555-555-0101", "Emery");
    const sourceRsvpId = await seedRsvp(testBackend, {
      eventId: sourceEventId,
      clerkUserId: "user_existing",
      listKey: "vip",
    });
    const existingTargetRsvpId = await seedRsvp(testBackend, {
      eventId: targetEventId,
      clerkUserId: "user_existing",
      listKey: "vip",
      status: "approved",
      customFieldValues: { preserved: "yes" },
    });
    const textBlastId = await seedTextBlast(testBackend, sourceEventId, "Existing reply blast");
    await seedDelivery(testBackend, {
      textBlastId,
      phone: "555-555-0101",
      status: "sent",
      eventId: sourceEventId,
      rsvpId: sourceRsvpId,
      clerkUserId: "user_existing",
      listKey: "vip",
    });
    await seedReplyAction(testBackend, {
      textBlastId,
      replyCode: "RETURN",
      targetEventId,
      targetListKey: "ga",
    });

    const result = await testBackend.mutation(internal.textBlasts.processIncomingSmsReply, {
      fromPhoneNumber: "555-555-0101",
      messageBody: "RETURN",
    });
    const existingTargetRsvp = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.get(existingTargetRsvpId);
    });

    expect(result.status).toBe("already_exists");
    expect(existingTargetRsvp?.listKey).toBe("vip");
    expect(existingTargetRsvp?.approvalStatus).toBe("approved");
    expect(existingTargetRsvp?.customFieldValues).toEqual({ preserved: "yes" });
  });

  it("does not submit a reply action RSVP when required matching fields are missing", async () => {
    const testBackend = setupTestBackend();
    const sourceEventId = await seedEvent(testBackend, "Missing Field Source");
    const targetEventId = await seedEventWithCustomFields(testBackend, "Missing Field Target", [
      { key: "requiredHandle", label: "Required handle", required: true },
    ]);
    await seedListCredential(testBackend, {
      eventId: targetEventId,
      listKey: "ga",
      password: "return",
    });
    await seedUser(testBackend, "user_missing", "555-555-0102", "Morgan");
    const sourceRsvpId = await seedRsvp(testBackend, {
      eventId: sourceEventId,
      clerkUserId: "user_missing",
      listKey: "vip",
    });
    const textBlastId = await seedTextBlast(testBackend, sourceEventId, "Missing field blast");
    await seedDelivery(testBackend, {
      textBlastId,
      phone: "555-555-0102",
      status: "sent",
      eventId: sourceEventId,
      rsvpId: sourceRsvpId,
      clerkUserId: "user_missing",
      listKey: "vip",
    });
    await seedReplyAction(testBackend, {
      textBlastId,
      replyCode: "RETURN",
      targetEventId,
      targetListKey: "ga",
    });

    const result = await testBackend.mutation(internal.textBlasts.processIncomingSmsReply, {
      fromPhoneNumber: "555-555-0102",
      messageBody: "RETURN",
    });
    const targetRsvps = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", targetEventId))
        .collect();
    });

    expect(result.status).toBe("missing_required_fields");
    expect(targetRsvps).toHaveLength(0);
  });

  it("dedupes multi-event recipients by normalized phone across users and events", async () => {
    const testBackend = setupTestBackend();
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
    const testBackend = setupTestBackend();
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
    const testBackend = setupTestBackend();
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

  it("targets approved previous RSVPs while excluding anyone who RSVP'd to the excluded event", async () => {
    const testBackend = setupTestBackend();
    const previousEventId = await seedEvent(testBackend, "Previous Event");
    const currentEventId = await seedEvent(testBackend, "Current Event");

    await seedUser(testBackend, "user_previous_only", "555-210-0001", "Previous");
    await seedUser(testBackend, "user_same_clerk", "555-210-0002", "Same");
    await seedUser(testBackend, "user_previous_shared_phone", "555-210-0003", "Shared");
    await seedUser(testBackend, "user_current_shared_phone", "(555) 210-0003", "Current");

    await seedRsvp(testBackend, {
      eventId: previousEventId,
      clerkUserId: "user_previous_only",
      listKey: "vip",
    });
    await seedRsvp(testBackend, {
      eventId: previousEventId,
      clerkUserId: "user_same_clerk",
      listKey: "vip",
    });
    await seedRsvp(testBackend, {
      eventId: previousEventId,
      clerkUserId: "user_previous_shared_phone",
      listKey: "vip",
    });
    await seedRsvp(testBackend, {
      eventId: currentEventId,
      clerkUserId: "user_same_clerk",
      listKey: "vip",
      status: "pending",
    });
    await seedRsvp(testBackend, {
      eventId: currentEventId,
      clerkUserId: "user_current_shared_phone",
      listKey: "vip",
      status: "pending",
    });

    const recipientFilter = JSON.stringify({
      type: "previous_approved_not_rsvped",
      excludedEventId: currentEventId,
    });
    const recipientCount = await testBackend.query(internal.textBlasts.countRecipientsInternal, {
      eventId: previousEventId,
      targetEventIds: [previousEventId],
      targetLists: ["vip"],
      recipientFilter,
    });
    const recipients = await testBackend.action(
      internal.textBlasts.getRecipientsWithPhonesInternal,
      {
        eventId: previousEventId,
        targetEventIds: [previousEventId],
        targetLists: ["vip"],
        recipientFilter,
      },
    );

    expect(recipientCount).toBe(1);
    expect(recipients.map((recipient) => recipient.clerkUserId)).toEqual(["user_previous_only"]);
  });

  it("filters history by sent delivery rows only", async () => {
    const testBackend = setupTestBackend();
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
    const testBackend = setupTestBackend();
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
    const testBackend = setupTestBackend();
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
    const testBackend = setupTestBackend();
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

  it("queues direct single-event blasts and finalizes Twilio-disabled failures", async () => {
    const testBackend = setupTestBackend();
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

    vi.useFakeTimers();
    try {
      const result = await hostBackend.action(api.textBlasts.sendBlastDirect, {
        eventId,
        targetEventIds: [eventId],
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
        name: "QR direct send",
        message: "Hi {{firstName}}, your ticket is {{ qrCodeUrl }}",
        targetLists: ["vip"],
        includeQrCodes: false,
      });

      expect(result).toMatchObject({
        success: true,
        totalRecipients: 1,
        status: "sending",
      });

      await finishQueuedFunctions(testBackend);
    } finally {
      if (previousDevTwilioEnabled === undefined) {
        delete process.env.DEV_TWILIO_ENABLED;
      } else {
        process.env.DEV_TWILIO_ENABLED = previousDevTwilioEnabled;
      }
      vi.clearAllTimers();
      vi.useRealTimers();
    }

    const sendState = await testBackend.run(async (databaseContext) => {
      const blasts = await databaseContext.db.query("textBlasts").collect();
      const notifications = await databaseContext.db.query("smsNotifications").collect();
      const deliveries = await databaseContext.db.query("textBlastRecipients").collect();
      const usageLogs = await databaseContext.db.query("smsUsageLogs").collect();
      return { blasts, notifications, deliveries, usageLogs };
    });

    expect(sendState.blasts).toHaveLength(1);
    expect(sendState.blasts[0].includeQrCodes).toBe(true);
    expect(sendState.blasts[0].status).toBe("failed");
    expect(sendState.blasts[0].failedCount).toBe(1);
    expect(sendState.notifications[0].message).toContain(
      "https://dojopomodoro.club/redeem/qr-test-code",
    );
    expect(sendState.notifications[0].status).toBe("failed");
    expect(sendState.deliveries[0].status).toBe("failed");
    expect(sendState.usageLogs).toHaveLength(0);
  });

  it("sends an existing draft only to saved selected RSVP IDs", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend, "Selected Draft Event");
    await seedUser(testBackend, "user_selected", "555-888-0001", "Selena");
    await seedUser(testBackend, "user_not_selected", "555-888-0002", "Nolan");
    const selectedRsvpId = await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_selected",
      listKey: "vip",
    });
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_not_selected",
      listKey: "vip",
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));
    const draftId = await hostBackend.mutation(api.textBlasts.createDraft, {
      eventId,
      targetEventIds: [eventId],
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
      name: "Selected draft",
      message: "Selected only",
      targetLists: ["vip"],
      selectedRsvpIds: [selectedRsvpId],
    });
    const previousDevTwilioEnabled = process.env.DEV_TWILIO_ENABLED;
    process.env.DEV_TWILIO_ENABLED = "false";

    vi.useFakeTimers();
    try {
      const result = await hostBackend.action(api.textBlasts.sendBlast, {
        blastId: draftId,
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
      });

      expect(result).toMatchObject({
        success: true,
        totalRecipients: 1,
      });
      await finishQueuedFunctions(testBackend);
    } finally {
      if (previousDevTwilioEnabled === undefined) {
        delete process.env.DEV_TWILIO_ENABLED;
      } else {
        process.env.DEV_TWILIO_ENABLED = previousDevTwilioEnabled;
      }
      vi.clearAllTimers();
      vi.useRealTimers();
    }

    const sendState = await testBackend.run(async (databaseContext) => {
      const blast = await databaseContext.db.get(draftId);
      const deliveries = await databaseContext.db.query("textBlastRecipients").collect();
      return { blast, deliveries };
    });

    expect(sendState.blast?.selectedRsvpIds).toEqual([selectedRsvpId]);
    expect(sendState.blast?.recipientCount).toBe(1);
    expect(sendState.deliveries).toHaveLength(1);
    expect(sendState.deliveries[0].sourceRsvpIds).toEqual([selectedRsvpId]);
    expect(sendState.deliveries[0].recipientClerkUserIds).toEqual(["user_selected"]);
  });

  it("finalizes successful bulk SMS results into notifications, deliveries, usage logs, and counts", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedEvent(testBackend, "Finalizer Event");
    await seedUser(testBackend, "user_finalizer", "555-123-4567", "Finley");
    const rsvpId = await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_finalizer",
      listKey: "vip",
    });
    const textBlastId = await seedQueuedTextBlast(testBackend, {
      eventId,
      name: "Finalizer blast",
      message: "Hello",
      recipientCount: 1,
    });
    const { phoneHash } = await normalizeAndHashPhoneNumber("555-123-4567");
    const { textBlastRecipientId, notificationId } = await testBackend.run(
      async (databaseContext) => {
        const deliveryId = await databaseContext.db.insert("textBlastRecipients", {
          textBlastId,
          phoneHash,
          status: "pending",
          sourceEventIds: [eventId],
          sourceRsvpIds: [rsvpId],
          sourceListKeys: ["vip"],
          recipientClerkUserIds: ["user_finalizer"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const smsNotificationId = await databaseContext.db.insert("smsNotifications", {
          eventId,
          recipientClerkUserId: "user_finalizer",
          recipientPhoneObfuscated: "+1-***-***-4567",
          type: "blast",
          message: "Hello",
          status: "pending",
          textBlastId,
          textBlastRecipientId: deliveryId,
          createdAt: Date.now(),
        });
        await databaseContext.db.patch(deliveryId, {
          smsNotificationId,
        });
        return { textBlastRecipientId: deliveryId, notificationId: smsNotificationId };
      },
    );

    const successfulResult = {
      notificationId,
      textBlastRecipientId,
      clerkUserId: "user_finalizer",
      phoneHash,
      success: true,
      messageId: "SM_success",
      messageLength: 5,
      messageType: "Promotional",
      estimatedCost: 0.00645,
      sentAt: 123_456,
    };
    await testBackend.mutation(internal.textBlasts.finalizeQueuedBlastSend, {
      blastId: textBlastId,
      totalRecipients: 1,
      results: [successfulResult],
    });
    await testBackend.mutation(internal.textBlasts.finalizeQueuedBlastSend, {
      blastId: textBlastId,
      totalRecipients: 1,
      results: [successfulResult],
    });

    const finalizedState = await testBackend.run(async (databaseContext) => {
      const blast = await databaseContext.db.get(textBlastId);
      const notification = await databaseContext.db.get(notificationId);
      const delivery = await databaseContext.db.get(textBlastRecipientId);
      const usageLogs = await databaseContext.db.query("smsUsageLogs").collect();
      const conversationMessages = await databaseContext.db
        .query("smsConversationMessages")
        .collect();
      return { blast, notification, delivery, usageLogs, conversationMessages };
    });

    expect(finalizedState.blast?.status).toBe("sent");
    expect(finalizedState.blast?.sentCount).toBe(1);
    expect(finalizedState.blast?.failedCount).toBe(0);
    expect(finalizedState.notification?.status).toBe("sent");
    expect(finalizedState.notification?.messageId).toBe("SM_success");
    expect(finalizedState.delivery?.status).toBe("sent");
    expect(finalizedState.delivery?.messageId).toBe("SM_success");
    expect(finalizedState.usageLogs).toHaveLength(1);
    expect(finalizedState.conversationMessages).toHaveLength(1);
    expect(finalizedState.usageLogs[0]).toMatchObject({
      messageId: "SM_success",
      phoneNumber: phoneHash,
      messageLength: 5,
      messageType: "Promotional",
      estimatedCost: 0.00645,
      timestamp: 123_456,
    });
  });

  it("skips opted-out recipients before Twilio and marks their delivery failed", async () => {
    const testBackend = setupTestBackend();
    const eventId = await seedEvent(testBackend, "Opt Out Event");
    await seedUser(testBackend, "user_opted_out", "555-222-3333", "Opal");
    await seedRsvp(testBackend, {
      eventId,
      clerkUserId: "user_opted_out",
      listKey: "vip",
    });
    const textBlastId = await seedQueuedTextBlast(testBackend, {
      eventId,
      name: "Opt out blast",
      message: "This should not send",
      recipientCount: 1,
    });
    const { phoneHash } = await normalizeAndHashPhoneNumber("555-222-3333");
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("smsOptOuts", {
        phoneNumber: phoneHash,
        optedOutAt: Date.now(),
        reason: "user_request_sms",
      });
    });

    await testBackend.action(internal.textBlasts.processQueuedBlastSend, {
      blastId: textBlastId,
    });

    const finalState = await testBackend.run(async (databaseContext) => {
      const blast = await databaseContext.db.get(textBlastId);
      const notifications = await databaseContext.db.query("smsNotifications").collect();
      const deliveries = await databaseContext.db.query("textBlastRecipients").collect();
      const usageLogs = await databaseContext.db.query("smsUsageLogs").collect();
      return { blast, notifications, deliveries, usageLogs };
    });

    expect(finalState.blast?.status).toBe("failed");
    expect(finalState.blast?.sentCount).toBe(0);
    expect(finalState.blast?.failedCount).toBe(1);
    expect(finalState.notifications).toHaveLength(1);
    expect(finalState.notifications[0].status).toBe("failed");
    expect(finalState.notifications[0].errorMessage).toBe(
      "User has opted out of SMS notifications",
    );
    expect(finalState.deliveries).toHaveLength(1);
    expect(finalState.deliveries[0].status).toBe("failed");
    expect(finalState.deliveries[0].errorMessage).toBe("User has opted out of SMS notifications");
    expect(finalState.usageLogs).toHaveLength(0);
  });
});
