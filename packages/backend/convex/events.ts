import { sanitizeOptionalApprovalMessage } from "@coucou/sdk/shared/approval-messages";
import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAuditEntry } from "./audit";
import { internalMutation, mutation, query } from "./functions";
import { validateAutoApproveDelayMinutes, validateAutoApproveLimit } from "./lib/autoApproval";
import { generateEventShortId } from "./lib/codeGenerators";
import { applyEventUnsetFields } from "./lib/eventPatch";
import {
  assignListCode,
  codeAssignment,
  effectiveCodeList,
  listPassword,
  releaseRotatedPassword,
  resolveActionCodeList,
  resolveClaimCodeList,
} from "./lib/listIdentity";
import {
  primaryFieldConfigFromWorkspaceDefaults,
  primaryFieldConfigHasEffectiveContent,
  primaryFieldConfigValidator,
} from "./lib/primaryFields";
import { ensureEventInSiteScope, eventMatchesSiteScope } from "./lib/siteScope";
import {
  isReplyActionForListCredential,
  isSmsExecutableEvent,
  normalizeSmsCode,
} from "./lib/smsCodeRouting";
import { type EventPatch, NotFoundError, ValidationError } from "./lib/types";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

type EventCodeCredential = Pick<
  Doc<"listCredentials">,
  "_id" | "eventId" | "listKey" | "password" | "passwordNormalized" | "archivedAt"
>;

async function syncChangedListCredentialCodeClaims(
  ctx: MutationCtx,
  event: Doc<"events">,
  previous: Doc<"listCredentials"> | undefined,
  next: Doc<"listCredentials">,
): Promise<void> {
  if (previous && listPassword(previous) !== listPassword(next)) {
    await releaseRotatedPassword(ctx, previous, next);
    const claims = await ctx.db
      .query("smsCodeClaims")
      .withIndex("by_list_credential", (builder) => builder.eq("listCredentialId", next._id))
      .collect();
    for (const claim of claims) if (claim.kind === "event_list") await ctx.db.delete(claim._id);
  }
  if (next.archivedAt !== undefined) return;
  if (
    !previous ||
    listPassword(previous) !== listPassword(next) ||
    previous.archivedAt !== undefined
  ) {
    await assignListCode(ctx, event, next, listPassword(next));
    if (listPassword(next)) {
      const claims = await ctx.db
        .query("smsCodeClaims")
        .withIndex("by_list_credential", (builder) => builder.eq("listCredentialId", next._id))
        .collect();
      if (
        !claims.some(
          (claim) => claim.kind === "event_list" && claim.normalizedCode === listPassword(next),
        )
      )
        await ctx.db.insert("smsCodeClaims", {
          eventId: event._id,
          listCredentialId: next._id,
          normalizedCode: listPassword(next),
          kind: "event_list",
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
    }
  }
}

function throwEventSmsCodeConflict(): never {
  throw new ConvexError({
    message:
      "A list password is unavailable as an SMS code. Choose another password and try again.",
    code: "SMS_CODE_CONFLICT",
  });
}

async function syncExecutableEventCodeClaims(
  ctx: MutationCtx,
  event: Doc<"events">,
  credentials: readonly EventCodeCredential[],
  now: number,
): Promise<void> {
  const existingEventClaims = await ctx.db
    .query("smsCodeClaims")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", event._id))
    .collect();
  const targetedReplyActions = await ctx.db
    .query("textBlastReplyActions")
    .withIndex("by_target_event", (queryBuilder) => queryBuilder.eq("targetEventId", event._id))
    .collect();
  if (!isSmsExecutableEvent(event, now)) {
    for (const claim of existingEventClaims) {
      if (claim.kind === "event_list") await ctx.db.delete(claim._id);
    }
    for (const replyAction of targetedReplyActions) {
      const claims = await ctx.db
        .query("smsCodeClaims")
        .withIndex("by_reply_action", (queryBuilder) =>
          queryBuilder.eq("replyActionId", replyAction._id),
        )
        .collect();
      for (const claim of claims) {
        await ctx.db.delete(claim._id);
      }
    }
    return;
  }

  const executableCredentialIds = await syncListCredentialCodeClaims(ctx, event, credentials, now);
  for (const claim of existingEventClaims) {
    if (
      claim.kind === "event_list" &&
      (!claim.listCredentialId || !executableCredentialIds.has(claim.listCredentialId))
    ) {
      await ctx.db.delete(claim._id);
    }
  }

  await syncReplyActionCodeClaims(ctx, event, credentials, targetedReplyActions, now);
}

async function syncListCredentialCodeClaims(
  ctx: MutationCtx,
  event: Doc<"events">,
  credentials: readonly EventCodeCredential[],
  now: number,
): Promise<Set<Id<"listCredentials">>> {
  const executableCredentials = credentials
    .filter((credential) => credential.archivedAt === undefined)
    .map((credential) => ({
      credential,
      normalizedCode: normalizeSmsCode(credential.passwordNormalized ?? credential.password ?? ""),
    }))
    .filter(({ normalizedCode }) => normalizedCode.length > 0);
  const localCodes = new Set<string>();
  for (const { normalizedCode } of executableCredentials) {
    if (localCodes.has(normalizedCode)) throwEventSmsCodeConflict();
    localCodes.add(normalizedCode);
  }

  for (const { credential, normalizedCode } of executableCredentials) {
    if (credential.passwordNormalized !== normalizedCode) {
      await ctx.db.patch(credential._id, { passwordNormalized: normalizedCode });
    }
    const matchingCredentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_passwordNormalized", (queryBuilder) =>
        queryBuilder.eq("passwordNormalized", normalizedCode),
      )
      .collect();
    for (const matchingCredential of matchingCredentials) {
      if (matchingCredential._id === credential._id || matchingCredential.archivedAt !== undefined)
        continue;
      const effectiveOwner = await effectiveCodeList(ctx, matchingCredential, normalizedCode);
      if (
        !effectiveOwner ||
        effectiveOwner._id === credential._id ||
        effectiveOwner.archivedAt !== undefined
      )
        continue;
      const matchingEvent = await ctx.db.get(matchingCredential.eventId);
      if (matchingEvent && isSmsExecutableEvent(matchingEvent, now)) {
        throwEventSmsCodeConflict();
      }
    }

    const replyActions = await ctx.db
      .query("textBlastReplyActions")
      .withIndex("by_code", (queryBuilder) =>
        queryBuilder.eq("replyCodeNormalized", normalizedCode),
      )
      .collect();
    for (const replyAction of replyActions) {
      if (!replyAction.isEnabled || isReplyActionForListCredential(replyAction, credential))
        continue;
      const targetEvent = await ctx.db.get(replyAction.targetEventId);
      if (!targetEvent || !isSmsExecutableEvent(targetEvent, now)) continue;
      const owner = await resolveActionCodeList(ctx, replyAction);
      if (!owner || owner._id === credential._id || owner.archivedAt !== undefined) continue;
      const successfulDelivery = await ctx.db
        .query("textBlastRecipients")
        .withIndex("by_text_blast_status", (queryBuilder) =>
          queryBuilder.eq("textBlastId", replyAction.textBlastId).eq("status", "sent"),
        )
        .first();
      if (successfulDelivery) throwEventSmsCodeConflict();
    }

    const matchingClaims = await ctx.db
      .query("smsCodeClaims")
      .withIndex("by_code", (queryBuilder) => queryBuilder.eq("normalizedCode", normalizedCode))
      .collect();
    let hasOwnClaim = false;
    for (const claim of matchingClaims) {
      if (claim.kind === "event_list" && claim.listCredentialId === credential._id) {
        hasOwnClaim = true;
        await ctx.db.patch(claim._id, {
          status: "active",
          reservationExpiresAt: undefined,
          updatedAt: now,
        });
        continue;
      }
      if (claim.status === "reserved" && (claim.reservationExpiresAt ?? 0) <= now) {
        await ctx.db.delete(claim._id);
        continue;
      }
      const owner = await resolveClaimCodeList(ctx, claim);
      const claimedEvent = owner ? await ctx.db.get(owner.eventId) : null;
      if (
        !owner ||
        owner.archivedAt !== undefined ||
        owner._id === credential._id ||
        !claimedEvent ||
        !isSmsExecutableEvent(claimedEvent, now)
      )
        continue;
      throwEventSmsCodeConflict();
    }
    if (!hasOwnClaim) {
      await ctx.db.insert("smsCodeClaims", {
        normalizedCode,
        kind: "event_list",
        eventId: event._id,
        listCredentialId: credential._id,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return new Set(executableCredentials.map(({ credential }) => credential._id));
}

async function syncReplyActionCodeClaims(
  ctx: MutationCtx,
  event: Doc<"events">,
  credentials: readonly EventCodeCredential[],
  targetedReplyActions: readonly Doc<"textBlastReplyActions">[],
  now: number,
): Promise<void> {
  for (const replyAction of targetedReplyActions) {
    const targetListExists = credentials.some(
      (credential) => credential.listKey === replyAction.targetListKey,
    );
    if (!targetListExists) {
      const claims = await ctx.db
        .query("smsCodeClaims")
        .withIndex("by_reply_action", (queryBuilder) =>
          queryBuilder.eq("replyActionId", replyAction._id),
        )
        .collect();
      for (const claim of claims) {
        await ctx.db.delete(claim._id);
      }
      continue;
    }
    if (!replyAction.isEnabled) continue;
    const owner = await resolveActionCodeList(ctx, replyAction);
    if (!owner || owner.archivedAt !== undefined) continue;
    const successfulDeliveries = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_text_blast_status", (queryBuilder) =>
        queryBuilder.eq("textBlastId", replyAction.textBlastId).eq("status", "sent"),
      )
      .collect();
    if (successfulDeliveries.length === 0) continue;

    const matchingCredentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_passwordNormalized", (queryBuilder) =>
        queryBuilder.eq("passwordNormalized", replyAction.replyCodeNormalized),
      )
      .collect();
    for (const matchingCredential of matchingCredentials) {
      const matchingOwner = await effectiveCodeList(
        ctx,
        matchingCredential,
        replyAction.replyCodeNormalized,
      );
      if (
        matchingCredential.archivedAt !== undefined ||
        !matchingOwner ||
        matchingOwner.archivedAt !== undefined ||
        matchingOwner._id === owner._id
      )
        continue;
      const matchingEvent = await ctx.db.get(matchingCredential.eventId);
      if (matchingEvent && isSmsExecutableEvent(matchingEvent, now)) {
        throwEventSmsCodeConflict();
      }
    }

    const sameCodeActions = await ctx.db
      .query("textBlastReplyActions")
      .withIndex("by_code", (queryBuilder) =>
        queryBuilder.eq("replyCodeNormalized", replyAction.replyCodeNormalized),
      )
      .collect();
    const conflictingPhoneHashes = new Set<string>();
    for (const otherAction of sameCodeActions) {
      if (!otherAction.isEnabled || otherAction._id === replyAction._id) {
        continue;
      }
      const otherOwner = await resolveActionCodeList(ctx, otherAction);
      if (!otherOwner || otherOwner.archivedAt !== undefined || otherOwner._id === owner._id)
        continue;
      const otherTargetEvent = await ctx.db.get(otherAction.targetEventId);
      if (!otherTargetEvent || !isSmsExecutableEvent(otherTargetEvent, now)) {
        continue;
      }
      const otherSuccessfulDeliveries = await ctx.db
        .query("textBlastRecipients")
        .withIndex("by_text_blast_status", (queryBuilder) =>
          queryBuilder.eq("textBlastId", otherAction.textBlastId).eq("status", "sent"),
        )
        .collect();
      for (const otherDelivery of otherSuccessfulDeliveries) {
        conflictingPhoneHashes.add(otherDelivery.phoneHash);
      }
    }
    for (const delivery of successfulDeliveries) {
      if (conflictingPhoneHashes.has(delivery.phoneHash)) {
        throwEventSmsCodeConflict();
      }

      const matchingClaims = await ctx.db
        .query("smsCodeClaims")
        .withIndex("by_code_phone", (queryBuilder) =>
          queryBuilder
            .eq("normalizedCode", replyAction.replyCodeNormalized)
            .eq("phoneHash", delivery.phoneHash),
        )
        .collect();
      const ownClaim = matchingClaims.find((claim) => claim.replyActionId === replyAction._id);
      for (const claim of matchingClaims) {
        if (claim._id === ownClaim?._id) continue;
        if (claim.status === "reserved" && (claim.reservationExpiresAt ?? 0) <= now) {
          await ctx.db.delete(claim._id);
          continue;
        }
        const claimOwner = await resolveClaimCodeList(ctx, claim);
        const claimedEvent = claimOwner ? await ctx.db.get(claimOwner.eventId) : null;
        if (
          !claimOwner ||
          claimOwner.archivedAt !== undefined ||
          claimOwner._id === owner._id ||
          !claimedEvent ||
          !isSmsExecutableEvent(claimedEvent, now)
        )
          continue;
        throwEventSmsCodeConflict();
      }
      if (ownClaim) {
        await ctx.db.patch(ownClaim._id, {
          status: "active",
          reservationExpiresAt: undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("smsCodeClaims", {
          normalizedCode: replyAction.replyCodeNormalized,
          kind: "blast_action",
          eventId: event._id,
          replyActionId: replyAction._id,
          textBlastId: replyAction.textBlastId,
          phoneHash: delivery.phoneHash,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
}

async function applyWorkspaceEventDefaults<TEvent extends Doc<"events"> | null>(
  ctx: QueryCtx,
  event: TEvent,
): Promise<TEvent> {
  if (!event) return event;
  const hasEventPrimaryFieldConfig = primaryFieldConfigHasEffectiveContent(
    event.primaryFieldConfig,
  );
  const hasEventReferralSharingSetting = typeof event.referralSharingEnabled === "boolean";
  if (hasEventPrimaryFieldConfig && hasEventReferralSharingSetting) {
    return event;
  }
  if (!event.workspaceSlug) {
    if (hasEventReferralSharingSetting) return event;
    return { ...event, referralSharingEnabled: false } as TEvent;
  }
  // Defensive lookup — `unique()` throws on >1 match, and a transient
  // schema oddity here would otherwise propagate as a Server Error to
  // the satellite (where it surfaces as a busted error screen on the
  // post-sign-in redirect). Returning the event as-is is safe: the
  // caller just doesn't get the workspace fallback.
  let workspace: Doc<"workspaces"> | null = null;
  try {
    workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", event.workspaceSlug!))
      .unique();
  } catch (error) {
    console.error("applyWorkspaceEventDefaults: workspace lookup failed", {
      workspaceSlug: event.workspaceSlug,
      error,
    });
    if (hasEventReferralSharingSetting) return event;
    return { ...event, referralSharingEnabled: false } as TEvent;
  }
  const fallbackPrimaryFieldConfig = hasEventPrimaryFieldConfig
    ? event.primaryFieldConfig
    : primaryFieldConfigFromWorkspaceDefaults(workspace?.eventDefaults);
  const referralSharingEnabled = event.referralSharingEnabled ?? false;

  if (
    fallbackPrimaryFieldConfig === event.primaryFieldConfig &&
    referralSharingEnabled === event.referralSharingEnabled
  ) {
    return event;
  }

  const eventWithDefaults = {
    ...event,
    referralSharingEnabled,
  };
  if (fallbackPrimaryFieldConfig) {
    return {
      ...eventWithDefaults,
      primaryFieldConfig: fallbackPrimaryFieldConfig,
    } as TEvent;
  }
  return eventWithDefaults as TEvent;
}

import {
  eventActValidator,
  eventLifecycleValidator,
  eventStatusValidator,
  openGraphImageSourceValidator,
} from "./lib/eventMetadata";
import { eventPartnerValidator } from "./lib/eventPartners";

// Node crypto-based creation is handled in eventsNode.ts (action).
// This module contains only queries/mutations compatible with the standard runtime.

const EVENT_SHORT_ID_MAX_ATTEMPTS = 20;

const eventUnsetFieldValidator = v.union(
  v.literal("secondaryTitle"),
  v.literal("productionCompany"),
  v.literal("eventEndDate"),
  v.literal("flyerStorageId"),
  v.literal("guestPortalImageStorageId"),
  v.literal("guestPortalLinkLabel"),
  v.literal("guestPortalLinkUrl"),
  v.literal("primaryFieldConfig"),
  v.literal("rsvpConfirmationMessage"),
  v.literal("smsOptInConfirmationMessage"),
  v.literal("smsOptOutConfirmationMessage"),
  v.literal("qrDeliveryMessage"),
);

const publicInstagramDevSeedSocialPlatform = {
  platformKey: "instagram",
  label: "Instagram",
  placeholder: "@handle",
  profileUrlPrefix: "https://instagram.com/",
  required: true,
};

const publicInstagramDevSeedCustomFields = [
  {
    key: "profile_category",
    label: "Profile category",
    placeholder: "Music, fashion, sports, creator...",
    copyEnabled: false,
  },
  {
    key: "public_profile_url",
    label: "Public profile URL",
    placeholder: "https://instagram.com/handle",
    copyEnabled: true,
    trimWhitespace: true,
  },
];

const publicInstagramDevSeedListCredentials = [
  { listKey: "creator", password: "creator", generateQR: true },
  { listKey: "vip", password: "vip", generateQR: true },
  { listKey: "press", password: "press", generateQR: true },
  { listKey: "friends", password: "friends", generateQR: false },
];

function mergePublicInstagramDevSeedCustomFields(
  customFields: Doc<"events">["customFields"],
): NonNullable<Doc<"events">["customFields"]> {
  const mergedCustomFields = [...(customFields ?? [])];
  const existingCustomFieldKeys = new Set(mergedCustomFields.map((field) => field.key));

  for (const seedCustomField of publicInstagramDevSeedCustomFields) {
    if (!existingCustomFieldKeys.has(seedCustomField.key)) {
      mergedCustomFields.push(seedCustomField);
    }
  }

  return mergedCustomFields;
}

function mergePublicInstagramDevSeedPrimaryFieldConfig(
  primaryFieldConfig: Doc<"events">["primaryFieldConfig"],
): NonNullable<Doc<"events">["primaryFieldConfig"]> {
  const existingSocialPlatforms = primaryFieldConfig?.socialPlatforms ?? [];
  const hasInstagramPlatform = existingSocialPlatforms.some(
    (platform) => platform.platformKey === "instagram",
  );

  return {
    socialPlatforms: hasInstagramPlatform
      ? existingSocialPlatforms
      : [...existingSocialPlatforms, publicInstagramDevSeedSocialPlatform],
    invitedBy:
      primaryFieldConfig?.invitedBy?.enabled === true
        ? primaryFieldConfig.invitedBy
        : {
            enabled: true,
            label: "Invited by",
            placeholder: "Who invited you?",
          },
  };
}

function normalizeEventShortId(value: string): string {
  return value.trim().toLowerCase();
}

async function generateUniqueEventShortId(ctx: MutationCtx): Promise<string> {
  for (let attemptNumber = 0; attemptNumber < EVENT_SHORT_ID_MAX_ATTEMPTS; attemptNumber++) {
    const shortId = generateEventShortId();
    const existingEvent = await ctx.db
      .query("events")
      .withIndex("by_shortId", (queryBuilder) => queryBuilder.eq("shortId", shortId))
      .first();
    if (!existingEvent) {
      return shortId;
    }
  }

  throw new Error("Unable to generate a unique event short link");
}

async function getEventByRouteId(
  ctx: QueryCtx,
  eventRouteId: string,
  scope: { siteKey?: string; workspaceSlug?: string },
): Promise<Doc<"events"> | null> {
  const normalizedShortId = normalizeEventShortId(eventRouteId);
  if (normalizedShortId) {
    const eventByShortId = await ctx.db
      .query("events")
      .withIndex("by_shortId", (queryBuilder) => queryBuilder.eq("shortId", normalizedShortId))
      .first();
    if (eventMatchesSiteScope(eventByShortId, scope)) {
      return eventByShortId;
    }
  }

  try {
    const eventByDocumentId = await ctx.db.get(eventRouteId as Id<"events">);
    if (eventMatchesSiteScope(eventByDocumentId, scope)) {
      return eventByDocumentId;
    }
  } catch {
    return null;
  }

  return null;
}

const insertEventWithCredentialsArgs = {
  workspaceSlug: v.optional(v.string()),
  siteKey: v.optional(v.string()),
  name: v.string(),
  secondaryTitle: v.optional(v.string()),
  description: v.optional(v.string()),
  acts: v.optional(v.array(eventActValidator)),
  eventPartners: v.optional(v.array(eventPartnerValidator)),
  sponsors: v.optional(v.array(eventPartnerValidator)),
  hosts: v.optional(v.array(v.string())),
  productionCompany: v.optional(v.string()),
  location: v.string(),
  flyerUrl: v.optional(v.string()),
  flyerStorageId: v.optional(v.id("_storage")),
  openGraphImageSource: v.optional(openGraphImageSourceValidator),
  customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  guestPortalImageStorageId: v.optional(v.id("_storage")),
  guestPortalLinkLabel: v.optional(v.string()),
  guestPortalLinkUrl: v.optional(v.string()),
  eventDate: v.number(),
  eventEndDate: v.optional(v.number()),
  eventTimezone: v.optional(v.string()),
  status: v.optional(eventStatusValidator),
  maxAttendees: v.optional(v.number()),
  customFields: v.optional(
    v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        placeholder: v.optional(v.string()),
        required: v.optional(v.boolean()),
        copyEnabled: v.optional(v.boolean()),
        prependUrl: v.optional(v.string()),
        trimWhitespace: v.optional(v.boolean()),
      }),
    ),
  ),
  primaryFieldConfig: v.optional(primaryFieldConfigValidator),
  themeBackgroundColor: v.optional(v.string()),
  themeTextColor: v.optional(v.string()),
  themeAccentColor: v.optional(v.string()),
  approvalMessage: v.optional(v.string()),
  rsvpConfirmationMessageEnabled: v.optional(v.boolean()),
  rsvpConfirmationMessage: v.optional(v.string()),
  smsOptInConfirmationMessage: v.optional(v.string()),
  smsOptOutConfirmationMessage: v.optional(v.string()),
  qrDeliveryMessage: v.optional(v.string()),
  qrCodeColor: v.optional(v.string()),
  defersQrDelivery: v.optional(v.boolean()),
  sendQrOnApproval: v.optional(v.boolean()),
  attendanceQuestionEnabled: v.optional(v.boolean()),
  referralSharingEnabled: v.optional(v.boolean()),
  creds: v.array(
    v.object({
      listKey: v.string(),
      displayName: v.optional(v.string()),
      password: v.optional(v.string()),
      passwordNormalized: v.optional(v.string()),
      generateQR: v.optional(v.boolean()),
      defersQrDelivery: v.optional(v.boolean()),
      sendQrOnApproval: v.optional(v.boolean()),
      includeTicketLinkOnApproval: v.optional(v.boolean()),
      approvalMessage: v.optional(v.string()),
      autoApproveLimit: v.optional(v.number()),
      autoApproveDelayMinutes: v.optional(v.number()),
    }),
  ),
};
const insertEventWithCredentialsArgsValidator = v.object(insertEventWithCredentialsArgs);
export async function insertEventWithCredentials(
  ctx: MutationCtx,
  args: Infer<typeof insertEventWithCredentialsArgsValidator>,
) {
  await requireWorkspaceHost(ctx, {
    siteKey: args.siteKey,
    workspaceSlug: args.workspaceSlug,
  });
  for (const credential of args.creds) {
    validateAutoApproveLimit(credential.autoApproveLimit);
    validateAutoApproveDelayMinutes(credential.autoApproveDelayMinutes);
  }

  const now = Date.now();
  const shortId = await generateUniqueEventShortId(ctx);
  if (args.eventDate < now) throw new Error("Event date must be in the future");
  const eventId = await ctx.db.insert("events", {
    workspaceSlug: args.workspaceSlug,
    siteKey: args.siteKey,
    shortId,
    name: args.name,
    secondaryTitle: args.secondaryTitle,
    description: args.description,
    acts: args.acts,
    eventPartners: args.eventPartners,
    sponsors: args.sponsors,
    hosts: args.hosts,
    productionCompany: args.productionCompany,
    location: args.location,
    flyerUrl: args.flyerUrl,
    flyerStorageId: args.flyerStorageId,
    openGraphImageSource: args.openGraphImageSource,
    customIconStorageId: args.customIconStorageId ?? null,
    guestPortalImageStorageId: args.guestPortalImageStorageId,
    guestPortalLinkLabel: args.guestPortalLinkLabel,
    guestPortalLinkUrl: args.guestPortalLinkUrl,
    eventDate: args.eventDate,
    eventEndDate: args.eventEndDate,
    eventTimezone: args.eventTimezone,
    status: args.status ?? "active",
    lifecycle: "published",
    publishedAt: now,
    defersQrDelivery: args.defersQrDelivery,
    sendQrOnApproval: args.sendQrOnApproval,
    attendanceQuestionEnabled: args.attendanceQuestionEnabled,
    referralSharingEnabled: args.referralSharingEnabled ?? false,
    maxAttendees: args.maxAttendees,
    customFields: args.customFields,
    primaryFieldConfig: args.primaryFieldConfig,
    themeBackgroundColor: args.themeBackgroundColor,
    themeTextColor: args.themeTextColor,
    themeAccentColor: args.themeAccentColor,
    approvalMessage: args.approvalMessage,
    rsvpConfirmationMessageEnabled: args.rsvpConfirmationMessageEnabled,
    rsvpConfirmationMessage: args.rsvpConfirmationMessage,
    smsOptInConfirmationMessage: args.smsOptInConfirmationMessage,
    smsOptOutConfirmationMessage: args.smsOptOutConfirmationMessage,
    qrDeliveryMessage: args.qrDeliveryMessage,
    qrCodeColor: args.qrCodeColor,
    createdAt: now,
    updatedAt: now,
  });
  const occupiedListKeys = new Set<string>();
  for (const credential of args.creds) {
    const displayName = (credential.displayName ?? credential.listKey).trim();
    if (!displayName) throw new ConvexError("List name is required.");
    const baseKey = credential.listKey.trim() || displayName;
    let listKey = baseKey;
    for (let suffix = 2; occupiedListKeys.has(listKey); suffix++) listKey = `${baseKey}-${suffix}`;
    occupiedListKeys.add(listKey);
    await ctx.db.insert("listCredentials", {
      eventId,
      ...credential,
      listKey,
      displayName,
      passwordNormalized:
        normalizeSmsCode(credential.passwordNormalized ?? credential.password ?? "") || undefined,
      createdAt: now,
    });
  }
  const insertedEvent = await ctx.db.get(eventId);
  const insertedCredentials = await ctx.db
    .query("listCredentials")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
    .collect();
  if (insertedEvent) {
    for (const credential of insertedCredentials)
      await assignListCode(ctx, insertedEvent, credential, listPassword(credential));
    await syncExecutableEventCodeClaims(ctx, insertedEvent, insertedCredentials, now);
  }
  return { eventId };
}
export const insertWithCreds = mutation({
  args: insertEventWithCredentialsArgs,
  handler: insertEventWithCredentials,
});

export const insertPublicInstagramDevSeedEvent = internalMutation({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const shortId = await generateUniqueEventShortId(ctx);
    const eventId = await ctx.db.insert("events", {
      workspaceSlug: args.workspaceSlug,
      siteKey: args.siteKey,
      shortId,
      name: args.name?.trim() || "Public Instagram Dev Seed",
      secondaryTitle: "100 public-profile seed guests",
      description:
        "Development-only event seeded with synthetic users and public Instagram handles.",
      hosts: ["Coucou Dev"],
      location: "Local Dev Room",
      eventDate: now + 14 * 24 * 60 * 60 * 1000,
      eventTimezone: "America/Los_Angeles",
      status: "active",
      lifecycle: "published",
      publishedAt: now,
      sendQrOnApproval: false,
      attendanceQuestionEnabled: true,
      maxAttendees: 2,
      customFields: mergePublicInstagramDevSeedCustomFields(undefined),
      primaryFieldConfig: mergePublicInstagramDevSeedPrimaryFieldConfig(undefined),
      themeBackgroundColor: "#111827",
      themeTextColor: "#F9FAFB",
      createdAt: now,
      updatedAt: now,
    });

    for (const credential of publicInstagramDevSeedListCredentials) {
      await ctx.db.insert("listCredentials", {
        eventId,
        ...credential,
        passwordNormalized: normalizeSmsCode(credential.password ?? "") || undefined,
        createdAt: now,
      });
    }
    const insertedEvent = await ctx.db.get(eventId);
    const insertedCredentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
      .collect();
    if (insertedEvent) {
      await syncExecutableEventCodeClaims(ctx, insertedEvent, insertedCredentials, now);
    }

    return { eventId };
  },
});

export const ensurePublicInstagramDevSeedFields = internalMutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    const customFields = mergePublicInstagramDevSeedCustomFields(event.customFields);
    const primaryFieldConfig = mergePublicInstagramDevSeedPrimaryFieldConfig(
      event.primaryFieldConfig,
    );
    const shouldPatchCustomFields =
      JSON.stringify(customFields) !== JSON.stringify(event.customFields ?? []);
    const shouldPatchPrimaryFieldConfig =
      JSON.stringify(primaryFieldConfig) !== JSON.stringify(event.primaryFieldConfig ?? {});

    if (!shouldPatchCustomFields && !shouldPatchPrimaryFieldConfig) {
      return { updated: false as const };
    }

    await ctx.db.patch(eventId, {
      customFields: shouldPatchCustomFields ? customFields : event.customFields,
      primaryFieldConfig: shouldPatchPrimaryFieldConfig
        ? primaryFieldConfig
        : event.primaryFieldConfig,
      updatedAt: Date.now(),
    });

    return { updated: true as const };
  },
});

export const createDraft = mutation({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const now = Date.now();
    const shortId = await generateUniqueEventShortId(ctx);
    const eventId = await ctx.db.insert("events", {
      workspaceSlug: args.workspaceSlug,
      siteKey: args.siteKey,
      shortId,
      name: args.name?.trim() || "Untitled event",
      location: "",
      eventDate: 0,
      lifecycle: "draft",
      referralSharingEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditEntry(ctx, {
      action: "event.draft.create",
      targetKind: "event",
      targetId: eventId,
      summary: args.name?.trim() || "Untitled event",
    });

    return { eventId };
  },
});

export const duplicateToDraft = mutation({
  args: {
    eventId: v.id("events"),
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolvedWorkspaceScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const sourceEvent = await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const sourceCredentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", sourceEvent._id))
      .collect();

    const now = Date.now();
    const duplicateEventName = `${sourceEvent.name} (Copy)`;
    const duplicateEventId = await ctx.db.insert("events", {
      workspaceSlug: sourceEvent.workspaceSlug ?? resolvedWorkspaceScope.workspaceSlug,
      siteKey: sourceEvent.siteKey ?? resolvedWorkspaceScope.siteKey ?? undefined,
      shortId: await generateUniqueEventShortId(ctx),
      name: duplicateEventName,
      secondaryTitle: sourceEvent.secondaryTitle,
      description: sourceEvent.description,
      acts: sourceEvent.acts,
      eventPartners: sourceEvent.eventPartners,
      sponsors: sourceEvent.sponsors,
      hosts: sourceEvent.hosts,
      productionCompany: sourceEvent.productionCompany,
      location: sourceEvent.location,
      flyerUrl: sourceEvent.flyerUrl,
      flyerStorageId: sourceEvent.flyerStorageId,
      openGraphImageSource: sourceEvent.openGraphImageSource,
      customIconStorageId: sourceEvent.customIconStorageId,
      guestPortalImageStorageId: sourceEvent.guestPortalImageStorageId,
      guestPortalLinkLabel: sourceEvent.guestPortalLinkLabel,
      guestPortalLinkUrl: sourceEvent.guestPortalLinkUrl,
      eventDate: sourceEvent.eventDate,
      eventEndDate: sourceEvent.eventEndDate,
      eventTimezone: sourceEvent.eventTimezone,
      // Copied passwords may still belong to an active source event.
      // The host can reactivate the copy after reviewing its lists.
      status: "inactive",
      lifecycle: "draft",
      defersQrDelivery: sourceEvent.defersQrDelivery,
      sendQrOnApproval: sourceEvent.sendQrOnApproval,
      attendanceQuestionEnabled: sourceEvent.attendanceQuestionEnabled,
      referralSharingEnabled: sourceEvent.referralSharingEnabled,
      maxAttendees: sourceEvent.maxAttendees,
      customFields: sourceEvent.customFields,
      primaryFieldConfig: sourceEvent.primaryFieldConfig,
      themeBackgroundColor: sourceEvent.themeBackgroundColor,
      themeTextColor: sourceEvent.themeTextColor,
      themeAccentColor: sourceEvent.themeAccentColor,
      approvalMessage: sourceEvent.approvalMessage,
      rsvpConfirmationMessageEnabled: sourceEvent.rsvpConfirmationMessageEnabled,
      rsvpConfirmationMessage: sourceEvent.rsvpConfirmationMessage,
      smsOptInConfirmationMessage: sourceEvent.smsOptInConfirmationMessage,
      smsOptOutConfirmationMessage: sourceEvent.smsOptOutConfirmationMessage,
      qrDeliveryMessage: sourceEvent.qrDeliveryMessage,
      qrCodeColor: sourceEvent.qrCodeColor,
      createdAt: now,
      updatedAt: now,
    });

    for (const sourceCredential of sourceCredentials.filter(
      (credential) => credential.archivedAt === undefined,
    )) {
      await ctx.db.insert("listCredentials", {
        eventId: duplicateEventId,
        listKey: sourceCredential.listKey,
        displayName: sourceCredential.displayName,
        password: sourceCredential.password,
        passwordNormalized: sourceCredential.passwordNormalized,
        passwordHash: sourceCredential.passwordHash,
        passwordSalt: sourceCredential.passwordSalt,
        passwordIterations: sourceCredential.passwordIterations,
        passwordFingerprint: sourceCredential.passwordFingerprint,
        encryptedPassword: sourceCredential.encryptedPassword,
        generateQR: sourceCredential.generateQR,
        defersQrDelivery: sourceCredential.defersQrDelivery,
        sendQrOnApproval: sourceCredential.sendQrOnApproval,
        includeTicketLinkOnApproval: sourceCredential.includeTicketLinkOnApproval,
        approvalMessage: sourceCredential.approvalMessage,
        autoApproveLimit: sourceCredential.autoApproveLimit,
        autoApproveDelayMinutes: sourceCredential.autoApproveDelayMinutes,
        createdAt: now,
      });
    }

    await writeAuditEntry(ctx, {
      action: "event.duplicate",
      targetKind: "event",
      targetId: duplicateEventId,
      summary: duplicateEventName,
      metadata: { sourceEventId: sourceEvent._id },
    });

    return { eventId: duplicateEventId };
  },
});

const PUBLISH_REQUIRED_FIELDS = [
  "name",
  "location",
  "eventDate",
  "themeBackgroundColor",
  "themeTextColor",
] as const;

const publishEventChangesArgs = {
  eventId: v.id("events"),
  siteKey: v.optional(v.string()),
  workspaceSlug: v.optional(v.string()),
};
const publishEventChangesArgsValidator = v.object(publishEventChangesArgs);
export async function publishEventChanges(
  ctx: MutationCtx,
  args: Infer<typeof publishEventChangesArgsValidator>,
) {
  await requireWorkspaceHost(ctx, {
    siteKey: args.siteKey,
    workspaceSlug: args.workspaceSlug,
  });

  const event = await ensureEventInSiteScope(ctx, args.eventId, {
    siteKey: args.siteKey,
    workspaceSlug: args.workspaceSlug,
  });
  if (!event) throw new NotFoundError("Event");

  const missingFields: string[] = [];
  for (const field of PUBLISH_REQUIRED_FIELDS) {
    const value = (event as Record<string, unknown>)[field];
    if (value === undefined || value === null || value === "" || value === 0) {
      missingFields.push(field);
    }
  }

  const credentials = await ctx.db
    .query("listCredentials")
    .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
    .collect();
  if (!credentials.some((credential) => credential.archivedAt === undefined)) {
    missingFields.push("lists");
  }

  if (missingFields.length > 0) {
    throw new ValidationError(
      `Cannot publish: missing required fields — ${missingFields.join(", ")}`,
    );
  }

  const now = Date.now();
  if (!isSmsExecutableEvent(event, now)) {
    await syncExecutableEventCodeClaims(
      ctx,
      { ...event, status: "active", lifecycle: "published" },
      credentials.filter((credential) => credential.archivedAt === undefined),
      now,
    );
  }
  await ctx.db.patch(args.eventId, {
    status: "active",
    lifecycle: "published",
    publishedAt: event.publishedAt ?? now,
    updatedAt: now,
  });

  await writeAuditEntry(ctx, {
    action: "event.publish",
    targetKind: "event",
    targetId: args.eventId,
    summary: event.name,
  });

  return { ok: true as const };
}
export const publishEvent = mutation({
  args: publishEventChangesArgs,
  handler: publishEventChanges,
});

export const unpublishEvent = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const event = await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    if (!event) throw new NotFoundError("Event");

    const now = Date.now();
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", args.eventId))
      .collect();
    await syncExecutableEventCodeClaims(ctx, { ...event, lifecycle: "draft" }, credentials, now);
    await ctx.db.patch(args.eventId, {
      status: "inactive",
      lifecycle: "draft",
      updatedAt: now,
    });

    await writeAuditEntry(ctx, {
      action: "event.unpublish",
      targetKind: "event",
      targetId: args.eventId,
      summary: event.name,
    });

    return { ok: true as const };
  },
});

const applyEventChangesArgs = {
  eventId: v.id("events"),
  siteKey: v.optional(v.string()),
  workspaceSlug: v.optional(v.string()),
  name: v.optional(v.string()),
  secondaryTitle: v.optional(v.string()),
  description: v.optional(v.string()),
  acts: v.optional(v.array(eventActValidator)),
  eventPartners: v.optional(v.array(eventPartnerValidator)),
  sponsors: v.optional(v.array(eventPartnerValidator)),
  hosts: v.optional(v.array(v.string())),
  productionCompany: v.optional(v.string()),
  location: v.optional(v.string()),
  flyerUrl: v.optional(v.string()),
  flyerStorageId: v.optional(v.id("_storage")),
  openGraphImageSource: v.optional(openGraphImageSourceValidator),
  eventDate: v.optional(v.number()),
  eventEndDate: v.optional(v.number()),
  eventTimezone: v.optional(v.string()),
  guestPortalImageStorageId: v.optional(v.id("_storage")),
  guestPortalLinkLabel: v.optional(v.string()),
  guestPortalLinkUrl: v.optional(v.string()),
  maxAttendees: v.optional(v.number()),
  status: v.optional(eventStatusValidator),
  lifecycle: v.optional(eventLifecycleValidator),
  publishedAt: v.optional(v.number()),
  defersQrDelivery: v.optional(v.boolean()),
  sendQrOnApproval: v.optional(v.boolean()),
  attendanceQuestionEnabled: v.optional(v.boolean()),
  referralSharingEnabled: v.optional(v.boolean()),
  isFeatured: v.optional(v.boolean()),
  customFields: v.optional(
    v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        placeholder: v.optional(v.string()),
        required: v.optional(v.boolean()),
        copyEnabled: v.optional(v.boolean()),
        prependUrl: v.optional(v.string()),
        trimWhitespace: v.optional(v.boolean()),
      }),
    ),
  ),
  primaryFieldConfig: v.optional(primaryFieldConfigValidator),
  themeBackgroundColor: v.optional(v.string()),
  themeTextColor: v.optional(v.string()),
  themeAccentColor: v.optional(v.string()),
  approvalMessage: v.optional(v.string()),
  rsvpConfirmationMessageEnabled: v.optional(v.boolean()),
  rsvpConfirmationMessage: v.optional(v.string()),
  smsOptInConfirmationMessage: v.optional(v.string()),
  smsOptOutConfirmationMessage: v.optional(v.string()),
  qrDeliveryMessage: v.optional(v.string()),
  qrCodeColor: v.optional(v.string()),
  customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  unsetFields: v.optional(v.array(eventUnsetFieldValidator)),
};
const applyEventChangesArgsValidator = v.object(applyEventChangesArgs);
export async function applyEventChanges(
  ctx: MutationCtx,
  args: Infer<typeof applyEventChangesArgsValidator>,
  deferRouting = false,
) {
  await requireWorkspaceHost(ctx, {
    siteKey: args.siteKey,
    workspaceSlug: args.workspaceSlug,
  });

  const event = await ensureEventInSiteScope(ctx, args.eventId, {
    siteKey: args.siteKey,
    workspaceSlug: args.workspaceSlug,
  });
  if (!event) throw new NotFoundError("Event");

  // Detect custom field key renames before updating
  let keyMappings: Record<string, string> | undefined;
  if (args.customFields !== undefined && event.customFields) {
    const oldFields = event.customFields;
    const newFields = args.customFields;

    // Build maps for comparison (keyed by label to detect renames)
    const oldFieldMap = new Map<string, (typeof oldFields)[0]>();
    const newFieldMap = new Map<string, (typeof newFields)[0]>();

    for (const field of oldFields) {
      oldFieldMap.set(field.label, field);
    }
    for (const field of newFields) {
      newFieldMap.set(field.label, field);
    }

    // Find keys that were renamed (same label but different key)
    keyMappings = {};
    for (const [label, oldField] of oldFieldMap) {
      const newField = newFieldMap.get(label);
      if (newField && oldField.key !== newField.key) {
        // Same label but different key = rename detected
        keyMappings[oldField.key] = newField.key;
      }
    }

    // Remove empty mappings
    if (Object.keys(keyMappings).length === 0) {
      keyMappings = undefined;
    }
  }

  const patch: EventPatch & { updatedAt: number } = { updatedAt: Date.now() };
  const updateableFields = [
    "name",
    "secondaryTitle",
    "description",
    "acts",
    "eventPartners",
    "sponsors",
    "hosts",
    "productionCompany",
    "location",
    "flyerUrl",
    "flyerStorageId",
    "openGraphImageSource",
    "customIconStorageId",
    "guestPortalImageStorageId",
    "guestPortalLinkLabel",
    "guestPortalLinkUrl",
    "eventDate",
    "eventEndDate",
    "eventTimezone",
    "maxAttendees",
    "status",
    "lifecycle",
    "publishedAt",
    "defersQrDelivery",
    "sendQrOnApproval",
    "attendanceQuestionEnabled",
    "referralSharingEnabled",
    "isFeatured",
    "customFields",
    "primaryFieldConfig",
    "themeBackgroundColor",
    "themeTextColor",
    "themeAccentColor",
    "approvalMessage",
    "rsvpConfirmationMessageEnabled",
    "rsvpConfirmationMessage",
    "smsOptInConfirmationMessage",
    "smsOptOutConfirmationMessage",
    "qrDeliveryMessage",
    "qrCodeColor",
  ] as const;

  for (const fieldKey of updateableFields) {
    if (args[fieldKey] !== undefined) {
      (patch as Record<string, unknown>)[fieldKey] = args[fieldKey];
    }
  }
  const finalPatch = applyEventUnsetFields(patch, args.unsetFields);
  const updatedEvent = { ...event, ...finalPatch };
  if (!deferRouting && isSmsExecutableEvent(event) !== isSmsExecutableEvent(updatedEvent)) {
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", args.eventId))
      .collect();
    await syncExecutableEventCodeClaims(ctx, updatedEvent, credentials, patch.updatedAt);
  }
  await ctx.db.patch(args.eventId, finalPatch);

  // If custom field keys were renamed, update all RSVPs for this event
  if (keyMappings && Object.keys(keyMappings).length > 0) {
    console.log(
      `[EVENT UPDATE] Detected custom field key renames for event ${args.eventId}:`,
      keyMappings,
    );
    await ctx.runMutation(internal.migrations.renameCustomFieldKeys, {
      keyMappings,
      eventId: args.eventId,
    });
  }

  await writeAuditEntry(ctx, {
    action: "event.update",
    targetKind: "event",
    targetId: args.eventId,
    summary: `${event.name}${args.name && args.name !== event.name ? ` → ${args.name}` : ""}`,
  });

  return { ok: true as const };
}
export const update = mutation({
  args: applyEventChangesArgs,
  handler: (ctx, args) => applyEventChanges(ctx, args),
});

export async function reconcileEventRouting(ctx: MutationCtx, previous: Doc<"events">) {
  const next = await ctx.db.get(previous._id);
  if (!next || isSmsExecutableEvent(previous) === isSmsExecutableEvent(next)) return;
  const credentials = await ctx.db
    .query("listCredentials")
    .withIndex("by_event", (builder) => builder.eq("eventId", previous._id))
    .collect();
  await syncExecutableEventCodeClaims(ctx, next, credentials, Date.now());
}

export const remove = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const event = await ensureEventInSiteScope(ctx, eventId, {
      siteKey,
      workspaceSlug,
    });

    const codeClaims = await ctx.db
      .query("smsCodeClaims")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
      .collect();
    for (const codeClaim of codeClaims) {
      await ctx.db.delete(codeClaim._id);
    }

    // Simply delete the event - trigger handles all cascading automatically!
    await ctx.db.delete(eventId);

    if (event) {
      await writeAuditEntry(ctx, {
        action: "event.remove",
        targetKind: "event",
        targetId: eventId,
        summary: event.name,
      });
    }

    return { ok: true as const };
  },
});

const editableListFields = {
  displayName: v.optional(v.string()),
  archived: v.optional(v.boolean()),
  password: v.optional(v.string()),
  generateQR: v.optional(v.boolean()),
  defersQrDelivery: v.optional(v.boolean()),
  sendQrOnApproval: v.optional(v.union(v.boolean(), v.null())),
  includeTicketLinkOnApproval: v.optional(v.union(v.boolean(), v.null())),
  approvalMessage: v.optional(v.string()),
  autoApproveLimit: v.optional(v.number()),
  autoApproveDelayMinutes: v.optional(v.number()),
};
const savedListValidator = v.object({
  id: v.optional(v.id("listCredentials")),
  listKey: v.string(),
  ...editableListFields,
});

const saveEventListsArgs = {
  eventId: v.id("events"),
  siteKey: v.optional(v.string()),
  workspaceSlug: v.optional(v.string()),
  expectedListsRevision: v.optional(v.number()),
  lists: v.array(savedListValidator),
  replace: v.optional(v.boolean()),
};
const saveEventListsArgsValidator = v.object(saveEventListsArgs);
export async function saveEventLists(
  ctx: MutationCtx,
  args: Infer<typeof saveEventListsArgsValidator>,
) {
  await requireWorkspaceHost(ctx, args);
  const event = await ensureEventInSiteScope(ctx, args.eventId, args);
  if (
    args.expectedListsRevision !== undefined &&
    args.expectedListsRevision !== (event.listsRevision ?? 0)
  ) {
    throw new ConvexError({
      code: "STALE_LISTS",
      message:
        "These lists changed in another session. Reload the event before saving; your draft has been kept.",
    });
  }
  const previousLists = await ctx.db
    .query("listCredentials")
    .withIndex("by_event", (builder) => builder.eq("eventId", event._id))
    .collect();
  const existingById = new Map(previousLists.map((list) => [list._id, list]));
  const incomingIds = new Set(args.lists.flatMap((list) => (list.id ? [list.id] : [])));
  if (incomingIds.size !== args.lists.filter((list) => list.id).length)
    throw new ConvexError("A list was submitted twice.");
  const occupiedKeys = new Set(previousLists.map((list) => list.listKey));
  const changedLists: Array<{ previous?: Doc<"listCredentials">; next: Doc<"listCredentials"> }> =
    [];
  if (args.replace !== false)
    for (const list of previousLists) {
      if (!incomingIds.has(list._id) && list.archivedAt === undefined)
        await ctx.db.patch(list._id, { archivedAt: Date.now() });
    }
  for (const list of args.lists) {
    const previous = list.id ? existingById.get(list.id) : undefined;
    if (list.id && !previous) throw new ConvexError("This list does not belong to the event.");
    const displayName = (
      list.displayName ??
      (previous
        ? list.listKey === previous.listKey
          ? (previous.displayName ?? previous.listKey)
          : list.listKey
        : list.listKey)
    ).trim();
    if (!displayName) throw new ConvexError("List name is required.");
    try {
      validateAutoApproveLimit(list.autoApproveLimit);
      validateAutoApproveDelayMinutes(list.autoApproveDelayMinutes);
    } catch (error) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: error instanceof Error ? error.message : "Invalid automatic approval settings.",
      });
    }
    const { id: submittedId, listKey: submittedKey, archived, ...submittedFields } = list;
    const fields = {
      ...submittedFields,
      password: list.password?.trim(),
      displayName:
        previous && displayName === (previous.displayName ?? previous.listKey)
          ? previous.displayName
          : displayName,
      approvalMessage: sanitizeOptionalApprovalMessage(list.approvalMessage),
    };
    const values: Partial<Doc<"listCredentials">> = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined && value !== null),
    );
    if (list.approvalMessage !== undefined)
      values.approvalMessage = sanitizeOptionalApprovalMessage(list.approvalMessage);
    if (list.sendQrOnApproval === null) {
      values.sendQrOnApproval = undefined;
      values.defersQrDelivery = undefined;
    }
    if (list.includeTicketLinkOnApproval === null) values.includeTicketLinkOnApproval = undefined;
    if (
      list.password !== undefined &&
      (!previous || list.password.trim() !== (previous.password ?? ""))
    ) {
      values.password = list.password.trim();
      values.passwordNormalized = normalizeSmsCode(list.password);
    }
    if (archived !== undefined)
      values.archivedAt = archived ? (previous?.archivedAt ?? Date.now()) : undefined;
    let credentialId = submittedId;
    if (previous) {
      if (previous.archivedAt !== undefined && archived === false) {
        const restoreCode =
          list.password !== undefined ? normalizeSmsCode(list.password) : listPassword(previous);
        const owner = restoreCode ? await codeAssignment(ctx, event._id, restoreCode) : null;
        if (owner && owner.listCredentialId !== previous._id)
          throw new ConvexError({
            code: "RESTORE_PASSWORD",
            message:
              "This password was reassigned. Choose a new password or make the list open before restoring.",
          });
      }
      const changedValues = Object.fromEntries(
        Object.entries(values).filter(
          ([key, value]) => previous[key as keyof typeof previous] !== value,
        ),
      );
      if (Object.keys(changedValues).length > 0) await ctx.db.patch(previous._id, changedValues);
    } else {
      let listKey = submittedKey.trim() || displayName;
      for (let suffix = 2; occupiedKeys.has(listKey); suffix++)
        listKey = `${submittedKey.trim() || displayName}-${suffix}`;
      occupiedKeys.add(listKey);
      credentialId = await ctx.db.insert("listCredentials", {
        eventId: event._id,
        listKey,
        createdAt: Date.now(),
        ...values,
      });
    }
    const next = credentialId ? await ctx.db.get(credentialId) : null;
    if (!next) throw new ConvexError("Unable to save list.");
    changedLists.push({ previous, next });
  }
  // All rows now represent the final requested state; collisions are order independent.
  for (const { previous, next } of changedLists)
    if (previous) await releaseRotatedPassword(ctx, previous, next);
  for (const { previous, next } of changedLists)
    await syncChangedListCredentialCodeClaims(ctx, event, previous, next);
  const listsRevision = (event.listsRevision ?? 0) + 1;
  await ctx.db.patch(event._id, { listsRevision });
  return {
    ok: true as const,
    listsRevision,
    lists: changedLists.map(({ next }) => ({ id: next._id, listKey: next.listKey })),
  };
}
export const saveLists = mutation({ args: saveEventListsArgs, handler: saveEventLists });

export const addListCredential = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    listKey: v.string(),
    passwordNormalized: v.optional(v.string()),
    ...editableListFields,
  },
  handler: async (
    ctx,
    { passwordNormalized: _passwordNormalized, ...args },
  ): Promise<{ ok: true }> => {
    const { eventId, siteKey, workspaceSlug, ...list } = args;
    await saveEventLists(ctx, {
      eventId,
      siteKey,
      workspaceSlug,
      lists: [list],
      replace: false,
    });
    return { ok: true as const };
  },
});
const updateListArgs = {
  id: v.id("listCredentials"),
  siteKey: v.optional(v.string()),
  workspaceSlug: v.optional(v.string()),
  patch: v.object({
    listKey: v.optional(v.string()),
    passwordNormalized: v.optional(v.string()),
    ...editableListFields,
  }),
};
const updateListValidator = v.object(updateListArgs);
async function updateList(ctx: MutationCtx, args: Infer<typeof updateListValidator>) {
  const credential = await ctx.db.get(args.id);
  if (!credential) throw new NotFoundError("List credential");
  const { passwordNormalized: _normalized, ...patch } = args.patch;
  await saveEventLists(ctx, {
    eventId: credential.eventId,
    siteKey: args.siteKey,
    workspaceSlug: args.workspaceSlug,
    replace: false,
    lists: [{ id: credential._id, listKey: credential.listKey, ...patch }],
  });
  return { ok: true as const, batched: false, affectedRecords: 0 };
}
export const updateListCredential = mutation({ args: updateListArgs, handler: updateList });
export const updateListCredentialWithCascade = mutation({
  args: updateListArgs,
  handler: updateList,
});
export const removeListCredential = mutation({
  args: {
    id: v.id("listCredentials"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    await updateList(ctx, { ...args, patch: { archived: true } });
    return { ok: true as const };
  },
});

export const get = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    const event = await ctx.db.get(eventId);
    if (!eventMatchesSiteScope(event, { siteKey, workspaceSlug })) return null;
    return await applyWorkspaceEventDefaults(ctx, event);
  },
});

export const getByRouteId = query({
  args: {
    eventRouteId: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventRouteId, siteKey, workspaceSlug }) => {
    const event = await getEventByRouteId(ctx, eventRouteId, { siteKey, workspaceSlug });
    return await applyWorkspaceEventDefaults(ctx, event);
  },
});

export const resolveRouteId = query({
  args: {
    eventRouteId: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventRouteId, siteKey, workspaceSlug }) => {
    const event = await getEventByRouteId(ctx, eventRouteId, { siteKey, workspaceSlug });
    if (!event) return null;
    return {
      eventId: event._id,
      shortId: event.shortId,
    };
  },
});

export const ensureShortId = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const event = await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });
    if (event.shortId?.trim()) {
      return { eventId, shortId: event.shortId };
    }

    const shortId = await generateUniqueEventShortId(ctx);
    await ctx.db.patch(eventId, {
      shortId,
      updatedAt: Date.now(),
    });
    return { eventId, shortId };
  },
});

export const listAll = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { siteKey, workspaceSlug }) => {
    const events = await ctx.db.query("events").collect();
    const filtered = events.filter((event) =>
      eventMatchesSiteScope(event, { siteKey, workspaceSlug }),
    );
    return await Promise.all(filtered.map((event) => applyWorkspaceEventDefaults(ctx, event)));
  },
});

export const listAllWithFlyerUrls = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { siteKey, workspaceSlug }) => {
    const events = await ctx.db.query("events").collect();
    const filtered = events.filter((event) =>
      eventMatchesSiteScope(event, { siteKey, workspaceSlug }),
    );
    const enriched = await Promise.all(
      filtered.map(async (event) => {
        const flyerUrl = event.flyerStorageId
          ? await ctx.storage.getUrl(event.flyerStorageId)
          : null;
        return { event: await applyWorkspaceEventDefaults(ctx, event), flyerUrl };
      }),
    );
    return enriched;
  },
});

export const hasNoPasswordList = query({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, { eventId }) => {
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    return credentials.some((credential) => {
      const normalized = credential.passwordNormalized?.trim() || credential.password?.trim();
      return credential.archivedAt === undefined && !normalized;
    });
  },
});

export const hasPasswordList = query({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, { eventId }) => {
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    return credentials.some((credential) => {
      const normalized = credential.passwordNormalized?.trim() || credential.password?.trim();
      return credential.archivedAt === undefined && Boolean(normalized);
    });
  },
});

export const getFeaturedEvent = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { siteKey, workspaceSlug }) => {
    const featuredEvents = await ctx.db
      .query("events")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();

    const matchingEvent =
      featuredEvents.find((event) => eventMatchesSiteScope(event, { siteKey, workspaceSlug })) ??
      null;
    return await applyWorkspaceEventDefaults(ctx, matchingEvent);
  },
});

export const setFeaturedEvent = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    // Set all other events to not featured
    const allEvents = await ctx.db.query("events").collect();
    for (const event of allEvents) {
      if (
        event._id !== eventId &&
        event.isFeatured &&
        eventMatchesSiteScope(event, { siteKey, workspaceSlug })
      ) {
        await ctx.db.patch(event._id, {
          isFeatured: false,
          updatedAt: Date.now(),
        });
      }
    }

    // Set the selected event as featured
    await ctx.db.patch(eventId, {
      isFeatured: true,
      updatedAt: Date.now(),
    });

    return { ok: true as const };
  },
});
