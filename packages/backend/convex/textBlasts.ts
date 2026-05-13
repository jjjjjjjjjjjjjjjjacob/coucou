/**
 * Text blast management API
 * Handles bulk SMS campaigns for events
 */

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
import { resolvePublicBaseUrlForEvent } from "./lib/publicBaseUrl";
import { type ApprovalStatus, resolveApprovalStatus } from "./lib/rsvpStatus";
import {
  ensureEventInSiteScope,
  ensureTextBlastInSiteScope,
  eventMatchesSiteScope,
  getEventInSiteScope,
  getTextBlastInSiteScope,
} from "./lib/siteScope";
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

const MULTI_EVENT_RESTRICTED_VARIABLE_PATTERN =
  /\{\{\s*(eventName|eventDate|eventLocation|qrCodeUrl)\s*\}\}/;
const QR_CODE_URL_VARIABLE_PATTERN = /\{\{\s*qrCodeUrl\s*\}\}/;
const QR_CODE_URL_VARIABLE_REPLACEMENT_PATTERN = /\{\{\s*qrCodeUrl\s*\}\}/g;

const getUniqueIds = <T extends string>(ids: T[]): T[] => Array.from(new Set(ids));

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

const messageContainsMultiEventRestrictedVariables = (message: string): boolean =>
  MULTI_EVENT_RESTRICTED_VARIABLE_PATTERN.test(message);

const messageContainsQrCodeUrlVariable = (message: string): boolean =>
  QR_CODE_URL_VARIABLE_PATTERN.test(message);

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

function eventTitleMap(events: Doc<"events">[]): Map<Id<"events">, string> {
  return new Map(events.map((event) => [event._id, formatEventTitleInlineForSms(event)]));
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
    return await ctx.db.insert("textBlasts", {
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

const formatEventDateForSms = (timestamp: number, timezone?: string): string => {
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  return date
    .toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      timeZone: timezone ?? "UTC",
    })
    .replace(/\//g, ".");
};

const applyTemplateVariables = (template: string, variables: TemplateVariables): string => {
  return template
    .replace(/\{\{firstName\}\}/g, variables.firstName)
    .replace(/\{\{eventName\}\}/g, variables.eventName)
    .replace(/\{\{eventDate\}\}/g, variables.eventDate)
    .replace(/\{\{eventLocation\}\}/g, variables.eventLocation)
    .replace(QR_CODE_URL_VARIABLE_REPLACEMENT_PATTERN, variables.qrCodeUrl || "");
};

const resolveRecipientFirstName = (recipient: BlastRecipient): string => {
  const userFirstName = recipient.firstName?.trim();
  if (userFirstName) return userFirstName;

  const derivedFromUserName = recipient.userName?.trim().split(/\s+/)[0];
  if (derivedFromUserName) return derivedFromUserName;

  return FIRST_NAME_FALLBACK;
};

const formatEventTitleInlineForSms = (
  event: Pick<Doc<"events">, "name" | "secondaryTitle"> | null,
): string => {
  const name = event?.name?.trim();
  const secondaryTitle = event?.secondaryTitle?.trim();
  if (name && secondaryTitle) {
    return `${name}: ${secondaryTitle}`;
  }
  if (name) return name;
  if (secondaryTitle) return secondaryTitle;
  return "Event";
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
    eventName: formatEventTitleInlineForSms(args.primaryEvent),
    eventDate: formatEventDateForSms(args.primaryEvent.eventDate, args.primaryEvent.eventTimezone),
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

    const personalizedMessage = applyTemplateVariables(args.message, {
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
  handler: async (ctx, args): Promise<(Doc<"textBlasts"> & { sentByName: string })[]> => {
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

    return blasts.map((blast) => ({
      ...blast,
      sentByName: senderNameMap.get(blast.sentBy) || "Unknown",
    })) as (Doc<"textBlasts"> & { sentByName: string })[];
  },
});

export const getBlastsByWorkspaceWithSenderNames = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<(Doc<"textBlasts"> & { sentByName: string })[]> => {
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

    return blasts.map((blast) => ({
      ...blast,
      sentByName: senderNameMap.get(blast.sentBy) || "Unknown",
    })) as (Doc<"textBlasts"> & { sentByName: string })[];
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
  handler: async (ctx, args): Promise<Doc<"textBlasts"> | null> => {
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

    return blast;
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
    return await ctx.db.insert("textBlasts", {
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

    await ctx.db.delete(args.blastId);
    return { success: true };
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("textBlasts", {
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
