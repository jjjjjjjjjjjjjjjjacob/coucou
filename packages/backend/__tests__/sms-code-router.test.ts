import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { buildGuestClerkUserId } from "../convex/lib/guestIdentity";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import { obfuscatePhoneNumber } from "../convex/lib/phoneUtils";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/smsCodeRouter.ts": () => import("../convex/smsCodeRouter"),
  "../convex/smsConversations.ts": () => import("../convex/smsConversations"),
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

async function seedEvent(
  testBackend: TestBackend,
  args: {
    name: string;
    code?: string;
    customFields?: Array<{ key: string; label: string; required?: boolean }>;
    primaryFieldConfig?: Doc<"events">["primaryFieldConfig"];
    workspaceSlug?: string | null;
    siteKey?: string;
  },
): Promise<{ eventId: Id<"events">; listCredentialId?: Id<"listCredentials"> }> {
  return await testBackend.run(async (databaseContext) => {
    const now = Date.now();
    const eventId = await databaseContext.db.insert("events", {
      workspaceSlug:
        args.workspaceSlug === null ? undefined : (args.workspaceSlug ?? "club-chlorine"),
      siteKey: args.siteKey ?? "club-chlorine",
      name: args.name,
      location: "Le Bain",
      eventDate: now + 86_400_000,
      status: "active",
      lifecycle: "published",
      customFields: args.customFields,
      primaryFieldConfig: args.primaryFieldConfig,
      rsvpConfirmationMessageEnabled: false,
      createdAt: now,
      updatedAt: now,
    });
    const listCredentialId = args.code
      ? await databaseContext.db.insert("listCredentials", {
          eventId,
          listKey: "ga",
          password: args.code,
          passwordNormalized: args.code.trim().toLowerCase(),
          createdAt: now,
        })
      : undefined;
    return { eventId, listCredentialId };
  });
}

async function processInbound(
  testBackend: TestBackend,
  args: {
    messageSid: string;
    phoneNumber: string;
    body: string;
  },
) {
  const receipt = await testBackend.mutation(internal.smsCodeRouter.beginInboundReceipt, {
    providerMessageId: args.messageSid,
    fromPhoneNumber: args.phoneNumber,
    toPhoneNumber: "+18449054257",
    body: args.body,
  });
  expect(receipt.accepted).toBe(true);
  return await testBackend.mutation(internal.smsCodeRouter.processReservedInbound, {
    providerMessageId: args.messageSid,
    fromPhoneNumber: args.phoneNumber,
    messageBody: args.body,
  });
}

describe("deterministic SMS code router", () => {
  it("starts a public event-code session for an unknown phone and completes it", async () => {
    const testBackend = setupTestBackend();
    const { eventId } = await seedEvent(testBackend, {
      name: "Saturday",
      code: "SATURDAY",
      customFields: [{ key: "city", label: "your city", required: true }],
    });

    const initialResult = await processInbound(testBackend, {
      messageSid: "SM_event_code",
      phoneNumber: "+15551230001",
      body: "  saturday ",
    });
    expect(initialResult.outcome).toBe("session_pending");
    expect(initialResult.responseMessage).toContain(
      "To complete your RSVP, reply with your full name and your city",
    );

    const partialResult = await processInbound(testBackend, {
      messageSid: "SM_partial",
      phoneNumber: "+15551230001",
      body: "Taylor Morgan",
    });
    expect(partialResult.outcome).toBe("session_pending");
    expect(partialResult.responseMessage).toContain("your city");

    const completedResult = await processInbound(testBackend, {
      messageSid: "SM_complete",
      phoneNumber: "+15551230001",
      body: "Brooklyn",
    });
    expect(completedResult.outcome).toBe("submitted");

    const storedRsvp = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
        .unique();
    });
    expect(storedRsvp?.userName).toBe("Taylor Morgan");
    expect(storedRsvp?.customFieldValues).toEqual({ city: "Brooklyn" });
    expect(storedRsvp?.smsConsent).toBe(true);
  });

  it("deduplicates a verified MessageSid before executing it again", async () => {
    const testBackend = setupTestBackend();
    await seedEvent(testBackend, { name: "Sunday", code: "SUNDAY" });
    await processInbound(testBackend, {
      messageSid: "SM_duplicate",
      phoneNumber: "+15551230002",
      body: "SUNDAY",
    });

    const duplicateReceipt = await testBackend.mutation(
      internal.smsCodeRouter.beginInboundReceipt,
      {
        providerMessageId: "SM_duplicate",
        fromPhoneNumber: "+15551230002",
        toPhoneNumber: "+18449054257",
        body: "SUNDAY",
      },
    );
    expect(duplicateReceipt.accepted).toBe(false);
  });

  it("uses one registered identity for immediate workspace-scoped prefill", async () => {
    const testBackend = setupTestBackend();
    const { eventId } = await seedEvent(testBackend, {
      name: "Known guest event",
      code: "KNOWN",
    });
    await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("users", {
        clerkUserId: "user_known",
        phone: "+15551230006",
        firstName: "Jordan",
        lastName: "Lee",
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_known_user",
      phoneNumber: "+15551230006",
      body: "KNOWN",
    });
    expect(result.outcome).toBe("submitted");
    const rsvp = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", eventId).eq("clerkUserId", "user_known"),
        )
        .unique();
    });
    expect(rsvp?.userName).toBe("Jordan Lee");
  });

  it("prefills required fields from prior guest RSVPs for the registered sending number", async () => {
    const testBackend = setupTestBackend();
    const phoneNumber = "+15551230016";
    const phoneResolution = await normalizeAndHashPhoneNumber(phoneNumber);
    const guestClerkUserId = buildGuestClerkUserId(phoneResolution.phoneHash);
    const priorEvent = await seedEvent(testBackend, {
      name: "Prior legacy event",
      workspaceSlug: null,
    });
    const destinationEvent = await seedEvent(testBackend, {
      name: "Known fields event",
      code: "PREFILLED",
      primaryFieldConfig: {
        socialPlatforms: [
          {
            platformKey: "instagram",
            label: "Instagram",
            required: true,
          },
        ],
      },
    });
    await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("users", {
        clerkUserId: "user_prefilled",
        phone: phoneNumber,
        createdAt: now,
        updatedAt: now,
      });
      const priorRsvpId = await databaseContext.db.insert("rsvps", {
        eventId: priorEvent.eventId,
        clerkUserId: guestClerkUserId,
        listKey: "ga",
        userName: "Jacob Smith",
        guestPhoneHash: phoneResolution.phoneHash,
        guestPhoneObfuscated: obfuscatePhoneNumber(phoneNumber),
        shareContact: true,
        smsConsent: true,
        status: "approved",
        approvalStatus: "approved",
        createdAt: now,
        updatedAt: now,
      });
      await databaseContext.db.insert("rsvpSocialProfiles", {
        eventId: priorEvent.eventId,
        rsvpId: priorRsvpId,
        clerkUserId: guestClerkUserId,
        platformKey: "instagram",
        handle: "@jacob",
        normalizedHandle: "jacob",
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_prefilled_guest_history",
      phoneNumber,
      body: "PREFILLED",
    });

    expect(result.outcome).toBe("submitted");
    expect(result.shouldRespond).toBe(false);
    const destinationRsvpState = await testBackend.run(async (databaseContext) => {
      const destinationRsvp = await databaseContext.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", destinationEvent.eventId).eq("clerkUserId", "user_prefilled"),
        )
        .unique();
      const destinationSocialProfiles = destinationRsvp
        ? await databaseContext.db
            .query("rsvpSocialProfiles")
            .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", destinationRsvp._id))
            .collect()
        : [];
      return { destinationRsvp, destinationSocialProfiles };
    });
    expect(destinationRsvpState.destinationRsvp?.userName).toBe("Jacob Smith");
    expect(destinationRsvpState.destinationSocialProfiles).toEqual([
      expect.objectContaining({ platformKey: "instagram", handle: "jacob" }),
    ]);
  });

  it("rolls up split same-phone RSVP history and submits without a completion prompt", async () => {
    const testBackend = setupTestBackend();
    const phoneNumber = "+15551230007";
    const phoneResolution = await normalizeAndHashPhoneNumber(phoneNumber);
    const oldestPriorEvent = await seedEvent(testBackend, { name: "Old history" });
    const newestPriorEvent = await seedEvent(testBackend, { name: "New history" });
    const additionalPriorEvent = await seedEvent(testBackend, { name: "More history" });
    const destinationEvent = await seedEvent(testBackend, {
      name: "August 8",
      code: "AMBIG",
      primaryFieldConfig: {
        socialPlatforms: [{ platformKey: "instagram", label: "Instagram", required: true }],
      },
    });
    await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("users", {
        clerkUserId: "user_one",
        phone: phoneNumber,
        phoneHash: phoneResolution.phoneHash,
        firstName: "Jacob",
        lastName: "Stein",
        createdAt: now - 10_000,
        updatedAt: now,
      });
      await databaseContext.db.insert("users", {
        clerkUserId: "user_two",
        phone: phoneNumber,
        phoneHash: phoneResolution.phoneHash,
        firstName: "Jacob",
        lastName: "Stein",
        createdAt: now,
        updatedAt: now,
      });
      await databaseContext.db.insert("rsvps", {
        eventId: oldestPriorEvent.eventId,
        clerkUserId: "user_one",
        listKey: "ga",
        userName: "Jacob Stein",
        shareContact: true,
        status: "approved",
        approvalStatus: "approved",
        createdAt: now - 20_000,
        updatedAt: now - 20_000,
      });
      const newestPriorRsvpId = await databaseContext.db.insert("rsvps", {
        eventId: newestPriorEvent.eventId,
        clerkUserId: "user_two",
        listKey: "ga",
        userName: "Jacob Stein",
        shareContact: true,
        status: "approved",
        approvalStatus: "approved",
        createdAt: now - 5_000,
        updatedAt: now - 5_000,
      });
      await databaseContext.db.insert("rsvpSocialProfiles", {
        eventId: newestPriorEvent.eventId,
        rsvpId: newestPriorRsvpId,
        clerkUserId: "user_two",
        platformKey: "instagram",
        handle: "jacobstein",
        normalizedHandle: "jacobstein",
        createdAt: now - 5_000,
        updatedAt: now - 5_000,
      });
      await databaseContext.db.insert("rsvps", {
        eventId: additionalPriorEvent.eventId,
        clerkUserId: "user_two",
        listKey: "ga",
        userName: "Jacob Stein",
        shareContact: true,
        status: "approved",
        approvalStatus: "approved",
        createdAt: now - 1_000,
        updatedAt: now - 1_000,
      });
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_ambiguous_user",
      phoneNumber,
      body: "AMBIG",
    });
    expect(result.outcome).toBe("submitted");
    expect(result.shouldRespond).toBe(false);
    const destinationRsvp = await testBackend.run(
      async (databaseContext) =>
        await databaseContext.db
          .query("rsvps")
          .withIndex("by_event_user", (queryBuilder) =>
            queryBuilder.eq("eventId", destinationEvent.eventId).eq("clerkUserId", "user_two"),
          )
          .unique(),
    );
    expect(destinationRsvp?.userName).toBe("Jacob Stein");
  });

  it("does not prefill from another workspace that shares the same site key", async () => {
    const testBackend = setupTestBackend();
    const phoneNumber = "+15551230011";
    const phoneResolution = await normalizeAndHashPhoneNumber(phoneNumber);
    const guestClerkUserId = buildGuestClerkUserId(phoneResolution.phoneHash);
    const destinationEvent = await seedEvent(testBackend, {
      name: "Destination workspace",
      code: "PRIVATE",
      customFields: [{ key: "city", label: "your city", required: true }],
      workspaceSlug: "destination-workspace",
      siteKey: "shared-site",
    });
    const otherWorkspaceEvent = await seedEvent(testBackend, {
      name: "Other workspace",
      workspaceSlug: "other-workspace",
      siteKey: "shared-site",
    });
    await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("rsvps", {
        eventId: otherWorkspaceEvent.eventId,
        clerkUserId: guestClerkUserId,
        listKey: "ga",
        userName: "Private Person",
        guestPhoneHash: phoneResolution.phoneHash,
        guestPhoneObfuscated: obfuscatePhoneNumber(phoneNumber),
        shareContact: true,
        smsConsent: true,
        customFieldValues: { city: "Secret City" },
        status: "pending",
        approvalStatus: "pending",
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_workspace_scope",
      phoneNumber,
      body: "PRIVATE",
    });
    expect(result.outcome).toBe("session_pending");
    expect(result.responseMessage).toContain("your full name and your city");
    const destinationRsvps = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) =>
          queryBuilder.eq("eventId", destinationEvent.eventId),
        )
        .collect();
    });
    expect(destinationRsvps).toHaveLength(0);
  });

  it("rejects extra comma values without changing the draft", async () => {
    const testBackend = setupTestBackend();
    await seedEvent(testBackend, {
      name: "Strict values",
      code: "STRICT",
      customFields: [{ key: "city", label: "your city", required: true }],
    });
    await processInbound(testBackend, {
      messageSid: "SM_strict_start",
      phoneNumber: "+15551230008",
      body: "STRICT",
    });
    const result = await processInbound(testBackend, {
      messageSid: "SM_strict_extra",
      phoneNumber: "+15551230008",
      body: "Alex Smith, Brooklyn, Extra",
    });
    expect(result.outcome).toBe("invalid_values");
    const phoneResolution = await normalizeAndHashPhoneNumber("+15551230008");
    const session = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("smsRsvpSessions")
        .withIndex("by_phone_status", (queryBuilder) =>
          queryBuilder.eq("phoneHash", phoneResolution.phoneHash).eq("status", "active"),
        )
        .unique();
    });
    expect(session?.firstName).toBeUndefined();
    expect(session?.customFieldValues).toEqual({});
  });

  it("revalidates and cancels a session when its event closes", async () => {
    const testBackend = setupTestBackend();
    const { eventId } = await seedEvent(testBackend, {
      name: "Closing event",
      code: "CLOSING",
    });
    await processInbound(testBackend, {
      messageSid: "SM_closing_start",
      phoneNumber: "+15551230009",
      body: "CLOSING",
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(eventId, {
        lifecycle: "draft",
        updatedAt: Date.now(),
      });
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_closing_value",
      phoneNumber: "+15551230009",
      body: "Morgan Reed",
    });
    expect(result.outcome).toBe("target_unavailable");
    expect(result.responseMessage).toContain("no longer accepting");
  });

  it("moves a different-list RSVP to pending and invalidates its prior ticket", async () => {
    const testBackend = setupTestBackend();
    const phoneNumber = "+15551230010";
    const phoneResolution = await normalizeAndHashPhoneNumber(phoneNumber);
    const guestClerkUserId = buildGuestClerkUserId(phoneResolution.phoneHash);
    const { eventId } = await seedEvent(testBackend, {
      name: "List move",
      code: "GENERAL",
    });
    await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "vip",
        password: "VIP",
        passwordNormalized: "vip",
        createdAt: now,
      });
      await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: guestClerkUserId,
        listKey: "vip",
        userName: "Casey Jones",
        guestPhoneHash: phoneResolution.phoneHash,
        guestPhoneObfuscated: obfuscatePhoneNumber(phoneNumber),
        ticketStatus: "issued",
        shareContact: true,
        smsConsent: true,
        status: "approved",
        approvalStatus: "approved",
        createdAt: now,
        updatedAt: now,
      });
      await databaseContext.db.insert("redemptions", {
        eventId,
        clerkUserId: guestClerkUserId,
        listKey: "vip",
        code: "OLDTICKET",
        createdAt: now,
        unredeemHistory: [],
      });
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_list_move",
      phoneNumber,
      body: "GENERAL",
    });
    expect(result.outcome).toBe("submitted");
    const state = await testBackend.run(async (databaseContext) => {
      const rsvp = await databaseContext.db
        .query("rsvps")
        .withIndex("by_event_guestPhoneHash", (queryBuilder) =>
          queryBuilder.eq("eventId", eventId).eq("guestPhoneHash", phoneResolution.phoneHash),
        )
        .unique();
      const redemption = await databaseContext.db
        .query("redemptions")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", eventId).eq("clerkUserId", guestClerkUserId),
        )
        .unique();
      return { rsvp, redemption };
    });
    expect(state.rsvp?.listKey).toBe("ga");
    expect(state.rsvp?.approvalStatus).toBe("pending");
    expect(state.rsvp?.ticketStatus).toBe("not-issued");
    expect(state.redemption).toBeNull();
  });

  it("gives an event password priority over a custom reply action with the same code", async () => {
    const testBackend = setupTestBackend();
    const phoneNumber = "+15551230014";
    const passwordEvent = await seedEvent(testBackend, {
      name: "Password destination",
      code: "DEFAULT",
    });
    const customActionEvent = await seedEvent(testBackend, {
      name: "Custom action destination",
    });

    await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("listCredentials", {
        eventId: passwordEvent.eventId,
        listKey: "vip",
        password: "VIP",
        passwordNormalized: "vip",
        createdAt: now,
      });
      await databaseContext.db.insert("listCredentials", {
        eventId: customActionEvent.eventId,
        listKey: "ga",
        createdAt: now,
      });
      await databaseContext.db.insert("users", {
        clerkUserId: "event_password_user",
        phone: phoneNumber,
        firstName: "Default",
        lastName: "Guest",
        createdAt: now,
        updatedAt: now,
      });
      const existingRsvpId = await databaseContext.db.insert("rsvps", {
        eventId: passwordEvent.eventId,
        clerkUserId: "event_password_user",
        listKey: "vip",
        userName: "Default Guest",
        shareContact: true,
        smsConsent: true,
        status: "approved",
        approvalStatus: "approved",
        createdAt: now,
        updatedAt: now,
      });
      const textBlastId = await databaseContext.db.insert("textBlasts", {
        eventId: passwordEvent.eventId,
        name: "Conflicting legacy action",
        message: "Reply DEFAULT",
        targetLists: ["vip"],
        recipientCount: 1,
        sentCount: 1,
        failedCount: 0,
        sentBy: "host",
        status: "sent",
        createdAt: now,
        updatedAt: now,
      });
      await databaseContext.db.insert("textBlastReplyActions", {
        textBlastId,
        replyCode: "DEFAULT",
        replyCodeNormalized: "default",
        targetEventId: customActionEvent.eventId,
        targetListKey: "ga",
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
      const phoneResolution = await normalizeAndHashPhoneNumber(phoneNumber);
      await databaseContext.db.insert("textBlastRecipients", {
        textBlastId,
        phoneHash: phoneResolution.phoneHash,
        status: "sent",
        sourceEventIds: [passwordEvent.eventId],
        sourceRsvpIds: [existingRsvpId],
        sourceListKeys: ["vip"],
        recipientClerkUserIds: ["event_password_user"],
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_event_password_priority",
      phoneNumber,
      body: "DEFAULT",
    });
    expect(result.outcome).toBe("submitted");

    const state = await testBackend.run(async (databaseContext) => {
      const passwordEventRsvp = await databaseContext.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder
            .eq("eventId", passwordEvent.eventId)
            .eq("clerkUserId", "event_password_user"),
        )
        .unique();
      const customActionEventRsvps = await databaseContext.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) =>
          queryBuilder.eq("eventId", customActionEvent.eventId),
        )
        .collect();
      return { passwordEventRsvp, customActionEventRsvps };
    });
    expect(state.passwordEventRsvp?.listKey).toBe("ga");
    expect(state.customActionEventRsvps).toHaveLength(0);
  });

  it("stores ordinary free text only in the most recent outbound thread", async () => {
    const testBackend = setupTestBackend();
    const firstEvent = await seedEvent(testBackend, { name: "First" });
    const secondEvent = await seedEvent(testBackend, { name: "Second" });
    const phoneNumber = "+15551230003";
    const phoneResolution = await normalizeAndHashPhoneNumber(phoneNumber);
    const phoneObfuscated = obfuscatePhoneNumber(phoneResolution.normalizedPhoneNumber);
    await testBackend.mutation(internal.smsConversations.recordMessage, {
      eventId: firstEvent.eventId,
      phoneHash: phoneResolution.phoneHash,
      phoneObfuscated,
      direction: "outbound",
      kind: "blast",
      body: "First outbound",
      createdAt: 100,
    });
    await testBackend.mutation(internal.smsConversations.recordMessage, {
      eventId: secondEvent.eventId,
      phoneHash: phoneResolution.phoneHash,
      phoneObfuscated,
      direction: "outbound",
      kind: "blast",
      body: "Second outbound",
      createdAt: 200,
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_free_text",
      phoneNumber,
      body: "TEST",
    });
    expect(result.outcome).toBe("unmatched_message");
    expect(result.shouldRespond).toBe(false);

    const inboundMessages = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("smsConversationMessages")
        .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("direction"), "inbound"))
        .collect();
    });
    expect(inboundMessages).toHaveLength(1);
    expect(inboundMessages[0]?.eventId).toBe(secondEvent.eventId);
  });

  it("keeps unmatched free text audit-only when the phone has no thread", async () => {
    const testBackend = setupTestBackend();
    const result = await processInbound(testBackend, {
      messageSid: "SM_no_thread",
      phoneNumber: "+15551230012",
      body: "HELLO",
    });
    expect(result.outcome).toBe("unmatched_message");
    expect(result.shouldRespond).toBe(false);
    const state = await testBackend.run(async (databaseContext) => {
      const receipts = await databaseContext.db.query("smsInboundReceipts").collect();
      const threads = await databaseContext.db.query("smsConversationThreads").collect();
      const messages = await databaseContext.db.query("smsConversationMessages").collect();
      return { receipts, threads, messages };
    });
    expect(state.receipts).toHaveLength(1);
    expect(state.receipts[0]?.status).toBe("processed");
    expect(state.threads).toHaveLength(0);
    expect(state.messages).toHaveLength(0);
  });

  it("routes an eligible action code to its destination event", async () => {
    const testBackend = setupTestBackend();
    const phoneNumber = "+15551230013";
    const sourceEvent = await seedEvent(testBackend, { name: "Action source" });
    const targetEvent = await seedEvent(testBackend, { name: "Action target" });
    const textBlastId = await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("listCredentials", {
        eventId: targetEvent.eventId,
        listKey: "ga",
        createdAt: now,
      });
      await databaseContext.db.insert("users", {
        clerkUserId: "eligible_action_user",
        phone: phoneNumber,
        firstName: "Eligible",
        lastName: "Guest",
        createdAt: now,
        updatedAt: now,
      });
      const sourceRsvpId = await databaseContext.db.insert("rsvps", {
        eventId: sourceEvent.eventId,
        clerkUserId: "eligible_action_user",
        listKey: "ga",
        userName: "Eligible Guest",
        shareContact: true,
        smsConsent: true,
        status: "approved",
        approvalStatus: "approved",
        createdAt: now,
        updatedAt: now,
      });
      const blastId = await databaseContext.db.insert("textBlasts", {
        eventId: sourceEvent.eventId,
        name: "Eligible action",
        message: "Reply MOVE",
        targetLists: ["ga"],
        recipientCount: 1,
        sentCount: 1,
        failedCount: 0,
        sentBy: "host",
        status: "sent",
        createdAt: now,
        updatedAt: now,
      });
      await databaseContext.db.insert("textBlastReplyActions", {
        textBlastId: blastId,
        replyCode: "MOVE",
        replyCodeNormalized: "move",
        targetEventId: targetEvent.eventId,
        targetListKey: "ga",
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
      const phoneResolution = await normalizeAndHashPhoneNumber(phoneNumber);
      await databaseContext.db.insert("textBlastRecipients", {
        textBlastId: blastId,
        phoneHash: phoneResolution.phoneHash,
        status: "sent",
        sourceEventIds: [sourceEvent.eventId],
        sourceRsvpIds: [sourceRsvpId],
        sourceListKeys: ["ga"],
        recipientClerkUserIds: ["eligible_action_user"],
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return blastId;
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_eligible_action",
      phoneNumber,
      body: "move",
    });
    expect(result.outcome).toBe("submitted");
    const state = await testBackend.run(async (databaseContext) => {
      const destinationRsvp = await databaseContext.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", targetEvent.eventId).eq("clerkUserId", "eligible_action_user"),
        )
        .unique();
      const destinationMessages = await databaseContext.db
        .query("smsConversationMessages")
        .withIndex("by_event_phone", (queryBuilder) =>
          queryBuilder.eq("eventId", targetEvent.eventId),
        )
        .collect();
      const sourceMessages = await databaseContext.db
        .query("smsConversationMessages")
        .withIndex("by_event_phone", (queryBuilder) =>
          queryBuilder.eq("eventId", sourceEvent.eventId),
        )
        .collect();
      return { destinationRsvp, destinationMessages, sourceMessages };
    });
    expect(textBlastId).toBeTruthy();
    expect(state.destinationRsvp?.userName).toBe("Eligible Guest");
    expect(state.destinationMessages).toHaveLength(1);
    expect(state.sourceMessages).toHaveLength(0);
  });

  it("treats an action code from an ineligible phone as ordinary free text", async () => {
    const testBackend = setupTestBackend();
    const sourceEvent = await seedEvent(testBackend, { name: "Source" });
    const targetEvent = await seedEvent(testBackend, {
      name: "Target",
      code: "PUBLIC",
    });
    const textBlastId = await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      const blastId = await databaseContext.db.insert("textBlasts", {
        eventId: sourceEvent.eventId,
        name: "Action blast",
        message: "Reply MOVE",
        targetLists: ["ga"],
        recipientCount: 1,
        sentCount: 1,
        failedCount: 0,
        sentBy: "host",
        status: "sent",
        createdAt: now,
        updatedAt: now,
      });
      await databaseContext.db.insert("textBlastReplyActions", {
        textBlastId: blastId,
        replyCode: "MOVE",
        replyCodeNormalized: "move",
        targetEventId: targetEvent.eventId,
        targetListKey: "ga",
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
      return blastId;
    });
    const eligiblePhone = await normalizeAndHashPhoneNumber("+15551230004");
    await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      await databaseContext.db.insert("textBlastRecipients", {
        textBlastId,
        phoneHash: eligiblePhone.phoneHash,
        status: "sent",
        sourceEventIds: [sourceEvent.eventId],
        sourceRsvpIds: [],
        sourceListKeys: ["ga"],
        recipientClerkUserIds: ["eligible_user"],
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await processInbound(testBackend, {
      messageSid: "SM_leaked_action",
      phoneNumber: "+15551230005",
      body: "MOVE",
    });
    expect(result.outcome).toBe("not_eligible");
    expect(result.shouldRespond).toBe(false);
    const targetRsvps = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", targetEvent.eventId))
        .collect();
    });
    expect(targetRsvps).toHaveLength(0);
  });
});
