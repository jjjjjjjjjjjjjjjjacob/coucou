import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import { obfuscatePhoneNumber } from "../convex/lib/phoneUtils";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/sms.ts": () => import("../convex/sms"),
  "../convex/smsActions.ts": () => import("../convex/smsActions"),
  "../convex/smsConversations.ts": () => import("../convex/smsConversations"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

const WORKSPACE_SLUG = "dojo-pomodoro";
const SITE_KEY = "dojo";
const CLERK_ORGANIZATION_ID = "org_dojo";

type TestBackend = ReturnType<typeof convexTest>;

function setupTestBackend(): TestBackend {
  return convexTest(schema, convexModules);
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

async function seedEvent(testBackend: TestBackend, name = "Conversation Event") {
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

async function seedUser(
  testBackend: TestBackend,
  args: {
    clerkUserId: string;
    phone: string;
    firstName: string;
    lastName?: string;
  },
) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("users", {
      clerkUserId: args.clerkUserId,
      phone: args.phone,
      firstName: args.firstName,
      lastName: args.lastName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedThreadMessage(
  testBackend: TestBackend,
  args: {
    eventId: Id<"events">;
    phone: string;
    clerkUserIds: string[];
    direction?: "inbound" | "outbound" | "system";
    body?: string;
    createdAt?: number;
    providerMessageId?: string;
    providerStatus?: string;
    qrCodeSent?: boolean;
  },
) {
  const phoneResolution = await normalizeAndHashPhoneNumber(args.phone);
  await testBackend.mutation(internal.smsConversations.recordMessage, {
    eventId: args.eventId,
    phoneHash: phoneResolution.phoneHash,
    phoneObfuscated: obfuscatePhoneNumber(phoneResolution.normalizedPhoneNumber),
    participantClerkUserIds: args.clerkUserIds,
    direction: args.direction ?? "inbound",
    kind: "sms",
    body: args.body ?? (args.direction === "outbound" ? "Outbound test" : "Inbound test"),
    providerMessageId: args.providerMessageId,
    providerStatus: args.providerStatus ?? "received",
    qrCodeSent: args.qrCodeSent,
    createdAt: args.createdAt ?? Date.now(),
  });
  const threads = await testBackend.run(async (databaseContext) => {
    return await databaseContext.db
      .query("smsConversationThreads")
      .withIndex("by_event_phone", (queryBuilder) =>
        queryBuilder.eq("eventId", args.eventId).eq("phoneHash", phoneResolution.phoneHash),
      )
      .collect();
  });
  return threads[0]?._id as Id<"smsConversationThreads">;
}

describe("sms conversations", () => {
  it("lists event threads and loads message timelines", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    await seedUser(testBackend, {
      clerkUserId: "user_guest",
      phone: "555-111-2222",
      firstName: "Riley",
      lastName: "Park",
    });
    const threadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-111-2222",
      clerkUserIds: ["user_guest"],
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    const threads = await hostBackend.query(api.smsConversations.listThreads, {
      eventId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });
    const detail = await hostBackend.query(api.smsConversations.getThread, {
      threadId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });

    expect(threads).toHaveLength(1);
    expect(threads[0]?.participantName).toBe("Riley Park");
    expect(threads[0]?.eventName).toBe("Conversation Event");
    expect(threads[0]?.eventDate).toBeGreaterThan(0);
    expect(threads[0]?.canSend).toBe(true);
    expect(detail.thread.phoneObfuscated).toContain("2222");
    expect(detail.messages.map((message) => message.body)).toEqual(["Inbound test"]);
  });

  it("returns explicit QR-send metadata in message timelines", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const threadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-111-3333",
      clerkUserIds: ["user_qr"],
      direction: "outbound",
      body: "Your ticket is attached.",
      providerStatus: "sent",
      qrCodeSent: true,
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    const detail = await hostBackend.query(api.smsConversations.getThread, {
      threadId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });

    expect(detail.messages[0]?.qrCodeSent).toBe(true);
  });

  it("reports when a manual thread can attach the guest's generated QR", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    await seedUser(testBackend, {
      clerkUserId: "user_qr_attachment",
      phone: "555-111-3434",
      firstName: "Jordan",
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "vip",
        generateQR: true,
        createdAt: Date.now(),
      });
      await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "user_qr_attachment",
        listKey: "vip",
        userName: "Jordan",
        shareContact: true,
        smsConsent: true,
        status: "approved",
        approvalStatus: "approved",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await databaseContext.db.insert("redemptions", {
        eventId,
        clerkUserId: "user_qr_attachment",
        listKey: "vip",
        code: "qr-attachment-code",
        unredeemHistory: [],
        createdAt: Date.now(),
      });
    });
    const threadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-111-3434",
      clerkUserIds: ["user_qr_attachment"],
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    const detail = await hostBackend.query(api.smsConversations.getThread, {
      threadId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });

    expect(detail.thread.canAttachQr).toBe(true);
    expect(detail.thread.qrDeliveredAt).toBeUndefined();
  });

  it("lists all workspace event threads with event metadata, global sorting, and event search", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const earlierEventId = await seedEvent(testBackend, "Earlier Event");
    const laterEventId = await seedEvent(testBackend, "Later Event");
    const outsideEventId = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.insert("events", {
        workspaceSlug: "outside-workspace",
        siteKey: "outside-site",
        name: "Outside Event",
        location: "Other Venue",
        eventDate: Date.now() + 172_800_000,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const earlierThreadId = await seedThreadMessage(testBackend, {
      eventId: earlierEventId,
      phone: "555-201-1001",
      clerkUserIds: [],
      body: "Earlier message",
      createdAt: 1_700_000_000_000,
    });
    const laterThreadId = await seedThreadMessage(testBackend, {
      eventId: laterEventId,
      phone: "555-201-1002",
      clerkUserIds: [],
      body: "Later message",
      createdAt: 1_700_000_100_000,
    });
    await seedThreadMessage(testBackend, {
      eventId: outsideEventId,
      phone: "555-201-1003",
      clerkUserIds: [],
      body: "Outside message",
      createdAt: 1_700_000_200_000,
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_all_events"));

    const allThreads = await hostBackend.query(api.smsConversations.listThreads, {
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });
    const eventSearchThreads = await hostBackend.query(api.smsConversations.listThreads, {
      search: "Earlier Event",
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });

    expect(allThreads.map((thread) => thread._id)).toEqual([laterThreadId, earlierThreadId]);
    expect(allThreads.map((thread) => thread.eventName)).toEqual(["Later Event", "Earlier Event"]);
    expect(allThreads.some((thread) => thread.eventName === "Outside Event")).toBe(false);
    expect(eventSearchThreads.map((thread) => thread._id)).toEqual([earlierThreadId]);
  });

  it("filters conversation states independently and combines multiple states with OR", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const needsReplyThreadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-202-1001",
      clerkUserIds: [],
      direction: "inbound",
      createdAt: 1_700_001_000_000,
    });
    const waitingWithIncomingThreadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-202-1002",
      clerkUserIds: [],
      direction: "inbound",
      createdAt: 1_700_001_100_000,
    });
    await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-202-1002",
      clerkUserIds: [],
      direction: "outbound",
      createdAt: 1_700_001_200_000,
    });
    const waitingWithoutIncomingThreadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-202-1003",
      clerkUserIds: [],
      direction: "outbound",
      createdAt: 1_700_001_300_000,
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_filters"));

    const queryThreadIds = async (
      conversationStates: Array<
        "needs_reply" | "waiting_on_guest" | "has_incoming" | "no_incoming"
      >,
    ) => {
      const threads = await hostBackend.query(api.smsConversations.listThreads, {
        eventId,
        conversationStates,
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
      });
      return new Set(threads.map((thread) => thread._id));
    };

    expect(await queryThreadIds(["needs_reply"])).toEqual(new Set([needsReplyThreadId]));
    expect(await queryThreadIds(["waiting_on_guest"])).toEqual(
      new Set([waitingWithIncomingThreadId, waitingWithoutIncomingThreadId]),
    );
    expect(await queryThreadIds(["has_incoming"])).toEqual(
      new Set([needsReplyThreadId, waitingWithIncomingThreadId]),
    );
    expect(await queryThreadIds(["no_incoming"])).toEqual(
      new Set([waitingWithoutIncomingThreadId]),
    );
    expect(await queryThreadIds(["needs_reply", "no_incoming"])).toEqual(
      new Set([needsReplyThreadId, waitingWithoutIncomingThreadId]),
    );
    expect(await queryThreadIds([])).toEqual(
      new Set([needsReplyThreadId, waitingWithIncomingThreadId, waitingWithoutIncomingThreadId]),
    );
  });

  it("uses the event RSVP name when the linked user has no stored name", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: "guest_without_profile_name",
        phone: "555-111-3434",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "guest_without_profile_name",
        listKey: "ga",
        userName: "Elena Chiu",
        shareContact: true,
        status: "pending",
        approvalStatus: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const threadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-111-3434",
      clerkUserIds: ["guest_without_profile_name"],
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    const threads = await hostBackend.query(api.smsConversations.listThreads, {
      eventId,
      search: "Elena",
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });
    const detail = await hostBackend.query(api.smsConversations.getThread, {
      threadId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });

    expect(threads).toHaveLength(1);
    expect(threads[0]?.participantName).toBe("Elena Chiu");
    expect(detail.thread.participantName).toBe("Elena Chiu");
  });

  it("uses a phone-matched RSVP name when a thread has no linked user", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const phone = "555-111-5656";
    const phoneResolution = await normalizeAndHashPhoneNumber(phone);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "guest_phone_only",
        listKey: "ga",
        userName: "Jordan Ben-Shmuel",
        guestPhoneHash: phoneResolution.phoneHash,
        guestPhoneObfuscated: obfuscatePhoneNumber(phoneResolution.normalizedPhoneNumber),
        shareContact: true,
        status: "pending",
        approvalStatus: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await seedThreadMessage(testBackend, {
      eventId,
      phone,
      clerkUserIds: [],
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    const threads = await hostBackend.query(api.smsConversations.listThreads, {
      eventId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });

    expect(threads).toHaveLength(1);
    expect(threads[0]?.participantName).toBe("Jordan Ben-Shmuel");
  });

  it("loads threads for an RSVP-only guest reference without rehashing its obfuscated phone", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    const phone = "555-111-7878";
    const phoneResolution = await normalizeAndHashPhoneNumber(phone);
    const rsvpId = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: `guest:${phoneResolution.phoneHash}`,
        listKey: "ga",
        userName: "RSVP Only Guest",
        guestPhoneHash: phoneResolution.phoneHash,
        guestPhoneObfuscated: obfuscatePhoneNumber(phoneResolution.normalizedPhoneNumber),
        shareContact: true,
        status: "pending",
        approvalStatus: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const threadId = await seedThreadMessage(testBackend, {
      eventId,
      phone,
      clerkUserIds: [],
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_rsvp_only"));

    const threads = await hostBackend.query(api.smsConversations.listThreadsByUserReference, {
      userReference: `rsvp~${rsvpId}`,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });

    expect(threads.map((thread) => thread._id)).toEqual([threadId]);
  });

  it("does not throw when an older client passes an obfuscated phone", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_obfuscated_phone"));

    const threads = await hostBackend.query(api.smsConversations.listThreadsByPhone, {
      phone: "***-***-7878",
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });

    expect(threads).toEqual([]);
  });

  it("records inbound webhook messages on existing threads", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    await seedUser(testBackend, {
      clerkUserId: "user_help",
      phone: "555-222-3333",
      firstName: "Morgan",
    });
    const threadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-222-3333",
      clerkUserIds: ["user_help"],
    });

    const mirroredCount = await testBackend.mutation(
      internal.smsConversations.recordInboundForExistingThreads,
      {
        fromPhoneNumber: "555-222-3333",
        body: "HELP",
        kind: "help",
        providerMessageId: "SM_help",
        providerStatus: "received",
      },
    );
    const messages = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("smsConversationMessages")
        .withIndex("by_thread_created", (queryBuilder) => queryBuilder.eq("threadId", threadId))
        .collect();
    });

    expect(mirroredCount).toBe(1);
    expect(messages.map((message) => message.body)).toEqual(["Inbound test", "HELP"]);
    expect(messages[1]?.kind).toBe("help");
  });

  it("updates provider status for conversation messages", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    await seedUser(testBackend, {
      clerkUserId: "user_status",
      phone: "555-333-4444",
      firstName: "Avery",
    });
    const threadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-333-4444",
      clerkUserIds: ["user_status"],
      direction: "outbound",
      providerMessageId: "SM_status",
      providerStatus: "sent",
    });

    const updatedCount = await testBackend.mutation(
      internal.smsConversations.updateProviderStatus,
      {
        providerMessageId: "SM_status",
        providerStatus: "delivered",
      },
    );
    const messages = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("smsConversationMessages")
        .withIndex("by_thread_created", (queryBuilder) => queryBuilder.eq("threadId", threadId))
        .collect();
    });

    expect(updatedCount).toBe(1);
    expect(messages[0]?.providerStatus).toBe("delivered");
  });

  it("records failed manual sends when Twilio is disabled", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    await seedUser(testBackend, {
      clerkUserId: "user_manual",
      phone: "555-444-5555",
      firstName: "Casey",
    });
    const threadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-444-5555",
      clerkUserIds: ["user_manual"],
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));
    const previousDevTwilioEnabled = process.env.DEV_TWILIO_ENABLED;
    process.env.DEV_TWILIO_ENABLED = "false";

    try {
      const result = await hostBackend.action(api.smsConversations.sendManualMessage, {
        threadId,
        body: "Manual hello",
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
      });

      expect(result.sent).toBe(false);
      expect(result.failureReason).toContain("Twilio disabled");
    } finally {
      if (previousDevTwilioEnabled === undefined) {
        delete process.env.DEV_TWILIO_ENABLED;
      } else {
        process.env.DEV_TWILIO_ENABLED = previousDevTwilioEnabled;
      }
    }

    const messages = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("smsConversationMessages")
        .withIndex("by_thread_created", (queryBuilder) => queryBuilder.eq("threadId", threadId))
        .collect();
    });

    expect(messages[messages.length - 1]?.body).toBe("Manual hello");
    expect(messages[messages.length - 1]?.providerStatus).toBe("failed");
    expect(messages[messages.length - 1]?.errorMessage).toContain("Twilio disabled");
    expect(messages[messages.length - 1]?.errorCode).toBe("TWILIO_DISABLED");
  });

  it("blocks manual sends for ambiguous phone ownership", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const eventId = await seedEvent(testBackend);
    await seedUser(testBackend, {
      clerkUserId: "user_first",
      phone: "555-555-6666",
      firstName: "First",
    });
    await seedUser(testBackend, {
      clerkUserId: "user_second",
      phone: "555-555-6666",
      firstName: "Second",
    });
    const threadId = await seedThreadMessage(testBackend, {
      eventId,
      phone: "555-555-6666",
      clerkUserIds: ["user_first", "user_second"],
    });
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));

    await expect(
      hostBackend.action(api.smsConversations.sendManualMessage, {
        threadId,
        body: "Cannot send",
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
      }),
    ).rejects.toThrow("more than one guest");
  });
});
