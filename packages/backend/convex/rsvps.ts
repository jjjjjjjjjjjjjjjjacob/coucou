import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { normalizeSocialPlatformKey } from "@coucou/sdk/shared/primary-fields";
import { v } from "convex/values";
import { api, components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { generateRsvpHandoffToken } from "./lib/codeGenerators";
import { buildGuestClerkUserId, isGuestClerkUserId } from "./lib/guestIdentity";
import { hashOpaqueValue, normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { obfuscatePhoneNumber } from "./lib/phoneUtils";
import {
  assertRequiredPrimaryFieldValues,
  buildInvitedByPatch,
  type SanitizedSubmittedSocialProfile,
  sanitizeSubmittedSocialProfiles,
  submittedSocialProfileValidator,
} from "./lib/primaryFields";
import { createProfileValuesAndWorkspaceGrantsForSocialProfiles } from "./lib/profileValueRecords";
import {
  countRsvpsWithAggregate,
  deleteRsvpFromAggregate,
  insertRsvpIntoAggregate,
  updateRsvpInAggregate,
} from "./lib/rsvpAggregate";
import { applyApprovalStatusTransition, tryAutoApproveRsvp } from "./lib/rsvpApproval";
import { formatRsvpConfirmationMessage } from "./lib/rsvpConfirmationMessages";
import {
  buildRsvpFuzzySearchTerms,
  collectRsvpsMatchingFilters,
  fieldValuesMatchRsvpFuzzySearchTerms,
  filtersRequireDirectRsvpCount,
  normalizeTicketStatusFilter,
  type ValidRsvpStatus,
  validRsvpStatuses,
} from "./lib/rsvpFilters";
import {
  type ApprovalStatus,
  type AttendanceStatus,
  deriveApprovalStatus,
  resolveApprovalStatus,
  sanitizeAttendanceStatus,
} from "./lib/rsvpStatus";
import { isPhoneNumberLikeDisplayName, resolveStoredUserDisplayName } from "./lib/rsvpUserName";
import { ensureEventInSiteScope, getEventInSiteScope } from "./lib/siteScope";
import {
  resolveSmsOrganizerPreference,
  upsertSmsOrganizerPreference,
} from "./lib/smsOrganizerPreferences";
import {
  replaceRsvpSocialProfileSnapshots,
  upsertUserSocialProfile,
} from "./lib/socialProfileRecords";
import { NotFoundError } from "./lib/types";
import {
  requireWorkspaceDoor,
  requireWorkspaceHost,
  requireWorkspaceRead,
} from "./lib/workspaceAuth";
import { eventMatchesTenantScope, resolveTenantWorkspaceScope } from "./lib/workspaceScope";

function normalizeReferralCode(value: string | undefined): string | undefined {
  const normalizedReferralCode = value?.trim().toUpperCase();
  return normalizedReferralCode && normalizedReferralCode.length > 0
    ? normalizedReferralCode.slice(0, 64)
    : undefined;
}

function resolveReferralDisplayName(user: Doc<"users">): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.metadata?.name || user.phone || user.clerkUserId || "Unknown user";
}

async function buildReferralPatch(
  ctx: MutationCtx,
  rawReferralCode: string | undefined,
  currentClerkUserId: string,
): Promise<
  | {
      referralCode: string;
      referrerUserId?: Id<"users">;
      referrerClerkUserId?: string;
      referredByName?: string;
    }
  | undefined
> {
  const referralCode = normalizeReferralCode(rawReferralCode);
  if (!referralCode) return undefined;

  const referrer = await ctx.db
    .query("users")
    .withIndex("by_referralCode", (queryBuilder) => queryBuilder.eq("referralCode", referralCode))
    .unique();

  if (!referrer) {
    return {
      referralCode,
      referrerUserId: undefined,
      referrerClerkUserId: undefined,
      referredByName: undefined,
    };
  }

  if (referrer.clerkUserId === currentClerkUserId) return undefined;

  return {
    referralCode,
    referrerUserId: referrer._id,
    referrerClerkUserId: referrer.clerkUserId,
    referredByName: resolveReferralDisplayName(referrer),
  };
}

const RSVP_HANDOFF_TTL_MS = 15 * 60 * 1000;

async function canAutoSendGuestRsvpHandoffCode(
  ctx: QueryCtx,
  {
    phoneNumber,
    phoneHash,
  }: {
    phoneNumber: string;
    phoneHash: string;
  },
): Promise<boolean> {
  const userWithPhone = await ctx.db
    .query("users")
    .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phone", phoneNumber))
    .first();
  if (userWithPhone?.clerkUserId && !isGuestClerkUserId(userWithPhone.clerkUserId)) {
    return true;
  }

  const rsvpsWithPhone = await ctx.db
    .query("rsvps")
    .withIndex("by_guestPhoneHash", (queryBuilder) => queryBuilder.eq("guestPhoneHash", phoneHash))
    .collect();
  return rsvpsWithPhone.some((rsvp) => !isGuestClerkUserId(rsvp.clerkUserId));
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function splitSubmittedDisplayName(displayName: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const normalizedDisplayName = normalizeOptionalText(displayName);
  if (!normalizedDisplayName) return {};

  const nameParts = normalizedDisplayName.split(/\s+/);
  return {
    firstName: nameParts[0],
    lastName: normalizeOptionalText(nameParts.slice(1).join(" ")),
  };
}

function resolveSubmittedGuestName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [normalizeOptionalText(firstName), normalizeOptionalText(lastName)]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function resolveMetadataDisplayName(user: Doc<"users">): string | undefined {
  const metadataName = normalizeOptionalText(user.metadata?.name);
  if (!metadataName) return undefined;
  return isPhoneNumberLikeDisplayName(metadataName, user.phone) ? undefined : metadataName;
}

function resolveUserDisplayName(user: Doc<"users"> | null | undefined, fallback: string): string {
  const fallbackName = normalizeOptionalText(fallback) ?? "";
  return (
    resolveStoredUserDisplayName(user) ||
    (user ? resolveMetadataDisplayName(user) : undefined) ||
    fallbackName
  );
}

async function mergeSubmittedUserProfile(
  ctx: MutationCtx,
  {
    user,
    clerkUserId,
    identityPhoneNumber,
    submittedPhoneNumber,
    submittedFirstName,
    submittedLastName,
    fallbackDisplayName,
    imageUrl,
    now,
  }: {
    user: Doc<"users"> | null;
    clerkUserId: string;
    identityPhoneNumber?: string;
    submittedPhoneNumber?: string;
    submittedFirstName?: string;
    submittedLastName?: string;
    fallbackDisplayName?: string;
    imageUrl?: string;
    now: number;
  },
): Promise<Doc<"users"> | null> {
  const normalizedSubmittedFirstName = normalizeOptionalText(submittedFirstName);
  const normalizedSubmittedLastName = normalizeOptionalText(submittedLastName);
  const fallbackNameParts = splitSubmittedDisplayName(fallbackDisplayName);
  const existingFirstName = normalizeOptionalText(user?.firstName);
  const existingLastName = normalizeOptionalText(user?.lastName);
  const existingDisplayName = [existingFirstName, existingLastName].filter(Boolean).join(" ");
  const existingDisplayNameIsPhoneLike =
    !!existingDisplayName && isPhoneNumberLikeDisplayName(existingDisplayName, user?.phone);
  const existingFirstNameIsPhoneLike =
    !!existingFirstName && isPhoneNumberLikeDisplayName(existingFirstName, user?.phone);
  const existingLastNameIsPhoneLike =
    !!existingLastName && isPhoneNumberLikeDisplayName(existingLastName, user?.phone);
  const usableExistingFirstName =
    existingDisplayNameIsPhoneLike || existingFirstNameIsPhoneLike ? undefined : existingFirstName;
  const usableExistingLastName =
    existingDisplayNameIsPhoneLike || existingLastNameIsPhoneLike ? undefined : existingLastName;
  const nextFirstName =
    usableExistingFirstName ?? normalizedSubmittedFirstName ?? fallbackNameParts.firstName;
  const nextLastName =
    usableExistingLastName ?? normalizedSubmittedLastName ?? fallbackNameParts.lastName;
  const nextPhoneNumber =
    normalizeOptionalText(submittedPhoneNumber) ??
    normalizeOptionalText(identityPhoneNumber) ??
    normalizeOptionalText(user?.phone);

  if (!user) {
    if (!nextFirstName && !nextLastName && !nextPhoneNumber) return null;

    const userId = await ctx.db.insert("users", {
      clerkUserId,
      phone: nextPhoneNumber,
      firstName: nextFirstName,
      lastName: nextLastName,
      imageUrl,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(userId);
  }

  const userPatch: {
    phone?: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    updatedAt: number;
  } = {
    updatedAt: now,
  };
  let shouldPatchUser = false;

  if (nextPhoneNumber && nextPhoneNumber !== user.phone) {
    userPatch.phone = nextPhoneNumber;
    shouldPatchUser = true;
  }
  if (nextFirstName && nextFirstName !== user.firstName) {
    userPatch.firstName = nextFirstName;
    shouldPatchUser = true;
  }
  if (nextLastName && nextLastName !== user.lastName) {
    userPatch.lastName = nextLastName;
    shouldPatchUser = true;
  }
  if (imageUrl && imageUrl !== user.imageUrl) {
    userPatch.imageUrl = imageUrl;
    shouldPatchUser = true;
  }

  if (!shouldPatchUser) return user;

  await ctx.db.patch(user._id, userPatch);
  return await ctx.db.get(user._id);
}

type RsvpSubmissionInput = {
  eventId: Id<"events">;
  siteKey?: string;
  listKey: string;
  firstName: string;
  lastName: string;
  note?: string;
  shareContact: boolean;
  attendees?: number;
  attendanceStatus?: "yes" | "no" | "maybe";
  smsConsent?: boolean;
  smsConsentIpAddress?: string;
  customFields?: Record<string, string>;
  socialProfiles?: Array<{ platformKey: string; handle: string }>;
  invitedByName?: string;
  referralCode?: string;
};

type PreparedRsvpSubmission = {
  event: Doc<"events">;
  now: number;
  sanitizedSocialProfiles: SanitizedSubmittedSocialProfile[];
  configuredSocialPlatformKeys: Set<string>;
  invitedByPatch: ReturnType<typeof buildInvitedByPatch> | Record<string, never>;
  referralPatch:
    | {
        referralCode: string;
        referrerUserId?: Id<"users">;
        referrerClerkUserId?: string;
        referredByName?: string;
      }
    | undefined;
  sanitizedCustomFieldValues: Record<string, string> | undefined;
  requestedAttendees: number;
  submittedAttendanceStatus: AttendanceStatus;
  sanitizedSmsConsentIpAddress: string | undefined;
};

type ResolvedRsvpSubmissionSmsConsent = {
  smsConsent: boolean;
  smsConsentTimestamp: number | undefined;
  smsConsentIpAddress: string | undefined;
  smsConsentChange: "enabled" | "disabled" | null;
  shouldUpdateOrganizerPreference: boolean;
};

function resolveRsvpSubmissionSmsConsent({
  submittedSmsConsent,
  submittedSmsConsentIpAddress,
  existingRsvp,
  organizerPreference,
  now,
}: {
  submittedSmsConsent: boolean | undefined;
  submittedSmsConsentIpAddress: string | undefined;
  existingRsvp: Pick<
    Doc<"rsvps">,
    "smsConsent" | "smsConsentTimestamp" | "smsConsentIpAddress"
  > | null;
  organizerPreference: {
    smsConsent: boolean;
    smsConsentTimestamp?: number;
    smsConsentIpAddress?: string;
  };
  now: number;
}): ResolvedRsvpSubmissionSmsConsent {
  const shouldUpdateOrganizerPreference = submittedSmsConsent !== undefined;
  const smsConsent =
    submittedSmsConsent ?? existingRsvp?.smsConsent ?? organizerPreference.smsConsent;
  const smsConsentTimestamp = shouldUpdateOrganizerPreference
    ? now
    : (existingRsvp?.smsConsentTimestamp ?? organizerPreference.smsConsentTimestamp);
  const priorSmsConsentIpAddress =
    existingRsvp?.smsConsentIpAddress ?? organizerPreference.smsConsentIpAddress;
  const smsConsentIpAddress = smsConsent
    ? (submittedSmsConsentIpAddress ?? priorSmsConsentIpAddress)
    : priorSmsConsentIpAddress;
  const smsConsentChange =
    !shouldUpdateOrganizerPreference || smsConsent === organizerPreference.smsConsent
      ? null
      : smsConsent
        ? "enabled"
        : "disabled";

  return {
    smsConsent,
    smsConsentTimestamp,
    smsConsentIpAddress,
    smsConsentChange,
    shouldUpdateOrganizerPreference,
  };
}

async function prepareRsvpSubmission(
  ctx: MutationCtx,
  args: RsvpSubmissionInput,
  currentClerkUserId: string,
): Promise<PreparedRsvpSubmission> {
  const event = await getEventInSiteScope(ctx, args.eventId, {
    siteKey: args.siteKey,
  });
  const now = Date.now();
  if (!event || !isEventOpenForRsvp(event, now)) throw new Error("Event not available");

  const eventFieldMap = new Map((event.customFields ?? []).map((field) => [field.key, field]));
  const primaryFieldConfig = event.primaryFieldConfig;
  const sanitizedSocialProfiles = sanitizeSubmittedSocialProfiles(
    args.socialProfiles,
    primaryFieldConfig,
  );
  assertRequiredPrimaryFieldValues({
    primaryFieldConfig,
    submittedProfiles: sanitizedSocialProfiles,
    invitedByName: args.invitedByName,
  });
  const configuredSocialPlatformKeys = new Set(
    (primaryFieldConfig?.socialPlatforms ?? []).map((platform) => platform.platformKey),
  );
  const invitedByPatch =
    primaryFieldConfig?.invitedBy?.enabled === true ? buildInvitedByPatch(args.invitedByName) : {};
  const referralPatch = await buildReferralPatch(ctx, args.referralCode, currentClerkUserId);

  const sanitizedCustomFieldValues = args.customFields
    ? Object.fromEntries(
        Object.entries(args.customFields)
          .map(([fieldKey, rawValue]) => {
            const fieldConfig = eventFieldMap.get(fieldKey);
            if (!fieldConfig) return null;
            const stringValue = typeof rawValue === "string" ? rawValue : `${rawValue ?? ""}`;
            const finalValue =
              fieldConfig.trimWhitespace === false ? stringValue : stringValue.trim();
            if (!finalValue) return null;
            return [fieldKey, finalValue];
          })
          .filter((entry): entry is [string, string] => entry !== null),
      )
    : undefined;

  const maxAttendeesAllowed = event.maxAttendees ?? 1;
  const requestedAttendees = args.attendees ?? 1;
  const submittedAttendanceStatus = sanitizeAttendanceStatus(args.attendanceStatus);
  if (requestedAttendees > maxAttendeesAllowed) {
    throw new Error(`Maximum ${maxAttendeesAllowed} attendees allowed for this event`);
  }
  if (requestedAttendees < 1) {
    throw new Error("At least 1 attendee required");
  }

  const sanitizedSmsConsentIpAddress =
    args.smsConsent === true && typeof args.smsConsentIpAddress === "string"
      ? args.smsConsentIpAddress.slice(0, 256)
      : undefined;

  return {
    event,
    now,
    sanitizedSocialProfiles,
    configuredSocialPlatformKeys,
    invitedByPatch,
    referralPatch,
    sanitizedCustomFieldValues,
    requestedAttendees,
    submittedAttendanceStatus,
    sanitizedSmsConsentIpAddress,
  };
}

export const submitRequest = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    listKey: v.string(),
    note: v.optional(v.string()),
    shareContact: v.boolean(),
    attendees: v.optional(v.number()),
    attendanceStatus: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("maybe"))),
    smsConsent: v.optional(v.boolean()), // SMS consent from user
    smsConsentIpAddress: v.optional(v.string()), // IP address for compliance
    // Contact is optional because the user may already have a phone on file.
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    customFields: v.optional(v.record(v.string(), v.string())),
    socialProfiles: v.optional(v.array(submittedSocialProfileValidator)),
    invitedByName: v.optional(v.string()),
    referralCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Require authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    let user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    const {
      event,
      now,
      sanitizedSocialProfiles,
      configuredSocialPlatformKeys,
      invitedByPatch,
      referralPatch,
      sanitizedCustomFieldValues,
      requestedAttendees,
      submittedAttendanceStatus,
      sanitizedSmsConsentIpAddress,
    } = await prepareRsvpSubmission(ctx, args, clerkUserId);
    const submittedFirstName = args.firstName.trim();
    const submittedLastName = args.lastName.trim();
    if (!submittedFirstName) {
      throw new Error("First name is required");
    }
    if (!submittedLastName) {
      throw new Error("Last name is required");
    }
    const submittedUserName = resolveSubmittedGuestName(submittedFirstName, submittedLastName);
    user = await mergeSubmittedUserProfile(ctx, {
      user,
      clerkUserId,
      identityPhoneNumber: identity.phoneNumber,
      submittedPhoneNumber: args.phone,
      submittedFirstName,
      submittedLastName,
      fallbackDisplayName: submittedUserName,
      imageUrl: identity.pictureUrl ?? undefined,
      now,
    });
    const userName = resolveUserDisplayName(user, submittedUserName);

    // Upsert RSVP per (eventId, clerkUserId)
    const existing = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
      .unique();

    const existingOrganizerSmsPreference = await resolveSmsOrganizerPreference(ctx, {
      clerkUserId,
      event,
      siteKey: args.siteKey,
    });
    const resolvedSmsConsent = resolveRsvpSubmissionSmsConsent({
      submittedSmsConsent: args.smsConsent,
      submittedSmsConsentIpAddress: sanitizedSmsConsentIpAddress,
      existingRsvp: existing,
      organizerPreference: existingOrganizerSmsPreference,
      now,
    });
    let wasAutomaticallyApproved = false;

    if (!existing) {
      const rsvpId = await ctx.db.insert("rsvps", {
        eventId: args.eventId,
        clerkUserId,
        listKey: args.listKey,
        ticketStatus: "not-issued",
        userName, // For search functionality
        note: args.note,
        shareContact: args.shareContact,
        attendees: requestedAttendees,
        smsConsent: resolvedSmsConsent.smsConsent,
        smsConsentTimestamp: resolvedSmsConsent.smsConsentTimestamp,
        smsConsentIpAddress: resolvedSmsConsent.smsConsentIpAddress,
        customFieldValues:
          sanitizedCustomFieldValues && Object.keys(sanitizedCustomFieldValues).length > 0
            ? sanitizedCustomFieldValues
            : undefined,
        ...invitedByPatch,
        ...(referralPatch ?? {}),
        status: "pending",
        approvalStatus: "pending",
        attendanceStatus: event.attendanceQuestionEnabled ? submittedAttendanceStatus : "yes",
        createdAt: now,
        updatedAt: now,
      });

      if (configuredSocialPlatformKeys.size > 0) {
        await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
          event,
          rsvpId,
          clerkUserId,
          userId: user?._id,
          submittedProfiles: sanitizedSocialProfiles,
        });
        await replaceRsvpSocialProfileSnapshots(ctx, {
          eventId: args.eventId,
          rsvpId,
          clerkUserId,
          userId: user?._id,
          configuredPlatformKeys: configuredSocialPlatformKeys,
          submittedProfiles: sanitizedSocialProfiles,
        });
      }

      if (resolvedSmsConsent.shouldUpdateOrganizerPreference) {
        await upsertSmsOrganizerPreference(ctx, {
          clerkUserId,
          event,
          siteKey: args.siteKey,
          smsConsent: resolvedSmsConsent.smsConsent,
          smsConsentIpAddress: resolvedSmsConsent.smsConsentIpAddress,
          sourceEventId: args.eventId,
          sourceRsvpId: rsvpId,
          now,
        });
      }

      // Sync with aggregate
      const newRsvp = await ctx.db.get(rsvpId);
      if (newRsvp) {
        await insertRsvpIntoAggregate(ctx, newRsvp);
        wasAutomaticallyApproved = await tryAutoApproveRsvp(ctx, newRsvp);
      }
    } else {
      // Prevent re-requesting the same denied list
      if (resolveApprovalStatus(existing) === "denied" && existing.listKey === args.listKey) {
        throw new Error("Denied for this list; try a different password");
      }
      // Get old state before update for aggregate sync
      const oldRsvp = await ctx.db.get(existing._id);

      await ctx.db.patch(existing._id, {
        listKey: args.listKey,
        userName, // Keep userName in sync
        note: args.note,
        shareContact: args.shareContact,
        attendees: requestedAttendees,
        smsConsent: resolvedSmsConsent.smsConsent,
        smsConsentTimestamp: resolvedSmsConsent.smsConsentTimestamp,
        smsConsentIpAddress: resolvedSmsConsent.smsConsentIpAddress,
        customFieldValues:
          sanitizedCustomFieldValues !== undefined
            ? Object.keys(sanitizedCustomFieldValues).length > 0
              ? sanitizedCustomFieldValues
              : undefined
            : existing.customFieldValues,
        ...invitedByPatch,
        ...(referralPatch ?? {}),
        // Reset to pending when re-requesting (unless already approved)
        status: resolveApprovalStatus(existing) === "approved" ? "approved" : "pending",
        approvalStatus: resolveApprovalStatus(existing) === "approved" ? "approved" : "pending",
        attendanceStatus: event.attendanceQuestionEnabled ? submittedAttendanceStatus : "yes",
        updatedAt: now,
      });

      if (configuredSocialPlatformKeys.size > 0) {
        await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
          event,
          rsvpId: existing._id,
          clerkUserId,
          userId: user?._id,
          submittedProfiles: sanitizedSocialProfiles,
        });
        await replaceRsvpSocialProfileSnapshots(ctx, {
          eventId: args.eventId,
          rsvpId: existing._id,
          clerkUserId,
          userId: user?._id,
          configuredPlatformKeys: configuredSocialPlatformKeys,
          submittedProfiles: sanitizedSocialProfiles,
        });
      }

      // Sync with aggregate
      const newRsvp = await ctx.db.get(existing._id);
      if (oldRsvp && newRsvp) {
        await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
        if (resolveApprovalStatus(oldRsvp) !== "approved" && oldRsvp.listKey !== newRsvp.listKey) {
          await tryAutoApproveRsvp(ctx, newRsvp);
        }
      }

      if (resolvedSmsConsent.shouldUpdateOrganizerPreference) {
        await upsertSmsOrganizerPreference(ctx, {
          clerkUserId,
          event,
          siteKey: args.siteKey,
          smsConsent: resolvedSmsConsent.smsConsent,
          smsConsentIpAddress: resolvedSmsConsent.smsConsentIpAddress,
          sourceEventId: args.eventId,
          sourceRsvpId: existing._id,
          now,
        });
      }
    }

    if (resolvedSmsConsent.smsConsentChange) {
      await ctx.scheduler.runAfter(0, api.notifications.sendSmsConsentStatusMessage, {
        eventId: args.eventId,
        clerkUserId,
        consentEnabled: resolvedSmsConsent.smsConsentChange === "enabled",
      });
    }

    const rsvpConfirmationMessage =
      !existing && resolvedSmsConsent.smsConsent && !wasAutomaticallyApproved
        ? formatRsvpConfirmationMessage(event, {
            firstName: user?.firstName ?? submittedFirstName,
            lastName: user?.lastName ?? submittedLastName,
            fullName: userName,
          })
        : undefined;
    if (rsvpConfirmationMessage) {
      await ctx.scheduler.runAfter(
        resolvedSmsConsent.smsConsentChange === "enabled" ? 1000 : 0,
        api.notifications.sendRsvpConfirmationSms,
        {
          eventId: args.eventId,
          clerkUserId,
          message: rsvpConfirmationMessage,
        },
      );
    }

    return { ok: true as const };
  },
});

export const submitGuestRequest = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    listKey: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    note: v.optional(v.string()),
    shareContact: v.boolean(),
    attendees: v.optional(v.number()),
    attendanceStatus: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("maybe"))),
    smsConsent: v.optional(v.boolean()),
    smsConsentIpAddress: v.optional(v.string()),
    customFields: v.optional(v.record(v.string(), v.string())),
    socialProfiles: v.optional(v.array(submittedSocialProfileValidator)),
    invitedByName: v.optional(v.string()),
    referralCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const submittedFirstName = args.firstName.trim();
    const submittedLastName = args.lastName.trim();
    if (!submittedFirstName) {
      throw new Error("First name is required");
    }
    if (!submittedLastName) {
      throw new Error("Last name is required");
    }

    const { normalizedPhoneNumber, phoneHash } = await normalizeAndHashPhoneNumber(args.phone);
    const guestClerkUserId = buildGuestClerkUserId(phoneHash);
    const guestPhoneObfuscated = obfuscatePhoneNumber(normalizedPhoneNumber);
    const guestName = resolveSubmittedGuestName(submittedFirstName, submittedLastName);
    const {
      event,
      now,
      sanitizedSocialProfiles,
      configuredSocialPlatformKeys,
      invitedByPatch,
      referralPatch,
      sanitizedCustomFieldValues,
      requestedAttendees,
      submittedAttendanceStatus,
      sanitizedSmsConsentIpAddress,
    } = await prepareRsvpSubmission(ctx, args, guestClerkUserId);

    // Durable phoneHash → plaintext map so partner webhooks can carry the
    // guest's phone number. Written before the RSVP row because the webhook
    // trigger resolves guest identity at RSVP-write time.
    const existingGuestContact = await ctx.db
      .query("guestContacts")
      .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
      .unique();
    if (existingGuestContact) {
      if (existingGuestContact.phoneNumber !== normalizedPhoneNumber) {
        await ctx.db.patch(existingGuestContact._id, {
          phoneNumber: normalizedPhoneNumber,
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.insert("guestContacts", {
        phoneHash,
        phoneNumber: normalizedPhoneNumber,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingGuestRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_guestPhoneHash", (queryBuilder) =>
        queryBuilder.eq("eventId", args.eventId).eq("guestPhoneHash", phoneHash),
      )
      .collect();
    const existing = existingGuestRsvps.find((rsvp) => isGuestClerkUserId(rsvp.clerkUserId));
    const existingOrganizerSmsPreference = await resolveSmsOrganizerPreference(ctx, {
      clerkUserId: guestClerkUserId,
      event,
      siteKey: args.siteKey,
    });
    const resolvedSmsConsent = resolveRsvpSubmissionSmsConsent({
      submittedSmsConsent: args.smsConsent,
      submittedSmsConsentIpAddress: sanitizedSmsConsentIpAddress,
      existingRsvp: existing ?? null,
      organizerPreference: existingOrganizerSmsPreference,
      now,
    });
    let wasAutomaticallyApproved = false;

    let rsvpId: Id<"rsvps">;
    if (!existing) {
      rsvpId = await ctx.db.insert("rsvps", {
        eventId: args.eventId,
        clerkUserId: guestClerkUserId,
        listKey: args.listKey,
        ticketStatus: "not-issued",
        userName: guestName,
        guestPhoneHash: phoneHash,
        guestPhoneObfuscated,
        note: args.note,
        shareContact: args.shareContact,
        attendees: requestedAttendees,
        smsConsent: resolvedSmsConsent.smsConsent,
        smsConsentTimestamp: resolvedSmsConsent.smsConsentTimestamp,
        smsConsentIpAddress: resolvedSmsConsent.smsConsentIpAddress,
        customFieldValues:
          sanitizedCustomFieldValues && Object.keys(sanitizedCustomFieldValues).length > 0
            ? sanitizedCustomFieldValues
            : undefined,
        ...invitedByPatch,
        ...(referralPatch ?? {}),
        status: "pending",
        approvalStatus: "pending",
        attendanceStatus: event.attendanceQuestionEnabled ? submittedAttendanceStatus : "yes",
        createdAt: now,
        updatedAt: now,
      });

      if (configuredSocialPlatformKeys.size > 0) {
        await replaceRsvpSocialProfileSnapshots(ctx, {
          eventId: args.eventId,
          rsvpId,
          clerkUserId: guestClerkUserId,
          configuredPlatformKeys: configuredSocialPlatformKeys,
          submittedProfiles: sanitizedSocialProfiles,
          persistUserProfiles: false,
        });
      }

      const newRsvp = await ctx.db.get(rsvpId);
      if (newRsvp) {
        await insertRsvpIntoAggregate(ctx, newRsvp);
        wasAutomaticallyApproved = await tryAutoApproveRsvp(ctx, newRsvp);
      }
    } else {
      if (resolveApprovalStatus(existing) === "denied" && existing.listKey === args.listKey) {
        throw new Error("Denied for this list; try a different password");
      }

      rsvpId = existing._id;
      const oldRsvp = await ctx.db.get(existing._id);
      await ctx.db.patch(existing._id, {
        listKey: args.listKey,
        userName: guestName,
        guestPhoneHash: phoneHash,
        guestPhoneObfuscated,
        note: args.note,
        shareContact: args.shareContact,
        attendees: requestedAttendees,
        smsConsent: resolvedSmsConsent.smsConsent,
        smsConsentTimestamp: resolvedSmsConsent.smsConsentTimestamp,
        smsConsentIpAddress: resolvedSmsConsent.smsConsentIpAddress,
        customFieldValues:
          sanitizedCustomFieldValues !== undefined
            ? Object.keys(sanitizedCustomFieldValues).length > 0
              ? sanitizedCustomFieldValues
              : undefined
            : existing.customFieldValues,
        ...invitedByPatch,
        ...(referralPatch ?? {}),
        status: resolveApprovalStatus(existing) === "approved" ? "approved" : "pending",
        approvalStatus: resolveApprovalStatus(existing) === "approved" ? "approved" : "pending",
        attendanceStatus: event.attendanceQuestionEnabled ? submittedAttendanceStatus : "yes",
        updatedAt: now,
      });

      if (configuredSocialPlatformKeys.size > 0) {
        await replaceRsvpSocialProfileSnapshots(ctx, {
          eventId: args.eventId,
          rsvpId: existing._id,
          clerkUserId: guestClerkUserId,
          configuredPlatformKeys: configuredSocialPlatformKeys,
          submittedProfiles: sanitizedSocialProfiles,
          persistUserProfiles: false,
        });
      }

      const newRsvp = await ctx.db.get(existing._id);
      if (oldRsvp && newRsvp) {
        await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
        if (resolveApprovalStatus(oldRsvp) !== "approved" && oldRsvp.listKey !== newRsvp.listKey) {
          await tryAutoApproveRsvp(ctx, newRsvp);
        }
      }
    }

    const rsvpHandoffToken = generateRsvpHandoffToken();
    const rsvpHandoffTokenHash = await hashOpaqueValue(rsvpHandoffToken);
    const expiresAt = now + RSVP_HANDOFF_TTL_MS;
    await ctx.db.insert("rsvpGuestHandoffs", {
      tokenHash: rsvpHandoffTokenHash,
      rsvpId,
      phoneNumber: normalizedPhoneNumber,
      phoneHash,
      expiresAt,
      createdAt: now,
    });

    if (resolvedSmsConsent.smsConsentChange) {
      await ctx.scheduler.runAfter(0, api.notifications.sendSmsConsentStatusMessage, {
        eventId: args.eventId,
        clerkUserId: guestClerkUserId,
        consentEnabled: resolvedSmsConsent.smsConsentChange === "enabled",
        phoneNumber: normalizedPhoneNumber,
      });
    }

    const rsvpConfirmationMessage =
      !existing && resolvedSmsConsent.smsConsent && !wasAutomaticallyApproved
        ? formatRsvpConfirmationMessage(event, {
            firstName: submittedFirstName,
            lastName: submittedLastName,
            fullName: guestName,
          })
        : undefined;
    if (rsvpConfirmationMessage) {
      await ctx.scheduler.runAfter(
        resolvedSmsConsent.smsConsentChange === "enabled" ? 1000 : 0,
        api.notifications.sendRsvpConfirmationSms,
        {
          eventId: args.eventId,
          clerkUserId: guestClerkUserId,
          message: rsvpConfirmationMessage,
          phoneNumber: normalizedPhoneNumber,
        },
      );
    }

    return {
      ok: true as const,
      rsvpId,
      rsvpHandoffToken,
      expiresAt,
    };
  },
});

export const resolveGuestRsvpHandoff = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, { token }) => {
    const trimmedToken = token.trim();
    if (!trimmedToken) return null;

    const tokenHash = await hashOpaqueValue(trimmedToken);
    const handoff = await ctx.db
      .query("rsvpGuestHandoffs")
      .withIndex("by_tokenHash", (queryBuilder) => queryBuilder.eq("tokenHash", tokenHash))
      .unique();
    if (!handoff || handoff.expiresAt <= Date.now()) {
      return null;
    }

    return {
      rsvpId: handoff.rsvpId,
      phoneNumber: handoff.phoneNumber,
      expiresAt: handoff.expiresAt,
      canAutoSendCode: await canAutoSendGuestRsvpHandoffCode(ctx, {
        phoneNumber: handoff.phoneNumber,
        phoneHash: handoff.phoneHash,
      }),
    } as const;
  },
});

function resolveApprovalRank(rsvp: Doc<"rsvps">): number {
  switch (resolveApprovalStatus(rsvp)) {
    case "approved":
      return 3;
    case "pending":
      return 2;
    case "denied":
      return 1;
    default:
      return 0;
  }
}

function chooseStrongerRsvpStatusSource(
  existingRsvp: Doc<"rsvps">,
  guestRsvp: Doc<"rsvps">,
): Doc<"rsvps"> {
  const existingRank = resolveApprovalRank(existingRsvp);
  const guestRank = resolveApprovalRank(guestRsvp);
  if (guestRank > existingRank) return guestRsvp;
  if (existingRank > guestRank) return existingRsvp;
  return (guestRsvp.updatedAt ?? guestRsvp.createdAt) >
    (existingRsvp.updatedAt ?? existingRsvp.createdAt)
    ? guestRsvp
    : existingRsvp;
}

async function moveGuestRsvpDependentRecords(
  ctx: MutationCtx,
  {
    guestRsvp,
    targetRsvpId,
    targetClerkUserId,
    targetUserId,
    now,
  }: {
    guestRsvp: Doc<"rsvps">;
    targetRsvpId: Id<"rsvps">;
    targetClerkUserId: string;
    targetUserId?: Id<"users">;
    now: number;
  },
): Promise<Doc<"redemptions"> | null> {
  const guestSocialProfiles = await ctx.db
    .query("rsvpSocialProfiles")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", guestRsvp._id))
    .collect();

  const event = await ctx.db.get(guestRsvp.eventId);
  const submittedProfiles = guestSocialProfiles.map((profile) => ({
    platformKey: profile.platformKey,
    handle: profile.handle,
    normalizedHandle: profile.normalizedHandle,
  }));
  if (event && submittedProfiles.length > 0) {
    await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
      event,
      rsvpId: targetRsvpId,
      clerkUserId: targetClerkUserId,
      userId: targetUserId,
      submittedProfiles,
    });
  }

  for (const profile of guestSocialProfiles) {
    const targetProfile =
      targetRsvpId === guestRsvp._id
        ? null
        : await ctx.db
            .query("rsvpSocialProfiles")
            .withIndex("by_rsvp_platform", (queryBuilder) =>
              queryBuilder.eq("rsvpId", targetRsvpId).eq("platformKey", profile.platformKey),
            )
            .unique();
    const userSocialProfileId = await upsertUserSocialProfile(ctx, {
      clerkUserId: targetClerkUserId,
      userId: targetUserId,
      platformKey: profile.platformKey,
      handle: profile.handle,
      normalizedHandle: profile.normalizedHandle,
    });

    if (targetProfile && targetProfile._id !== profile._id) {
      await ctx.db.delete(profile._id);
      continue;
    }

    await ctx.db.patch(profile._id, {
      rsvpId: targetRsvpId,
      clerkUserId: targetClerkUserId,
      userSocialProfileId,
      updatedAt: now,
    });
  }

  const approvals = await ctx.db
    .query("approvals")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", guestRsvp.eventId))
    .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("rsvpId"), guestRsvp._id))
    .collect();
  for (const approval of approvals) {
    await ctx.db.patch(approval._id, {
      rsvpId: targetRsvpId,
      clerkUserId: targetClerkUserId,
    });
  }

  const guestRedemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", guestRsvp.eventId).eq("clerkUserId", guestRsvp.clerkUserId),
    )
    .unique();
  const existingTargetRedemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", guestRsvp.eventId).eq("clerkUserId", targetClerkUserId),
    )
    .unique();
  let resolvedRedemption = existingTargetRedemption;
  if (guestRedemption && !existingTargetRedemption) {
    await ctx.db.patch(guestRedemption._id, {
      clerkUserId: targetClerkUserId,
    });
    resolvedRedemption = {
      ...guestRedemption,
      clerkUserId: targetClerkUserId,
    };
  } else if (
    guestRedemption &&
    existingTargetRedemption &&
    guestRedemption._id !== existingTargetRedemption._id
  ) {
    await ctx.db.delete(guestRedemption._id);
  }

  const handoffs = await ctx.db
    .query("rsvpGuestHandoffs")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", guestRsvp._id))
    .collect();
  for (const handoff of handoffs) {
    await ctx.db.patch(handoff._id, {
      rsvpId: targetRsvpId,
      usedAt: handoff.usedAt ?? now,
    });
  }

  return resolvedRedemption;
}

async function maybeSendPairedApprovalSms(
  ctx: MutationCtx,
  {
    guestRsvp,
    targetClerkUserId,
    redemption,
  }: {
    guestRsvp: Doc<"rsvps">;
    targetClerkUserId: string;
    redemption: Doc<"redemptions"> | null;
  },
) {
  if (resolveApprovalStatus(guestRsvp) !== "approved") return;
  if (!redemption || !guestRsvp.shareContact || !guestRsvp.listKey) return;

  await ctx.scheduler.runAfter(0, api.notifications.sendApprovalSms, {
    eventId: guestRsvp.eventId,
    clerkUserId: targetClerkUserId,
    listKey: guestRsvp.listKey,
    code: redemption.code,
    shareContact: guestRsvp.shareContact,
  });
}

async function claimGuestRsvpsForPhone(
  ctx: MutationCtx,
  {
    clerkUserId,
    phoneNumber,
  }: {
    clerkUserId: string;
    phoneNumber: string;
  },
) {
  const { phoneHash } = await normalizeAndHashPhoneNumber(phoneNumber);
  const now = Date.now();
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
    .unique();
  const guestRsvps = (
    await ctx.db
      .query("rsvps")
      .withIndex("by_guestPhoneHash", (queryBuilder) =>
        queryBuilder.eq("guestPhoneHash", phoneHash),
      )
      .collect()
  ).filter((rsvp) => isGuestClerkUserId(rsvp.clerkUserId));

  let pairedCount = 0;
  let mergedCount = 0;
  let mergedUser = user;
  for (const guestRsvp of guestRsvps) {
    mergedUser = await mergeSubmittedUserProfile(ctx, {
      user: mergedUser,
      clerkUserId,
      identityPhoneNumber: phoneNumber,
      submittedPhoneNumber: phoneNumber,
      fallbackDisplayName: guestRsvp.userName,
      now,
    });
    const existingUserRsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (queryBuilder) =>
        queryBuilder.eq("eventId", guestRsvp.eventId).eq("clerkUserId", clerkUserId),
      )
      .unique();

    if (existingUserRsvp && existingUserRsvp._id !== guestRsvp._id) {
      const statusSource = chooseStrongerRsvpStatusSource(existingUserRsvp, guestRsvp);
      const oldExistingUserRsvp = await ctx.db.get(existingUserRsvp._id);
      const mergedCustomFieldValues = {
        ...(existingUserRsvp.customFieldValues ?? {}),
        ...(guestRsvp.customFieldValues ?? {}),
      };
      await ctx.db.patch(existingUserRsvp._id, {
        listKey: statusSource.listKey,
        userName: resolveUserDisplayName(
          mergedUser,
          guestRsvp.userName ?? existingUserRsvp.userName ?? "",
        ),
        note: guestRsvp.note ?? existingUserRsvp.note,
        shareContact: guestRsvp.shareContact || existingUserRsvp.shareContact,
        attendees: guestRsvp.attendees ?? existingUserRsvp.attendees,
        smsConsent: guestRsvp.smsConsent ?? existingUserRsvp.smsConsent,
        smsConsentTimestamp: guestRsvp.smsConsentTimestamp ?? existingUserRsvp.smsConsentTimestamp,
        smsConsentIpAddress: guestRsvp.smsConsentIpAddress ?? existingUserRsvp.smsConsentIpAddress,
        customFieldValues:
          Object.keys(mergedCustomFieldValues).length > 0 ? mergedCustomFieldValues : undefined,
        invitedByName: guestRsvp.invitedByName ?? existingUserRsvp.invitedByName,
        invitedByNormalizedName:
          guestRsvp.invitedByNormalizedName ?? existingUserRsvp.invitedByNormalizedName,
        invitedBySocialPlatformKey:
          guestRsvp.invitedBySocialPlatformKey ?? existingUserRsvp.invitedBySocialPlatformKey,
        invitedBySocialHandle:
          guestRsvp.invitedBySocialHandle ?? existingUserRsvp.invitedBySocialHandle,
        invitedByUserId: guestRsvp.invitedByUserId ?? existingUserRsvp.invitedByUserId,
        referralCode: guestRsvp.referralCode ?? existingUserRsvp.referralCode,
        referrerUserId: guestRsvp.referrerUserId ?? existingUserRsvp.referrerUserId,
        referrerClerkUserId: guestRsvp.referrerClerkUserId ?? existingUserRsvp.referrerClerkUserId,
        referredByName: guestRsvp.referredByName ?? existingUserRsvp.referredByName,
        status: resolveApprovalStatus(statusSource),
        approvalStatus: resolveApprovalStatus(statusSource),
        attendanceStatus: guestRsvp.attendanceStatus ?? existingUserRsvp.attendanceStatus,
        ticketStatus: statusSource.ticketStatus ?? existingUserRsvp.ticketStatus,
        ticketViewedAt: guestRsvp.ticketViewedAt ?? existingUserRsvp.ticketViewedAt,
        guestPhoneObfuscated:
          guestRsvp.guestPhoneObfuscated ?? existingUserRsvp.guestPhoneObfuscated,
        pairedAt: now,
        updatedAt: now,
      });
      const newExistingUserRsvp = await ctx.db.get(existingUserRsvp._id);
      if (oldExistingUserRsvp && newExistingUserRsvp) {
        await updateRsvpInAggregate(ctx, oldExistingUserRsvp, newExistingUserRsvp);
      }

      const redemption = await moveGuestRsvpDependentRecords(ctx, {
        guestRsvp,
        targetRsvpId: existingUserRsvp._id,
        targetClerkUserId: clerkUserId,
        targetUserId: mergedUser?._id,
        now,
      });

      await ctx.db.delete(guestRsvp._id);
      await deleteRsvpFromAggregate(ctx, guestRsvp);
      await maybeSendPairedApprovalSms(ctx, {
        guestRsvp,
        targetClerkUserId: clerkUserId,
        redemption,
      });
      pairedCount++;
      mergedCount++;
      continue;
    }

    const oldGuestRsvp = await ctx.db.get(guestRsvp._id);
    await ctx.db.patch(guestRsvp._id, {
      clerkUserId,
      userName: resolveUserDisplayName(mergedUser, guestRsvp.userName ?? ""),
      guestPhoneHash: undefined,
      pairedAt: now,
      updatedAt: now,
    });
    const newUserRsvp = await ctx.db.get(guestRsvp._id);
    if (oldGuestRsvp && newUserRsvp) {
      await updateRsvpInAggregate(ctx, oldGuestRsvp, newUserRsvp);
    }

    const redemption = await moveGuestRsvpDependentRecords(ctx, {
      guestRsvp,
      targetRsvpId: guestRsvp._id,
      targetClerkUserId: clerkUserId,
      targetUserId: mergedUser?._id,
      now,
    });
    await maybeSendPairedApprovalSms(ctx, {
      guestRsvp,
      targetClerkUserId: clerkUserId,
      redemption,
    });
    pairedCount++;
  }

  return {
    paired: pairedCount,
    merged: mergedCount,
  } as const;
}

export const claimGuestRsvpsForCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", identity.subject),
      )
      .unique();
    const phoneNumber = identity.phoneNumber ?? user?.phone;
    if (!phoneNumber) {
      return { paired: 0, merged: 0 } as const;
    }

    return await claimGuestRsvpsForPhone(ctx, {
      clerkUserId: identity.subject,
      phoneNumber,
    });
  },
});

export const claimGuestRsvpsForClerkPhoneInternal = internalMutation({
  args: {
    clerkUserId: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, { clerkUserId, phone }) => {
    return await claimGuestRsvpsForPhone(ctx, {
      clerkUserId,
      phoneNumber: phone,
    });
  },
});

/**
 * Internal query to check if a user has consented to SMS for a specific event.
 * Used by SMS infrastructure to verify consent before sending messages.
 * Consent is copied onto an RSVP from the guest's explicit selection or their
 * existing organizer-level preference when they submit that event's RSVP.
 */
export const checkSmsConsentForUserEvent = internalQuery({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, { eventId, clerkUserId }) => {
    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId).eq("clerkUserId", clerkUserId))
      .unique();

    const hasConsented = rsvp?.smsConsent === true;
    return {
      hasConsented,
      consentTimestamp: rsvp?.smsConsentTimestamp ?? null,
      consentIpAddress: rsvp?.smsConsentIpAddress,
      rsvpStatus: rsvp ? resolveApprovalStatus(rsvp) : undefined,
    };
  },
});

export const getApprovedRsvpWithRedemption = internalQuery({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, { eventId, clerkUserId }) => {
    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId).eq("clerkUserId", clerkUserId))
      .unique();

    if (!rsvp || resolveApprovalStatus(rsvp) !== "approved") {
      return null;
    }

    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId).eq("clerkUserId", clerkUserId))
      .unique();

    if (!redemption) {
      return null;
    }

    return {
      rsvpId: rsvp._id,
      listKey: rsvp.listKey,
      shareContact: rsvp.shareContact,
      redemptionCode: redemption.code,
    };
  },
});

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await collectUserSharedEvents(ctx, null);
  },
});

export const listForCurrentUserInWorkspace = query({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceSlug, siteKey }) => {
    if (!workspaceSlug && !siteKey) return [];
    const scope = await resolveTenantWorkspaceScope(ctx, {
      workspaceSlug,
      siteKey,
    });
    if (!scope) return [];
    return await collectUserSharedEvents(ctx, scope);
  },
});

export const smsPreferenceForUserEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const event = await getEventInSiteScope(ctx, eventId, { siteKey });
    if (!event) return null;

    return await resolveSmsOrganizerPreference(ctx, {
      clerkUserId: identity.subject,
      event,
      siteKey,
    });
  },
});

export const smsPreferenceForUserEventByRouteId = query({
  args: {
    eventRouteId: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventRouteId, siteKey, workspaceSlug }) => {
    const resolvedEventRoute: { eventId: Id<"events">; shortId?: string } | null =
      await ctx.runQuery(api.events.resolveRouteId, {
        eventRouteId,
        siteKey,
        workspaceSlug,
      });
    if (!resolvedEventRoute) return null;

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const event = await getEventInSiteScope(ctx, resolvedEventRoute.eventId, {
      siteKey,
      workspaceSlug,
    });
    if (!event) return null;

    return await resolveSmsOrganizerPreference(ctx, {
      clerkUserId: identity.subject,
      event,
      siteKey,
    });
  },
});

async function collectUserSharedEvents(
  ctx: QueryCtx,
  scope: { workspaceSlug: string; siteKey: string | null } | null,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return [];
  const clerkUserId = identity.subject;
  const rsvps = await ctx.db
    .query("rsvps")
    .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
    .order("desc")
    .collect();

  if (rsvps.length === 0) return [];

  const uniqueEventIds = Array.from(new Set(rsvps.map((rsvp) => rsvp.eventId)));
  const eventEntries = await Promise.all(
    uniqueEventIds.map(async (eventId) => ({
      eventId,
      event: await ctx.db.get(eventId),
    })),
  );
  const eventMap = new Map(
    eventEntries.filter((entry) => entry.event).map((entry) => [entry.eventId, entry.event!]),
  );

  const filteredRsvps = scope
    ? rsvps.filter((rsvp) => {
        const event = eventMap.get(rsvp.eventId);
        if (!event) return false;
        return eventMatchesTenantScope(event, scope);
      })
    : rsvps;

  return await Promise.all(
    filteredRsvps.map(async (rsvp) => {
      const event = eventMap.get(rsvp.eventId);
      const customFieldDefinitions = event?.customFields ?? [];
      const customFields = customFieldDefinitions.map((definition) => ({
        key: definition.key,
        label: definition.label,
        value: rsvp.customFieldValues?.[definition.key] ?? "",
        required: definition.required ?? false,
        copyEnabled: definition.copyEnabled ?? false,
        prependUrl: definition.prependUrl ?? "",
        trimWhitespace: definition.trimWhitespace !== false,
      }));
      const socialProfiles = await ctx.db
        .query("rsvpSocialProfiles")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
        .collect();

      return {
        rsvpId: rsvp._id,
        eventId: rsvp.eventId,
        eventName: event?.name ?? "Untitled Event",
        eventSecondaryTitle: event?.secondaryTitle,
        eventDate: event?.eventDate ?? null,
        eventTimezone: event?.eventTimezone,
        eventHostNames: event?.hosts ?? [],
        productionCompany: event?.productionCompany,
        listKey: rsvp.listKey,
        smsConsent: rsvp.smsConsent ?? false,
        shareContact: rsvp.shareContact,
        updatedAt: rsvp.updatedAt,
        customFields,
        socialProfiles: socialProfiles.map((profile) => ({
          platformKey: profile.platformKey,
          handle: profile.handle,
        })),
        invitedByName: rsvp.invitedByName,
      };
    }),
  );
}

export const updateSmsPreference = mutation({
  args: {
    rsvpId: v.optional(v.id("rsvps")),
    smsConsent: v.boolean(),
    applyToAll: v.optional(v.boolean()),
    smsConsentIpAddress: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, smsConsent, applyToAll, smsConsentIpAddress }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;
    const now = Date.now();
    const sanitizedSmsConsentIpAddress =
      smsConsent && typeof smsConsentIpAddress === "string"
        ? smsConsentIpAddress.slice(0, 256)
        : undefined;

    const notificationsByEvent = new Map<Id<"events">, boolean>();
    let updatedCount = 0;

    if (applyToAll || !rsvpId) {
      const rsvps = await ctx.db
        .query("rsvps")
        .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
        .collect();
      for (const rsvp of rsvps) {
        const rsvpSmsConsentIpAddress = smsConsent
          ? (sanitizedSmsConsentIpAddress ?? rsvp.smsConsentIpAddress)
          : rsvp.smsConsentIpAddress;
        await ctx.db.patch(rsvp._id, {
          smsConsent,
          smsConsentTimestamp: now,
          smsConsentIpAddress: rsvpSmsConsentIpAddress,
          updatedAt: now,
        });
        const event = await ctx.db.get(rsvp.eventId);
        if (event) {
          await upsertSmsOrganizerPreference(ctx, {
            clerkUserId,
            event,
            smsConsent,
            smsConsentIpAddress: rsvpSmsConsentIpAddress,
            sourceEventId: rsvp.eventId,
            sourceRsvpId: rsvp._id,
            now,
          });
        }
        if (rsvp.smsConsent !== smsConsent) {
          notificationsByEvent.set(rsvp.eventId, smsConsent);
        }
      }
      updatedCount = rsvps.length;
    } else {
      const rsvp = await ctx.db.get(rsvpId);
      if (!rsvp) throw new NotFoundError("RSVP");
      if (rsvp.clerkUserId !== clerkUserId) throw new Error("Forbidden");
      const event = await ctx.db.get(rsvp.eventId);
      const rsvpSmsConsentIpAddress = smsConsent
        ? (sanitizedSmsConsentIpAddress ?? rsvp.smsConsentIpAddress)
        : rsvp.smsConsentIpAddress;
      if (event) {
        await upsertSmsOrganizerPreference(ctx, {
          clerkUserId,
          event,
          smsConsent,
          smsConsentIpAddress: rsvpSmsConsentIpAddress,
          sourceEventId: rsvp.eventId,
          sourceRsvpId: rsvp._id,
          now,
        });
      }
      if (rsvp.smsConsent === smsConsent) return { updated: 0 };

      await ctx.db.patch(rsvpId, {
        smsConsent,
        smsConsentTimestamp: now,
        smsConsentIpAddress: rsvpSmsConsentIpAddress,
        updatedAt: now,
      });
      notificationsByEvent.set(rsvp.eventId, smsConsent);
      updatedCount = 1;
    }

    if (notificationsByEvent.size > 0) {
      await Promise.all(
        Array.from(notificationsByEvent.entries()).map(([eventId, consentEnabled]) =>
          ctx.scheduler.runAfter(0, api.notifications.sendSmsConsentStatusMessage, {
            eventId,
            clerkUserId,
            consentEnabled,
          }),
        ),
      );
    }

    return { updated: updatedCount };
  },
});

export const updateSharedFields = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    fields: v.record(v.string(), v.string()),
  },
  handler: async (ctx, { rsvpId, fields }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new NotFoundError("RSVP");
    if (rsvp.clerkUserId !== clerkUserId) throw new Error("Forbidden");

    const event = await ctx.db.get(rsvp.eventId);
    if (!event) throw new NotFoundError("Event");

    const fieldDefinitions = new Map(
      (event.customFields ?? []).map((definition) => [definition.key, definition]),
    );

    const nextValues: Record<string, string> = {
      ...(rsvp.customFieldValues ?? {}),
    };

    for (const [fieldKey, rawValue] of Object.entries(fields)) {
      const definition = fieldDefinitions.get(fieldKey);
      if (!definition) continue;
      const stringValue = typeof rawValue === "string" ? rawValue : `${rawValue ?? ""}`;
      const finalValue = definition.trimWhitespace === false ? stringValue : stringValue.trim();
      if (finalValue) {
        nextValues[fieldKey] = finalValue;
      } else {
        delete nextValues[fieldKey];
      }
    }

    await ctx.db.patch(rsvpId, {
      customFieldValues: Object.keys(nextValues).length > 0 ? nextValues : undefined,
      updatedAt: Date.now(),
    });

    return {
      ok: true as const,
      customFieldValues: Object.keys(nextValues).length > 0 ? nextValues : undefined,
    };
  },
});

export const updateSharedPrimaryFields = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    socialProfiles: v.optional(v.array(submittedSocialProfileValidator)),
    invitedByName: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, socialProfiles, invitedByName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new NotFoundError("RSVP");
    if (rsvp.clerkUserId !== clerkUserId) throw new Error("Forbidden");

    const event = await ctx.db.get(rsvp.eventId);
    if (!event) throw new NotFoundError("Event");

    const primaryFieldConfig = event.primaryFieldConfig;
    const configuredSocialPlatformKeys = new Set(
      (primaryFieldConfig?.socialPlatforms ?? []).map((platform) => platform.platformKey),
    );
    const sanitizedSocialProfiles =
      socialProfiles === undefined
        ? []
        : sanitizeSubmittedSocialProfiles(socialProfiles, primaryFieldConfig);
    if (socialProfiles !== undefined || invitedByName !== undefined) {
      assertRequiredPrimaryFieldValues({
        primaryFieldConfig:
          socialProfiles === undefined
            ? {
                invitedBy: primaryFieldConfig?.invitedBy,
              }
            : invitedByName === undefined
              ? {
                  socialPlatforms: primaryFieldConfig?.socialPlatforms,
                }
              : primaryFieldConfig,
        submittedProfiles: sanitizedSocialProfiles,
        invitedByName,
      });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
      .unique();

    if (socialProfiles !== undefined && configuredSocialPlatformKeys.size > 0) {
      await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
        event,
        rsvpId,
        clerkUserId,
        userId: user?._id,
        submittedProfiles: sanitizedSocialProfiles,
      });
      await replaceRsvpSocialProfileSnapshots(ctx, {
        eventId: rsvp.eventId,
        rsvpId,
        clerkUserId,
        userId: user?._id,
        configuredPlatformKeys: configuredSocialPlatformKeys,
        submittedProfiles: sanitizedSocialProfiles,
      });
    }

    if (primaryFieldConfig?.invitedBy?.enabled === true && invitedByName !== undefined) {
      await ctx.db.patch(rsvpId, {
        ...buildInvitedByPatch(invitedByName),
        updatedAt: Date.now(),
      });
    }

    return { ok: true as const };
  },
});

export const listForEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { eventId, siteKey, workspaceSlug },
  ): Promise<
    Array<{
      id: Id<"rsvps">;
      clerkUserId: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      listKey: string;
      note?: string;
      status: string;
      approvalStatus: ApprovalStatus;
      attendanceStatus: AttendanceStatus;
      ticketViewedAt?: number;
      attendees?: number;
      contact?: { email?: string; phone?: string };
      socialProfiles: Array<{
        platformKey: string;
        handle: string;
        normalizedHandle: string;
      }>;
      invitedByName?: string;
      invitedByNormalizedName?: string;
      invitedBySocialPlatformKey?: string;
      invitedBySocialHandle?: string;
      referralCode?: string;
      referrerUserId?: Id<"users">;
      referrerClerkUserId?: string;
      referredByName?: string;
      redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
      redemptionCode?: string;
      createdAt: number;
    }>
  > => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const rows = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const enriched = await Promise.all(
      rows.map(
        async (
          r,
        ): Promise<{
          id: Id<"rsvps">;
          clerkUserId: string;
          name?: string;
          firstName?: string;
          lastName?: string;
          listKey: string;
          note?: string;
          status: string;
          approvalStatus: ApprovalStatus;
          attendanceStatus: AttendanceStatus;
          ticketViewedAt?: number;
          attendees?: number;
          contact?: { email?: string; phone?: string };
          customFieldValues?: Record<string, string>;
          socialProfiles: Array<{
            platformKey: string;
            handle: string;
            normalizedHandle: string;
          }>;
          invitedByName?: string;
          invitedByNormalizedName?: string;
          invitedBySocialPlatformKey?: string;
          invitedBySocialHandle?: string;
          referralCode?: string;
          referrerUserId?: Id<"users">;
          referrerClerkUserId?: string;
          referredByName?: string;
          redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
          redemptionCode?: string;
          createdAt: number;
        }> => {
          // Look up user's display name
          const user = await ctx.db
            .query("users")
            .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", r.clerkUserId))
            .unique();
          // User name constructed from firstName/lastName in display logic
          const firstName = user?.firstName || (r.userName ? r.userName.split(" ")[0] : undefined);
          const lastName =
            user?.lastName || (r.userName ? r.userName.split(" ").slice(1).join(" ") : undefined);
          const name = [firstName, lastName].filter(Boolean).join(" ") || r.userName || undefined;
          // Redemption info for this user+event
          const redemption = await ctx.db
            .query("redemptions")
            .withIndex("by_event_user", (q) =>
              q.eq("eventId", eventId).eq("clerkUserId", r.clerkUserId),
            )
            .unique();
          let redemptionStatus: "none" | "issued" | "redeemed" | "disabled" = "none";
          if (redemption) {
            if (redemption.disabledAt) redemptionStatus = "disabled";
            else if (redemption.redeemedAt) redemptionStatus = "redeemed";
            else redemptionStatus = "issued";
          }
          let contact: { email?: string; phone?: string } | undefined;
          if (r.shareContact) {
            const prof: {
              hasEmail: boolean;
              hasPhone: boolean;
              emailObfuscated?: string;
              phoneObfuscated?: string;
            } | null = await ctx.runQuery(api.profiles.getForClerk, {
              clerkUserId: r.clerkUserId,
            });
            if (prof) {
              contact = {
                email: prof.emailObfuscated,
                phone: prof.phoneObfuscated ?? r.guestPhoneObfuscated,
              };
            } else if (r.guestPhoneObfuscated) {
              contact = {
                phone: r.guestPhoneObfuscated,
              };
            }
          }
          const socialProfiles = await ctx.db
            .query("rsvpSocialProfiles")
            .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", r._id))
            .collect();
          return {
            id: r._id,
            clerkUserId: r.clerkUserId,
            name,
            firstName,
            lastName,
            listKey: r.listKey,
            note: r.note,
            status: sanitizeStatus(r.status),
            approvalStatus: resolveApprovalStatus(r),
            attendanceStatus: sanitizeAttendanceStatus(r.attendanceStatus),
            ticketViewedAt: r.ticketViewedAt,
            attendees: r.attendees,
            contact,
            customFieldValues: r.customFieldValues ?? undefined,
            socialProfiles: socialProfiles.map((profile) => ({
              platformKey: profile.platformKey,
              handle: profile.handle,
              normalizedHandle: profile.normalizedHandle,
            })),
            invitedByName: r.invitedByName,
            invitedByNormalizedName: r.invitedByNormalizedName,
            invitedBySocialPlatformKey: r.invitedBySocialPlatformKey,
            invitedBySocialHandle: r.invitedBySocialHandle,
            referralCode: r.referralCode,
            referrerUserId: r.referrerUserId,
            referrerClerkUserId: r.referrerClerkUserId,
            referredByName: r.referredByName,
            redemptionStatus,
            redemptionCode: redemption?.code,
            createdAt: r.createdAt,
          };
        },
      ),
    );

    return enriched;
  },
});

// Count query for filtered RSVPs using aggregate
export const countForEventFiltered = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    approvalFilter: v.optional(
      v.union(v.literal("all"), v.literal("pending"), v.literal("approved"), v.literal("denied")),
    ),
    listFilter: v.optional(v.string()),
    guestSearch: v.optional(v.string()),
    redemptionFilter: v.optional(v.string()),
    socialPlatformFilter: v.optional(v.string()),
    socialSearch: v.optional(v.string()),
    invitedBySearch: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      eventId,
      siteKey,
      workspaceSlug,
      approvalFilter = "all",
      listFilter = "all",
      guestSearch = "",
      redemptionFilter = "all",
      socialPlatformFilter = "all",
      socialSearch = "",
      invitedBySearch = "",
    },
  ) => {
    await requireWorkspaceRead(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const ticketStatusFilter = normalizeTicketStatusFilter(redemptionFilter);

    const needsPrimaryFieldFiltering =
      socialPlatformFilter !== "all" ||
      socialSearch.trim().length > 0 ||
      invitedBySearch.trim().length > 0;

    if (
      filtersRequireDirectRsvpCount({ guestSearch, ticketStatusFilter }) ||
      needsPrimaryFieldFiltering
    ) {
      let matchingRsvps = await collectRsvpsMatchingFilters(ctx, {
        eventId,
        guestSearch: "",
        approvalFilter,
        listFilter,
        ticketStatusFilter,
      });
      matchingRsvps = await filterRsvpsByPrimaryFields(ctx, matchingRsvps, {
        unifiedSearch: guestSearch,
        socialPlatformFilter,
        socialSearch,
        invitedBySearch,
      });

      return matchingRsvps.length;
    }

    // Use aggregate for efficient counting
    return countRsvpsWithAggregate(ctx, eventId, approvalFilter, listFilter);
  },
});

async function filterRsvpsByPrimaryFields(
  ctx: QueryCtx,
  rsvps: Array<Doc<"rsvps">>,
  {
    unifiedSearch = "",
    socialPlatformFilter = "all",
    socialSearch = "",
    invitedBySearch = "",
  }: {
    unifiedSearch?: string;
    socialPlatformFilter?: string;
    socialSearch?: string;
    invitedBySearch?: string;
  },
): Promise<Array<Doc<"rsvps">>> {
  const normalizedSocialPlatformFilter =
    socialPlatformFilter === "all" ? "all" : normalizeSocialPlatformKey(socialPlatformFilter);
  const unifiedSearchTerms = buildRsvpFuzzySearchTerms(unifiedSearch);
  const socialSearchTerms = buildRsvpFuzzySearchTerms(socialSearch);
  const invitedBySearchTerms = buildRsvpFuzzySearchTerms(invitedBySearch);

  if (
    normalizedSocialPlatformFilter === "all" &&
    unifiedSearchTerms.length === 0 &&
    socialSearchTerms.length === 0 &&
    invitedBySearchTerms.length === 0
  ) {
    return rsvps;
  }

  const filteredRsvps: Array<Doc<"rsvps">> = [];
  for (const rsvp of rsvps) {
    if (invitedBySearchTerms.length > 0) {
      if (
        !fieldValuesMatchRsvpFuzzySearchTerms(
          [rsvp.invitedByNormalizedName, rsvp.invitedByName],
          invitedBySearchTerms,
        )
      ) {
        continue;
      }
    }

    let socialProfiles: Array<Doc<"rsvpSocialProfiles">> | null = null;
    const getSocialProfiles = async () => {
      if (socialProfiles) {
        return socialProfiles;
      }
      socialProfiles = await ctx.db
        .query("rsvpSocialProfiles")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
        .collect();
      return socialProfiles;
    };

    if (normalizedSocialPlatformFilter !== "all" || socialSearchTerms.length > 0) {
      const profilesForFilter = await getSocialProfiles();
      const matchingSocialProfiles = profilesForFilter.filter((profile) => {
        if (
          normalizedSocialPlatformFilter !== "all" &&
          profile.platformKey !== normalizedSocialPlatformFilter
        ) {
          return false;
        }
        if (
          socialSearchTerms.length > 0 &&
          !fieldValuesMatchRsvpFuzzySearchTerms(
            [profile.normalizedHandle, profile.handle],
            socialSearchTerms,
          )
        ) {
          return false;
        }
        return true;
      });

      if (matchingSocialProfiles.length === 0) {
        continue;
      }
    }

    if (unifiedSearchTerms.length > 0) {
      const rsvpTextMatches = fieldValuesMatchRsvpFuzzySearchTerms(
        [
          rsvp.userName,
          rsvp.invitedByNormalizedName,
          rsvp.invitedByName,
          rsvp.invitedBySocialHandle,
        ],
        unifiedSearchTerms,
      );

      if (!rsvpTextMatches) {
        const profilesForSearch = (await getSocialProfiles()).filter(
          (profile) =>
            normalizedSocialPlatformFilter === "all" ||
            profile.platformKey === normalizedSocialPlatformFilter,
        );
        const socialProfileMatches = profilesForSearch.some((profile) =>
          fieldValuesMatchRsvpFuzzySearchTerms(
            [profile.normalizedHandle, profile.handle],
            unifiedSearchTerms,
          ),
        );

        if (!socialProfileMatches) {
          continue;
        }
      }
    }

    filteredRsvps.push(rsvp);
  }

  return filteredRsvps;
}

// Type definitions for enriched RSVP data
type EnrichedRsvp = {
  id: Id<"rsvps">;
  userId?: Id<"users">;
  clerkUserId: string;
  name: string;
  firstName: string;
  lastName: string;
  listKey: string;
  note?: string;
  status: ValidRsvpStatus;
  approvalStatus: ApprovalStatus;
  attendanceStatus: AttendanceStatus;
  ticketViewedAt?: number;
  ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed";
  attendees?: number;
  contact?: {
    email?: string;
    phone?: string;
  };
  customFieldValues: Record<string, string> | undefined;
  socialProfiles: Array<{
    platformKey: string;
    handle: string;
    normalizedHandle: string;
  }>;
  invitedByName?: string;
  invitedByNormalizedName?: string;
  invitedBySocialPlatformKey?: string;
  invitedBySocialHandle?: string;
  referralCode?: string;
  referrerUserId?: Id<"users">;
  referrerClerkUserId?: string;
  referredByName?: string;
  redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
  redemptionCode?: string;
  createdAt: number;
  updatedAt: number;
};

type PaginatedRsvpResult = {
  page: EnrichedRsvp[];
  nextCursor: string | null;
  isDone: boolean;
};

async function enrichSelectedHostRsvps(
  ctx: QueryCtx,
  eventId: Id<"events">,
  rsvpsToEnrich: Array<Doc<"rsvps">>,
): Promise<EnrichedRsvp[]> {
  const userClerkIds = Array.from(
    new Set(rsvpsToEnrich.map((rsvpRecord) => rsvpRecord.clerkUserId)),
  );
  const users = await Promise.all(
    userClerkIds.map(async (clerkUserId) =>
      ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
        .unique(),
    ),
  );
  const userMap = Object.fromEntries(
    users
      .filter((userRecord): userRecord is Doc<"users"> => userRecord !== null)
      .map((userRecord) => [userRecord.clerkUserId, userRecord]),
  );

  const rsvpsNeedingRedemption = rsvpsToEnrich.filter(
    (rsvpRecord) =>
      ((rsvpRecord.ticketStatus as string | undefined) ?? "not-issued") !== "not-issued",
  );
  const redemptions = await Promise.all(
    rsvpsNeedingRedemption.map(async (rsvpRecord) =>
      ctx.db
        .query("redemptions")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", eventId).eq("clerkUserId", rsvpRecord.clerkUserId),
        )
        .unique(),
    ),
  );
  const redemptionMap = Object.fromEntries(
    redemptions
      .filter(
        (redemptionRecord): redemptionRecord is Doc<"redemptions"> => redemptionRecord !== null,
      )
      .map((redemptionRecord) => [redemptionRecord.clerkUserId, redemptionRecord]),
  );

  const socialProfileEntries = await Promise.all(
    rsvpsToEnrich.map(async (rsvpRecord) => ({
      rsvpId: rsvpRecord._id,
      profiles: await ctx.db
        .query("rsvpSocialProfiles")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpRecord._id))
        .collect(),
    })),
  );
  const socialProfilesByRsvpId = new Map(
    socialProfileEntries.map((entry) => [entry.rsvpId, entry.profiles]),
  );

  return rsvpsToEnrich.map((rsvpRecord) => {
    const redemption = redemptionMap[rsvpRecord.clerkUserId];
    const ticketStatus =
      (rsvpRecord.ticketStatus as "not-issued" | "issued" | "disabled" | "redeemed") ??
      "not-issued";
    let redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
    switch (ticketStatus) {
      case "issued":
        redemptionStatus = "issued";
        break;
      case "disabled":
        redemptionStatus = "disabled";
        break;
      case "redeemed":
        redemptionStatus = "redeemed";
        break;
      case "not-issued":
      default:
        redemptionStatus = "none";
        break;
    }

    const user = userMap[rsvpRecord.clerkUserId];
    const customFieldValues = rsvpRecord.customFieldValues ?? ({} as Record<string, string>);
    const socialProfiles = socialProfilesByRsvpId.get(rsvpRecord._id) ?? [];

    return {
      id: rsvpRecord._id,
      userId: user?._id,
      clerkUserId: rsvpRecord.clerkUserId,
      name:
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        user?.metadata?.name ||
        rsvpRecord.userName ||
        "",
      firstName: user?.firstName || (rsvpRecord.userName ? rsvpRecord.userName.split(" ")[0] : ""),
      lastName:
        user?.lastName ||
        (rsvpRecord.userName ? rsvpRecord.userName.split(" ").slice(1).join(" ") : ""),
      listKey: rsvpRecord.listKey || "",
      note: rsvpRecord.note,
      status: resolveApprovalStatus(rsvpRecord),
      approvalStatus: resolveApprovalStatus(rsvpRecord),
      attendanceStatus: sanitizeAttendanceStatus(rsvpRecord.attendanceStatus),
      ticketViewedAt: rsvpRecord.ticketViewedAt,
      ticketStatus,
      attendees: rsvpRecord.attendees,
      contact: rsvpRecord.shareContact
        ? {
            email: undefined,
            phone: rsvpRecord.guestPhoneObfuscated,
          }
        : undefined,
      customFieldValues,
      socialProfiles: socialProfiles.map((profile) => ({
        platformKey: profile.platformKey,
        handle: profile.handle,
        normalizedHandle: profile.normalizedHandle,
      })),
      invitedByName: rsvpRecord.invitedByName,
      invitedByNormalizedName: rsvpRecord.invitedByNormalizedName,
      invitedBySocialPlatformKey: rsvpRecord.invitedBySocialPlatformKey,
      invitedBySocialHandle: rsvpRecord.invitedBySocialHandle,
      referralCode: rsvpRecord.referralCode,
      referrerUserId: rsvpRecord.referrerUserId,
      referrerClerkUserId: rsvpRecord.referrerClerkUserId,
      referredByName: rsvpRecord.referredByName,
      redemptionStatus,
      redemptionCode: redemption?.code,
      createdAt: rsvpRecord.createdAt,
      updatedAt: rsvpRecord.updatedAt ?? rsvpRecord.createdAt,
      smsConsent: rsvpRecord.smsConsent ?? undefined,
    };
  });
}

export const listReviewFeedForEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    rsvpIds: v.array(v.id("rsvps")),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug, rsvpIds }): Promise<EnrichedRsvp[]> => {
    await requireWorkspaceRead(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const orderedUniqueRsvpIds: Array<Id<"rsvps">> = [];
    const seenRsvpIds = new Set<string>();
    for (const rsvpId of rsvpIds) {
      if (seenRsvpIds.has(rsvpId)) {
        continue;
      }
      seenRsvpIds.add(rsvpId);
      orderedUniqueRsvpIds.push(rsvpId);
    }

    const rsvpEntries = await Promise.all(
      orderedUniqueRsvpIds.map(async (rsvpId) => ({
        rsvpId,
        rsvp: await ctx.db.get(rsvpId),
      })),
    );
    const rsvpRecordsById = new Map(
      rsvpEntries
        .filter(
          (entry): entry is { rsvpId: Id<"rsvps">; rsvp: Doc<"rsvps"> } =>
            entry.rsvp !== null && entry.rsvp.eventId === eventId,
        )
        .map((entry) => [entry.rsvpId, entry.rsvp]),
    );
    const orderedRsvps = orderedUniqueRsvpIds
      .map((rsvpId) => rsvpRecordsById.get(rsvpId))
      .filter((rsvpRecord): rsvpRecord is Doc<"rsvps"> => rsvpRecord !== undefined);

    return await enrichSelectedHostRsvps(ctx, eventId, orderedRsvps);
  },
});

export const listForEventPaginated = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    guestSearch: v.optional(v.string()),
    approvalFilter: v.optional(
      v.union(v.literal("all"), v.literal("pending"), v.literal("approved"), v.literal("denied")),
    ),
    listFilter: v.optional(v.string()), // Filter by list key
    redemptionFilter: v.optional(v.string()),
    socialPlatformFilter: v.optional(v.string()),
    socialSearch: v.optional(v.string()),
    invitedBySearch: v.optional(v.string()),
    sortBy: v.optional(v.string()),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (
    ctx,
    {
      eventId,
      siteKey,
      workspaceSlug,
      cursor,
      pageSize = 20,
      guestSearch = "",
      approvalFilter = "all",
      listFilter = "all",
      redemptionFilter = "all",
      socialPlatformFilter = "all",
      socialSearch = "",
      invitedBySearch = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    },
  ): Promise<PaginatedRsvpResult> => {
    // Debug logging for sorting
    console.log(
      `[RSVP_PAGINATED] Sort params: sortBy=${sortBy}, sortOrder=${sortOrder}, search="${guestSearch}", filters: approval=${approvalFilter}, list=${listFilter}, redemption=${redemptionFilter}`,
    );

    const ticketStatusFilter = normalizeTicketStatusFilter(redemptionFilter);

    // Fetch event once since all RSVPs are for the same event
    await requireWorkspaceRead(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    // For proper global sorting, we need to fetch all matching records, sort them, then paginate
    // This is necessary because Convex's .order() on an index only reverses index order,
    // not by createdAt or other fields. Cursor pagination requires consistent ordering.
    let allMatchingRsvps = await collectRsvpsMatchingFilters(ctx, {
      eventId,
      guestSearch: "",
      approvalFilter,
      listFilter,
      ticketStatusFilter,
    });
    allMatchingRsvps = await filterRsvpsByPrimaryFields(ctx, allMatchingRsvps, {
      unifiedSearch: guestSearch,
      socialPlatformFilter,
      socialSearch,
      invitedBySearch,
    });

    console.log(`[RSVP_PAGINATED] Fetched ${allMatchingRsvps.length} matching RSVPs for sorting`);

    // Sort all matching RSVPs before pagination
    // For fields that require enrichment (name, firstName, lastName), we'll sort after enrichment
    // For fields on the RSVP document directly, we can sort before enrichment
    const needsEnrichmentForSort =
      sortBy === "name" ||
      sortBy === "firstName" ||
      sortBy === "lastName" ||
      sortBy === "invitedByName" ||
      sortBy.startsWith("social:");

    if (!needsEnrichmentForSort) {
      // Sort before enrichment for better performance
      allMatchingRsvps.sort((a: Doc<"rsvps">, b: Doc<"rsvps">) => {
        let comparison = 0;
        const directionMultiplier = sortOrder === "asc" ? 1 : -1;

        switch (sortBy) {
          case "updatedAt":
            comparison = (a.updatedAt ?? a.createdAt) - (b.updatedAt ?? b.createdAt);
            break;
          case "createdAt":
            comparison = a.createdAt - b.createdAt;
            break;
          case "approvalStatus":
          case "status":
            comparison = resolveApprovalStatus(a).localeCompare(resolveApprovalStatus(b));
            break;
          case "attendanceStatus":
            comparison = sanitizeAttendanceStatus(a.attendanceStatus).localeCompare(
              sanitizeAttendanceStatus(b.attendanceStatus),
            );
            break;
          case "ticketViewedAt":
            comparison = (a.ticketViewedAt ?? 0) - (b.ticketViewedAt ?? 0);
            break;
          case "ticketStatus": {
            const aTicketStatus = (a.ticketStatus as string | undefined) ?? "not-issued";
            const bTicketStatus = (b.ticketStatus as string | undefined) ?? "not-issued";
            comparison = aTicketStatus.localeCompare(bTicketStatus);
            break;
          }
          case "listKey":
            comparison = (a.listKey || "").localeCompare(b.listKey || "");
            break;
          case "attendees":
            comparison = (a.attendees ?? 0) - (b.attendees ?? 0);
            break;
          case "invitedByName":
            comparison = (a.invitedByName ?? "").localeCompare(b.invitedByName ?? "");
            break;
          case "referredByName":
            comparison = (a.referredByName ?? "").localeCompare(b.referredByName ?? "");
            break;
          default:
            // Fallback to createdAt
            comparison = a.createdAt - b.createdAt;
            break;
        }

        // If values are equal, use createdAt as tiebreaker
        if (comparison === 0) {
          comparison = a.createdAt - b.createdAt;
        }

        return directionMultiplier * comparison;
      });

      console.log(
        `[RSVP_PAGINATED] Pre-sorted ${allMatchingRsvps.length} RSVPs by ${sortBy} ${sortOrder}`,
      );
    }

    // Manual pagination - we'll sort after enrichment if needed
    const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
    const startIndex = cursorIndex;
    const endIndex = startIndex + pageSize;
    const paginatedRsvps = needsEnrichmentForSort
      ? allMatchingRsvps // Will sort after enrichment
      : allMatchingRsvps.slice(startIndex, endIndex); // Pre-sorted, can paginate now
    const nextCursor = needsEnrichmentForSort
      ? null // Will be set after enrichment and sorting
      : endIndex < allMatchingRsvps.length
        ? String(endIndex)
        : null;
    const isDone = needsEnrichmentForSort
      ? false // Will be set after enrichment and sorting
      : endIndex >= allMatchingRsvps.length;

    // Batch fetch related data to avoid N+1 queries
    // Note: credentialId field has been removed from schema
    // We'll handle credential lookups via listKey when needed

    // Batch fetch user data for metadata (custom fields)
    // For name-based sorting, we need to fetch all users to sort properly
    const rsvpsToEnrich = needsEnrichmentForSort ? allMatchingRsvps : paginatedRsvps;
    const userClerkIds = [
      ...new Set(rsvpsToEnrich.map((r: Doc<"rsvps">) => r.clerkUserId)),
    ] as string[];
    const users = await Promise.all(
      userClerkIds.map(async (clerkUserId: string) =>
        ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (query) => query.eq("clerkUserId", clerkUserId))
          .unique(),
      ),
    );
    const userMap = Object.fromEntries(users.filter((u) => u).map((u) => [u!.clerkUserId, u]));

    // Batch fetch redemption data only for RSVPs with active codes
    const rsvpsNeedingRedemption = rsvpsToEnrich.filter(
      (rsvp: Doc<"rsvps">) =>
        ((rsvp.ticketStatus as string | undefined) ?? "not-issued") !== "not-issued",
    );
    const redemptions = await Promise.all(
      rsvpsNeedingRedemption.map(async (rsvp: Doc<"rsvps">) =>
        ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique(),
      ),
    );
    const redemptionMap = Object.fromEntries(
      redemptions.filter((r) => r).map((r) => [r!.clerkUserId, r]),
    );

    const socialProfileEntries = await Promise.all(
      rsvpsToEnrich.map(async (rsvp: Doc<"rsvps">) => ({
        rsvpId: rsvp._id,
        profiles: await ctx.db
          .query("rsvpSocialProfiles")
          .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
          .collect(),
      })),
    );
    const socialProfilesByRsvpId = new Map(
      socialProfileEntries.map((entry) => [entry.rsvpId, entry.profiles]),
    );

    // Enrich with batched data (avoid N+1 queries)
    let enrichedPage = rsvpsToEnrich.map((rsvp: Doc<"rsvps">) => {
      const redemption = redemptionMap[rsvp.clerkUserId];
      const ticketStatus =
        (rsvp.ticketStatus as "not-issued" | "issued" | "disabled" | "redeemed") ?? "not-issued";
      let redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
      switch (ticketStatus) {
        case "issued":
          redemptionStatus = "issued";
          break;
        case "disabled":
          redemptionStatus = "disabled";
          break;
        case "redeemed":
          redemptionStatus = "redeemed";
          break;
        case "not-issued":
        default:
          redemptionStatus = "none";
          break;
      }

      // credentialId field has been removed from schema
      // Credential lookups now use listKey only
      const user = userMap[rsvp.clerkUserId];

      // Ensure customFieldValues is always included in the response
      // Return empty object instead of undefined to ensure the field is always present
      // This ensures consistency when using search queries vs regular queries
      const customFieldValues = rsvp.customFieldValues ?? ({} as Record<string, string>);
      const socialProfiles = socialProfilesByRsvpId.get(rsvp._id) ?? [];

      return {
        id: rsvp._id,
        clerkUserId: rsvp.clerkUserId,
        name:
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.name ||
          rsvp.userName ||
          "", // PRIORITY: users table (fresh data) → rsvp.userName (fallback)
        firstName: user?.firstName || (rsvp.userName ? rsvp.userName.split(" ")[0] : ""),
        lastName:
          user?.lastName || (rsvp.userName ? rsvp.userName.split(" ").slice(1).join(" ") : ""),
        listKey: rsvp.listKey || "",
        note: rsvp.note,
        status: resolveApprovalStatus(rsvp),
        approvalStatus: resolveApprovalStatus(rsvp),
        attendanceStatus: sanitizeAttendanceStatus(rsvp.attendanceStatus),
        ticketViewedAt: rsvp.ticketViewedAt,
        ticketStatus,
        attendees: rsvp.attendees,
        contact: rsvp.shareContact
          ? {
              email: undefined,
              phone: rsvp.guestPhoneObfuscated,
            }
          : undefined,
        customFieldValues,
        socialProfiles: socialProfiles.map((profile) => ({
          platformKey: profile.platformKey,
          handle: profile.handle,
          normalizedHandle: profile.normalizedHandle,
        })),
        invitedByName: rsvp.invitedByName,
        invitedByNormalizedName: rsvp.invitedByNormalizedName,
        invitedBySocialPlatformKey: rsvp.invitedBySocialPlatformKey,
        invitedBySocialHandle: rsvp.invitedBySocialHandle,
        referralCode: rsvp.referralCode,
        referrerUserId: rsvp.referrerUserId,
        referrerClerkUserId: rsvp.referrerClerkUserId,
        referredByName: rsvp.referredByName,
        redemptionStatus,
        redemptionCode: redemption?.code,
        createdAt: rsvp.createdAt,
        updatedAt: rsvp.updatedAt ?? rsvp.createdAt,
        smsConsent: rsvp.smsConsent ?? undefined,
      };
    });

    // Note: Sorting is already done before pagination above for most fields
    // For name-based sorting, sort after enrichment, then paginate
    if (needsEnrichmentForSort) {
      enrichedPage.sort((a: EnrichedRsvp, b: EnrichedRsvp) => {
        let comparison = 0;
        const directionMultiplier = sortOrder === "asc" ? 1 : -1;

        switch (sortBy) {
          case "name":
            comparison = (a.name || "").localeCompare(b.name || "");
            break;
          case "firstName":
            comparison = (a.firstName || "").localeCompare(b.firstName || "");
            break;
          case "lastName":
            comparison = (a.lastName || "").localeCompare(b.lastName || "");
            break;
          case "invitedByName":
            comparison = (a.invitedByName || "").localeCompare(b.invitedByName || "");
            break;
          default:
            if (sortBy.startsWith("social:")) {
              const platformKey = normalizeSocialPlatformKey(sortBy.slice("social:".length));
              const leftHandle =
                a.socialProfiles.find((profile) => profile.platformKey === platformKey)?.handle ??
                "";
              const rightHandle =
                b.socialProfiles.find((profile) => profile.platformKey === platformKey)?.handle ??
                "";
              comparison = leftHandle.localeCompare(rightHandle);
            } else {
              comparison = a.createdAt - b.createdAt;
            }
            break;
        }

        // If values are equal, use createdAt as tiebreaker
        if (comparison === 0) {
          comparison = a.createdAt - b.createdAt;
        }

        return directionMultiplier * comparison;
      });

      console.log(
        `[RSVP_PAGINATED] Post-enrichment sorted ${enrichedPage.length} RSVPs by ${sortBy} ${sortOrder}`,
      );

      // Now paginate after sorting
      const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
      const startIndex = cursorIndex;
      const endIndex = startIndex + pageSize;
      enrichedPage = enrichedPage.slice(startIndex, endIndex);
      const finalNextCursor = endIndex < allMatchingRsvps.length ? String(endIndex) : null;
      const finalIsDone = endIndex >= allMatchingRsvps.length;

      return {
        page: enrichedPage,
        nextCursor: finalNextCursor,
        isDone: finalIsDone,
      };
    }

    // For non-enrichment sorts, enriched page already maintains sort order from pre-sorted paginatedRsvps
    return {
      page: enrichedPage,
      nextCursor,
      isDone,
    };
  },
});

export const statusForUserEvent = query({
  args: { eventId: v.id("events"), siteKey: v.optional(v.string()) },
  handler: async (ctx, { eventId, siteKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const event = await getEventInSiteScope(ctx, eventId, { siteKey });
    if (!event) return null;
    const clerkUserId = identity.subject;
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (query) => query.eq("eventId", eventId))
      .filter((query) => query.eq(query.field("clerkUserId"), clerkUserId))
      .collect();
    if (rsvps.length === 0) return null;

    const chosen = selectPrimaryRsvp(rsvps);

    const listCredential = await resolveListCredential(ctx, eventId, chosen);
    const socialProfiles = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", chosen._id))
      .collect();

    return {
      rsvpId: chosen._id,
      listKey: chosen.listKey,
      status: resolveApprovalStatus(chosen),
      approvalStatus: resolveApprovalStatus(chosen),
      attendanceStatus: sanitizeAttendanceStatus(chosen.attendanceStatus),
      ticketViewedAt: chosen.ticketViewedAt,
      shareContact: chosen.shareContact,
      customFieldValues: chosen.customFieldValues ?? undefined,
      socialProfiles: socialProfiles.map((profile) => ({
        platformKey: profile.platformKey,
        handle: profile.handle,
      })),
      invitedByName: chosen.invitedByName,
      smsConsent: chosen.smsConsent ?? false,
      smsConsentIpAddress: chosen.smsConsentIpAddress ?? undefined,
      generateQR: listCredential?.generateQR ?? false,
    } as const;
  },
});

export const statusForUserEventServer = query({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, clerkUserId, siteKey }) => {
    const event = await getEventInSiteScope(ctx, eventId, { siteKey });
    if (!event) return null;
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (query) => query.eq("eventId", eventId))
      .filter((query) => query.eq(query.field("clerkUserId"), clerkUserId))
      .collect();
    if (rsvps.length === 0) return null;

    const chosen = selectPrimaryRsvp(rsvps);

    const redemptionInfo = await resolveRedemption(ctx, eventId, clerkUserId, chosen);
    const socialProfiles = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", chosen._id))
      .collect();

    return {
      rsvpId: chosen._id,
      listKey: chosen.listKey,
      status: resolveApprovalStatus(chosen),
      approvalStatus: resolveApprovalStatus(chosen),
      attendanceStatus: sanitizeAttendanceStatus(chosen.attendanceStatus),
      ticketViewedAt: chosen.ticketViewedAt,
      shareContact: chosen.shareContact,
      customFieldValues: chosen.customFieldValues ?? undefined,
      socialProfiles: socialProfiles.map((profile) => ({
        platformKey: profile.platformKey,
        handle: profile.handle,
      })),
      invitedByName: chosen.invitedByName,
      smsConsent: chosen.smsConsent ?? false,
      redemption: redemptionInfo,
    } as const;
  },
});

export const statusForUserEventByRouteId = query({
  args: {
    eventRouteId: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventRouteId, siteKey, workspaceSlug }) => {
    const resolvedEventRoute: { eventId: Id<"events">; shortId?: string } | null =
      await ctx.runQuery(api.events.resolveRouteId, {
        eventRouteId,
        siteKey,
        workspaceSlug,
      });
    if (!resolvedEventRoute) return null;

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const event = await getEventInSiteScope(ctx, resolvedEventRoute.eventId, { siteKey });
    if (!event) return null;
    const clerkUserId = identity.subject;
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (query) => query.eq("eventId", resolvedEventRoute.eventId))
      .filter((query) => query.eq(query.field("clerkUserId"), clerkUserId))
      .collect();
    if (rsvps.length === 0) return null;

    const chosen = selectPrimaryRsvp(rsvps);

    const listCredential = await resolveListCredential(ctx, resolvedEventRoute.eventId, chosen);
    const socialProfiles = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", chosen._id))
      .collect();

    return {
      rsvpId: chosen._id,
      listKey: chosen.listKey,
      status: resolveApprovalStatus(chosen),
      approvalStatus: resolveApprovalStatus(chosen),
      attendanceStatus: sanitizeAttendanceStatus(chosen.attendanceStatus),
      ticketViewedAt: chosen.ticketViewedAt,
      shareContact: chosen.shareContact,
      customFieldValues: chosen.customFieldValues ?? undefined,
      socialProfiles: socialProfiles.map((profile) => ({
        platformKey: profile.platformKey,
        handle: profile.handle,
      })),
      invitedByName: chosen.invitedByName,
      smsConsent: chosen.smsConsent ?? false,
      smsConsentIpAddress: chosen.smsConsentIpAddress ?? undefined,
      generateQR: listCredential?.generateQR ?? false,
    } as const;
  },
});

export const statusForUserEventServerByRouteId = query({
  args: {
    eventRouteId: v.string(),
    clerkUserId: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventRouteId, clerkUserId, siteKey, workspaceSlug }) => {
    const resolvedEventRoute: { eventId: Id<"events">; shortId?: string } | null =
      await ctx.runQuery(api.events.resolveRouteId, {
        eventRouteId,
        siteKey,
        workspaceSlug,
      });
    if (!resolvedEventRoute) return null;

    const event = await getEventInSiteScope(ctx, resolvedEventRoute.eventId, { siteKey });
    if (!event) return null;
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (query) => query.eq("eventId", resolvedEventRoute.eventId))
      .filter((query) => query.eq(query.field("clerkUserId"), clerkUserId))
      .collect();
    if (rsvps.length === 0) return null;

    const chosen = selectPrimaryRsvp(rsvps);

    const redemptionInfo = await resolveRedemption(
      ctx,
      resolvedEventRoute.eventId,
      clerkUserId,
      chosen,
    );
    const socialProfiles = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", chosen._id))
      .collect();

    return {
      rsvpId: chosen._id,
      listKey: chosen.listKey,
      status: resolveApprovalStatus(chosen),
      approvalStatus: resolveApprovalStatus(chosen),
      attendanceStatus: sanitizeAttendanceStatus(chosen.attendanceStatus),
      ticketViewedAt: chosen.ticketViewedAt,
      shareContact: chosen.shareContact,
      customFieldValues: chosen.customFieldValues ?? undefined,
      socialProfiles: socialProfiles.map((profile) => ({
        platformKey: profile.platformKey,
        handle: profile.handle,
      })),
      invitedByName: chosen.invitedByName,
      smsConsent: chosen.smsConsent ?? false,
      redemption: redemptionInfo,
    } as const;
  },
});

type RawRsvp = Doc<"rsvps">;

const statusPriority: readonly ValidRsvpStatus[] = ["approved", "pending", "denied"];

function selectPrimaryRsvp(rsvps: RawRsvp[]): RawRsvp {
  const prioritized = [...rsvps].sort((a, b) => {
    const priorityDiff =
      statusPriority.indexOf(resolveApprovalStatus(b)) -
      statusPriority.indexOf(resolveApprovalStatus(a));
    if (priorityDiff !== 0) return priorityDiff;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
  return prioritized[0];
}

function sanitizeStatus(status: string): ValidRsvpStatus {
  const typedStatus = status as ValidRsvpStatus;
  if (validRsvpStatuses.includes(typedStatus)) {
    return typedStatus;
  }

  return deriveApprovalStatus(status);
}

async function resolveListCredential(ctx: QueryCtx, eventId: Id<"events">, rsvp: RawRsvp) {
  if (!rsvp.listKey) return null;
  return ctx.db
    .query("listCredentials")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
    .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("listKey"), rsvp.listKey))
    .unique();
}

async function resolveRedemption(
  ctx: QueryCtx,
  eventId: Id<"events">,
  clerkUserId: string,
  rsvp: RawRsvp,
) {
  if (resolveApprovalStatus(rsvp) !== "approved") {
    return null;
  }

  const redemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", eventId).eq("clerkUserId", clerkUserId),
    )
    .unique();

  if (!redemption) return null;

  return {
    code: redemption.code,
    listKey: redemption.listKey,
    redeemedAt: redemption.redeemedAt,
    disabledAt: redemption.disabledAt,
    status: redemption.disabledAt
      ? ("disabled" as const)
      : redemption.redeemedAt
        ? ("redeemed" as const)
        : ("issued" as const),
  };
}

async function markApprovedRsvpTicketViewed(
  ctx: MutationCtx,
  {
    eventId,
    siteKey,
    clerkUserId,
  }: {
    eventId: Id<"events">;
    siteKey?: string;
    clerkUserId: string;
  },
) {
  await ensureEventInSiteScope(ctx, eventId, { siteKey });

  const rsvp = await ctx.db
    .query("rsvps")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
    .unique();
  if (!rsvp) throw new Error("No RSVP found");
  if (resolveApprovalStatus(rsvp) !== "approved") {
    throw new Error("Ticket can only be viewed for approved RSVPs");
  }

  const now = Date.now();
  await ctx.db.patch(rsvp._id, {
    ticketViewedAt: rsvp.ticketViewedAt ?? now,
    updatedAt: now,
  });

  return { ok: true as const };
}

export const markTicketViewed = mutation({
  args: { eventId: v.id("events"), siteKey: v.optional(v.string()) },
  handler: async (ctx, { eventId, siteKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    return await markApprovedRsvpTicketViewed(ctx, {
      eventId,
      siteKey,
      clerkUserId: identity.subject,
    });
  },
});

export const acceptRsvp = mutation({
  args: { eventId: v.id("events"), siteKey: v.optional(v.string()) },
  handler: async (ctx, { eventId, siteKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    return await markApprovedRsvpTicketViewed(ctx, {
      eventId,
      siteKey,
      clerkUserId: identity.subject,
    });
  },
});

export const listUserTickets = query({
  handler: async (ctx) => {
    return await collectUserTickets(ctx, null);
  },
});

export const listUserTicketsInWorkspace = query({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceSlug, siteKey }) => {
    if (!workspaceSlug && !siteKey) return [];
    const scope = await resolveTenantWorkspaceScope(ctx, {
      workspaceSlug,
      siteKey,
    });
    if (!scope) return [];
    return await collectUserTickets(ctx, scope);
  },
});

async function collectUserTickets(
  ctx: QueryCtx,
  scope: { workspaceSlug: string; siteKey: string | null } | null,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    if (scope) return [];
    throw new Error("Unauthorized");
  }
  const clerkUserId = identity.subject;

  const userRsvps = await ctx.db
    .query("rsvps")
    .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
    .collect();

  const ticketsWithDetails = await Promise.all(
    userRsvps.map(async (rsvp) => {
      const event = await ctx.db.get(rsvp.eventId);

      let redemptionInfo = null;
      if (resolveApprovalStatus(rsvp) === "approved") {
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", clerkUserId),
          )
          .unique();

        if (redemption) {
          redemptionInfo = {
            code: redemption.code,
            listKey: redemption.listKey,
            redeemedAt: redemption.redeemedAt,
          };
        }
      }

      return {
        rsvp,
        event,
        redemption: redemptionInfo,
      };
    }),
  );

  const filtered = scope
    ? ticketsWithDetails.filter((entry) => {
        if (!entry.event) return false;
        return eventMatchesTenantScope(entry.event, scope);
      })
    : ticketsWithDetails;

  return filtered.sort((a, b) => {
    if (!a.event || !b.event) return 0;
    return b.event.eventDate - a.event.eventDate;
  });
}

// Seed helper mutation - creates an RSVP with any status (for testing)
export const createDirect = mutation({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(),
    userName: v.optional(v.string()),
    shareContact: v.boolean(),
    note: v.optional(v.string()),
    attendees: v.optional(v.number()),
    smsConsent: v.optional(v.boolean()),
    smsConsentIpAddress: v.optional(v.string()),
    customFieldValues: v.optional(v.record(v.string(), v.string())),
    socialProfiles: v.optional(v.array(submittedSocialProfileValidator)),
    invitedByName: v.optional(v.string()),
    status: v.string(),
    approvalStatus: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
    ),
    attendanceStatus: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("maybe"))),
    ticketViewedAt: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    ticketStatus: v.optional(
      v.union(
        v.literal("not-issued"),
        v.literal("issued"),
        v.literal("disabled"),
        v.literal("redeemed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const now = args.createdAt || Date.now();
    const event =
      args.socialProfiles?.length || args.invitedByName ? await ctx.db.get(args.eventId) : null;
    const primaryFieldConfig = event?.primaryFieldConfig;
    const sanitizedSocialProfiles = sanitizeSubmittedSocialProfiles(
      args.socialProfiles,
      primaryFieldConfig,
    );
    const configuredSocialPlatformKeys = new Set(
      (primaryFieldConfig?.socialPlatforms ?? [])
        .map((platform) => normalizeSocialPlatformKey(platform.platformKey))
        .filter((platformKey): platformKey is string => Boolean(platformKey)),
    );
    const invitedByPatch =
      primaryFieldConfig?.invitedBy?.enabled === true
        ? buildInvitedByPatch(args.invitedByName)
        : {};
    const user =
      sanitizedSocialProfiles.length > 0
        ? await ctx.db
            .query("users")
            .withIndex("by_clerkUserId", (queryBuilder) =>
              queryBuilder.eq("clerkUserId", args.clerkUserId),
            )
            .unique()
        : null;
    const sanitizedSmsConsentIpAddress =
      args.smsConsent === true && typeof args.smsConsentIpAddress === "string"
        ? args.smsConsentIpAddress.slice(0, 256)
        : undefined;

    const rsvpId = await ctx.db.insert("rsvps", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey,
      ticketStatus: args.ticketStatus ?? "not-issued",
      userName: args.userName,
      note: args.note,
      shareContact: args.shareContact,
      attendees: args.attendees,
      smsConsent: args.smsConsent,
      smsConsentTimestamp: args.smsConsent !== undefined ? now : undefined,
      smsConsentIpAddress: args.smsConsent === true ? sanitizedSmsConsentIpAddress : undefined,
      customFieldValues: args.customFieldValues,
      ...invitedByPatch,
      status: args.status,
      approvalStatus: args.approvalStatus ?? deriveApprovalStatus(args.status),
      attendanceStatus: sanitizeAttendanceStatus(args.attendanceStatus),
      ticketViewedAt: args.ticketViewedAt,
      createdAt: now,
      updatedAt: now,
    });

    if (event && sanitizedSocialProfiles.length > 0 && configuredSocialPlatformKeys.size > 0) {
      await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
        event,
        rsvpId,
        clerkUserId: args.clerkUserId,
        userId: user?._id,
        submittedProfiles: sanitizedSocialProfiles,
      });
      await replaceRsvpSocialProfileSnapshots(ctx, {
        eventId: args.eventId,
        rsvpId,
        clerkUserId: args.clerkUserId,
        userId: user?._id,
        configuredPlatformKeys: configuredSocialPlatformKeys,
        submittedProfiles: sanitizedSocialProfiles,
      });
    }

    // Sync with aggregate
    const newRsvp = await ctx.db.get(rsvpId);
    if (newRsvp) {
      await insertRsvpIntoAggregate(ctx, newRsvp);
    }

    return rsvpId;
  },
});

// Delete an RSVP (for cleaning up test data)
export const deleteRSVP = mutation({
  args: {
    rsvpId: v.id("rsvps"),
  },
  handler: async (ctx, args) => {
    // Get RSVP before deleting for aggregate sync
    const rsvp = await ctx.db.get(args.rsvpId);
    const socialProfileSnapshots = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", args.rsvpId))
      .collect();

    for (const socialProfileSnapshot of socialProfileSnapshots) {
      await ctx.db.delete(socialProfileSnapshot._id);
    }

    await ctx.db.delete(args.rsvpId);

    // Sync with aggregate
    if (rsvp) {
      await deleteRsvpFromAggregate(ctx, rsvp);
    }

    return { deleted: true };
  },
});

// Complete RSVP update with approval and ticket status
export const updateRsvpComplete = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    approvalStatus: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
    ),
    ticketStatus: v.optional(
      v.union(v.literal("issued"), v.literal("not-issued"), v.literal("disabled")),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const now = Date.now();

    if (args.approvalStatus) {
      await applyApprovalStatusTransition(ctx, {
        rsvp,
        nextApprovalStatus: args.approvalStatus,
        decidedBy: identity.subject,
        now,
      });
    }

    if (args.ticketStatus) {
      if (args.approvalStatus !== "denied") {
        await ctx.runMutation(api.redemptions.updateTicketStatus, {
          rsvpId: args.rsvpId,
          status: args.ticketStatus,
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });
      }
    }

    return { status: "ok" as const };
  },
});

export const updateAttendanceStatus = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    attendanceStatus: v.union(v.literal("yes"), v.literal("no"), v.literal("maybe")),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    await ctx.db.patch(args.rsvpId, {
      attendanceStatus: args.attendanceStatus,
      updatedAt: Date.now(),
    });

    return { status: "ok" as const };
  },
});

// Complete RSVP deletion with all associated records
export const deleteRsvpComplete = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    // Delete associated redemption
    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (redemption) {
      await ctx.db.delete(redemption._id);
    }

    // Delete associated approvals
    const approvals = await ctx.db
      .query("approvals")
      .filter((q) => q.eq(q.field("rsvpId"), args.rsvpId))
      .collect();
    for (const approval of approvals) {
      await ctx.db.delete(approval._id);
    }

    // Get RSVP before deleting for aggregate sync (already have it from line 927)

    // Delete the RSVP itself
    await ctx.db.delete(args.rsvpId);

    // Sync with aggregate
    if (rsvp) {
      await deleteRsvpFromAggregate(ctx, rsvp);
    }

    return { deleted: true };
  },
});

// Update RSVP list key only
export const updateRsvpListKey = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    listKey: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    // Get old state before update for aggregate sync
    const oldRsvp = await ctx.db.get(args.rsvpId);

    await ctx.db.patch(args.rsvpId, {
      listKey: args.listKey,
    });

    // Sync with aggregate
    const newRsvp = await ctx.db.get(args.rsvpId);
    if (oldRsvp && newRsvp) {
      await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
    }

    // Update related records with the new list key
    // Update redemption record if it exists
    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (redemption) {
      await ctx.db.patch(redemption._id, {
        listKey: args.listKey,
      });
    }

    // Update approval records if they exist
    const approvals = await ctx.db
      .query("approvals")
      .filter((q) => q.eq(q.field("rsvpId"), args.rsvpId))
      .collect();
    for (const approval of approvals) {
      await ctx.db.patch(approval._id, {
        listKey: args.listKey,
      });
    }

    return { status: "ok" as const };
  },
});

// Bulk update list key for multiple RSVPs
export const bulkUpdateListKey = mutation({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        listKey: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Process all updates in a single transaction
    for (const update of args.updates) {
      try {
        const rsvp = await ctx.db.get(update.rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${update.rsvpId} not found`);
          continue;
        }
        await ensureEventInSiteScope(ctx, rsvp.eventId, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        // Get old state before update for aggregate sync
        const oldRsvp = await ctx.db.get(update.rsvpId);

        // Update RSVP
        await ctx.db.patch(update.rsvpId, { listKey: update.listKey });

        // Sync with aggregate
        const newRsvp = await ctx.db.get(update.rsvpId);
        if (oldRsvp && newRsvp) {
          await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
        }

        // Update related redemption if exists
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();
        if (redemption) {
          await ctx.db.patch(redemption._id, { listKey: update.listKey });
        }

        // Update approvals
        const approvals = await ctx.db
          .query("approvals")
          .filter((q) => q.eq(q.field("rsvpId"), update.rsvpId))
          .collect();
        for (const approval of approvals) {
          await ctx.db.patch(approval._id, { listKey: update.listKey });
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to update ${update.rsvpId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  },
});

// Migrations for aggregate backfilling
import { Migrations } from "@convex-dev/migrations";

export const migrations = new Migrations(components.migrations, {
  internalMutation,
});
export const run = migrations.runner();

export const backfillRsvpAggregate = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvpDoc) => {
    const existingRsvp = await ctx.db.get(rsvpDoc._id);
    if (!existingRsvp) {
      return;
    }

    await insertRsvpIntoAggregate(ctx, existingRsvp);
  },
});

/**
 * Check aggregate health - compares aggregate count with database count
 * Returns the difference if aggregate is out of sync
 */
export const checkAggregateHealth = query({
  args: {
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { eventId }) => {
    try {
      // Get aggregate count
      let aggregateCount: number;
      if (eventId) {
        aggregateCount = await countRsvpsWithAggregate(ctx, eventId, "all", "all");
      } else {
        // Count all RSVPs across all events
        const allRsvps = await ctx.db.query("rsvps").collect();
        aggregateCount = allRsvps.length;
        // This is a rough check - aggregate doesn't have a simple "count all" API
        // So we'll use DB count as baseline
      }

      // Get database count
      let dbCount: number;
      if (eventId) {
        const dbRsvps = await ctx.db
          .query("rsvps")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect();
        dbCount = dbRsvps.length;
      } else {
        const dbRsvps = await ctx.db.query("rsvps").collect();
        dbCount = dbRsvps.length;
      }

      const difference = dbCount - aggregateCount;
      const isHealthy = difference === 0;

      return {
        isHealthy,
        aggregateCount,
        dbCount,
        difference,
        message: isHealthy
          ? "Aggregate is in sync"
          : `Aggregate is out of sync: ${difference} RSVPs missing. Run backfillRsvpAggregate migration.`,
      };
    } catch (error) {
      return {
        isHealthy: false,
        aggregateCount: 0,
        dbCount: 0,
        difference: 0,
        message: `Error checking aggregate health: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const backfillTicketStatus = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvpDoc) => {
    if (rsvpDoc.ticketStatus !== undefined) {
      return;
    }

    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (query) =>
        query.eq("eventId", rsvpDoc.eventId).eq("clerkUserId", rsvpDoc.clerkUserId),
      )
      .unique();

    let ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed" = "not-issued";
    if (redemption) {
      if (redemption.disabledAt) {
        ticketStatus = "disabled";
      } else if (redemption.redeemedAt) {
        ticketStatus = "redeemed";
      } else {
        ticketStatus = "issued";
      }
    }

    await ctx.db.patch(rsvpDoc._id, {
      ticketStatus,
    });
  },
});

// Bulk update approval status for multiple RSVPs
export const bulkUpdateApproval = mutation({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        approvalStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const now = Date.now();

    for (const update of args.updates) {
      try {
        const rsvp = await ctx.db.get(update.rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${update.rsvpId} not found`);
          continue;
        }
        await ensureEventInSiteScope(ctx, rsvp.eventId, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        await applyApprovalStatusTransition(ctx, {
          rsvp,
          nextApprovalStatus: update.approvalStatus,
          decidedBy: identity.subject,
          now,
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to update ${update.rsvpId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  },
});

export const bulkUpdateAttendanceStatus = mutation({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        attendanceStatus: v.union(v.literal("yes"), v.literal("no"), v.literal("maybe")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const now = Date.now();

    for (const update of args.updates) {
      try {
        const rsvp = await ctx.db.get(update.rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${update.rsvpId} not found`);
          continue;
        }
        await ensureEventInSiteScope(ctx, rsvp.eventId, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        await ctx.db.patch(update.rsvpId, {
          attendanceStatus: update.attendanceStatus,
          updatedAt: now,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to update ${update.rsvpId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  },
});

// Bulk update ticket status for multiple RSVPs
export const bulkUpdateTicketStatus = mutation({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        ticketStatus: v.union(v.literal("issued"), v.literal("not-issued"), v.literal("disabled")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const update of args.updates) {
      try {
        const rsvp = await ctx.db.get(update.rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${update.rsvpId} not found`);
          continue;
        }
        await ensureEventInSiteScope(ctx, rsvp.eventId, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        await ctx.runMutation(api.redemptions.updateTicketStatus, {
          rsvpId: update.rsvpId,
          status: update.ticketStatus,
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to update ${update.rsvpId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  },
});

// Bulk delete multiple RSVPs
export const bulkDeleteRsvps = mutation({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    rsvpIds: v.array(v.id("rsvps")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const rsvpId of args.rsvpIds) {
      try {
        const rsvp = await ctx.db.get(rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${rsvpId} not found`);
          continue;
        }
        await ensureEventInSiteScope(ctx, rsvp.eventId, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        // Delete redemption
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();
        if (redemption) {
          await ctx.db.delete(redemption._id);
        }

        // Delete approvals
        const approvals = await ctx.db
          .query("approvals")
          .filter((q) => q.eq(q.field("rsvpId"), rsvpId))
          .collect();
        for (const approval of approvals) {
          await ctx.db.delete(approval._id);
        }

        // Get RSVP before deleting for aggregate sync (already have it from line 1233)

        // Delete RSVP
        await ctx.db.delete(rsvpId);

        // Sync with aggregate
        if (rsvp) {
          await deleteRsvpFromAggregate(ctx, rsvp);
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to delete ${rsvpId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  },
});

export const listByClerkUser = query({
  args: {
    clerkUserId: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Host-level (not admin-only) so Guests directory rows can open details.
    const workspaceScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const userRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", args.clerkUserId))
      .collect();

    const workspaceEvents = await ctx.db
      .query("events")
      .withIndex("by_workspaceSlug", (queryBuilder) =>
        queryBuilder.eq("workspaceSlug", workspaceScope.workspaceSlug),
      )
      .collect();

    const eventMap = new Map(workspaceEvents.map((event) => [event._id, event]));
    const workspaceEventIds = new Set(workspaceEvents.map((event) => event._id));

    return userRsvps
      .filter((rsvp) => workspaceEventIds.has(rsvp.eventId))
      .map((rsvp) => {
        const event = eventMap.get(rsvp.eventId);
        return {
          id: rsvp._id,
          eventId: rsvp.eventId,
          eventName: event?.name ?? "Unknown Event",
          eventDate: event?.eventDate ?? 0,
          listKey: rsvp.listKey,
          approvalStatus: rsvp.approvalStatus ?? "pending",
          attendanceStatus: rsvp.attendanceStatus ?? "yes",
          ticketStatus: rsvp.ticketStatus ?? "not-issued",
          attendees: rsvp.attendees ?? 1,
          createdAt: rsvp.createdAt,
          updatedAt: rsvp.updatedAt,
        };
      })
      .sort((firstEntry, secondEntry) => secondEntry.createdAt - firstEntry.createdAt);
  },
});
