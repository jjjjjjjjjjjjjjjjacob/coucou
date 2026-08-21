import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { action, internalMutation, internalQuery, query } from "./functions";
import { resolveCanonicalRsvpId, resolveCanonicalUserById } from "./lib/canonicalUserIdentity";
import { normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { obfuscatePhoneNumber } from "./lib/phoneUtils";
import { resolveStoredUserDisplayName } from "./lib/rsvpUserName";
import { ensureEventInSiteScope, eventMatchesSiteScope } from "./lib/siteScope";
import {
  recordSmsConversationMessage,
  type SmsConversationDirection,
  type SmsConversationKind,
  updateSmsConversationProviderStatus,
  upsertSmsConversationThread,
} from "./lib/smsConversationRecords";
import { formatSmsMessageForSite } from "./lib/smsProgramCopy";
import {
  type ResolvedWorkspaceAuthScope,
  requireWorkspaceHost,
  requireWorkspaceRead,
} from "./lib/workspaceAuth";

const smsConversationDirectionValidator = v.union(
  v.literal("inbound"),
  v.literal("outbound"),
  v.literal("system"),
);

const smsConversationKindValidator = v.union(
  v.literal("sms"),
  v.literal("manual"),
  v.literal("blast"),
  v.literal("approval"),
  v.literal("consent"),
  v.literal("reply_action"),
  v.literal("opt_out"),
  v.literal("help"),
  v.literal("delivery_status"),
  v.literal("system"),
);

const smsConversationFilterStateValidator = v.union(
  v.literal("needs_reply"),
  v.literal("waiting_on_guest"),
  v.literal("has_incoming"),
  v.literal("no_incoming"),
);

const scopeArgs = {
  siteKey: v.optional(v.string()),
  workspaceSlug: v.optional(v.string()),
};

type SiteScopeArgs = {
  siteKey?: string;
  workspaceSlug?: string;
};

type SmsConversationFilterState =
  | "needs_reply"
  | "waiting_on_guest"
  | "has_incoming"
  | "no_incoming";

type SendReadiness =
  | { state: "ready"; phoneNumber: string; clerkUserId: string }
  | { state: "ambiguous"; reason: string }
  | { state: "no_phone"; reason: string };

type ThreadParticipantSummary = {
  displayName: string;
  clerkUserIds: string[];
};

type SendSmsInternalResult = {
  success?: boolean;
  messageId?: string;
  error?: string;
  skipped?: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sendManualMessageToReadyThread(
  ctx: Pick<ActionCtx, "runAction" | "runMutation">,
  args: {
    thread: Doc<"smsConversationThreads">;
    phoneNumber: string;
    body: string;
    siteKey?: string;
    adminClerkUserId: string;
  },
): Promise<{
  sent: boolean;
  providerMessageId?: string;
  failureReason?: string;
}> {
  const formattedBody = formatSmsMessageForSite(args.siteKey, args.body);
  if (formattedBody.length > 1600) {
    return {
      sent: false,
      failureReason: "Message must be 1600 characters or fewer after required branding.",
    };
  }

  let sendResult: SendSmsInternalResult;
  try {
    sendResult = (await ctx.runAction(internal.smsActions.sendSmsInternal, {
      eventId: args.thread.eventId,
      phoneNumber: args.phoneNumber,
      message: formattedBody,
      messageType: "Transactional",
    })) as SendSmsInternalResult;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await ctx.runMutation(internal.smsConversations.recordMessage, {
      eventId: args.thread.eventId,
      phoneHash: args.thread.phoneHash,
      phoneObfuscated: args.thread.phoneObfuscated,
      participantClerkUserIds: args.thread.participantClerkUserIds,
      direction: "outbound",
      kind: "manual",
      body: formattedBody,
      providerStatus: "failed",
      adminClerkUserId: args.adminClerkUserId,
    });
    return { sent: false, failureReason: errorMessage };
  }

  const sent = sendResult.success === true;
  const failureReason = sent ? undefined : (sendResult.error ?? sendResult.skipped);
  await ctx.runMutation(internal.smsConversations.recordMessage, {
    eventId: args.thread.eventId,
    phoneHash: args.thread.phoneHash,
    phoneObfuscated: args.thread.phoneObfuscated,
    participantClerkUserIds: args.thread.participantClerkUserIds,
    direction: "outbound",
    kind: "manual",
    body: formattedBody,
    providerMessageId: sendResult.messageId,
    providerStatus: sent ? "sent" : "failed",
    adminClerkUserId: args.adminClerkUserId,
  });

  return {
    sent,
    providerMessageId: sendResult.messageId,
    failureReason,
  };
}

function notificationKindForType(type: string): SmsConversationKind {
  switch (type) {
    case "approval":
      return "approval";
    case "blast":
      return "blast";
    case "sms_consent_enabled":
    case "sms_consent_disabled":
      return "consent";
    case "rsvp_confirmation":
      return "reply_action";
    default:
      return "system";
  }
}

function threadMatchesConversationFilterState(
  thread: Doc<"smsConversationThreads">,
  filterState: SmsConversationFilterState,
): boolean {
  switch (filterState) {
    case "needs_reply":
      return thread.lastMessageDirection === "inbound";
    case "waiting_on_guest":
      return thread.lastMessageDirection === "outbound";
    case "has_incoming":
      return thread.inboundCount > 0;
    case "no_incoming":
      return thread.inboundCount === 0;
  }
}

function splitRsvpDisplayName(displayName: string | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const normalizedDisplayName = displayName?.trim().replace(/\s+/g, " ");
  if (!normalizedDisplayName) return {};

  const nameParts = normalizedDisplayName.split(" ");
  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(" ") || undefined,
  };
}

function resolveParticipantDisplayName(
  user: Doc<"users"> | null,
  rsvp: Doc<"rsvps"> | null,
): string | null {
  const rsvpDisplayName = rsvp?.userName?.trim().replace(/\s+/g, " ");
  const rsvpNameParts = splitRsvpDisplayName(rsvpDisplayName);
  const firstName = user?.firstName?.trim() || rsvpNameParts.firstName;
  const lastName = user?.lastName?.trim() || rsvpNameParts.lastName;
  const combinedDisplayName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return combinedDisplayName || resolveStoredUserDisplayName(user) || rsvpDisplayName || null;
}

async function getUserByClerkUserId(
  ctx: Pick<QueryCtx, "db">,
  clerkUserId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
    .unique();
}

async function summarizeThreadParticipants(
  ctx: Pick<QueryCtx, "db">,
  thread: Doc<"smsConversationThreads">,
): Promise<ThreadParticipantSummary> {
  const participantRecords = await Promise.all(
    thread.participantClerkUserIds.map(async (clerkUserId) => {
      const [user, rsvp] = await Promise.all([
        getUserByClerkUserId(ctx, clerkUserId),
        ctx.db
          .query("rsvps")
          .withIndex("by_event_user", (queryBuilder) =>
            queryBuilder.eq("eventId", thread.eventId).eq("clerkUserId", clerkUserId),
          )
          .first(),
      ]);
      return { user, rsvp };
    }),
  );
  const displayNames = participantRecords
    .map(({ user, rsvp }) => resolveParticipantDisplayName(user, rsvp))
    .filter((displayName): displayName is string => displayName !== null);

  if (displayNames.length === 0) {
    const phoneMatchedRsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_guestPhoneHash", (queryBuilder) =>
        queryBuilder.eq("eventId", thread.eventId).eq("guestPhoneHash", thread.phoneHash),
      )
      .first();
    const phoneMatchedDisplayName = resolveParticipantDisplayName(null, phoneMatchedRsvp);
    if (phoneMatchedDisplayName) {
      displayNames.push(phoneMatchedDisplayName);
    }
  }

  return {
    displayName: displayNames[0] ?? thread.phoneObfuscated,
    clerkUserIds: thread.participantClerkUserIds,
  };
}

async function resolveThreadSendReadiness(
  ctx: Pick<QueryCtx, "db">,
  thread: Doc<"smsConversationThreads">,
): Promise<SendReadiness> {
  const sendableUsers: Array<{ clerkUserId: string; phoneNumber: string }> = [];

  for (const clerkUserId of thread.participantClerkUserIds) {
    const user = await getUserByClerkUserId(ctx, clerkUserId);
    if (!user?.phone) {
      continue;
    }

    try {
      const phoneResolution = await normalizeAndHashPhoneNumber(user.phone);
      if (phoneResolution.phoneHash === thread.phoneHash) {
        sendableUsers.push({ clerkUserId, phoneNumber: phoneResolution.normalizedPhoneNumber });
      }
    } catch (error) {
      console.warn(
        `[resolveThreadSendReadiness] Skipping invalid phone for ${clerkUserId}: ${getErrorMessage(error)}`,
      );
    }
  }

  if (sendableUsers.length === 1) {
    return {
      state: "ready",
      clerkUserId: sendableUsers[0].clerkUserId,
      phoneNumber: sendableUsers[0].phoneNumber,
    };
  }

  if (sendableUsers.length > 1) {
    return {
      state: "ambiguous",
      reason: "This phone number is linked to more than one guest.",
    };
  }

  return {
    state: "no_phone",
    reason: "No linked guest phone is available for this thread.",
  };
}

async function getThreadInScope(
  ctx: Pick<QueryCtx, "db">,
  threadId: Id<"smsConversationThreads">,
  scope: SiteScopeArgs,
): Promise<Doc<"smsConversationThreads">> {
  const thread = await ctx.db.get(threadId);
  if (!thread) {
    throw new Error("Conversation thread not found");
  }

  await ensureEventInSiteScope(ctx, thread.eventId, scope);
  return thread;
}

export const ensureThreadForPhoneHash = internalMutation({
  args: {
    eventId: v.id("events"),
    phoneHash: v.string(),
    phoneObfuscated: v.string(),
    participantClerkUserIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Id<"smsConversationThreads">> => {
    const thread = await upsertSmsConversationThread(ctx, {
      eventId: args.eventId,
      phoneHash: args.phoneHash,
      phoneObfuscated: args.phoneObfuscated,
      participantClerkUserIds: args.participantClerkUserIds,
    });
    return thread._id;
  },
});

export const recordMessage = internalMutation({
  args: {
    eventId: v.id("events"),
    phoneHash: v.string(),
    phoneObfuscated: v.string(),
    participantClerkUserIds: v.optional(v.array(v.string())),
    direction: smsConversationDirectionValidator,
    kind: smsConversationKindValidator,
    body: v.optional(v.string()),
    mediaUrls: v.optional(v.array(v.string())),
    qrCodeSent: v.optional(v.boolean()),
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    smsNotificationId: v.optional(v.id("smsNotifications")),
    textBlastId: v.optional(v.id("textBlasts")),
    textBlastRecipientId: v.optional(v.id("textBlastRecipients")),
    replyAttemptId: v.optional(v.id("textBlastReplyAttempts")),
    adminClerkUserId: v.optional(v.string()),
    rawPayload: v.optional(v.any()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"smsConversationMessages">> => {
    return await recordSmsConversationMessage(ctx, {
      ...args,
      direction: args.direction as SmsConversationDirection,
      kind: args.kind as SmsConversationKind,
    });
  },
});

export const updateProviderStatus = internalMutation({
  args: {
    providerMessageId: v.string(),
    providerStatus: v.string(),
    smsNotificationId: v.optional(v.id("smsNotifications")),
  },
  handler: async (ctx, args): Promise<number> => {
    return await updateSmsConversationProviderStatus(ctx, args);
  },
});

export const recordInboundForExistingThreads = internalMutation({
  args: {
    fromPhoneNumber: v.string(),
    body: v.string(),
    kind: smsConversationKindValidator,
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    rawPayload: v.optional(v.any()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<number> => {
    const phoneResolution = await normalizeAndHashPhoneNumber(args.fromPhoneNumber);
    const threads = await ctx.db
      .query("smsConversationThreads")
      .withIndex("by_phone", (queryBuilder) =>
        queryBuilder.eq("phoneHash", phoneResolution.phoneHash),
      )
      .collect();
    const createdAt = args.createdAt ?? Date.now();

    for (const thread of threads) {
      await recordSmsConversationMessage(ctx, {
        eventId: thread.eventId,
        phoneHash: thread.phoneHash,
        phoneObfuscated: thread.phoneObfuscated,
        participantClerkUserIds: thread.participantClerkUserIds,
        direction: "inbound",
        kind: args.kind as SmsConversationKind,
        body: args.body,
        providerMessageId: args.providerMessageId,
        providerStatus: args.providerStatus,
        rawPayload: args.rawPayload,
        createdAt,
      });
    }

    return threads.length;
  },
});

export const recordOutboundForExistingThreads = internalMutation({
  args: {
    toPhoneNumber: v.string(),
    body: v.string(),
    kind: smsConversationKindValidator,
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<number> => {
    const phoneResolution = await normalizeAndHashPhoneNumber(args.toPhoneNumber);
    const threads = await ctx.db
      .query("smsConversationThreads")
      .withIndex("by_phone", (queryBuilder) =>
        queryBuilder.eq("phoneHash", phoneResolution.phoneHash),
      )
      .collect();
    const createdAt = args.createdAt ?? Date.now();

    for (const thread of threads) {
      await recordSmsConversationMessage(ctx, {
        eventId: thread.eventId,
        phoneHash: thread.phoneHash,
        phoneObfuscated: thread.phoneObfuscated,
        participantClerkUserIds: thread.participantClerkUserIds,
        direction: "outbound",
        kind: args.kind as SmsConversationKind,
        body: args.body,
        providerMessageId: args.providerMessageId,
        providerStatus: args.providerStatus,
        createdAt,
      });
    }

    return threads.length;
  },
});

export const getNotificationMirrorContext = internalQuery({
  args: {
    notificationId: v.id("smsNotifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;

    let phoneHash = notification.recipientPhoneHash;
    if (!phoneHash && notification.textBlastRecipientId) {
      const delivery = await ctx.db.get(notification.textBlastRecipientId);
      phoneHash = delivery?.phoneHash;
    }
    if (!phoneHash) return null;

    return {
      eventId: notification.eventId,
      phoneHash,
      phoneObfuscated: notification.recipientPhoneObfuscated,
      participantClerkUserIds: [notification.recipientClerkUserId],
      direction: "outbound" as const,
      kind: notificationKindForType(notification.type),
      body: notification.message,
      smsNotificationId: notification._id,
      textBlastId: notification.textBlastId,
      textBlastRecipientId: notification.textBlastRecipientId,
      providerMessageId: notification.messageId,
      providerStatus: notification.status,
      createdAt: notification.sentAt ?? notification.createdAt,
    };
  },
});

export const getThreadSendTargetInternal = internalQuery({
  args: {
    threadId: v.id("smsConversationThreads"),
    ...scopeArgs,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    thread: Doc<"smsConversationThreads">;
    sendReadiness: SendReadiness;
  }> => {
    const thread = await getThreadInScope(ctx, args.threadId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const sendReadiness = await resolveThreadSendReadiness(ctx, thread);
    return { thread, sendReadiness };
  },
});

export const getRsvpThreadTargetInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    rsvpId: v.id("rsvps"),
    ...scopeArgs,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    eventId: Id<"events">;
    phoneHash: string;
    phoneObfuscated: string;
    phoneNumber: string;
    participantClerkUserIds: string[];
    clerkUserId: string;
  }> => {
    await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp || rsvp.eventId !== args.eventId) {
      throw new Error("RSVP not found");
    }
    const user = await getUserByClerkUserId(ctx, rsvp.clerkUserId);
    if (!user?.phone) {
      throw new Error("No linked phone is available for this RSVP");
    }
    const phoneResolution = await normalizeAndHashPhoneNumber(user.phone);
    return {
      eventId: args.eventId,
      phoneHash: phoneResolution.phoneHash,
      phoneObfuscated: obfuscatePhoneNumber(phoneResolution.normalizedPhoneNumber),
      phoneNumber: phoneResolution.normalizedPhoneNumber,
      participantClerkUserIds: [rsvp.clerkUserId],
      clerkUserId: rsvp.clerkUserId,
    };
  },
});

export const listThreads = query({
  args: {
    eventId: v.optional(v.id("events")),
    search: v.optional(v.string()),
    conversationStates: v.optional(v.array(smsConversationFilterStateValidator)),
    ...scopeArgs,
  },
  handler: async (ctx, args) => {
    const workspaceScope = await requireWorkspaceRead(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const eventScope = {
      siteKey: args.siteKey ?? workspaceScope.siteKey ?? undefined,
      workspaceSlug: args.workspaceSlug ?? workspaceScope.workspaceSlug,
    };
    const scopedEvents = args.eventId
      ? [await ensureEventInSiteScope(ctx, args.eventId, eventScope)]
      : (await ctx.db.query("events").collect()).filter((event) =>
          eventMatchesSiteScope(event, eventScope),
        );
    const eventById = new Map(scopedEvents.map((event) => [event._id, event]));

    const search = args.search?.trim().toLowerCase() ?? "";
    const selectedConversationStates = Array.from(new Set(args.conversationStates ?? []));
    const threadGroups = await Promise.all(
      scopedEvents.map(
        async (event) =>
          await ctx.db
            .query("smsConversationThreads")
            .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", event._id))
            .collect(),
      ),
    );
    const threads = threadGroups
      .flat()
      .filter(
        (thread) =>
          selectedConversationStates.length === 0 ||
          selectedConversationStates.some((filterState) =>
            threadMatchesConversationFilterState(thread, filterState),
          ),
      );

    const enrichedThreads = await Promise.all(
      threads.map(async (thread) => {
        const participants = await summarizeThreadParticipants(ctx, thread);
        const sendReadiness = await resolveThreadSendReadiness(ctx, thread);
        const event = eventById.get(thread.eventId);
        return {
          ...thread,
          eventName: event?.name ?? "Unknown Event",
          eventDate: event?.eventDate ?? 0,
          participantName: participants.displayName,
          canSend: sendReadiness.state === "ready",
          sendDisabledReason: sendReadiness.state === "ready" ? undefined : sendReadiness.reason,
        };
      }),
    );

    return enrichedThreads
      .filter((thread) => {
        if (!search) return true;
        return (
          thread.participantName.toLowerCase().includes(search) ||
          thread.phoneObfuscated.toLowerCase().includes(search) ||
          (thread.lastMessageBody ?? "").toLowerCase().includes(search) ||
          thread.eventName.toLowerCase().includes(search)
        );
      })
      .sort(
        (firstThread, secondThread) =>
          (secondThread.lastMessageAt ?? secondThread.updatedAt) -
          (firstThread.lastMessageAt ?? firstThread.updatedAt),
      );
  },
});

export const getThread = query({
  args: {
    threadId: v.id("smsConversationThreads"),
    ...scopeArgs,
  },
  handler: async (ctx, args) => {
    await requireWorkspaceRead(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const thread = await getThreadInScope(ctx, args.threadId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const event = await ctx.db.get(thread.eventId);
    const participants = await summarizeThreadParticipants(ctx, thread);
    const sendReadiness = await resolveThreadSendReadiness(ctx, thread);
    const messages = await ctx.db
      .query("smsConversationMessages")
      .withIndex("by_thread_created", (queryBuilder) => queryBuilder.eq("threadId", thread._id))
      .collect();

    return {
      thread: {
        ...thread,
        participantName: participants.displayName,
        canSend: sendReadiness.state === "ready",
        sendDisabledReason: sendReadiness.state === "ready" ? undefined : sendReadiness.reason,
      },
      event,
      messages,
    };
  },
});

export const sendManualMessage = action({
  args: {
    threadId: v.id("smsConversationThreads"),
    body: v.string(),
    ...scopeArgs,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    sent: boolean;
    providerMessageId?: string;
    failureReason?: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const body = args.body.trim();
    if (!body) {
      throw new Error("Message body is required");
    }
    if (body.length > 1600) {
      throw new Error("Message body must be 1600 characters or fewer");
    }

    const target = await ctx.runQuery(internal.smsConversations.getThreadSendTargetInternal, {
      threadId: args.threadId,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    if (target.sendReadiness.state !== "ready") {
      throw new Error(target.sendReadiness.reason);
    }

    return await sendManualMessageToReadyThread(ctx, {
      thread: target.thread,
      phoneNumber: target.sendReadiness.phoneNumber,
      body,
      siteKey: args.siteKey ?? args.workspaceSlug,
      adminClerkUserId: identity.subject,
    });
  },
});

export const startThreadFromRsvp = action({
  args: {
    eventId: v.id("events"),
    rsvpId: v.id("rsvps"),
    body: v.string(),
    ...scopeArgs,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    threadId: Id<"smsConversationThreads">;
    sent: boolean;
    providerMessageId?: string;
    failureReason?: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const target = await ctx.runQuery(internal.smsConversations.getRsvpThreadTargetInternal, {
      eventId: args.eventId,
      rsvpId: args.rsvpId,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const threadId = await ctx.runMutation(internal.smsConversations.ensureThreadForPhoneHash, {
      eventId: target.eventId,
      phoneHash: target.phoneHash,
      phoneObfuscated: target.phoneObfuscated,
      participantClerkUserIds: target.participantClerkUserIds,
    });

    const body = args.body.trim();
    if (!body) {
      return { threadId, sent: false, failureReason: "Message body is required" };
    }

    const sendTarget = await ctx.runQuery(internal.smsConversations.getThreadSendTargetInternal, {
      threadId,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    if (sendTarget.sendReadiness.state !== "ready") {
      return {
        threadId,
        sent: false,
        failureReason: sendTarget.sendReadiness.reason,
      };
    }

    const sendResult = await sendManualMessageToReadyThread(ctx, {
      thread: sendTarget.thread,
      phoneNumber: sendTarget.sendReadiness.phoneNumber,
      body,
      siteKey: args.siteKey ?? args.workspaceSlug,
      adminClerkUserId: identity.subject,
    });

    return {
      threadId,
      ...sendResult,
    };
  },
});

export const listThreadsByPhone = query({
  args: {
    phone: v.string(),
    ...scopeArgs,
  },
  handler: async (ctx, args) => {
    // Host-level (not admin-only) so Guests directory rows can open details.
    const workspaceScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    let phoneHash: string;
    try {
      ({ phoneHash } = await normalizeAndHashPhoneNumber(args.phone));
    } catch {
      // Older clients may still pass the obfuscated phone shown for RSVP-only
      // guests. Treat display-only values as having no directly lookupable
      // thread instead of taking down the user detail page.
      return [];
    }

    return await listWorkspaceThreadsByPhoneHashes(ctx, workspaceScope, [phoneHash]);
  },
});

async function resolveUserPhoneHash(user: Doc<"users"> | null): Promise<string | null> {
  if (user?.phoneHash) {
    return user.phoneHash;
  }

  if (!user?.phone) {
    return null;
  }

  try {
    return (await normalizeAndHashPhoneNumber(user.phone)).phoneHash;
  } catch {
    return null;
  }
}

async function resolvePhoneHashesForUserReference(
  ctx: Pick<QueryCtx, "db">,
  userReference: string,
  workspaceScope: ResolvedWorkspaceAuthScope,
): Promise<string[]> {
  const rsvpReferencePrefix = "rsvp~";
  if (userReference.startsWith(rsvpReferencePrefix)) {
    const rsvpId = ctx.db.normalizeId("rsvps", userReference.slice(rsvpReferencePrefix.length));
    const rsvp = rsvpId ? await ctx.db.get(await resolveCanonicalRsvpId(ctx, rsvpId)) : null;
    if (!rsvp) {
      throw new Error("Guest not found");
    }

    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey: workspaceScope.siteKey,
      workspaceSlug: workspaceScope.workspaceSlug,
    });

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    const userPhoneHash = await resolveUserPhoneHash(user);
    return Array.from(
      new Set([userPhoneHash, rsvp.guestPhoneHash].filter((value): value is string => !!value)),
    );
  }

  const userId = ctx.db.normalizeId("users", userReference);
  const user = userId ? await resolveCanonicalUserById(ctx, userId) : null;
  if (!user) {
    throw new Error("User not found");
  }

  const phoneHash = await resolveUserPhoneHash(user);
  return phoneHash ? [phoneHash] : [];
}

async function listWorkspaceThreadsByPhoneHashes(
  ctx: Pick<QueryCtx, "db">,
  workspaceScope: ResolvedWorkspaceAuthScope,
  phoneHashes: string[],
) {
  const threadCollections = await Promise.all(
    phoneHashes.map(async (phoneHash) => {
      return await ctx.db
        .query("smsConversationThreads")
        .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
        .collect();
    }),
  );
  const threads = Array.from(
    new Map(threadCollections.flat().map((thread) => [thread._id, thread])).values(),
  );

  const workspaceEvents = await ctx.db
    .query("events")
    .withIndex("by_workspaceSlug", (queryBuilder) =>
      queryBuilder.eq("workspaceSlug", workspaceScope.workspaceSlug),
    )
    .collect();

  const eventMap = new Map(workspaceEvents.map((event) => [event._id, event]));
  const workspaceEventIds = new Set(workspaceEvents.map((event) => event._id));

  const enrichedThreads = await Promise.all(
    threads
      .filter((thread) => workspaceEventIds.has(thread.eventId))
      .map(async (thread) => {
        const participants = await summarizeThreadParticipants(ctx, thread);
        const sendReadiness = await resolveThreadSendReadiness(ctx, thread);
        const event = eventMap.get(thread.eventId);
        return {
          ...thread,
          eventName: event?.name ?? "Unknown Event",
          eventDate: event?.eventDate ?? 0,
          participantName: participants.displayName,
          canSend: sendReadiness.state === "ready",
          sendDisabledReason: sendReadiness.state === "ready" ? undefined : sendReadiness.reason,
        };
      }),
  );

  return enrichedThreads.sort(
    (firstThread, secondThread) =>
      (secondThread.lastMessageAt ?? secondThread.updatedAt) -
      (firstThread.lastMessageAt ?? firstThread.updatedAt),
  );
}

export const listThreadsByUserReference = query({
  args: {
    userReference: v.string(),
    ...scopeArgs,
  },
  handler: async (ctx, args) => {
    const workspaceScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const phoneHashes = await resolvePhoneHashesForUserReference(
      ctx,
      args.userReference,
      workspaceScope,
    );
    return await listWorkspaceThreadsByPhoneHashes(ctx, workspaceScope, phoneHashes);
  },
});
