import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
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
    direction?: "inbound" | "outbound";
    providerMessageId?: string;
    providerStatus?: string;
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
    body: args.direction === "outbound" ? "Outbound test" : "Inbound test",
    providerMessageId: args.providerMessageId,
    providerStatus: args.providerStatus ?? "received",
    createdAt: Date.now(),
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
    expect(threads[0]?.canSend).toBe(true);
    expect(detail.thread.phoneObfuscated).toContain("2222");
    expect(detail.messages.map((message) => message.body)).toEqual(["Inbound test"]);
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
