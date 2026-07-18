import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type SmsConversationDirection = "inbound" | "outbound" | "system";

export type SmsConversationKind =
  | "sms"
  | "manual"
  | "blast"
  | "approval"
  | "consent"
  | "reply_action"
  | "opt_out"
  | "help"
  | "delivery_status"
  | "system";

type SmsConversationDatabase = Pick<MutationCtx, "db">;

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function mergeUniqueStrings(firstValues: readonly string[], secondValues: readonly string[]) {
  return uniqueStrings([...firstValues, ...secondValues]);
}

export async function upsertSmsConversationThread(
  ctx: SmsConversationDatabase,
  args: {
    eventId: Id<"events">;
    phoneHash: string;
    phoneObfuscated: string;
    participantClerkUserIds?: readonly string[];
    now?: number;
  },
): Promise<Doc<"smsConversationThreads">> {
  const now = args.now ?? Date.now();
  const existingThread = await ctx.db
    .query("smsConversationThreads")
    .withIndex("by_event_phone", (queryBuilder) =>
      queryBuilder.eq("eventId", args.eventId).eq("phoneHash", args.phoneHash),
    )
    .unique();
  const participantClerkUserIds = uniqueStrings(args.participantClerkUserIds ?? []);

  if (!existingThread) {
    const threadId = await ctx.db.insert("smsConversationThreads", {
      eventId: args.eventId,
      phoneHash: args.phoneHash,
      phoneObfuscated: args.phoneObfuscated,
      participantClerkUserIds,
      messageCount: 0,
      inboundCount: 0,
      outboundCount: 0,
      systemCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const insertedThread = await ctx.db.get(threadId);
    if (!insertedThread) {
      throw new Error("Failed to create SMS conversation thread");
    }
    return insertedThread;
  }

  const mergedParticipantClerkUserIds = mergeUniqueStrings(
    existingThread.participantClerkUserIds,
    participantClerkUserIds,
  );
  const patch: Partial<Doc<"smsConversationThreads">> = {
    phoneObfuscated: args.phoneObfuscated || existingThread.phoneObfuscated,
    participantClerkUserIds: mergedParticipantClerkUserIds,
    updatedAt: now,
  };
  await ctx.db.patch(existingThread._id, patch);
  return {
    ...existingThread,
    ...patch,
  };
}

export async function recordSmsConversationMessage(
  ctx: SmsConversationDatabase,
  args: {
    eventId: Id<"events">;
    phoneHash: string;
    phoneObfuscated: string;
    participantClerkUserIds?: readonly string[];
    direction: SmsConversationDirection;
    kind: SmsConversationKind;
    body?: string;
    mediaUrls?: readonly string[];
    providerMessageId?: string;
    providerStatus?: string;
    smsNotificationId?: Id<"smsNotifications">;
    textBlastId?: Id<"textBlasts">;
    textBlastRecipientId?: Id<"textBlastRecipients">;
    replyAttemptId?: Id<"textBlastReplyAttempts">;
    adminClerkUserId?: string;
    rawPayload?: unknown;
    createdAt?: number;
  },
): Promise<Id<"smsConversationMessages">> {
  const createdAt = args.createdAt ?? Date.now();
  const thread = await upsertSmsConversationThread(ctx, {
    eventId: args.eventId,
    phoneHash: args.phoneHash,
    phoneObfuscated: args.phoneObfuscated,
    participantClerkUserIds: args.participantClerkUserIds,
    now: createdAt,
  });

  if (args.providerMessageId) {
    const existingProviderMessage = await ctx.db
      .query("smsConversationMessages")
      .withIndex("by_providerMessageId", (queryBuilder) =>
        queryBuilder.eq("providerMessageId", args.providerMessageId),
      )
      .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("threadId"), thread._id))
      .first();

    if (existingProviderMessage) {
      await ctx.db.patch(existingProviderMessage._id, {
        providerStatus: args.providerStatus ?? existingProviderMessage.providerStatus,
        smsNotificationId: args.smsNotificationId ?? existingProviderMessage.smsNotificationId,
        updatedAt: Date.now(),
      });
      return existingProviderMessage._id;
    }
  }

  const messageId = await ctx.db.insert("smsConversationMessages", {
    threadId: thread._id,
    eventId: args.eventId,
    phoneHash: args.phoneHash,
    direction: args.direction,
    kind: args.kind,
    body: args.body,
    mediaUrls: args.mediaUrls ? [...args.mediaUrls] : undefined,
    providerMessageId: args.providerMessageId,
    providerStatus: args.providerStatus,
    smsNotificationId: args.smsNotificationId,
    textBlastId: args.textBlastId,
    textBlastRecipientId: args.textBlastRecipientId,
    replyAttemptId: args.replyAttemptId,
    adminClerkUserId: args.adminClerkUserId,
    rawPayload: args.rawPayload,
    createdAt,
    updatedAt: createdAt,
  });

  await ctx.db.patch(thread._id, {
    lastMessageBody: args.body,
    lastMessageAt: createdAt,
    lastMessageDirection: args.direction,
    lastMessageKind: args.kind,
    messageCount: thread.messageCount + 1,
    inboundCount: thread.inboundCount + (args.direction === "inbound" ? 1 : 0),
    outboundCount: thread.outboundCount + (args.direction === "outbound" ? 1 : 0),
    systemCount: thread.systemCount + (args.direction === "system" ? 1 : 0),
    lastInboundAt: args.direction === "inbound" ? createdAt : thread.lastInboundAt,
    lastOutboundAt: args.direction === "outbound" ? createdAt : thread.lastOutboundAt,
    updatedAt: createdAt,
  });

  return messageId;
}

export async function updateSmsConversationProviderStatus(
  ctx: SmsConversationDatabase,
  args: {
    providerMessageId: string;
    providerStatus: string;
    smsNotificationId?: Id<"smsNotifications">;
  },
): Promise<number> {
  const messages = await ctx.db
    .query("smsConversationMessages")
    .withIndex("by_providerMessageId", (queryBuilder) =>
      queryBuilder.eq("providerMessageId", args.providerMessageId),
    )
    .collect();

  for (const message of messages) {
    await ctx.db.patch(message._id, {
      providerStatus: args.providerStatus,
      smsNotificationId: args.smsNotificationId ?? message.smsNotificationId,
      updatedAt: Date.now(),
    });
  }

  return messages.length;
}
