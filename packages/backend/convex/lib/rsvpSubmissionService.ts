import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { buildGuestClerkUserId, isGuestClerkUserId } from "./guestIdentity";
import {
  assertRequiredPrimaryFieldValues,
  buildInvitedByPatch,
  sanitizeSubmittedSocialProfiles,
} from "./primaryFields";
import { createProfileValuesAndWorkspaceGrantsForSocialProfiles } from "./profileValueRecords";
import { insertRsvpIntoAggregate, updateRsvpInAggregate } from "./rsvpAggregate";
import { tryAutoApproveRsvp } from "./rsvpApproval";
import { formatRsvpConfirmationMessage } from "./rsvpConfirmationMessages";
import { resolveApprovalStatus } from "./rsvpStatus";
import { upsertSmsOrganizerPreference } from "./smsOrganizerPreferences";
import { replaceRsvpSocialProfileSnapshots } from "./socialProfileRecords";

export type RsvpSubmissionServiceResult = {
  rsvpId: Id<"rsvps">;
  disposition: "existing" | "submitted" | "moved";
  approvalStatus: string;
  responseMessage?: string;
};

type FinalizeRsvpSubmissionInput = {
  event: Doc<"events">;
  rsvpId: Id<"rsvps">;
  previousRsvp?: Doc<"rsvps">;
  clerkUserId: string;
  registeredUser?: Doc<"users">;
  sanitizedSocialProfiles: ReturnType<typeof sanitizeSubmittedSocialProfiles>;
  configuredSocialPlatformKeys: Set<string>;
  persistUserProfiles: boolean;
  updateOrganizerPreference: boolean;
  organizerSiteKey?: string;
  smsConsent: boolean;
  smsConsentIpAddress?: string;
  tryAutomaticApproval: boolean;
  now: number;
};

type SharedRsvpSubmissionInput = {
  submissionOrigin: "sms" | "web";
  event: Doc<"events">;
  listKey: string;
  clerkUserId: string;
  registeredUser?: Doc<"users">;
  firstName: string;
  lastName: string;
  socialProfiles: Array<{ platformKey: string; handle: string }>;
  invitedByName?: string;
  customFieldValues: Record<string, string>;
  smsConsent: boolean;
  smsConsentIpAddress?: string;
  guestPhoneHash?: string;
  guestPhoneObfuscated?: string;
  normalizedPhoneNumber?: string;
  now?: number;
};

async function findExistingRsvp(
  ctx: MutationCtx,
  input: SharedRsvpSubmissionInput,
): Promise<Doc<"rsvps"> | null> {
  if (input.guestPhoneHash && isGuestClerkUserId(input.clerkUserId)) {
    const matchingRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_guestPhoneHash", (queryBuilder) =>
        queryBuilder.eq("eventId", input.event._id).eq("guestPhoneHash", input.guestPhoneHash),
      )
      .collect();
    return matchingRsvps.find((rsvp) => rsvp.clerkUserId === input.clerkUserId) ?? null;
  }

  return await ctx.db
    .query("rsvps")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", input.event._id).eq("clerkUserId", input.clerkUserId),
    )
    .unique();
}

async function upsertGuestContact(
  ctx: MutationCtx,
  input: SharedRsvpSubmissionInput,
  now: number,
): Promise<void> {
  const guestPhoneHash = input.guestPhoneHash;
  const normalizedPhoneNumber = input.normalizedPhoneNumber;
  if (!guestPhoneHash || !normalizedPhoneNumber) return;

  const existingGuestContact = await ctx.db
    .query("guestContacts")
    .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", guestPhoneHash))
    .unique();
  if (existingGuestContact) {
    if (existingGuestContact.phoneNumber !== normalizedPhoneNumber) {
      await ctx.db.patch(existingGuestContact._id, {
        phoneNumber: normalizedPhoneNumber,
        updatedAt: now,
      });
    }
    return;
  }

  await ctx.db.insert("guestContacts", {
    phoneHash: guestPhoneHash,
    phoneNumber: normalizedPhoneNumber,
    createdAt: now,
    updatedAt: now,
  });
}

async function invalidatePreviousTicket(ctx: MutationCtx, rsvp: Doc<"rsvps">): Promise<void> {
  const redemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
    )
    .unique();
  if (redemption) {
    await ctx.db.delete(redemption._id);
  }
}

export async function finalizeRsvpSubmissionThroughSharedService(
  ctx: MutationCtx,
  input: FinalizeRsvpSubmissionInput,
): Promise<{ wasAutomaticallyApproved: boolean; rsvp: Doc<"rsvps"> }> {
  if (input.configuredSocialPlatformKeys.size > 0) {
    if (input.registeredUser) {
      await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
        event: input.event,
        rsvpId: input.rsvpId,
        clerkUserId: input.clerkUserId,
        userId: input.registeredUser._id,
        submittedProfiles: input.sanitizedSocialProfiles,
      });
    }
    await replaceRsvpSocialProfileSnapshots(ctx, {
      eventId: input.event._id,
      rsvpId: input.rsvpId,
      clerkUserId: input.clerkUserId,
      userId: input.registeredUser?._id,
      configuredPlatformKeys: input.configuredSocialPlatformKeys,
      submittedProfiles: input.sanitizedSocialProfiles,
      persistUserProfiles: input.persistUserProfiles,
    });
  }

  const storedRsvp = await ctx.db.get(input.rsvpId);
  if (!storedRsvp) {
    throw new Error("RSVP submission could not be stored");
  }
  if (input.previousRsvp) {
    try {
      await updateRsvpInAggregate(ctx, input.previousRsvp, storedRsvp);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("DELETE_MISSING_KEY")) {
        throw error;
      }
      console.warn(
        "[finalizeRsvpSubmissionThroughSharedService] Repairing an RSVP aggregate entry confirmed missing",
        error,
      );
      await insertRsvpIntoAggregate(ctx, storedRsvp);
    }
  } else {
    await insertRsvpIntoAggregate(ctx, storedRsvp);
  }
  if (input.updateOrganizerPreference) {
    await upsertSmsOrganizerPreference(ctx, {
      clerkUserId: input.clerkUserId,
      event: input.event,
      siteKey: input.organizerSiteKey ?? input.event.siteKey,
      smsConsent: input.smsConsent,
      smsConsentIpAddress: input.smsConsentIpAddress,
      sourceEventId: input.event._id,
      sourceRsvpId: input.rsvpId,
      now: input.now,
    });
  }

  const wasAutomaticallyApproved = input.tryAutomaticApproval
    ? await tryAutoApproveRsvp(ctx, storedRsvp)
    : false;
  return {
    wasAutomaticallyApproved,
    rsvp: (await ctx.db.get(input.rsvpId)) ?? storedRsvp,
  };
}

/**
 * Shared persistence boundary for web- and SMS-originated RSVP submissions.
 * Callers own authentication and field collection; this service owns the
 * durable RSVP/profile/consent/aggregate behavior.
 */
export async function submitRsvpThroughSharedService(
  ctx: MutationCtx,
  input: SharedRsvpSubmissionInput,
): Promise<RsvpSubmissionServiceResult> {
  const now = input.now ?? Date.now();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) {
    throw new Error("First and last name are required");
  }

  const listCredential = await ctx.db
    .query("listCredentials")
    .withIndex("by_event_key", (queryBuilder) =>
      queryBuilder.eq("eventId", input.event._id).eq("listKey", input.listKey),
    )
    .unique();
  if (!listCredential) {
    throw new Error("RSVP list is not available");
  }

  const sanitizedSocialProfiles = sanitizeSubmittedSocialProfiles(
    input.socialProfiles,
    input.event.primaryFieldConfig,
  );
  assertRequiredPrimaryFieldValues({
    primaryFieldConfig: input.event.primaryFieldConfig,
    submittedProfiles: sanitizedSocialProfiles,
    invitedByName: input.invitedByName,
  });

  const customFieldValues = Object.fromEntries(
    (input.event.customFields ?? [])
      .map((field): [string, string] | null => {
        const rawValue = input.customFieldValues[field.key] ?? "";
        const finalValue = field.trimWhitespace === false ? rawValue : rawValue.trim();
        if (field.required === true && !finalValue) {
          throw new Error(`${field.label} is required`);
        }
        return finalValue ? [field.key, finalValue] : null;
      })
      .filter((entry): entry is [string, string] => entry !== null),
  );
  const configuredSocialPlatformKeys = new Set(
    (input.event.primaryFieldConfig?.socialPlatforms ?? []).map((platform) => platform.platformKey),
  );
  const invitedByPatch =
    input.event.primaryFieldConfig?.invitedBy?.enabled === true
      ? buildInvitedByPatch(input.invitedByName)
      : {};
  const userName = `${firstName} ${lastName}`.trim();
  const existingRsvp = await findExistingRsvp(ctx, input);

  if (existingRsvp?.listKey === input.listKey) {
    if (input.smsConsent && existingRsvp.smsConsent !== true) {
      await ctx.db.patch(existingRsvp._id, {
        smsConsent: true,
        smsConsentIpAddress: input.smsConsentIpAddress,
        smsConsentTimestamp: now,
        updatedAt: now,
      });
    }
    if (input.smsConsent) {
      await upsertSmsOrganizerPreference(ctx, {
        clerkUserId: input.clerkUserId,
        event: input.event,
        siteKey: input.event.siteKey,
        smsConsent: true,
        smsConsentIpAddress: input.smsConsentIpAddress,
        sourceEventId: input.event._id,
        sourceRsvpId: existingRsvp._id,
        now,
      });
    }
    return {
      rsvpId: existingRsvp._id,
      disposition: "existing",
      approvalStatus: resolveApprovalStatus(existingRsvp),
      responseMessage: `You already have an RSVP for ${input.event.name} (${resolveApprovalStatus(existingRsvp)}).`,
    };
  }

  await upsertGuestContact(ctx, input, now);
  if (input.registeredUser) {
    const userPatch: Partial<Doc<"users">> = { updatedAt: now };
    if (!input.registeredUser.firstName) userPatch.firstName = firstName;
    if (!input.registeredUser.lastName) userPatch.lastName = lastName;
    await ctx.db.patch(input.registeredUser._id, userPatch);
  }

  let rsvpId: Id<"rsvps">;
  let disposition: RsvpSubmissionServiceResult["disposition"];
  if (!existingRsvp) {
    disposition = "submitted";
    rsvpId = await ctx.db.insert("rsvps", {
      eventId: input.event._id,
      clerkUserId: input.clerkUserId,
      listKey: input.listKey,
      ticketStatus: "not-issued",
      userName,
      guestPhoneHash: input.guestPhoneHash,
      guestPhoneObfuscated: input.guestPhoneObfuscated,
      shareContact: true,
      attendees: 1,
      smsConsent: input.smsConsent,
      smsConsentIpAddress: input.smsConsent ? input.smsConsentIpAddress : undefined,
      smsConsentTimestamp: input.smsConsent ? now : undefined,
      customFieldValues: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      ...invitedByPatch,
      status: "pending",
      approvalStatus: "pending",
      attendanceStatus: "yes",
      createdAt: now,
      updatedAt: now,
    });
  } else {
    disposition = "moved";
    rsvpId = existingRsvp._id;
    await invalidatePreviousTicket(ctx, existingRsvp);
    await ctx.db.patch(existingRsvp._id, {
      listKey: input.listKey,
      ticketStatus: "not-issued",
      userName,
      guestPhoneHash: input.guestPhoneHash ?? existingRsvp.guestPhoneHash,
      guestPhoneObfuscated: input.guestPhoneObfuscated ?? existingRsvp.guestPhoneObfuscated,
      shareContact: true,
      attendees: 1,
      smsConsent: input.smsConsent,
      smsConsentIpAddress: input.smsConsent
        ? (input.smsConsentIpAddress ?? existingRsvp.smsConsentIpAddress)
        : existingRsvp.smsConsentIpAddress,
      smsConsentTimestamp: input.smsConsent ? now : existingRsvp.smsConsentTimestamp,
      customFieldValues: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      ...invitedByPatch,
      status: "pending",
      approvalStatus: "pending",
      attendanceStatus: "yes",
      updatedAt: now,
    });
    await ctx.db.insert("approvals", {
      eventId: input.event._id,
      rsvpId: existingRsvp._id,
      clerkUserId: input.clerkUserId,
      listKey: input.listKey,
      decision: "pending",
      decidedBy: `system:${input.submissionOrigin}-list-move`,
      decidedAt: now,
    });
  }

  const finalizationResult = await finalizeRsvpSubmissionThroughSharedService(ctx, {
    event: input.event,
    rsvpId,
    previousRsvp: existingRsvp ?? undefined,
    clerkUserId: input.clerkUserId,
    registeredUser: input.registeredUser,
    sanitizedSocialProfiles,
    configuredSocialPlatformKeys,
    persistUserProfiles: Boolean(input.registeredUser),
    updateOrganizerPreference: true,
    organizerSiteKey: input.event.siteKey,
    smsConsent: input.smsConsent,
    smsConsentIpAddress: input.smsConsentIpAddress,
    tryAutomaticApproval: true,
    now,
  });
  return {
    rsvpId,
    disposition,
    approvalStatus: resolveApprovalStatus(finalizationResult.rsvp),
    responseMessage: finalizationResult.wasAutomaticallyApproved
      ? undefined
      : formatRsvpConfirmationMessage(input.event, {
          firstName,
          lastName,
          fullName: userName,
        }),
  };
}

export function guestClerkUserIdForPhoneHash(phoneHash: string): string {
  return buildGuestClerkUserId(phoneHash);
}
