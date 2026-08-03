import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAuditEntry } from "./audit";
import { internalMutation, mutation, query } from "./functions";
import { validateAutoApproveLimit } from "./lib/autoApproval";
import { generateEventShortId } from "./lib/codeGenerators";
import { applyEventUnsetFields } from "./lib/eventPatch";
import {
  primaryFieldConfigFromWorkspaceDefaults,
  primaryFieldConfigHasEffectiveContent,
  primaryFieldConfigValidator,
} from "./lib/primaryFields";
import { ensureEventInSiteScope, eventMatchesSiteScope } from "./lib/siteScope";
import { isSmsExecutableEvent, normalizeSmsCode } from "./lib/smsCodeRouting";
import { ConvexError, type EventPatch, NotFoundError, ValidationError } from "./lib/types";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

type EventCodeCredential = Pick<
  Doc<"listCredentials">,
  "_id" | "eventId" | "listKey" | "password" | "passwordNormalized"
>;

type EventCredentialCodePatch = {
  listKey?: string;
  password?: string;
  passwordNormalized?: string;
};

function applyCredentialCodePatch<TCredential extends EventCodeCredential>(
  credential: TCredential,
  patch: EventCredentialCodePatch,
): TCredential {
  const passwordNormalized =
    patch.passwordNormalized !== undefined
      ? normalizeSmsCode(patch.passwordNormalized)
      : patch.password !== undefined
        ? normalizeSmsCode(patch.password)
        : credential.passwordNormalized;
  return {
    ...credential,
    ...patch,
    passwordNormalized,
  };
}

function normalizedCredentialPatch<TPatch extends EventCredentialCodePatch>(
  patch: TPatch,
): TPatch & { passwordNormalized?: string } {
  if (patch.password === undefined && patch.passwordNormalized === undefined) {
    return patch;
  }
  return {
    ...patch,
    passwordNormalized:
      patch.passwordNormalized !== undefined
        ? normalizeSmsCode(patch.passwordNormalized)
        : normalizeSmsCode(patch.password ?? ""),
  };
}

function throwEventSmsCodeConflict(): never {
  throw new ConvexError(
    "A list password is unavailable as an SMS code. Choose another password and try again.",
    "SMS_CODE_CONFLICT",
  );
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

  const executableCredentials = credentials
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
      if (matchingCredential._id === credential._id) continue;
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
      if (!replyAction.isEnabled) continue;
      const targetEvent = await ctx.db.get(replyAction.targetEventId);
      if (!targetEvent || !isSmsExecutableEvent(targetEvent, now)) continue;
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

  const executableCredentialIds = new Set(
    executableCredentials.map(({ credential }) => credential._id),
  );
  for (const claim of existingEventClaims) {
    if (
      claim.kind === "event_list" &&
      (!claim.listCredentialId || !executableCredentialIds.has(claim.listCredentialId))
    ) {
      await ctx.db.delete(claim._id);
    }
  }

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
  const referralSharingEnabled =
    event.referralSharingEnabled ?? workspace?.eventDefaults?.referralSharingEnabled ?? false;

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
} from "./lib/eventMetadata";

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

export const insertWithCreds = mutation({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    name: v.string(),
    secondaryTitle: v.optional(v.string()),
    description: v.optional(v.string()),
    acts: v.optional(v.array(eventActValidator)),
    hosts: v.optional(v.array(v.string())),
    productionCompany: v.optional(v.string()),
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
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
    approvalMessage: v.optional(v.string()),
    rsvpConfirmationMessageEnabled: v.optional(v.boolean()),
    rsvpConfirmationMessage: v.optional(v.string()),
    qrCodeColor: v.optional(v.string()),
    defersQrDelivery: v.optional(v.boolean()),
    sendQrOnApproval: v.optional(v.boolean()),
    attendanceQuestionEnabled: v.optional(v.boolean()),
    referralSharingEnabled: v.optional(v.boolean()),
    creds: v.array(
      v.object({
        listKey: v.string(),
        password: v.optional(v.string()),
        passwordNormalized: v.optional(v.string()),
        generateQR: v.optional(v.boolean()),
        defersQrDelivery: v.optional(v.boolean()),
        sendQrOnApproval: v.optional(v.boolean()),
        includeTicketLinkOnApproval: v.optional(v.boolean()),
        approvalMessage: v.optional(v.string()),
        autoApproveLimit: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    for (const credential of args.creds) {
      validateAutoApproveLimit(credential.autoApproveLimit);
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
      hosts: args.hosts,
      productionCompany: args.productionCompany,
      location: args.location,
      flyerUrl: args.flyerUrl,
      flyerStorageId: args.flyerStorageId,
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
      referralSharingEnabled: args.referralSharingEnabled,
      maxAttendees: args.maxAttendees,
      customFields: args.customFields,
      primaryFieldConfig: args.primaryFieldConfig,
      themeBackgroundColor: args.themeBackgroundColor,
      themeTextColor: args.themeTextColor,
      approvalMessage: args.approvalMessage,
      rsvpConfirmationMessageEnabled: args.rsvpConfirmationMessageEnabled,
      rsvpConfirmationMessage: args.rsvpConfirmationMessage,
      qrCodeColor: args.qrCodeColor,
      createdAt: now,
      updatedAt: now,
    });
    for (const credential of args.creds) {
      await ctx.db.insert("listCredentials", {
        eventId,
        ...credential,
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
      await syncExecutableEventCodeClaims(ctx, insertedEvent, insertedCredentials, now);
    }
    return { eventId };
  },
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
      hosts: sourceEvent.hosts,
      productionCompany: sourceEvent.productionCompany,
      location: sourceEvent.location,
      flyerUrl: sourceEvent.flyerUrl,
      flyerStorageId: sourceEvent.flyerStorageId,
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
      approvalMessage: sourceEvent.approvalMessage,
      rsvpConfirmationMessageEnabled: sourceEvent.rsvpConfirmationMessageEnabled,
      rsvpConfirmationMessage: sourceEvent.rsvpConfirmationMessage,
      qrCodeColor: sourceEvent.qrCodeColor,
      createdAt: now,
      updatedAt: now,
    });

    for (const sourceCredential of sourceCredentials) {
      await ctx.db.insert("listCredentials", {
        eventId: duplicateEventId,
        listKey: sourceCredential.listKey,
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

export const publishEvent = mutation({
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
    if (credentials.length === 0) {
      missingFields.push("lists");
    }

    if (missingFields.length > 0) {
      throw new ValidationError(
        `Cannot publish: missing required fields — ${missingFields.join(", ")}`,
      );
    }

    const now = Date.now();
    await syncExecutableEventCodeClaims(
      ctx,
      { ...event, lifecycle: "published" },
      credentials,
      now,
    );
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
  },
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

export const update = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    name: v.optional(v.string()),
    secondaryTitle: v.optional(v.string()),
    description: v.optional(v.string()),
    acts: v.optional(v.array(eventActValidator)),
    hosts: v.optional(v.array(v.string())),
    productionCompany: v.optional(v.string()),
    location: v.optional(v.string()),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
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
    approvalMessage: v.optional(v.string()),
    rsvpConfirmationMessageEnabled: v.optional(v.boolean()),
    rsvpConfirmationMessage: v.optional(v.string()),
    qrCodeColor: v.optional(v.string()),
    customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    unsetFields: v.optional(v.array(eventUnsetFieldValidator)),
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
      "hosts",
      "productionCompany",
      "location",
      "flyerUrl",
      "flyerStorageId",
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
      "approvalMessage",
      "rsvpConfirmationMessageEnabled",
      "rsvpConfirmationMessage",
      "qrCodeColor",
    ] as const;

    for (const fieldKey of updateableFields) {
      if (args[fieldKey] !== undefined) {
        (patch as Record<string, unknown>)[fieldKey] = args[fieldKey];
      }
    }
    const finalPatch = applyEventUnsetFields(patch, args.unsetFields);
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", args.eventId))
      .collect();
    await syncExecutableEventCodeClaims(
      ctx,
      { ...event, ...finalPatch },
      credentials,
      patch.updatedAt,
    );
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

    return { ok: true };
  },
});

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

    return { ok: true };
  },
});

export const addListCredential = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    listKey: v.string(),
    password: v.optional(v.string()),
    passwordNormalized: v.optional(v.string()),
    generateQR: v.optional(v.boolean()),
    defersQrDelivery: v.optional(v.boolean()),
    sendQrOnApproval: v.optional(v.boolean()),
    includeTicketLinkOnApproval: v.optional(v.boolean()),
    approvalMessage: v.optional(v.string()),
    autoApproveLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateAutoApproveLimit(args.autoApproveLimit);
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const event = await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const now = Date.now();
    await ctx.db.insert("listCredentials", {
      eventId: args.eventId,
      listKey: args.listKey,
      password: args.password,
      passwordNormalized:
        normalizeSmsCode(args.passwordNormalized ?? args.password ?? "") || undefined,
      generateQR: args.generateQR,
      defersQrDelivery: args.defersQrDelivery,
      sendQrOnApproval: args.sendQrOnApproval,
      includeTicketLinkOnApproval: args.includeTicketLinkOnApproval,
      approvalMessage: args.approvalMessage,
      autoApproveLimit: args.autoApproveLimit,
      createdAt: now,
    });
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", args.eventId))
      .collect();
    await syncExecutableEventCodeClaims(ctx, event, credentials, now);
    return { ok: true as const };
  },
});

export const updateListCredential = mutation({
  args: {
    id: v.id("listCredentials"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    patch: v.object({
      listKey: v.optional(v.string()),
      password: v.optional(v.string()),
      passwordNormalized: v.optional(v.string()),
      generateQR: v.optional(v.boolean()),
      defersQrDelivery: v.optional(v.boolean()),
      sendQrOnApproval: v.optional(v.boolean()),
      includeTicketLinkOnApproval: v.optional(v.boolean()),
      approvalMessage: v.optional(v.string()),
      autoApproveLimit: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { id, patch, siteKey, workspaceSlug }) => {
    validateAutoApproveLimit(patch.autoApproveLimit);
    const credential = await ctx.db.get(id);
    if (!credential) throw new NotFoundError("List credential");

    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const event = await ensureEventInSiteScope(ctx, credential.eventId, {
      siteKey,
      workspaceSlug,
    });

    const now = Date.now();
    const effectivePatch = normalizedCredentialPatch(patch);
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", credential.eventId))
      .collect();
    await syncExecutableEventCodeClaims(
      ctx,
      event,
      credentials.map((candidateCredential) =>
        candidateCredential._id === id
          ? applyCredentialCodePatch(candidateCredential, effectivePatch)
          : candidateCredential,
      ),
      now,
    );
    await ctx.db.patch(id, effectivePatch);
    return { ok: true as const };
  },
});

export const removeListCredential = mutation({
  args: {
    id: v.id("listCredentials"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { id, siteKey, workspaceSlug }) => {
    // Get credential info for logging
    const credential = await ctx.db.get(id);
    if (!credential) throw new NotFoundError("List credential");

    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const event = await ensureEventInSiteScope(ctx, credential.eventId, {
      siteKey,
      workspaceSlug,
    });

    console.log(
      `[DELETE] Removing list credential ${id} (${credential.listKey}) for event ${credential.eventId}`,
    );

    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", credential.eventId))
      .collect();
    await syncExecutableEventCodeClaims(
      ctx,
      event,
      credentials.filter((candidateCredential) => candidateCredential._id !== id),
      Date.now(),
    );

    // Simply delete the credential - trigger handles cascading automatically!
    await ctx.db.delete(id);

    return { ok: true as const };
  },
});

// New mutation that handles listKey updates with cascading
export const updateListCredentialWithCascade = mutation({
  args: {
    id: v.id("listCredentials"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    patch: v.object({
      listKey: v.optional(v.string()),
      password: v.optional(v.string()),
      passwordNormalized: v.optional(v.string()),
      generateQR: v.optional(v.boolean()),
      defersQrDelivery: v.optional(v.boolean()),
      sendQrOnApproval: v.optional(v.boolean()),
      includeTicketLinkOnApproval: v.optional(v.boolean()),
      approvalMessage: v.optional(v.string()),
      autoApproveLimit: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { id, patch, siteKey, workspaceSlug }) => {
    validateAutoApproveLimit(patch.autoApproveLimit);
    const credential = await ctx.db.get(id);
    if (!credential) throw new NotFoundError("List credential");

    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const event = await ensureEventInSiteScope(ctx, credential.eventId, {
      siteKey,
      workspaceSlug,
    });
    const now = Date.now();
    const effectivePatch = normalizedCredentialPatch(patch);
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", credential.eventId))
      .collect();
    await syncExecutableEventCodeClaims(
      ctx,
      event,
      credentials.map((candidateCredential) =>
        candidateCredential._id === id
          ? applyCredentialCodePatch(candidateCredential, effectivePatch)
          : candidateCredential,
      ),
      now,
    );

    // Check if listKey is changing
    if (effectivePatch.listKey && effectivePatch.listKey !== credential.listKey) {
      console.log(
        `[UPDATE] ListKey changing: ${credential.listKey} → ${effectivePatch.listKey} for credential ${id}`,
      );

      // Count affected records to determine if we should batch
      const [rsvpCount, approvalCount, redemptionCount] = await Promise.all([
        ctx.db
          .query("rsvps")
          .withIndex("by_event", (q) => q.eq("eventId", credential.eventId))
          .filter((q) => q.eq(q.field("listKey"), credential.listKey))
          .collect()
          .then((results) => results.length),
        ctx.db
          .query("approvals")
          .withIndex("by_event", (q) => q.eq("eventId", credential.eventId))
          .filter((q) => q.eq(q.field("listKey"), credential.listKey))
          .collect()
          .then((results) => results.length),
        ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) => q.eq("eventId", credential.eventId))
          .filter((q) => q.eq(q.field("listKey"), credential.listKey))
          .collect()
          .then((results) => results.length),
      ]);

      const totalAffected = rsvpCount + approvalCount + redemptionCount;

      if (totalAffected > 100) {
        // Use batched update for large operations
        console.log(`[UPDATE] ${totalAffected} records affected, using batched update`);

        // Update the credential first
        await ctx.db.patch(id, effectivePatch);

        // Schedule batched listKey update
        await ctx.scheduler.runAfter(0, internal.cascades.batchUpdateListKey, {
          eventId: credential.eventId,
          credentialId: id,
          oldListKey: credential.listKey,
          newListKey: effectivePatch.listKey,
          cursor: undefined,
          batchSize: 500,
          phase: "rsvps",
        });

        return { ok: true, batched: true, affectedRecords: totalAffected };
      } else {
        // Inline update for smaller operations - triggers will handle cascade
        console.log(
          `[UPDATE] ${totalAffected} records affected, using inline update with triggers`,
        );

        await ctx.db.patch(id, effectivePatch);
        return { ok: true, batched: false, affectedRecords: totalAffected };
      }
    } else {
      // No listKey change, simple update
      await ctx.db.patch(id, effectivePatch);
      return { ok: true, batched: false, affectedRecords: 0 };
    }
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
      const normalized = credential.passwordNormalized?.trim();
      return !normalized;
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
      const normalized = credential.passwordNormalized?.trim();
      return Boolean(normalized);
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

    return { ok: true };
  },
});
