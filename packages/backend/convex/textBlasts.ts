/**
 * Text blast management API
 * Handles bulk SMS campaigns for events
 */

import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import {
  applyMessageTemplateVariables,
  formatEventDateForMessageTemplate,
  formatEventTitleForMessageTemplate,
  messageContainsMultiEventRestrictedVariables,
  messageContainsQrCodeUrlVariable,
  resolveMessageTemplateFirstName,
} from "@coucou/sdk/shared/message-template";
import type { UserIdentity } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { obfuscatePhoneNumber } from "./lib/phoneUtils";
import {
  assertRequiredPrimaryFieldValues,
  buildInvitedByPatch,
  sanitizeSubmittedSocialProfiles,
} from "./lib/primaryFields";
import { createProfileValuesAndWorkspaceGrantsForSocialProfiles } from "./lib/profileValueRecords";
import { resolvePublicBaseUrlForEvent } from "./lib/publicBaseUrl";
import { insertRsvpIntoAggregate } from "./lib/rsvpAggregate";
import {
  type ApprovalStatus,
  resolveApprovalStatus,
  sanitizeAttendanceStatus,
} from "./lib/rsvpStatus";
import {
  ensureEventInSiteScope,
  ensureTextBlastInSiteScope,
  eventMatchesSiteScope,
  getEventInSiteScope,
  getTextBlastInSiteScope,
} from "./lib/siteScope";
import { replaceRsvpSocialProfileSnapshots } from "./lib/socialProfileRecords";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type RsvpStatus = ApprovalStatus;

type RecipientFilterConfig =
  | { type: "all" }
  | { type: "approved_no_approval_sms" }
  | { type: "approved_with_approval_sms" }
  | { type: "status"; status: RsvpStatus }
  | { type: "custom_field_missing"; fieldKey: string }
  | { type: "rsvp_before"; timestamp: number };

type RecipientHistoryFilterConfig =
  | { type: "received_any"; textBlastIds: Id<"textBlasts">[] }
  | { type: "not_received_any"; textBlastIds: Id<"textBlasts">[] };

const ALL_RSVP_STATUSES: RsvpStatus[] = ["pending", "approved", "denied"];
const DEFAULT_APPROVED_STATUSES: RsvpStatus[] = ["approved"];

const recipientHistoryFilterValidator = v.optional(
  v.object({
    type: v.union(v.literal("received_any"), v.literal("not_received_any")),
    textBlastIds: v.array(v.id("textBlasts")),
  }),
);

const replyActionInputValidator = v.object({
  replyCode: v.string(),
  targetEventId: v.id("events"),
  targetListKey: v.string(),
  isEnabled: v.optional(v.boolean()),
});

type ReplyActionInput = {
  replyCode: string;
  targetEventId: Id<"events">;
  targetListKey: string;
  isEnabled?: boolean;
};

type StoredReplyActionInput = {
  replyCode: string;
  replyCodeNormalized: string;
  targetEventId: Id<"events">;
  targetListKey: string;
  isEnabled: boolean;
};

type ReplyActionAttemptStatus =
  | "submitted"
  | "already_exists"
  | "ambiguous_recipient"
  | "invalid_code"
  | "missing_required_fields"
  | "target_unavailable"
  | "unknown_sender"
  | "error";

const RESERVED_REPLY_CODES = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "start",
  "yes",
  "unstop",
  "help",
  "info",
]);

const getUniqueIds = <T extends string>(ids: T[]): T[] => Array.from(new Set(ids));

function normalizeReplyCode(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeReplyCode(value: string): { replyCode: string; replyCodeNormalized: string } {
  const replyCode = value.trim();
  const replyCodeNormalized = normalizeReplyCode(replyCode);

  if (!replyCodeNormalized) {
    throw new Error("Reply action code is required");
  }
  if (replyCodeNormalized.length > 64) {
    throw new Error("Reply action code must be 64 characters or fewer");
  }
  if (replyCode.includes("\n") || replyCode.includes("\r")) {
    throw new Error("Reply action code must fit in one SMS line");
  }
  if (RESERVED_REPLY_CODES.has(replyCodeNormalized)) {
    throw new Error(`"${replyCode}" is reserved for SMS compliance replies`);
  }

  return { replyCode, replyCodeNormalized };
}

const getBlastTargetEventIds = (
  blast: Pick<Doc<"textBlasts">, "eventId" | "targetEventIds">,
): Id<"events">[] => {
  const rawTargetEventIds =
    blast.targetEventIds && blast.targetEventIds.length > 0
      ? blast.targetEventIds
      : [blast.eventId];
  return getUniqueIds(rawTargetEventIds);
};

const normalizeTargetEventIds = (args: {
  eventId: Id<"events">;
  targetEventIds?: Id<"events">[];
}): Id<"events">[] => {
  const rawTargetEventIds =
    args.targetEventIds && args.targetEventIds.length > 0 ? args.targetEventIds : [args.eventId];
  return getUniqueIds([args.eventId, ...rawTargetEventIds]);
};

const resolveEffectiveIncludeQrCodes = (args: {
  message: string;
  includeQrCodes?: boolean;
}): boolean => args.includeQrCodes === true || messageContainsQrCodeUrlVariable(args.message);

const validateBlastConfiguration = (args: {
  targetEventIds: Id<"events">[];
  message: string;
  includeQrCodes?: boolean;
}) => {
  if (args.targetEventIds.length <= 1) {
    return;
  }

  if (args.includeQrCodes) {
    throw new Error("QR code attachments are only available for single-event text blasts");
  }

  if (messageContainsMultiEventRestrictedVariables(args.message)) {
    throw new Error(
      "Multi-event text blasts can only use {{firstName}}. Remove event-specific variables before sending.",
    );
  }
};

const parseRecipientFilter = (rawFilter: string | null | undefined): RecipientFilterConfig => {
  if (!rawFilter) {
    return { type: "all" };
  }

  if (rawFilter === "approved_no_approval_sms") {
    return { type: "approved_no_approval_sms" };
  }

  if (rawFilter === "approved_with_approval_sms") {
    return { type: "approved_with_approval_sms" };
  }

  try {
    const parsed = JSON.parse(rawFilter) as Partial<RecipientFilterConfig>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return { type: "all" };
    }

    switch (parsed.type) {
      case "all":
        return { type: "all" };
      case "approved_no_approval_sms":
        return { type: "approved_no_approval_sms" };
      case "approved_with_approval_sms":
        return { type: "approved_with_approval_sms" };
      case "status":
        if (
          typeof parsed.status === "string" &&
          ALL_RSVP_STATUSES.includes(parsed.status as RsvpStatus)
        ) {
          return { type: "status", status: parsed.status as RsvpStatus };
        }
        break;
      case "custom_field_missing":
        if (typeof (parsed as { fieldKey?: unknown }).fieldKey === "string") {
          return {
            type: "custom_field_missing",
            fieldKey: (parsed as { fieldKey: string }).fieldKey,
          };
        }
        break;
      case "rsvp_before":
        if (
          typeof (parsed as { timestamp?: unknown }).timestamp === "number" &&
          Number.isFinite((parsed as { timestamp: number }).timestamp)
        ) {
          return {
            type: "rsvp_before",
            timestamp: (parsed as { timestamp: number }).timestamp,
          };
        }
        break;
      default:
        break;
    }
  } catch (error) {
    console.warn(`[parseRecipientFilter] Failed to parse recipient filter: ${rawFilter}`, error);
  }

  return { type: "all" };
};

const statusesForFilter = (filter: RecipientFilterConfig): RsvpStatus[] => {
  switch (filter.type) {
    case "all":
    case "approved_no_approval_sms":
    case "approved_with_approval_sms":
      return DEFAULT_APPROVED_STATUSES;
    case "status":
      return [filter.status];
    case "custom_field_missing":
    case "rsvp_before":
      return ["pending", "approved"];
    default:
      return DEFAULT_APPROVED_STATUSES;
  }
};

const customFieldIsMissing = (rsvp: Doc<"rsvps">, fieldKey: string): boolean => {
  const value = rsvp.customFieldValues?.[fieldKey];
  if (value === undefined) {
    return true;
  }
  if (typeof value !== "string") {
    return true;
  }
  return value.trim().length === 0;
};

async function rsvpHasSentApprovalSms(
  ctx: Pick<QueryCtx, "db">,
  rsvp: Doc<"rsvps">,
): Promise<boolean> {
  const approvalSms = await ctx.db
    .query("smsNotifications")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", rsvp.eventId))
    .filter((queryBuilder) =>
      queryBuilder.and(
        queryBuilder.eq(queryBuilder.field("recipientClerkUserId"), rsvp.clerkUserId),
        queryBuilder.eq(queryBuilder.field("type"), "approval"),
        queryBuilder.eq(queryBuilder.field("status"), "sent"),
      ),
    )
    .first();

  return approvalSms !== null;
}

type IdentityWithRole = UserIdentity & { role?: string };

const identityHasHostRole = (identity: IdentityWithRole): boolean => {
  return identity.role === "org:admin" || identity.role === "org:host";
};

const identityCanManageBlast = (identity: IdentityWithRole, blastOwnerId: string): boolean => {
  if (identity.subject === blastOwnerId) {
    return true;
  }
  return identityHasHostRole(identity);
};

function getEventBaseUrl(event: Pick<Doc<"events">, "siteKey"> | null): string | null {
  return resolvePublicBaseUrlForEvent(event);
}

type SiteScopeArgs = {
  siteKey?: string;
  workspaceSlug?: string;
};

async function ensureEventsInSiteScope(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  eventIds: Id<"events">[],
  scope: SiteScopeArgs,
): Promise<Doc<"events">[]> {
  const events: Doc<"events">[] = [];
  for (const eventId of eventIds) {
    events.push(await ensureEventInSiteScope(ctx, eventId, scope));
  }
  return events;
}

async function ensureListExistsForEvent(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  eventId: Id<"events">,
  targetListKey: string,
): Promise<Doc<"listCredentials">> {
  const listCredential = await ctx.db
    .query("listCredentials")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
    .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("listKey"), targetListKey))
    .unique();

  if (!listCredential) {
    throw new Error(`Destination list "${targetListKey}" was not found for the selected event`);
  }

  return listCredential;
}

async function normalizeReplyActionsForStorage(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  replyActions: ReplyActionInput[] | undefined,
  scope: SiteScopeArgs,
): Promise<StoredReplyActionInput[]> {
  const normalizedReplyCodeSet = new Set<string>();
  const storedReplyActions: StoredReplyActionInput[] = [];

  for (const replyAction of replyActions ?? []) {
    const { replyCode, replyCodeNormalized } = sanitizeReplyCode(replyAction.replyCode);
    if (normalizedReplyCodeSet.has(replyCodeNormalized)) {
      throw new Error(`Duplicate reply action code "${replyCode}"`);
    }
    normalizedReplyCodeSet.add(replyCodeNormalized);

    const targetEvent = await ensureEventInSiteScope(ctx, replyAction.targetEventId, scope);
    if (!isEventOpenForRsvp(targetEvent, Date.now())) {
      throw new Error(`Destination event "${targetEvent.name}" is not open for RSVPs`);
    }

    const targetListKey = replyAction.targetListKey.trim();
    if (!targetListKey) {
      throw new Error("Reply action destination list is required");
    }
    await ensureListExistsForEvent(ctx, targetEvent._id, targetListKey);

    storedReplyActions.push({
      replyCode,
      replyCodeNormalized,
      targetEventId: targetEvent._id,
      targetListKey,
      isEnabled: replyAction.isEnabled !== false,
    });
  }

  return storedReplyActions;
}

async function listReplyActionsForBlast(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  textBlastId: Id<"textBlasts">,
): Promise<Doc<"textBlastReplyActions">[]> {
  return await ctx.db
    .query("textBlastReplyActions")
    .withIndex("by_text_blast", (queryBuilder) => queryBuilder.eq("textBlastId", textBlastId))
    .collect();
}

async function replaceReplyActionsForBlast(
  ctx: MutationCtx,
  args: {
    textBlastId: Id<"textBlasts">;
    replyActions?: ReplyActionInput[];
    scope: SiteScopeArgs;
  },
): Promise<void> {
  const storedReplyActions = await normalizeReplyActionsForStorage(
    ctx,
    args.replyActions,
    args.scope,
  );
  const existingReplyActions = await listReplyActionsForBlast(ctx, args.textBlastId);
  for (const existingReplyAction of existingReplyActions) {
    await ctx.db.delete(existingReplyAction._id);
  }

  const now = Date.now();
  for (const replyAction of storedReplyActions) {
    await ctx.db.insert("textBlastReplyActions", {
      textBlastId: args.textBlastId,
      ...replyAction,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function eventTitleMap(events: Doc<"events">[]): Map<Id<"events">, string> {
  return new Map(events.map((event) => [event._id, formatEventTitleForMessageTemplate(event)]));
}

function blastTargetsEvent(blast: Doc<"textBlasts">, eventId: Id<"events">): boolean {
  return getBlastTargetEventIds(blast).includes(eventId);
}

/**
 * Create a new text blast draft
 */
export const createDraft = mutation({
  args: {
    eventId: v.id("events"),
    targetEventIds: v.optional(v.array(v.id("events"))),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    name: v.string(),
    message: v.string(),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()),
    recipientHistoryFilter: recipientHistoryFilterValidator,
    includeQrCodes: v.optional(v.boolean()),
    replyActions: v.optional(v.array(replyActionInputValidator)),
  },
  handler: async (ctx, args): Promise<Id<"textBlasts">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    const targetEventIds = normalizeTargetEventIds(args);
    const effectiveIncludeQrCodes = resolveEffectiveIncludeQrCodes({
      message: args.message,
      includeQrCodes: args.includeQrCodes,
    });
    validateBlastConfiguration({
      targetEventIds,
      message: args.message,
      includeQrCodes: args.includeQrCodes,
    });

    // Verify user is host of each selected event (using org:admin role)
    await ensureEventsInSiteScope(ctx, targetEventIds, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (!identityHasHostRole(identityWithRole)) {
      throw new Error("Not authorized for this event");
    }

    // Count potential recipients
    const recipientCount = await ctx.runQuery(internal.textBlasts.countRecipientsInternal, {
      eventId: args.eventId,
      targetEventIds,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      recipientHistoryFilter: args.recipientHistoryFilter,
    });

    const now = Date.now();
    const blastId = await ctx.db.insert("textBlasts", {
      eventId: args.eventId,
      targetEventIds,
      name: args.name,
      message: args.message,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      recipientHistoryFilter: args.recipientHistoryFilter,
      includeQrCodes: effectiveIncludeQrCodes,
      deliveryTrackingEnabled: true,
      recipientCount,
      sentCount: 0,
      failedCount: 0,
      sentBy: identity.subject,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    await replaceReplyActionsForBlast(ctx, {
      textBlastId: blastId,
      replyActions: args.replyActions,
      scope: {
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
      },
    });
    return blastId;
  },
});

/**
 * Update an existing text blast draft
 */
export const updateDraft = mutation({
  args: {
    blastId: v.id("textBlasts"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    targetEventIds: v.optional(v.array(v.id("events"))),
    name: v.optional(v.string()),
    message: v.optional(v.string()),
    targetLists: v.optional(v.array(v.string())),
    recipientFilter: v.optional(v.string()),
    recipientHistoryFilter: recipientHistoryFilterValidator,
    clearRecipientHistoryFilter: v.optional(v.boolean()),
    includeQrCodes: v.optional(v.boolean()),
    replyActions: v.optional(v.array(replyActionInputValidator)),
  },
  handler: async (ctx, args): Promise<Doc<"textBlasts"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    const { blast } = await ensureTextBlastInSiteScope(ctx, args.blastId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (!identityCanManageBlast(identityWithRole, blast.sentBy)) {
      throw new Error("Not authorized to edit this text blast");
    }

    if (blast.status !== "draft") {
      throw new Error("Can only edit draft text blasts");
    }

    const primaryEventId = args.eventId ?? blast.eventId;
    const targetEventIds =
      args.targetEventIds !== undefined
        ? normalizeTargetEventIds({
            eventId: primaryEventId,
            targetEventIds: args.targetEventIds,
          })
        : getBlastTargetEventIds(blast);
    const nextMessage = args.message ?? blast.message;
    const nextIncludeQrCodes = args.includeQrCodes ?? blast.includeQrCodes ?? false;
    const effectiveIncludeQrCodes = resolveEffectiveIncludeQrCodes({
      message: nextMessage,
      includeQrCodes: nextIncludeQrCodes,
    });
    validateBlastConfiguration({
      targetEventIds,
      message: nextMessage,
      includeQrCodes: nextIncludeQrCodes,
    });
    await ensureEventsInSiteScope(ctx, targetEventIds, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    // Update recipient count if targeting or filter changed
    let recipientCount = blast.recipientCount;
    if (
      args.targetEventIds !== undefined ||
      args.targetLists !== undefined ||
      args.recipientFilter !== undefined ||
      args.recipientHistoryFilter !== undefined ||
      args.clearRecipientHistoryFilter === true
    ) {
      recipientCount = await ctx.runQuery(internal.textBlasts.countRecipientsInternal, {
        eventId: primaryEventId,
        targetEventIds,
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
        targetLists: args.targetLists ?? blast.targetLists,
        recipientFilter: args.recipientFilter ?? blast.recipientFilter,
        recipientHistoryFilter:
          args.clearRecipientHistoryFilter === true
            ? undefined
            : (args.recipientHistoryFilter ?? blast.recipientHistoryFilter),
      });
    }

    const updateData: Partial<Doc<"textBlasts">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updateData.name = args.name;
    if (args.message !== undefined) updateData.message = args.message;
    if (args.targetEventIds !== undefined) {
      updateData.targetEventIds = targetEventIds;
      updateData.recipientCount = recipientCount;
      updateData.eventId = primaryEventId;
    }
    if (args.targetLists !== undefined) {
      updateData.targetLists = args.targetLists;
      updateData.recipientCount = recipientCount;
    }
    if (args.recipientFilter !== undefined) {
      updateData.recipientFilter = args.recipientFilter;
      updateData.recipientCount = recipientCount;
    }
    if (args.recipientHistoryFilter !== undefined) {
      updateData.recipientHistoryFilter = args.recipientHistoryFilter;
      updateData.recipientCount = recipientCount;
    }
    if (args.clearRecipientHistoryFilter === true) {
      updateData.recipientHistoryFilter = undefined;
      updateData.recipientCount = recipientCount;
    }
    if (args.includeQrCodes !== undefined || args.message !== undefined) {
      updateData.includeQrCodes = effectiveIncludeQrCodes;
    }

    await ctx.db.patch(args.blastId, updateData);
    if (args.replyActions !== undefined) {
      await replaceReplyActionsForBlast(ctx, {
        textBlastId: args.blastId,
        replyActions: args.replyActions,
        scope: {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        },
      });
    }
    return await ctx.db.get(args.blastId);
  },
});

/**
 * Send a text blast immediately
 */
type SendBlastResult =
  | {
      success: true;
      totalRecipients: number;
      sentCount: number;
      failedCount: number;
    }
  | {
      success: false;
      message?: string;
    };

type BlastRecipient = {
  clerkUserId: string;
  phoneNumber: string;
  phoneHash: string;
  phoneObfuscated: string;
  listKey: string;
  sourceEventIds: Id<"events">[];
  sourceRsvpIds: Id<"rsvps">[];
  sourceListKeys: string[];
  recipientClerkUserIds: string[];
  firstName?: string;
  userName?: string;
  redemptionCode?: string;
};

type SmsRecipientPayload = {
  phoneNumber: string;
  clerkUserId: string;
  phoneHash: string;
  textBlastRecipientId: Id<"textBlastRecipients">;
  notificationId: Id<"smsNotifications">;
  personalizedMessage: string;
  mediaUrl?: string;
};

type BulkSmsSendResult = {
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    clerkUserId: string;
    phoneHash?: string;
    textBlastRecipientId?: Id<"textBlastRecipients">;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
};

type ApprovedRsvpForList = Doc<"rsvps">;

type RecipientPreview = {
  rsvpId: Id<"rsvps">;
  name: string;
  listKey: string;
  eventId: Id<"events">;
  eventName: string;
};

type TemplateVariables = {
  firstName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  qrCodeUrl?: string;
};

const FIRST_NAME_FALLBACK = "there";

const resolveRecipientFirstName = (recipient: BlastRecipient): string => {
  return resolveMessageTemplateFirstName({
    firstName: recipient.firstName,
    fullName: recipient.userName,
    fallback: FIRST_NAME_FALLBACK,
  });
};

type SelectionRecipient = {
  phoneHash: string;
  normalizedPhoneNumber: string;
  phoneObfuscated: string;
  rsvp: Doc<"rsvps">;
  user: Doc<"users">;
  sourceEventIds: Id<"events">[];
  sourceRsvpIds: Id<"rsvps">[];
  sourceListKeys: string[];
  recipientClerkUserIds: string[];
};

type RecipientSelectionArgs = {
  eventId: Id<"events">;
  targetEventIds?: Id<"events">[];
  siteKey?: string;
  workspaceSlug?: string;
  targetLists: string[];
  recipientFilter?: string;
  recipientHistoryFilter?: RecipientHistoryFilterConfig;
  selectedRsvpIds?: Id<"rsvps">[];
  textBlastId?: Id<"textBlasts">;
  skipAlreadySentForBlast?: boolean;
};

async function hasSentDeliveryForAnyBlast(
  ctx: Pick<QueryCtx, "db">,
  phoneHash: string,
  textBlastIds: Id<"textBlasts">[],
): Promise<boolean> {
  for (const textBlastId of textBlastIds) {
    const sentDelivery = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_text_blast_phone", (queryBuilder) =>
        queryBuilder.eq("textBlastId", textBlastId).eq("phoneHash", phoneHash),
      )
      .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("status"), "sent"))
      .first();

    if (sentDelivery) {
      return true;
    }
  }

  return false;
}

async function passesRecipientHistoryFilter(
  ctx: Pick<QueryCtx, "db">,
  phoneHash: string,
  recipientHistoryFilter?: RecipientHistoryFilterConfig,
): Promise<boolean> {
  if (!recipientHistoryFilter || recipientHistoryFilter.textBlastIds.length === 0) {
    return true;
  }

  const hasSentDelivery = await hasSentDeliveryForAnyBlast(
    ctx,
    phoneHash,
    recipientHistoryFilter.textBlastIds,
  );

  return recipientHistoryFilter.type === "received_any" ? hasSentDelivery : !hasSentDelivery;
}

async function alreadySentForBlast(
  ctx: Pick<QueryCtx, "db">,
  textBlastId: Id<"textBlasts"> | undefined,
  phoneHash: string,
): Promise<boolean> {
  if (!textBlastId) {
    return false;
  }

  const sentDelivery = await ctx.db
    .query("textBlastRecipients")
    .withIndex("by_text_blast_phone", (queryBuilder) =>
      queryBuilder.eq("textBlastId", textBlastId).eq("phoneHash", phoneHash),
    )
    .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("status"), "sent"))
    .first();

  return sentDelivery !== null;
}

async function getFilteredRsvpsForTargeting(
  ctx: Pick<QueryCtx, "db">,
  args: Omit<RecipientSelectionArgs, "targetEventIds"> & { targetEventIds: Id<"events">[] },
): Promise<Doc<"rsvps">[]> {
  const filterConfig = parseRecipientFilter(args.recipientFilter);
  const statusesToFetch = statusesForFilter(filterConfig);
  const normalizedTargetListKeys = new Set(
    args.targetLists.map((listKey) => listKey.toLowerCase()),
  );
  const selectedRsvpIdsSet =
    args.selectedRsvpIds && args.selectedRsvpIds.length > 0 ? new Set(args.selectedRsvpIds) : null;

  let filteredRsvps: Doc<"rsvps">[] = [];
  for (const eventId of args.targetEventIds) {
    const rsvpsForEvent = (
      await ctx.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
        .collect()
    ).filter((rsvp) => statusesToFetch.includes(resolveApprovalStatus(rsvp)));

    filteredRsvps.push(
      ...rsvpsForEvent.filter((rsvp) => {
        if (!rsvp.listKey || rsvp.smsConsent !== true) {
          return false;
        }
        if (selectedRsvpIdsSet && !selectedRsvpIdsSet.has(rsvp._id)) {
          return false;
        }

        return normalizedTargetListKeys.has(rsvp.listKey.toLowerCase());
      }),
    );
  }

  switch (filterConfig.type) {
    case "approved_no_approval_sms": {
      const filteredWithApprovalSmsStatus = await Promise.all(
        filteredRsvps.map(async (rsvp) => {
          return (await rsvpHasSentApprovalSms(ctx, rsvp)) ? null : rsvp;
        }),
      );

      filteredRsvps = filteredWithApprovalSmsStatus.filter(
        (rsvp): rsvp is (typeof filteredRsvps)[0] => rsvp !== null,
      );
      break;
    }
    case "approved_with_approval_sms": {
      const filteredWithApprovalSmsStatus = await Promise.all(
        filteredRsvps.map(async (rsvp) => {
          return (await rsvpHasSentApprovalSms(ctx, rsvp)) ? rsvp : null;
        }),
      );

      filteredRsvps = filteredWithApprovalSmsStatus.filter(
        (rsvp): rsvp is (typeof filteredRsvps)[0] => rsvp !== null,
      );
      break;
    }
    case "status": {
      filteredRsvps = filteredRsvps.filter(
        (rsvp) => resolveApprovalStatus(rsvp) === filterConfig.status,
      );
      break;
    }
    case "custom_field_missing": {
      filteredRsvps = filteredRsvps.filter((rsvp) =>
        customFieldIsMissing(rsvp, filterConfig.fieldKey),
      );
      break;
    }
    case "rsvp_before": {
      filteredRsvps = filteredRsvps.filter((rsvp) => rsvp.createdAt < filterConfig.timestamp);
      break;
    }
    case "all":
    default:
      break;
  }

  return filteredRsvps;
}

async function selectRecipientsFromStoredPhones(
  ctx: Pick<QueryCtx, "db">,
  args: RecipientSelectionArgs,
): Promise<SelectionRecipient[]> {
  const targetEventIds = normalizeTargetEventIds(args);
  for (const eventId of targetEventIds) {
    await ensureEventInSiteScope(ctx, eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
  }

  const filteredRsvps = (await getFilteredRsvpsForTargeting(ctx, {
    ...args,
    targetEventIds,
  })) as ApprovedRsvpForList[];

  const recipientsByPhoneHash = new Map<string, SelectionRecipient>();
  for (const rsvp of filteredRsvps) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();

    if (!user?.phone) {
      continue;
    }

    let normalizedPhoneNumber: string;
    let phoneHash: string;
    try {
      const phoneResolution = await normalizeAndHashPhoneNumber(user.phone);
      normalizedPhoneNumber = phoneResolution.normalizedPhoneNumber;
      phoneHash = phoneResolution.phoneHash;
    } catch (error) {
      console.warn(
        `[selectRecipientsFromStoredPhones] Skipping invalid phone for ${rsvp.clerkUserId}: ${getErrorMessage(error)}`,
      );
      continue;
    }

    if (
      !(await passesRecipientHistoryFilter(ctx, phoneHash, args.recipientHistoryFilter)) ||
      (args.skipAlreadySentForBlast &&
        (await alreadySentForBlast(ctx, args.textBlastId, phoneHash)))
    ) {
      continue;
    }

    const existingRecipient = recipientsByPhoneHash.get(phoneHash);
    if (existingRecipient) {
      existingRecipient.sourceEventIds = getUniqueIds([
        ...existingRecipient.sourceEventIds,
        rsvp.eventId,
      ]);
      existingRecipient.sourceRsvpIds = getUniqueIds([
        ...existingRecipient.sourceRsvpIds,
        rsvp._id,
      ]);
      existingRecipient.sourceListKeys = getUniqueIds([
        ...existingRecipient.sourceListKeys,
        rsvp.listKey,
      ]);
      existingRecipient.recipientClerkUserIds = getUniqueIds([
        ...existingRecipient.recipientClerkUserIds,
        rsvp.clerkUserId,
      ]);
      continue;
    }

    recipientsByPhoneHash.set(phoneHash, {
      phoneHash,
      normalizedPhoneNumber,
      phoneObfuscated: obfuscatePhoneNumber(normalizedPhoneNumber),
      rsvp,
      user,
      sourceEventIds: [rsvp.eventId],
      sourceRsvpIds: [rsvp._id],
      sourceListKeys: [rsvp.listKey],
      recipientClerkUserIds: [rsvp.clerkUserId],
    });
  }

  return Array.from(recipientsByPhoneHash.values());
}

async function createSmsRecipientsForBlast(args: {
  ctx: ActionCtx;
  blastId: Id<"textBlasts">;
  primaryEvent: Doc<"events">;
  recipients: BlastRecipient[];
  message: string;
  includeQrCodes: boolean;
}): Promise<SmsRecipientPayload[]> {
  const templateBase: Omit<TemplateVariables, "firstName"> = {
    eventName: formatEventTitleForMessageTemplate(args.primaryEvent),
    eventDate: formatEventDateForMessageTemplate(
      args.primaryEvent.eventDate,
      args.primaryEvent.eventTimezone,
    ),
    eventLocation: args.primaryEvent.location?.trim() ?? "",
  };
  const baseUrl = getEventBaseUrl(args.primaryEvent);
  const smsRecipients: SmsRecipientPayload[] = [];

  for (const recipient of args.recipients) {
    let qrCodeMediaUrl: string | undefined;
    let redemptionLink: string | undefined;

    if (args.includeQrCodes && recipient.redemptionCode && baseUrl) {
      try {
        const ticketUrl = `${baseUrl}/redeem/${recipient.redemptionCode}`;
        redemptionLink = ticketUrl;
        const storageId = await args.ctx.runAction(
          internal.lib.qrCodeGenerator.generateAndUploadQrCode,
          {
            value: ticketUrl,
            foregroundColor: args.primaryEvent.themeTextColor,
            backgroundColor: args.primaryEvent.themeBackgroundColor,
          },
        );
        const qrCodeUrl = await args.ctx.runAction(internal.lib.qrCodeGenerator.getQrCodeUrl, {
          storageId,
        });

        if (qrCodeUrl) {
          qrCodeMediaUrl = qrCodeUrl;
        }
      } catch (error) {
        console.error(`Failed to generate QR code for recipient ${recipient.clerkUserId}:`, error);
      }
    }

    const personalizedMessage = applyMessageTemplateVariables(args.message, {
      ...templateBase,
      firstName: resolveRecipientFirstName(recipient),
      qrCodeUrl: redemptionLink || "",
    });

    const textBlastRecipientId = await args.ctx.runMutation(
      internal.textBlasts.upsertRecipientDelivery,
      {
        textBlastId: args.blastId,
        phoneHash: recipient.phoneHash,
        sourceEventIds: recipient.sourceEventIds,
        sourceRsvpIds: recipient.sourceRsvpIds,
        sourceListKeys: recipient.sourceListKeys,
        recipientClerkUserIds: recipient.recipientClerkUserIds,
      },
    );

    const notificationId = await args.ctx.runMutation(internal.sms.createNotification, {
      eventId: recipient.sourceEventIds[0] ?? args.primaryEvent._id,
      recipientClerkUserId: recipient.clerkUserId,
      recipientPhoneObfuscated: recipient.phoneObfuscated,
      type: "blast",
      message: personalizedMessage,
      textBlastId: args.blastId,
      textBlastRecipientId,
    });

    await args.ctx.runMutation(internal.textBlasts.linkRecipientDeliveryNotification, {
      textBlastRecipientId,
      smsNotificationId: notificationId as Id<"smsNotifications">,
    });

    smsRecipients.push({
      phoneNumber: recipient.phoneNumber,
      clerkUserId: recipient.clerkUserId,
      phoneHash: recipient.phoneHash,
      textBlastRecipientId,
      notificationId: notificationId as Id<"smsNotifications">,
      personalizedMessage,
      mediaUrl: qrCodeMediaUrl,
    });
  }

  return smsRecipients;
}

async function updateBlastCountsFromDeliveries(
  ctx: ActionCtx,
  blastId: Id<"textBlasts">,
  fallbackCounts: { sentCount: number; failedCount: number },
): Promise<{ sentCount: number; failedCount: number; status: "sent" | "failed" }> {
  const deliveryStats = (await ctx.runQuery(internal.textBlasts.getDeliveryStatsInternal, {
    textBlastId: blastId,
  })) as {
    totalCount: number;
    sentCount: number;
    failedCount: number;
    pendingCount: number;
  };
  const sentCount =
    deliveryStats.totalCount > 0 ? deliveryStats.sentCount : fallbackCounts.sentCount;
  const failedCount =
    deliveryStats.totalCount > 0 ? deliveryStats.failedCount : fallbackCounts.failedCount;
  const status = sentCount > 0 ? "sent" : "failed";

  await ctx.runMutation(internal.textBlasts.updateBlastCounts, {
    blastId,
    sentCount,
    failedCount,
    status,
  });

  return {
    sentCount,
    failedCount,
    status,
  };
}

export const sendBlast = action({
  args: {
    blastId: v.id("textBlasts"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SendBlastResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    // Get blast details and verify ownership
    const blast = await ctx.runQuery(internal.textBlasts.getBlastInternal, {
      blastId: args.blastId,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (!blast) throw new Error("Text blast not found");
    if (!identityCanManageBlast(identityWithRole, blast.sentBy)) {
      throw new Error("Not authorized to send this text blast");
    }
    // Allow sending drafts and failed blasts (failed blasts can be retried)
    if (blast.status !== "draft" && blast.status !== "failed") {
      throw new Error("Text blast already sent or in progress");
    }

    const targetEventIds = getBlastTargetEventIds(blast);
    const effectiveIncludeQrCodes = resolveEffectiveIncludeQrCodes({
      message: blast.message,
      includeQrCodes: blast.includeQrCodes,
    });
    validateBlastConfiguration({
      targetEventIds,
      message: blast.message,
      includeQrCodes: blast.includeQrCodes,
    });

    const event = await ctx.runQuery(internal.textBlasts.getEventInternal, {
      eventId: blast.eventId,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    if (!event) {
      throw new Error("Event not found");
    }

    await ctx.runMutation(internal.textBlasts.startBlastSend, {
      blastId: args.blastId,
      sentAt: Date.now(),
      includeQrCodes: effectiveIncludeQrCodes,
    });

    try {
      const recipients = (await ctx.runAction(internal.textBlasts.getRecipientsWithPhonesInternal, {
        eventId: blast.eventId,
        targetEventIds,
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
        targetLists: blast.targetLists,
        recipientFilter: blast.recipientFilter,
        recipientHistoryFilter: blast.recipientHistoryFilter,
        textBlastId: args.blastId,
        skipAlreadySentForBlast: true,
      })) as BlastRecipient[];

      if (recipients.length === 0) {
        const deliveryStats = (await ctx.runQuery(internal.textBlasts.getDeliveryStatsInternal, {
          textBlastId: args.blastId,
        })) as {
          sentCount: number;
          failedCount: number;
          totalCount: number;
        };

        if (deliveryStats.sentCount > 0) {
          await ctx.runMutation(internal.textBlasts.updateBlastCounts, {
            blastId: args.blastId,
            sentCount: deliveryStats.sentCount,
            failedCount: deliveryStats.failedCount,
            status: "sent",
          });
          return {
            success: true,
            totalRecipients: deliveryStats.totalCount,
            sentCount: deliveryStats.sentCount,
            failedCount: deliveryStats.failedCount,
          };
        }

        throw new Error(
          "Cannot send text blast: No recipients found with SMS consent and phone numbers. " +
            "Please check that: (1) RSVPs have SMS consent enabled, (2) Users have phone numbers saved in their profiles, " +
            "and (3) Selected lists have approved RSVPs.",
        );
      }

      const smsRecipients = await createSmsRecipientsForBlast({
        ctx,
        blastId: args.blastId,
        primaryEvent: event,
        recipients,
        message: blast.message,
        includeQrCodes: effectiveIncludeQrCodes,
      });

      // Send bulk SMS - Twilio handles promotional messages via standard API
      const result = (await ctx.runAction(internal.smsActions.sendBulkSmsInternal, {
        recipients: smsRecipients,
        message: blast.message,
        batchSize: 10, // Send 10 at a time
        messageType: "Promotional",
      })) as BulkSmsSendResult;

      console.log(
        `[sendBlast] Bulk send result: ${result.successCount} succeeded, ${result.failureCount} failed out of ${result.totalRecipients} total`,
      );

      const finalCounts = await updateBlastCountsFromDeliveries(ctx, args.blastId, {
        sentCount: result.successCount,
        failedCount: result.failureCount,
      });

      // If no messages were sent, provide a more informative error
      if (result.successCount === 0 && result.failureCount > 0) {
        const sampleErrors = result.results
          .filter((r) => !r.success && r.error)
          .map((r) => r.error)
          .slice(0, 3);
        const errorSummary =
          sampleErrors.length > 0 ? ` Common errors: ${sampleErrors.join("; ")}` : "";
        throw new Error(
          `Failed to send any messages to ${result.totalRecipients} recipients.${errorSummary} ` +
            `Check Twilio credentials, opt-out status, and phone number formats.`,
        );
      }

      return {
        success: true,
        totalRecipients: result.totalRecipients,
        sentCount: finalCounts.sentCount,
        failedCount: finalCounts.failedCount,
      };
    } catch (error) {
      // Mark blast as failed
      console.error(`[sendBlast] Error sending text blast ${args.blastId}:`, error);
      await ctx.runMutation(internal.textBlasts.updateBlastStatus, {
        blastId: args.blastId,
        status: "failed",
      });
      throw new Error(`Failed to send text blast: ${getErrorMessage(error)}`);
    }
  },
});

/**
 * Send a text blast immediately without requiring a draft
 * Accepts form data directly and creates/sends in one operation
 */
export const sendBlastDirect = action({
  args: {
    eventId: v.id("events"),
    targetEventIds: v.optional(v.array(v.id("events"))),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    name: v.string(),
    message: v.string(),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()),
    recipientHistoryFilter: recipientHistoryFilterValidator,
    includeQrCodes: v.optional(v.boolean()),
    selectedRsvpIds: v.optional(v.array(v.id("rsvps"))), // Filter to specific RSVP IDs for testing
    replyActions: v.optional(v.array(replyActionInputValidator)),
  },
  handler: async (ctx, args): Promise<SendBlastResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    // Verify user is host of this event (using org:admin role)
    const event = await ctx.runQuery(internal.textBlasts.getEventInternal, {
      eventId: args.eventId,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    if (!event) throw new Error("Event not found");

    if (!identityHasHostRole(identityWithRole)) {
      throw new Error("Not authorized for this event");
    }

    const targetEventIds = normalizeTargetEventIds(args);
    const effectiveIncludeQrCodes = resolveEffectiveIncludeQrCodes({
      message: args.message,
      includeQrCodes: args.includeQrCodes,
    });
    validateBlastConfiguration({
      targetEventIds,
      message: args.message,
      includeQrCodes: args.includeQrCodes,
    });

    // Fetch recipients with decrypted phone numbers so the validation matches the send payload
    const recipients = (await ctx.runAction(internal.textBlasts.getRecipientsWithPhonesInternal, {
      eventId: args.eventId,
      targetEventIds,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      recipientHistoryFilter: args.recipientHistoryFilter,
      selectedRsvpIds: args.selectedRsvpIds,
    })) as BlastRecipient[];

    // Pre-check: Validate recipients exist before attempting to send
    if (recipients.length === 0) {
      throw new Error(
        "Cannot send text blast: No recipients found with SMS consent and phone numbers. " +
          "Please check that: (1) RSVPs have SMS consent enabled, (2) Users have phone numbers saved in their profiles, " +
          "and (3) Selected lists have approved RSVPs.",
      );
    }

    // Create draft record first
    const now = Date.now();
    const blastId = await ctx.runMutation(internal.textBlasts.createBlastInternal, {
      eventId: args.eventId,
      targetEventIds,
      name: args.name,
      message: args.message,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      recipientHistoryFilter: args.recipientHistoryFilter,
      includeQrCodes: effectiveIncludeQrCodes,
      recipientCount: recipients.length,
      sentBy: identity.subject,
      createdAt: now,
      updatedAt: now,
      replyActions: args.replyActions,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    await ctx.runMutation(internal.textBlasts.startBlastSend, {
      blastId,
      sentAt: now,
      includeQrCodes: effectiveIncludeQrCodes,
    });

    try {
      const smsRecipients = await createSmsRecipientsForBlast({
        ctx,
        blastId,
        primaryEvent: event,
        recipients,
        message: args.message,
        includeQrCodes: effectiveIncludeQrCodes,
      });

      // Send bulk SMS - Twilio handles promotional messages via standard API
      const result = (await ctx.runAction(internal.smsActions.sendBulkSmsInternal, {
        recipients: smsRecipients,
        message: args.message,
        batchSize: 10, // Send 10 at a time
        messageType: "Promotional",
      })) as BulkSmsSendResult;

      console.log(
        `[sendBlastDirect] Bulk send result: ${result.successCount} succeeded, ${result.failureCount} failed out of ${result.totalRecipients} total`,
      );

      const finalCounts = await updateBlastCountsFromDeliveries(ctx, blastId, {
        sentCount: result.successCount,
        failedCount: result.failureCount,
      });

      // If no messages were sent, provide a more informative error
      if (result.successCount === 0 && result.failureCount > 0) {
        const sampleErrors = result.results
          .filter((r) => !r.success && r.error)
          .map((r) => r.error)
          .slice(0, 3);
        const errorSummary =
          sampleErrors.length > 0 ? ` Common errors: ${sampleErrors.join("; ")}` : "";
        throw new Error(
          `Failed to send any messages to ${result.totalRecipients} recipients.${errorSummary} ` +
            `Check Twilio credentials, opt-out status, and phone number formats.`,
        );
      }

      return {
        success: true,
        totalRecipients: result.totalRecipients,
        sentCount: finalCounts.sentCount,
        failedCount: finalCounts.failedCount,
      };
    } catch (error) {
      // Mark blast as failed
      console.error(`[sendBlastDirect] Error sending text blast ${blastId}:`, error);
      await ctx.runMutation(internal.textBlasts.updateBlastStatus, {
        blastId,
        status: "failed",
      });
      throw new Error(`Failed to send text blast: ${getErrorMessage(error)}`);
    }
  },
});

/**
 * Get text blasts for a specific event
 */
export const getBlastsByEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"textBlasts">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    // Verify user is host of this event (using org:admin role)
    await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (!identityHasHostRole(identityWithRole)) {
      throw new Error("Not authorized for this event");
    }

    const allBlasts = await ctx.db.query("textBlasts").collect();
    const blasts = allBlasts
      .filter((blast) => blastTargetsEvent(blast, args.eventId))
      .filter((blast) => !args.status || blast.status === args.status)
      .sort((firstBlast, secondBlast) => secondBlast.createdAt - firstBlast.createdAt)
      .slice(0, args.limit || 50);

    return blasts;
  },
});

/**
 * Get text blasts for a specific event, enriched with sender display names
 */
export const getBlastsByEventWithSenderNames = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<(Doc<"textBlasts"> & { sentByName: string; replyActionCount: number })[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (!identityHasHostRole(identityWithRole)) {
      throw new Error("Not authorized for this event");
    }

    const allBlasts = await ctx.db.query("textBlasts").collect();
    const blasts = allBlasts
      .filter((blast) => blastTargetsEvent(blast, args.eventId))
      .filter((blast) => !args.status || blast.status === args.status)
      .sort((firstBlast, secondBlast) => secondBlast.createdAt - firstBlast.createdAt)
      .slice(0, args.limit || 100);

    // Resolve unique sender names
    const uniqueSenderIds = [...new Set(blasts.map((blast) => blast.sentBy))];
    const senderNameMap = new Map<string, string>();
    for (const senderId of uniqueSenderIds) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", senderId))
        .unique();
      if (user) {
        const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
        senderNameMap.set(senderId, displayName || "Unknown");
      } else {
        senderNameMap.set(senderId, "Unknown");
      }
    }

    return await Promise.all(
      blasts.map(async (blast) => ({
        ...blast,
        sentByName: senderNameMap.get(blast.sentBy) || "Unknown",
        replyActionCount: (await listReplyActionsForBlast(ctx, blast._id)).length,
      })),
    );
  },
});

export const getBlastsByWorkspaceWithSenderNames = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<(Doc<"textBlasts"> & { sentByName: string; replyActionCount: number })[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    if (!identityHasHostRole(identityWithRole)) {
      throw new Error("Not authorized for this workspace");
    }

    const scopedEvents = (await ctx.db.query("events").collect()).filter((event) =>
      eventMatchesSiteScope(event, {
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
      }),
    );
    const scopedEventIds = new Set(scopedEvents.map((event) => event._id));

    const allBlasts = await ctx.db.query("textBlasts").collect();
    const blasts = allBlasts
      .filter((blast) =>
        getBlastTargetEventIds(blast).some((eventId) => scopedEventIds.has(eventId)),
      )
      .filter((blast) => !args.status || blast.status === args.status)
      .sort((firstBlast, secondBlast) => secondBlast.createdAt - firstBlast.createdAt)
      .slice(0, args.limit || 200);

    const uniqueSenderIds = [...new Set(blasts.map((blast) => blast.sentBy))];
    const senderNameMap = new Map<string, string>();
    for (const senderId of uniqueSenderIds) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", senderId))
        .unique();
      if (user) {
        const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
        senderNameMap.set(senderId, displayName || "Unknown");
      } else {
        senderNameMap.set(senderId, "Unknown");
      }
    }

    return await Promise.all(
      blasts.map(async (blast) => ({
        ...blast,
        sentByName: senderNameMap.get(blast.sentBy) || "Unknown",
        replyActionCount: (await listReplyActionsForBlast(ctx, blast._id)).length,
      })),
    );
  },
});

/**
 * Get text blasts sent by current user
 */
export const getMyBlasts = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"textBlasts">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    let query = ctx.db
      .query("textBlasts")
      .withIndex("by_sent_by", (q) => q.eq("sentBy", identity.subject));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    const blasts = await query.order("desc").take(args.limit || 50);

    return blasts as Doc<"textBlasts">[];
  },
});

/**
 * Get a single text blast by ID
 */
export const getBlastById = query({
  args: {
    blastId: v.id("textBlasts"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<(Doc<"textBlasts"> & { replyActions: Doc<"textBlastReplyActions">[] }) | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    const blastRecord = await getTextBlastInSiteScope(ctx, args.blastId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    if (!blastRecord) return null;
    const { blast } = blastRecord;

    if (!identityCanManageBlast(identityWithRole, blast.sentBy)) {
      throw new Error("Not authorized to view this text blast");
    }

    return {
      ...blast,
      replyActions: await listReplyActionsForBlast(ctx, blast._id),
    };
  },
});

/**
 * Get RSVPs with names for text blast recipient selection
 * Returns RSVPs filtered by target lists and SMS consent
 */
export const getRecipientsForSelection = query({
  args: {
    eventId: v.id("events"),
    targetEventIds: v.optional(v.array(v.id("events"))),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()),
    recipientHistoryFilter: recipientHistoryFilterValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      rsvpId: Id<"rsvps">;
      name: string;
      listKey: string;
      eventId: Id<"events">;
      eventName: string;
    }>
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    const targetEventIds = normalizeTargetEventIds(args);

    // Verify user is host of each selected event
    const selectedEvents = await ensureEventsInSiteScope(ctx, targetEventIds, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (!identityHasHostRole(identityWithRole)) {
      throw new Error("Not authorized for this event");
    }

    const filteredRecipients = await selectRecipientsFromStoredPhones(ctx, {
      eventId: args.eventId,
      targetEventIds,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      recipientHistoryFilter: args.recipientHistoryFilter,
    });
    const selectedEventTitleMap = eventTitleMap(selectedEvents);

    // Enrich with user names
    const enriched: RecipientPreview[] = filteredRecipients.map((recipient) => {
      const rsvp = recipient.rsvp;
      const user = recipient.user;
      const firstName = user.firstName;
      const lastName = user.lastName;
      const name = [firstName, lastName].filter(Boolean).join(" ") || rsvp.userName || "Unknown";
      return {
        rsvpId: rsvp._id,
        name,
        listKey: rsvp.listKey,
        eventId: rsvp.eventId,
        eventName: selectedEventTitleMap.get(rsvp.eventId) ?? "Event",
      };
    });

    // Sort by name
    enriched.sort((a, b) => a.name.localeCompare(b.name));

    return enriched;
  },
});

/**
 * Get available recipient lists for an event with counts
 * Returns distinct listKeys with recipient counts for each list
 */
export const getAvailableListsForEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    recipientFilter: v.optional(v.string()),
    recipientHistoryFilter: recipientHistoryFilterValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ listKey: string; recipientCount: number; totalRsvps: number }>> => {
    return await getAvailableListsForEventsHandler(ctx, {
      ...args,
      targetEventIds: [args.eventId],
    });
  },
});

export const getAvailableListsForEvents = query({
  args: {
    eventId: v.id("events"),
    targetEventIds: v.array(v.id("events")),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    recipientFilter: v.optional(v.string()),
    recipientHistoryFilter: recipientHistoryFilterValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ listKey: string; recipientCount: number; totalRsvps: number }>> => {
    return await getAvailableListsForEventsHandler(ctx, args);
  },
});

async function getAvailableListsForEventsHandler(
  ctx: QueryCtx,
  args: {
    eventId: Id<"events">;
    targetEventIds: Id<"events">[];
    siteKey?: string;
    workspaceSlug?: string;
    recipientFilter?: string;
    recipientHistoryFilter?: RecipientHistoryFilterConfig;
  },
): Promise<Array<{ listKey: string; recipientCount: number; totalRsvps: number }>> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  await requireWorkspaceHost(ctx, {
    siteKey: args.siteKey,
    workspaceSlug: args.workspaceSlug,
  });
  const identityWithRole = identity as IdentityWithRole;

  const targetEventIds = normalizeTargetEventIds(args);

  // Verify user is host of selected events (using org:admin role)
  await ensureEventsInSiteScope(ctx, targetEventIds, {
    siteKey: args.siteKey,
    workspaceSlug: args.workspaceSlug,
  });

  if (!identityHasHostRole(identityWithRole)) {
    throw new Error("Not authorized for this event");
  }

  const filterConfig = parseRecipientFilter(args.recipientFilter);
  const statusesToFetch = statusesForFilter(filterConfig);
  const listUniqueUsers = new Map<string, Set<string>>();

  for (const eventId of targetEventIds) {
    const rsvpsForEvent = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
      .collect();

    for (const rsvp of rsvpsForEvent) {
      if (!statusesToFetch.includes(resolveApprovalStatus(rsvp))) {
        continue;
      }
      if (!rsvp.listKey) {
        console.warn(`[getAvailableListsForEvents] RSVP ${rsvp._id} missing listKey, skipping`);
        continue;
      }
      if (!listUniqueUsers.has(rsvp.listKey)) {
        listUniqueUsers.set(rsvp.listKey, new Set());
      }
      listUniqueUsers.get(rsvp.listKey)!.add(rsvp.clerkUserId);
    }
  }

  const result: Array<{
    listKey: string;
    recipientCount: number;
    totalRsvps: number;
  }> = [];

  for (const [listKey, userIds] of listUniqueUsers.entries()) {
    const recipientCount = await ctx.runQuery(internal.textBlasts.countRecipientsInternal, {
      eventId: args.eventId,
      targetEventIds,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
      targetLists: [listKey],
      recipientFilter: args.recipientFilter,
      recipientHistoryFilter: args.recipientHistoryFilter,
    });

    result.push({
      listKey,
      recipientCount,
      totalRsvps: userIds.size,
    });

    console.log(
      `[getAvailableListsForEvents] List ${listKey}: ${userIds.size} RSVPs (statuses considered: ${statusesToFetch.join(", ")}), ${recipientCount} reachable recipients`,
    );
  }

  result.sort((a, b) => a.listKey.localeCompare(b.listKey));

  return result;
}

/**
 * Duplicate an existing text blast as a new draft
 */
export const duplicateBlast = mutation({
  args: {
    blastId: v.id("textBlasts"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"textBlasts">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    const { blast: originalBlast } = await ensureTextBlastInSiteScope(ctx, args.blastId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (!identityCanManageBlast(identityWithRole, originalBlast.sentBy)) {
      throw new Error("Not authorized to duplicate this text blast");
    }

    const targetEventIds = getBlastTargetEventIds(originalBlast);
    const effectiveIncludeQrCodes = resolveEffectiveIncludeQrCodes({
      message: originalBlast.message,
      includeQrCodes: originalBlast.includeQrCodes,
    });

    // Count current recipients for the target lists
    const recipientCount = await ctx.runQuery(internal.textBlasts.countRecipientsInternal, {
      eventId: originalBlast.eventId,
      targetEventIds,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
      targetLists: originalBlast.targetLists,
      recipientFilter: originalBlast.recipientFilter,
      recipientHistoryFilter: originalBlast.recipientHistoryFilter,
    });

    const now = Date.now();
    const newBlastId = await ctx.db.insert("textBlasts", {
      eventId: originalBlast.eventId,
      targetEventIds,
      name: `${originalBlast.name} (Copy)`,
      message: originalBlast.message,
      targetLists: originalBlast.targetLists,
      recipientFilter: originalBlast.recipientFilter,
      recipientHistoryFilter: originalBlast.recipientHistoryFilter,
      includeQrCodes: effectiveIncludeQrCodes,
      deliveryTrackingEnabled: true,
      recipientCount,
      sentCount: 0,
      failedCount: 0,
      sentBy: identity.subject,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    const originalReplyActions = await listReplyActionsForBlast(ctx, args.blastId);
    await replaceReplyActionsForBlast(ctx, {
      textBlastId: newBlastId,
      replyActions: originalReplyActions.map((replyAction) => ({
        replyCode: replyAction.replyCode,
        targetEventId: replyAction.targetEventId,
        targetListKey: replyAction.targetListKey,
        isEnabled: replyAction.isEnabled,
      })),
      scope: {
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
      },
    });
    return newBlastId;
  },
});

/**
 * Delete a text blast
 * Allows deletion of any status text blast (draft, sent, failed, etc.)
 */
export const deleteBlast = mutation({
  args: {
    blastId: v.id("textBlasts"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    const { blast } = await ensureTextBlastInSiteScope(ctx, args.blastId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (!identityCanManageBlast(identityWithRole, blast.sentBy)) {
      throw new Error("Not authorized to delete this text blast");
    }

    // Prevent deletion of blasts that are currently being sent
    if (blast.status === "sending") {
      throw new Error("Cannot delete a text blast that is currently being sent");
    }

    const replyActions = await listReplyActionsForBlast(ctx, args.blastId);
    for (const replyAction of replyActions) {
      await ctx.db.delete(replyAction._id);
    }

    await ctx.db.delete(args.blastId);
    return { success: true };
  },
});

export const updateReplyActions = mutation({
  args: {
    blastId: v.id("textBlasts"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    replyActions: v.array(replyActionInputValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;

    const { blast } = await ensureTextBlastInSiteScope(ctx, args.blastId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (!identityCanManageBlast(identityWithRole, blast.sentBy)) {
      throw new Error("Not authorized to update this text blast");
    }
    if (blast.status === "sending") {
      throw new Error("Cannot update reply actions while the blast is sending");
    }

    await replaceReplyActionsForBlast(ctx, {
      textBlastId: args.blastId,
      replyActions: args.replyActions,
      scope: {
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
      },
    });

    return {
      ok: true as const,
      replyActionCount: args.replyActions.length,
    };
  },
});

export const getReplyActionTargetOptions = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      eventId: Id<"events">;
      eventName: string;
      eventSecondaryTitle?: string;
      eventDate: number;
      eventTimezone?: string;
      lists: Array<{ listKey: string; password?: string }>;
    }>
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identityWithRole = identity as IdentityWithRole;
    if (!identityHasHostRole(identityWithRole)) {
      throw new Error("Not authorized for this workspace");
    }

    const events = (await ctx.db.query("events").collect())
      .filter((event) =>
        eventMatchesSiteScope(event, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        }),
      )
      .filter((event) => isEventOpenForRsvp(event, Date.now()))
      .sort((firstEvent, secondEvent) => secondEvent.eventDate - firstEvent.eventDate);

    const options = [];
    for (const event of events) {
      const credentials = await ctx.db
        .query("listCredentials")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", event._id))
        .collect();
      options.push({
        eventId: event._id,
        eventName: event.name,
        eventSecondaryTitle: event.secondaryTitle,
        eventDate: event.eventDate,
        eventTimezone: event.eventTimezone,
        lists: credentials
          .map((credential) => ({
            listKey: credential.listKey,
            password: credential.password?.trim() || undefined,
          }))
          .sort((firstList, secondList) => firstList.listKey.localeCompare(secondList.listKey)),
      });
    }

    return options;
  },
});

// Internal functions below this line

/**
 * Internal query to get blast details
 */
export const getBlastInternal = internalQuery({
  args: {
    blastId: v.id("textBlasts"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const blastRecord = await getTextBlastInSiteScope(ctx, args.blastId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    return blastRecord?.blast ?? null;
  },
});

/**
 * Internal query to get event details
 */
export const getEventInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await getEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
  },
});

/**
 * Internal mutation to create a blast record
 */
export const createBlastInternal = internalMutation({
  args: {
    eventId: v.id("events"),
    targetEventIds: v.optional(v.array(v.id("events"))),
    name: v.string(),
    message: v.string(),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()),
    recipientHistoryFilter: recipientHistoryFilterValidator,
    includeQrCodes: v.optional(v.boolean()),
    recipientCount: v.number(),
    sentBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    replyActions: v.optional(v.array(replyActionInputValidator)),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const blastId = await ctx.db.insert("textBlasts", {
      eventId: args.eventId,
      targetEventIds: args.targetEventIds ?? [args.eventId],
      name: args.name,
      message: args.message,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      recipientHistoryFilter: args.recipientHistoryFilter,
      includeQrCodes: resolveEffectiveIncludeQrCodes({
        message: args.message,
        includeQrCodes: args.includeQrCodes,
      }),
      deliveryTrackingEnabled: true,
      recipientCount: args.recipientCount,
      sentCount: 0,
      failedCount: 0,
      sentBy: args.sentBy,
      status: "draft",
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });
    await replaceReplyActionsForBlast(ctx, {
      textBlastId: blastId,
      replyActions: args.replyActions,
      scope: {
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
      },
    });
    return blastId;
  },
});

/**
 * Internal mutation to update blast status
 */
type UpdateBlastStatusArgs = {
  blastId: Id<"textBlasts">;
  status: string;
  sentAt?: number;
};

export const updateBlastStatus = internalMutation({
  args: {
    blastId: v.id("textBlasts"),
    status: v.string(),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args: UpdateBlastStatusArgs) => {
    const updateData: Partial<Doc<"textBlasts"> & { updatedAt: number }> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.sentAt !== undefined) {
      updateData.sentAt = args.sentAt;
    }

    await ctx.db.patch(args.blastId, updateData);
  },
});

/**
 * Internal mutation to update blast counts
 */
type UpdateBlastCountArgs = {
  blastId: Id<"textBlasts">;
  sentCount: number;
  failedCount: number;
  status: string;
};

export const updateBlastCounts = internalMutation({
  args: {
    blastId: v.id("textBlasts"),
    sentCount: v.number(),
    failedCount: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args: UpdateBlastCountArgs) => {
    await ctx.db.patch(args.blastId, {
      sentCount: args.sentCount,
      failedCount: args.failedCount,
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const startBlastSend = internalMutation({
  args: {
    blastId: v.id("textBlasts"),
    sentAt: v.number(),
    includeQrCodes: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Doc<"textBlasts">> => {
    const blast = await ctx.db.get(args.blastId);
    if (!blast) {
      throw new Error("Text blast not found");
    }
    if (blast.status !== "draft" && blast.status !== "failed") {
      throw new Error("Text blast already sent or in progress");
    }

    await ctx.db.patch(args.blastId, {
      status: "sending",
      sentAt: args.sentAt,
      includeQrCodes: args.includeQrCodes ?? blast.includeQrCodes ?? false,
      deliveryTrackingEnabled: true,
      updatedAt: Date.now(),
    });

    const updatedBlast = await ctx.db.get(args.blastId);
    if (!updatedBlast) {
      throw new Error("Text blast not found");
    }
    return updatedBlast;
  },
});

async function logReplyAttempt(
  ctx: MutationCtx,
  args: {
    textBlastId?: Id<"textBlasts">;
    textBlastRecipientId?: Id<"textBlastRecipients">;
    replyActionId?: Id<"textBlastReplyActions">;
    phoneHash: string;
    fromPhoneObfuscated: string;
    inboundMessage: string;
    normalizedReplyCode: string;
    targetEventId?: Id<"events">;
    targetListKey?: string;
    sourceRsvpId?: Id<"rsvps">;
    destinationRsvpId?: Id<"rsvps">;
    status: ReplyActionAttemptStatus;
    responseMessage?: string;
    errorMessage?: string;
    messageSid?: string;
    receivedAt: number;
  },
): Promise<void> {
  await ctx.db.insert("textBlastReplyAttempts", {
    ...args,
    createdAt: Date.now(),
  });
}

async function findLatestReplyActionCandidate(
  ctx: MutationCtx,
  phoneHash: string,
): Promise<{
  delivery: Doc<"textBlastRecipients">;
  blast: Doc<"textBlasts">;
  replyActions: Doc<"textBlastReplyActions">[];
} | null> {
  const deliveries = (
    await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
      .collect()
  )
    .filter((delivery) => delivery.status === "sent")
    .sort((firstDelivery, secondDelivery) => {
      const firstTimestamp = firstDelivery.sentAt ?? firstDelivery.updatedAt;
      const secondTimestamp = secondDelivery.sentAt ?? secondDelivery.updatedAt;
      return secondTimestamp - firstTimestamp;
    });

  for (const delivery of deliveries) {
    const blast = await ctx.db.get(delivery.textBlastId);
    if (!blast) {
      continue;
    }
    const replyActions = (await listReplyActionsForBlast(ctx, blast._id)).filter(
      (replyAction) => replyAction.isEnabled,
    );
    if (replyActions.length === 0) {
      continue;
    }

    return { delivery, blast, replyActions };
  }

  return null;
}

function selectSourceRsvpForReplyAction(
  sourceRsvps: Doc<"rsvps">[],
  clerkUserId: string,
): Doc<"rsvps"> | null {
  const matchingRsvps = sourceRsvps
    .filter((rsvp) => rsvp.clerkUserId === clerkUserId)
    .sort((firstRsvp, secondRsvp) => secondRsvp.updatedAt - firstRsvp.updatedAt);
  return matchingRsvps[0] ?? null;
}

function copyMatchingCustomFieldValues(args: {
  sourceRsvp: Doc<"rsvps">;
  targetEvent: Doc<"events">;
}): { customFieldValues?: Record<string, string>; missingRequiredLabels: string[] } {
  const copiedValues: Record<string, string> = {};
  const missingRequiredLabels: string[] = [];
  const sourceValues = args.sourceRsvp.customFieldValues ?? {};

  for (const targetField of args.targetEvent.customFields ?? []) {
    const sourceValue = sourceValues[targetField.key];
    const stringValue = typeof sourceValue === "string" ? sourceValue : "";
    const finalValue = targetField.trimWhitespace === false ? stringValue : stringValue.trim();
    if (finalValue) {
      copiedValues[targetField.key] = finalValue;
      continue;
    }
    if (targetField.required === true) {
      missingRequiredLabels.push(targetField.label);
    }
  }

  return {
    customFieldValues: Object.keys(copiedValues).length > 0 ? copiedValues : undefined,
    missingRequiredLabels,
  };
}

async function copyMatchingPrimaryFields(args: {
  ctx: MutationCtx;
  sourceRsvp: Doc<"rsvps">;
  targetEvent: Doc<"events">;
}): Promise<{
  socialProfiles: Array<{ platformKey: string; handle: string }>;
  invitedByName?: string;
  missingRequiredMessage?: string;
}> {
  const targetPrimaryFieldConfig = args.targetEvent.primaryFieldConfig;
  const sourceSocialProfiles = await args.ctx.db
    .query("rsvpSocialProfiles")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", args.sourceRsvp._id))
    .collect();
  const sourceSocialProfileByPlatform = new Map(
    sourceSocialProfiles.map((socialProfile) => [socialProfile.platformKey, socialProfile]),
  );
  const socialProfiles = (targetPrimaryFieldConfig?.socialPlatforms ?? [])
    .map((platform) => {
      const sourceSocialProfile = sourceSocialProfileByPlatform.get(platform.platformKey);
      if (!sourceSocialProfile) {
        return null;
      }
      return {
        platformKey: platform.platformKey,
        handle: sourceSocialProfile.handle,
      };
    })
    .filter((profile): profile is { platformKey: string; handle: string } => profile !== null);
  const sanitizedSocialProfiles = sanitizeSubmittedSocialProfiles(
    socialProfiles,
    targetPrimaryFieldConfig,
  );
  const invitedByName =
    targetPrimaryFieldConfig?.invitedBy?.enabled === true
      ? args.sourceRsvp.invitedByName
      : undefined;

  try {
    assertRequiredPrimaryFieldValues({
      primaryFieldConfig: targetPrimaryFieldConfig,
      submittedProfiles: sanitizedSocialProfiles,
      invitedByName,
    });
  } catch (error) {
    return {
      socialProfiles,
      invitedByName,
      missingRequiredMessage: getErrorMessage(error),
    };
  }

  return { socialProfiles, invitedByName };
}

function buildMissingFieldsResponse(missingFields: string[]): string {
  const missingFieldsLabel = missingFields.join(", ");
  return `We could not submit this RSVP by text because ${missingFieldsLabel} still needs to be filled out.`;
}

function formatReplyActionEventName(event: Doc<"events">): string {
  return formatEventTitleForMessageTemplate(event);
}

export const processIncomingSmsReply = internalMutation({
  args: {
    fromPhoneNumber: v.string(),
    messageBody: v.string(),
    messageSid: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    shouldRespond: boolean;
    responseMessage?: string;
    status: ReplyActionAttemptStatus;
  }> => {
    const receivedAt = args.receivedAt ?? Date.now();
    const inboundMessage = args.messageBody.trim().slice(0, 512);
    const normalizedReplyCode = normalizeReplyCode(inboundMessage);
    const phoneResolution = await normalizeAndHashPhoneNumber(args.fromPhoneNumber);
    const fromPhoneObfuscated = obfuscatePhoneNumber(phoneResolution.normalizedPhoneNumber);

    const candidate = await findLatestReplyActionCandidate(ctx, phoneResolution.phoneHash);
    if (!candidate) {
      await logReplyAttempt(ctx, {
        phoneHash: phoneResolution.phoneHash,
        fromPhoneObfuscated,
        inboundMessage,
        normalizedReplyCode,
        status: "unknown_sender",
        messageSid: args.messageSid,
        receivedAt,
      });
      return { shouldRespond: false, status: "unknown_sender" };
    }

    const matchingReplyAction = candidate.replyActions.find(
      (replyAction) => replyAction.replyCodeNormalized === normalizedReplyCode,
    );
    if (!matchingReplyAction) {
      const responseMessage = "We could not match that reply code. Check the text and try again.";
      await logReplyAttempt(ctx, {
        textBlastId: candidate.blast._id,
        textBlastRecipientId: candidate.delivery._id,
        phoneHash: phoneResolution.phoneHash,
        fromPhoneObfuscated,
        inboundMessage,
        normalizedReplyCode,
        status: "invalid_code",
        responseMessage,
        messageSid: args.messageSid,
        receivedAt,
      });
      return { shouldRespond: true, responseMessage, status: "invalid_code" };
    }

    const uniqueRecipientClerkUserIds = getUniqueIds(candidate.delivery.recipientClerkUserIds);
    if (uniqueRecipientClerkUserIds.length !== 1) {
      const responseMessage =
        "We could not submit this RSVP by text because this phone matches more than one guest.";
      await logReplyAttempt(ctx, {
        textBlastId: candidate.blast._id,
        textBlastRecipientId: candidate.delivery._id,
        replyActionId: matchingReplyAction._id,
        phoneHash: phoneResolution.phoneHash,
        fromPhoneObfuscated,
        inboundMessage,
        normalizedReplyCode,
        targetEventId: matchingReplyAction.targetEventId,
        targetListKey: matchingReplyAction.targetListKey,
        status: "ambiguous_recipient",
        responseMessage,
        messageSid: args.messageSid,
        receivedAt,
      });
      return { shouldRespond: true, responseMessage, status: "ambiguous_recipient" };
    }

    const clerkUserId = uniqueRecipientClerkUserIds[0];
    const sourceRsvps = (
      await Promise.all(
        candidate.delivery.sourceRsvpIds.map((sourceRsvpId) => ctx.db.get(sourceRsvpId)),
      )
    ).filter((sourceRsvp): sourceRsvp is Doc<"rsvps"> => sourceRsvp !== null);
    const sourceRsvp = selectSourceRsvpForReplyAction(sourceRsvps, clerkUserId);
    if (!sourceRsvp) {
      const responseMessage = "We could not find the original RSVP needed for this text reply.";
      await logReplyAttempt(ctx, {
        textBlastId: candidate.blast._id,
        textBlastRecipientId: candidate.delivery._id,
        replyActionId: matchingReplyAction._id,
        phoneHash: phoneResolution.phoneHash,
        fromPhoneObfuscated,
        inboundMessage,
        normalizedReplyCode,
        targetEventId: matchingReplyAction.targetEventId,
        targetListKey: matchingReplyAction.targetListKey,
        status: "error",
        responseMessage,
        errorMessage: "Source RSVP not found",
        messageSid: args.messageSid,
        receivedAt,
      });
      return { shouldRespond: true, responseMessage, status: "error" };
    }

    const targetEvent = await ctx.db.get(matchingReplyAction.targetEventId);
    const targetListCredential = targetEvent
      ? await ctx.db
          .query("listCredentials")
          .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", targetEvent._id))
          .filter((queryBuilder) =>
            queryBuilder.eq(queryBuilder.field("listKey"), matchingReplyAction.targetListKey),
          )
          .unique()
      : null;
    if (!targetEvent || !targetListCredential || !isEventOpenForRsvp(targetEvent, receivedAt)) {
      const responseMessage = "This reply code is no longer accepting RSVPs.";
      await logReplyAttempt(ctx, {
        textBlastId: candidate.blast._id,
        textBlastRecipientId: candidate.delivery._id,
        replyActionId: matchingReplyAction._id,
        phoneHash: phoneResolution.phoneHash,
        fromPhoneObfuscated,
        inboundMessage,
        normalizedReplyCode,
        targetEventId: matchingReplyAction.targetEventId,
        targetListKey: matchingReplyAction.targetListKey,
        sourceRsvpId: sourceRsvp._id,
        status: "target_unavailable",
        responseMessage,
        messageSid: args.messageSid,
        receivedAt,
      });
      return { shouldRespond: true, responseMessage, status: "target_unavailable" };
    }

    const existingDestinationRsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (queryBuilder) =>
        queryBuilder.eq("eventId", targetEvent._id).eq("clerkUserId", clerkUserId),
      )
      .unique();
    if (existingDestinationRsvp) {
      const existingStatus = resolveApprovalStatus(existingDestinationRsvp);
      const responseMessage = `You already have an RSVP for ${formatReplyActionEventName(targetEvent)} (${existingStatus}).`;
      await logReplyAttempt(ctx, {
        textBlastId: candidate.blast._id,
        textBlastRecipientId: candidate.delivery._id,
        replyActionId: matchingReplyAction._id,
        phoneHash: phoneResolution.phoneHash,
        fromPhoneObfuscated,
        inboundMessage,
        normalizedReplyCode,
        targetEventId: targetEvent._id,
        targetListKey: matchingReplyAction.targetListKey,
        sourceRsvpId: sourceRsvp._id,
        destinationRsvpId: existingDestinationRsvp._id,
        status: "already_exists",
        responseMessage,
        messageSid: args.messageSid,
        receivedAt,
      });
      return { shouldRespond: true, responseMessage, status: "already_exists" };
    }

    const copiedCustomFields = copyMatchingCustomFieldValues({ sourceRsvp, targetEvent });
    const copiedPrimaryFields = await copyMatchingPrimaryFields({ ctx, sourceRsvp, targetEvent });
    const missingRequiredFields = [...copiedCustomFields.missingRequiredLabels];
    if (copiedPrimaryFields.missingRequiredMessage) {
      missingRequiredFields.push(copiedPrimaryFields.missingRequiredMessage);
    }
    if (missingRequiredFields.length > 0) {
      const responseMessage = buildMissingFieldsResponse(missingRequiredFields);
      await logReplyAttempt(ctx, {
        textBlastId: candidate.blast._id,
        textBlastRecipientId: candidate.delivery._id,
        replyActionId: matchingReplyAction._id,
        phoneHash: phoneResolution.phoneHash,
        fromPhoneObfuscated,
        inboundMessage,
        normalizedReplyCode,
        targetEventId: targetEvent._id,
        targetListKey: matchingReplyAction.targetListKey,
        sourceRsvpId: sourceRsvp._id,
        status: "missing_required_fields",
        responseMessage,
        errorMessage: missingRequiredFields.join(", "),
        messageSid: args.messageSid,
        receivedAt,
      });
      return { shouldRespond: true, responseMessage, status: "missing_required_fields" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
      .unique();
    const userName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "" : "";
    const configuredSocialPlatformKeys = new Set(
      (targetEvent.primaryFieldConfig?.socialPlatforms ?? []).map(
        (platform) => platform.platformKey,
      ),
    );
    const sanitizedSocialProfiles = sanitizeSubmittedSocialProfiles(
      copiedPrimaryFields.socialProfiles,
      targetEvent.primaryFieldConfig,
    );
    const invitedByPatch =
      targetEvent.primaryFieldConfig?.invitedBy?.enabled === true
        ? buildInvitedByPatch(copiedPrimaryFields.invitedByName)
        : {};
    const now = Date.now();
    const destinationRsvpId = await ctx.db.insert("rsvps", {
      eventId: targetEvent._id,
      clerkUserId,
      listKey: matchingReplyAction.targetListKey,
      ticketStatus: "not-issued",
      userName,
      shareContact: sourceRsvp.shareContact,
      attendees: 1,
      smsConsent: true,
      smsConsentTimestamp: now,
      customFieldValues: copiedCustomFields.customFieldValues,
      ...invitedByPatch,
      status: "pending",
      approvalStatus: "pending",
      attendanceStatus: targetEvent.attendanceQuestionEnabled
        ? sanitizeAttendanceStatus("yes")
        : "yes",
      createdAt: now,
      updatedAt: now,
    });

    if (configuredSocialPlatformKeys.size > 0) {
      await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
        event: targetEvent,
        rsvpId: destinationRsvpId,
        clerkUserId,
        userId: user?._id,
        submittedProfiles: sanitizedSocialProfiles,
      });
      await replaceRsvpSocialProfileSnapshots(ctx, {
        eventId: targetEvent._id,
        rsvpId: destinationRsvpId,
        clerkUserId,
        userId: user?._id,
        configuredPlatformKeys: configuredSocialPlatformKeys,
        submittedProfiles: sanitizedSocialProfiles,
      });
    }

    const destinationRsvp = await ctx.db.get(destinationRsvpId);
    if (destinationRsvp) {
      try {
        await insertRsvpIntoAggregate(ctx, destinationRsvp);
      } catch (error) {
        console.error("[processIncomingSmsReply] Failed to sync RSVP aggregate", error);
      }
    }

    const responseMessage = `RSVP submitted for ${formatReplyActionEventName(targetEvent)}. Your request is pending approval.`;
    await logReplyAttempt(ctx, {
      textBlastId: candidate.blast._id,
      textBlastRecipientId: candidate.delivery._id,
      replyActionId: matchingReplyAction._id,
      phoneHash: phoneResolution.phoneHash,
      fromPhoneObfuscated,
      inboundMessage,
      normalizedReplyCode,
      targetEventId: targetEvent._id,
      targetListKey: matchingReplyAction.targetListKey,
      sourceRsvpId: sourceRsvp._id,
      destinationRsvpId,
      status: "submitted",
      responseMessage,
      messageSid: args.messageSid,
      receivedAt,
    });

    return { shouldRespond: true, responseMessage, status: "submitted" };
  },
});

export const upsertRecipientDelivery = internalMutation({
  args: {
    textBlastId: v.id("textBlasts"),
    phoneHash: v.string(),
    sourceEventIds: v.array(v.id("events")),
    sourceRsvpIds: v.array(v.id("rsvps")),
    sourceListKeys: v.array(v.string()),
    recipientClerkUserIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"textBlastRecipients">> => {
    const now = Date.now();
    const existingDelivery = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_text_blast_phone", (queryBuilder) =>
        queryBuilder.eq("textBlastId", args.textBlastId).eq("phoneHash", args.phoneHash),
      )
      .first();

    const deliveryPatch = {
      status: "pending",
      smsNotificationId: undefined,
      sourceEventIds: args.sourceEventIds,
      sourceRsvpIds: args.sourceRsvpIds,
      sourceListKeys: args.sourceListKeys,
      recipientClerkUserIds: args.recipientClerkUserIds,
      messageId: undefined,
      errorMessage: undefined,
      sentAt: undefined,
      updatedAt: now,
    };

    if (existingDelivery) {
      if (existingDelivery.status === "sent") {
        return existingDelivery._id;
      }
      await ctx.db.patch(existingDelivery._id, deliveryPatch);
      return existingDelivery._id;
    }

    return await ctx.db.insert("textBlastRecipients", {
      textBlastId: args.textBlastId,
      phoneHash: args.phoneHash,
      ...deliveryPatch,
      createdAt: now,
    });
  },
});

export const linkRecipientDeliveryNotification = internalMutation({
  args: {
    textBlastRecipientId: v.id("textBlastRecipients"),
    smsNotificationId: v.id("smsNotifications"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.textBlastRecipientId, {
      smsNotificationId: args.smsNotificationId,
      updatedAt: Date.now(),
    });
  },
});

export const getDeliveryStatsInternal = internalQuery({
  args: {
    textBlastId: v.id("textBlasts"),
  },
  handler: async (ctx, args) => {
    const deliveries = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_text_blast", (queryBuilder) =>
        queryBuilder.eq("textBlastId", args.textBlastId),
      )
      .collect();

    return {
      totalCount: deliveries.length,
      sentCount: deliveries.filter((delivery) => delivery.status === "sent").length,
      failedCount: deliveries.filter((delivery) => delivery.status === "failed").length,
      pendingCount: deliveries.filter((delivery) => delivery.status === "pending").length,
    };
  },
});

export const isPhoneHashEligibleForBlastInternal = internalQuery({
  args: {
    phoneHash: v.string(),
    recipientHistoryFilter: recipientHistoryFilterValidator,
    textBlastId: v.optional(v.id("textBlasts")),
    skipAlreadySentForBlast: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<boolean> => {
    if (!(await passesRecipientHistoryFilter(ctx, args.phoneHash, args.recipientHistoryFilter))) {
      return false;
    }

    if (args.skipAlreadySentForBlast) {
      return !(await alreadySentForBlast(ctx, args.textBlastId, args.phoneHash));
    }

    return true;
  },
});

/**
 * Internal query to count recipients for target lists
 */
export const countRecipientsInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    targetEventIds: v.optional(v.array(v.id("events"))),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()), // Serialized recipient filter config
    recipientHistoryFilter: recipientHistoryFilterValidator,
    selectedRsvpIds: v.optional(v.array(v.id("rsvps"))),
    textBlastId: v.optional(v.id("textBlasts")),
    skipAlreadySentForBlast: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const recipients = await selectRecipientsFromStoredPhones(ctx, {
      eventId: args.eventId,
      targetEventIds: args.targetEventIds,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      recipientHistoryFilter: args.recipientHistoryFilter,
      selectedRsvpIds: args.selectedRsvpIds,
      textBlastId: args.textBlastId,
      skipAlreadySentForBlast: args.skipAlreadySentForBlast,
    });

    return recipients.length;
  },
});

/**
 * Internal action to get recipients with decrypted phones
 */
export const getRecipientsWithPhonesInternal = internalAction({
  args: {
    eventId: v.id("events"),
    targetEventIds: v.optional(v.array(v.id("events"))),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()), // Serialized recipient filter config
    recipientHistoryFilter: recipientHistoryFilterValidator,
    selectedRsvpIds: v.optional(v.array(v.id("rsvps"))), // Filter to specific RSVP IDs if provided
    textBlastId: v.optional(v.id("textBlasts")),
    skipAlreadySentForBlast: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<BlastRecipient[]> => {
    // Get all approved RSVPs for target lists
    const rsvps = (await ctx.runQuery(internal.textBlasts.getApprovedRsvpsForListsInternal, {
      eventId: args.eventId,
      targetEventIds: args.targetEventIds,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      selectedRsvpIds: args.selectedRsvpIds,
    })) as ApprovedRsvpForList[];

    console.log(
      `[getRecipientsWithPhonesInternal] Found ${rsvps.length} RSVPs with SMS consent for lists: ${args.targetLists.join(", ")}`,
    );

    const recipientsByPhoneHash = new Map<string, BlastRecipient>();
    let skippedNoConsent = 0;
    let skippedNoPhone = 0;
    let skippedInvalidPhone = 0;
    let skippedDuplicate = 0;
    let skippedByHistory = 0;

    // Import Clerk client for fallback phone lookup
    const { createClerkClient } = await import("@clerk/backend");
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    let clerkClient: ReturnType<typeof createClerkClient> | null = null;

    // Helper function to resolve phone number with fallbacks
    const resolvePhoneNumber = async (
      clerkUserId: string,
      userRecord: Doc<"users"> | null,
    ): Promise<string | null> => {
      if (userRecord?.phone) {
        return userRecord.phone;
      }

      if (!userRecord) {
        const fetchedUser = await ctx.runQuery(internal.textBlasts.getUserByClerkUserIdInternal, {
          clerkUserId,
        });
        if (fetchedUser?.phone) {
          return fetchedUser.phone;
        }
      }

      // Fallback: fetch from Clerk API if local user phone is missing.
      if (clerkSecretKey) {
        try {
          if (!clerkClient) {
            clerkClient = createClerkClient({ secretKey: clerkSecretKey });
          }
          const clerkUser = await clerkClient.users.getUser(clerkUserId);
          const preferredPhone =
            (clerkUser.primaryPhoneNumberId &&
              clerkUser.phoneNumbers.find((phone) => phone.id === clerkUser.primaryPhoneNumberId)
                ?.phoneNumber) ||
            clerkUser.phoneNumbers[0]?.phoneNumber;
          if (preferredPhone) {
            return preferredPhone;
          }
        } catch (error) {
          console.error(
            `[getRecipientsWithPhonesInternal] Failed to fetch phone from Clerk for user ${clerkUserId}:`,
            error,
          );
        }
      }

      console.warn(
        `[getRecipientsWithPhonesInternal] No phone number found for user ${clerkUserId} (checked: users=${!!userRecord?.phone}, clerk=${!!clerkSecretKey})`,
      );
      return null;
    };

    for (const rsvp of rsvps) {
      // Check SMS consent - only send to users who have consented
      // Note: This should already be filtered by getApprovedRsvpsForListsInternal, but double-check
      if (rsvp.smsConsent !== true) {
        skippedNoConsent++;
        console.warn(
          `[getRecipientsWithPhonesInternal] RSVP ${rsvp._id} does not have SMS consent`,
        );
        continue;
      }

      const userRecord = await ctx.runQuery(internal.textBlasts.getUserByClerkUserIdInternal, {
        clerkUserId: rsvp.clerkUserId,
      });

      // Try to resolve phone number with fallbacks
      const phoneNumber = await resolvePhoneNumber(rsvp.clerkUserId, userRecord);

      if (!phoneNumber) {
        skippedNoPhone++;
        console.warn(
          `[getRecipientsWithPhonesInternal] User ${rsvp.clerkUserId} does not have a phone number in profile, Clerk, or users table`,
        );
        continue;
      }

      // Validate phone number format before adding to recipients
      // This catches formatting issues early
      const phoneNumberTrimmed = phoneNumber.trim();
      if (!phoneNumberTrimmed || phoneNumberTrimmed.length === 0) {
        skippedNoPhone++;
        console.warn(
          `[getRecipientsWithPhonesInternal] User ${rsvp.clerkUserId} has empty phone number`,
        );
        continue;
      }

      let normalizedPhoneNumber: string;
      let phoneHash: string;
      try {
        const phoneResolution = await normalizeAndHashPhoneNumber(phoneNumberTrimmed);
        normalizedPhoneNumber = phoneResolution.normalizedPhoneNumber;
        phoneHash = phoneResolution.phoneHash;
      } catch (error) {
        skippedInvalidPhone++;
        console.warn(
          `[getRecipientsWithPhonesInternal] User ${rsvp.clerkUserId} has invalid phone number (${obfuscatePhoneNumber(phoneNumberTrimmed)}): ${getErrorMessage(error)}`,
        );
        continue;
      }

      const phoneIsEligible = (await ctx.runQuery(
        internal.textBlasts.isPhoneHashEligibleForBlastInternal,
        {
          phoneHash,
          recipientHistoryFilter: args.recipientHistoryFilter,
          textBlastId: args.textBlastId,
          skipAlreadySentForBlast: args.skipAlreadySentForBlast,
        },
      )) as boolean;

      if (!phoneIsEligible) {
        skippedByHistory++;
        continue;
      }

      const existingRecipient = recipientsByPhoneHash.get(phoneHash);
      if (existingRecipient) {
        skippedDuplicate++;
        existingRecipient.sourceEventIds = getUniqueIds([
          ...existingRecipient.sourceEventIds,
          rsvp.eventId,
        ]);
        existingRecipient.sourceRsvpIds = getUniqueIds([
          ...existingRecipient.sourceRsvpIds,
          rsvp._id,
        ]);
        existingRecipient.sourceListKeys = getUniqueIds([
          ...existingRecipient.sourceListKeys,
          rsvp.listKey,
        ]);
        existingRecipient.recipientClerkUserIds = getUniqueIds([
          ...existingRecipient.recipientClerkUserIds,
          rsvp.clerkUserId,
        ]);
        continue;
      }

      const firstNameFromUserRecord = userRecord?.firstName?.trim();
      const firstNameFromUserName = rsvp.userName?.trim().split(/\s+/)[0];

      // Get redemption code for this user/event if available
      // Uses the exact same query pattern as api.redemptions.forCurrentUserEvent
      // to ensure we get the same redemption code the user would see on their ticket page
      const redemption = await ctx.runQuery(internal.textBlasts.getRedemptionForUserEventInternal, {
        eventId: rsvp.eventId,
        clerkUserId: rsvp.clerkUserId,
      });

      recipientsByPhoneHash.set(phoneHash, {
        clerkUserId: rsvp.clerkUserId,
        phoneNumber: normalizedPhoneNumber,
        phoneHash,
        phoneObfuscated: obfuscatePhoneNumber(normalizedPhoneNumber),
        listKey: rsvp.listKey,
        sourceEventIds: [rsvp.eventId],
        sourceRsvpIds: [rsvp._id],
        sourceListKeys: [rsvp.listKey],
        recipientClerkUserIds: [rsvp.clerkUserId],
        firstName: firstNameFromUserRecord || firstNameFromUserName || undefined,
        userName: rsvp.userName ?? undefined,
        // Use the exact redemption code as stored in the database
        // This is identical to what users see on their ticket page
        redemptionCode: redemption?.code,
      });
    }

    const recipients = Array.from(recipientsByPhoneHash.values());
    console.log(
      `[getRecipientsWithPhonesInternal] Final count: ${recipients.length} recipients. Skipped: ${skippedNoConsent} no consent, ${skippedNoPhone} no phone, ${skippedInvalidPhone} invalid phone, ${skippedDuplicate} duplicates, ${skippedByHistory} history/retry`,
    );

    return recipients;
  },
});

/**
 * Internal query to get user by Clerk user ID
 */
export const getUserByClerkUserIdInternal = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});

/**
 * Internal query to get redemption code for a user/event
 * Uses the exact same query pattern as api.redemptions.forCurrentUserEvent
 * to ensure we retrieve the same redemption code the user would see on their ticket page
 * This guarantees 100% compatibility between text blast QR codes and user-facing QR codes
 */
export const getRedemptionForUserEventInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", args.eventId).eq("clerkUserId", args.clerkUserId),
      )
      .unique();
  },
});

/**
 * Internal query to get approved RSVPs for specific lists
 */
export const getApprovedRsvpsForListsInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    targetEventIds: v.optional(v.array(v.id("events"))),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()), // Serialized recipient filter config
    selectedRsvpIds: v.optional(v.array(v.id("rsvps"))), // Filter to specific RSVP IDs if provided
  },
  handler: async (ctx, args) => {
    const filterConfig = parseRecipientFilter(args.recipientFilter);
    const statusesToFetch = statusesForFilter(filterConfig);
    const targetEventIds = normalizeTargetEventIds(args);
    await ensureEventsInSiteScope(ctx, targetEventIds, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const filteredRsvps = await getFilteredRsvpsForTargeting(ctx, {
      ...args,
      targetEventIds,
    });

    console.log(
      `[getApprovedRsvpsForListsInternal] Considered statuses [${statusesToFetch.join(", ")}], ${filteredRsvps.length} match target lists + SMS consent${args.recipientFilter ? ` (filter: ${args.recipientFilter})` : ""}${args.selectedRsvpIds && args.selectedRsvpIds.length > 0 ? ` (${args.selectedRsvpIds.length} selected)` : ""}`,
    );

    return filteredRsvps;
  },
});
