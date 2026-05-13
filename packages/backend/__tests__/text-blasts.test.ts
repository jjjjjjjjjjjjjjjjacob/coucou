import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/textBlasts.ts": () => import("../convex/textBlasts"),
};

type TestBackend = ReturnType<typeof convexTest>;

async function seedEvent(testBackend: TestBackend, name: string) {
  return await testBackend.run(async (ctx) => {
    return await ctx.db.insert("events", {
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
  return await testBackend.run(async (ctx) => {
    return await ctx.db.insert("users", {
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
  return await testBackend.run(async (ctx) => {
    return await ctx.db.insert("rsvps", {
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
  return await testBackend.run(async (ctx) => {
    return await ctx.db.insert("textBlasts", {
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
  return await testBackend.run(async (ctx) => {
    return await ctx.db.insert("textBlastRecipients", {
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
});
