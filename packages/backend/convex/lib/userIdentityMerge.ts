import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { writeAuditEntry } from "../audit";
import { appendInviterHistoryForContact, mergeInviterHistoryEntries } from "./inviterHistory";
import {
  deleteRsvpFromAggregate,
  insertRsvpIntoAggregate,
  updateRsvpInAggregate,
} from "./rsvpAggregate";
import { resolveApprovalStatus } from "./rsvpStatus";

type DatabaseReader = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export type DuplicatePhoneGroupReport = {
  phoneHash: string;
  canonicalUserId: Id<"users">;
  canonicalClerkUserId: string;
  retiredUserIds: Id<"users">[];
  retiredClerkUserIds: string[];
  rsvpCount: number;
  rsvpMoveCount: number;
  rsvpCollisionCount: number;
  profileDuplicateCount: number;
  historicalSnapshotReferenceCount: number;
  unresolvedReferenceCount: number;
};

export type DuplicateUserMergeResult = DuplicatePhoneGroupReport & {
  mergedAt: number;
  removedRsvpCount: number;
};

function requireClerkUserId(user: Doc<"users">): string {
  if (!user.clerkUserId) {
    throw new Error(`User ${user._id} has no Clerk user ID and cannot be consolidated`);
  }
  return user.clerkUserId;
}

async function replaceRsvpAggregateSafely(
  ctx: MutationCtx,
  previousRsvp: Doc<"rsvps">,
  nextRsvp: Doc<"rsvps">,
): Promise<void> {
  try {
    await updateRsvpInAggregate(ctx, previousRsvp, nextRsvp);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("DELETE_MISSING_KEY")) throw error;
    await insertRsvpIntoAggregate(ctx, nextRsvp);
  }
}

async function loadRsvpsByUser(ctx: DatabaseReader, clerkUserId: string): Promise<Doc<"rsvps">[]> {
  return await ctx.db
    .query("rsvps")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
    .collect();
}

export async function chooseCanonicalUser(
  ctx: DatabaseReader,
  users: readonly Doc<"users">[],
): Promise<{ user: Doc<"users">; rsvpsByClerkUserId: Map<string, Doc<"rsvps">[]> }> {
  if (users.length === 0) throw new Error("Cannot select a canonical user from an empty group");

  const rsvpsByClerkUserId = new Map<string, Doc<"rsvps">[]>();
  await Promise.all(
    users.map(async (user) => {
      const clerkUserId = requireClerkUserId(user);
      rsvpsByClerkUserId.set(clerkUserId, await loadRsvpsByUser(ctx, clerkUserId));
    }),
  );

  const orderedUsers = [...users].sort((firstUser, secondUser) => {
    const firstRsvpCount = rsvpsByClerkUserId.get(requireClerkUserId(firstUser))?.length ?? 0;
    const secondRsvpCount = rsvpsByClerkUserId.get(requireClerkUserId(secondUser))?.length ?? 0;
    if (firstRsvpCount !== secondRsvpCount) return secondRsvpCount - firstRsvpCount;
    if (firstUser.createdAt !== secondUser.createdAt) {
      return secondUser.createdAt - firstUser.createdAt;
    }
    return String(firstUser._id).localeCompare(String(secondUser._id));
  });

  return { user: orderedUsers[0], rsvpsByClerkUserId };
}

export async function buildDuplicatePhoneGroupReport(
  ctx: DatabaseReader,
  phoneHash: string,
  users: readonly Doc<"users">[],
): Promise<DuplicatePhoneGroupReport> {
  const { user: canonicalUser, rsvpsByClerkUserId } = await chooseCanonicalUser(ctx, users);
  const canonicalClerkUserId = requireClerkUserId(canonicalUser);
  const canonicalEventIds = new Set(
    (rsvpsByClerkUserId.get(canonicalClerkUserId) ?? []).map((rsvp) => String(rsvp.eventId)),
  );
  const retiredUsers = users.filter((user) => user._id !== canonicalUser._id);
  const retiredRsvps = retiredUsers.flatMap(
    (user) => rsvpsByClerkUserId.get(requireClerkUserId(user)) ?? [],
  );
  const socialProfiles = (
    await Promise.all(
      users.map(
        async (user) =>
          await ctx.db
            .query("userSocialProfiles")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("clerkUserId", requireClerkUserId(user)),
            )
            .collect(),
      ),
    )
  ).flat();
  const distinctSocialKeys = new Set(
    socialProfiles.map((profile) => `${profile.platformKey}:${profile.normalizedHandle}`),
  );
  const retiredRsvpIds = new Set(retiredRsvps.map((rsvp) => String(rsvp._id)));
  const historicalSnapshotReferenceCount = (
    await ctx.db.query("webhookDeliveries").collect()
  ).filter((delivery) => delivery.rsvpId && retiredRsvpIds.has(String(delivery.rsvpId))).length;

  return {
    phoneHash,
    canonicalUserId: canonicalUser._id,
    canonicalClerkUserId,
    retiredUserIds: retiredUsers.map((user) => user._id),
    retiredClerkUserIds: retiredUsers.map(requireClerkUserId),
    rsvpCount: Array.from(rsvpsByClerkUserId.values()).reduce(
      (totalCount, rsvps) => totalCount + rsvps.length,
      0,
    ),
    rsvpMoveCount: retiredRsvps.filter((rsvp) => !canonicalEventIds.has(String(rsvp.eventId)))
      .length,
    rsvpCollisionCount: retiredRsvps.filter((rsvp) => canonicalEventIds.has(String(rsvp.eventId)))
      .length,
    profileDuplicateCount: socialProfiles.length - distinctSocialKeys.size,
    historicalSnapshotReferenceCount,
    unresolvedReferenceCount: 0,
  };
}

function approvalRank(rsvp: Doc<"rsvps">): number {
  const approvalStatus = resolveApprovalStatus(rsvp);
  if (approvalStatus === "approved") return 3;
  if (approvalStatus === "pending") return 2;
  if (approvalStatus === "denied") return 1;
  return 0;
}

function chooseStatusSource(firstRsvp: Doc<"rsvps">, secondRsvp: Doc<"rsvps">): Doc<"rsvps"> {
  const rankDifference = approvalRank(secondRsvp) - approvalRank(firstRsvp);
  if (rankDifference > 0) return secondRsvp;
  if (rankDifference < 0) return firstRsvp;
  return secondRsvp.updatedAt > firstRsvp.updatedAt ? secondRsvp : firstRsvp;
}

function combineDistinctText(firstValue?: string, secondValue?: string): string | undefined {
  const values: string[] = [];
  const normalizedValues = new Set<string>();
  for (const candidateValue of [firstValue, secondValue]) {
    const trimmedValue = candidateValue?.trim();
    if (!trimmedValue) continue;
    const normalizedValue = trimmedValue.replace(/\s+/g, " ").toLocaleLowerCase();
    if (normalizedValues.has(normalizedValue)) continue;
    normalizedValues.add(normalizedValue);
    values.push(trimmedValue);
  }
  return values.length > 0 ? values.join("\n\n") : undefined;
}

function mergeNewestCustomFieldValues(
  targetRsvp: Doc<"rsvps">,
  sourceRsvp: Doc<"rsvps">,
): Record<string, string> | undefined {
  const mergedValues: Record<string, string> = {};
  const fieldKeys = new Set([
    ...Object.keys(targetRsvp.customFieldValues ?? {}),
    ...Object.keys(sourceRsvp.customFieldValues ?? {}),
  ]);
  for (const fieldKey of fieldKeys) {
    const targetValue = targetRsvp.customFieldValues?.[fieldKey]?.trim();
    const sourceValue = sourceRsvp.customFieldValues?.[fieldKey]?.trim();
    const preferredValue =
      sourceValue && (!targetValue || sourceRsvp.updatedAt >= targetRsvp.updatedAt)
        ? sourceValue
        : targetValue;
    if (preferredValue) mergedValues[fieldKey] = preferredValue;
  }
  return Object.keys(mergedValues).length > 0 ? mergedValues : undefined;
}

function chooseNewestExplicitValue<Value>(
  firstValue: Value | undefined,
  firstTimestamp: number,
  secondValue: Value | undefined,
  secondTimestamp: number,
): Value | undefined {
  if (firstValue === undefined) return secondValue;
  if (secondValue === undefined) return firstValue;
  return secondTimestamp >= firstTimestamp ? secondValue : firstValue;
}

function redemptionRank(redemption: Doc<"redemptions">): number {
  if (redemption.disabledAt === undefined && redemption.redeemedAt !== undefined) return 3;
  if (redemption.disabledAt === undefined) return 2;
  return 1;
}

function ticketStatusFromRedemption(redemption: Doc<"redemptions"> | null): string | undefined {
  if (!redemption) return undefined;
  if (redemption.disabledAt !== undefined) return "disabled";
  if (redemption.redeemedAt !== undefined) return "redeemed";
  return "issued";
}

async function mergeRedemptions(
  ctx: MutationCtx,
  input: {
    eventId: Id<"events">;
    sourceClerkUserId: string;
    canonicalClerkUserId: string;
  },
): Promise<Doc<"redemptions"> | null> {
  const sourceRedemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", input.eventId).eq("clerkUserId", input.sourceClerkUserId),
    )
    .first();
  const canonicalRedemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", input.eventId).eq("clerkUserId", input.canonicalClerkUserId),
    )
    .first();

  if (!sourceRedemption) return canonicalRedemption;
  if (!canonicalRedemption) {
    await ctx.db.patch(sourceRedemption._id, { clerkUserId: input.canonicalClerkUserId });
    return { ...sourceRedemption, clerkUserId: input.canonicalClerkUserId };
  }
  if (sourceRedemption._id === canonicalRedemption._id) return canonicalRedemption;

  const sourceWins =
    redemptionRank(sourceRedemption) > redemptionRank(canonicalRedemption) ||
    (redemptionRank(sourceRedemption) === redemptionRank(canonicalRedemption) &&
      Math.max(sourceRedemption.redeemedAt ?? 0, sourceRedemption.createdAt) >
        Math.max(canonicalRedemption.redeemedAt ?? 0, canonicalRedemption.createdAt));
  const winner = sourceWins ? sourceRedemption : canonicalRedemption;
  const loser = sourceWins ? canonicalRedemption : sourceRedemption;
  const unredeemHistory = Array.from(
    new Map(
      [...winner.unredeemHistory, ...loser.unredeemHistory].map((historyEntry) => [
        `${historyEntry.at}:${historyEntry.byClerkUserId}:${historyEntry.reason ?? ""}`,
        historyEntry,
      ]),
    ).values(),
  ).sort((firstEntry, secondEntry) => firstEntry.at - secondEntry.at);

  if (sourceWins) {
    await ctx.db.delete(canonicalRedemption._id);
    await ctx.db.patch(sourceRedemption._id, {
      clerkUserId: input.canonicalClerkUserId,
      unredeemHistory,
    });
    return { ...sourceRedemption, clerkUserId: input.canonicalClerkUserId, unredeemHistory };
  }

  await ctx.db.patch(canonicalRedemption._id, { unredeemHistory });
  await ctx.db.delete(sourceRedemption._id);
  return { ...canonicalRedemption, unredeemHistory };
}

async function upsertRsvpAlias(
  ctx: MutationCtx,
  input: {
    retiredRsvpId: Id<"rsvps">;
    canonicalRsvpId: Id<"rsvps">;
    retiredClerkUserId: string;
    canonicalClerkUserId: string;
    now: number;
  },
): Promise<void> {
  const existingAlias = await ctx.db
    .query("rsvpIdentityAliases")
    .withIndex("by_retired", (queryBuilder) =>
      queryBuilder.eq("retiredRsvpId", input.retiredRsvpId),
    )
    .first();
  if (existingAlias) {
    await ctx.db.patch(existingAlias._id, {
      canonicalRsvpId: input.canonicalRsvpId,
      canonicalClerkUserId: input.canonicalClerkUserId,
      updatedAt: input.now,
    });
    return;
  }
  await ctx.db.insert("rsvpIdentityAliases", {
    retiredRsvpId: input.retiredRsvpId,
    canonicalRsvpId: input.canonicalRsvpId,
    retiredClerkUserId: input.retiredClerkUserId,
    canonicalClerkUserId: input.canonicalClerkUserId,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

async function repointRsvpReferences(
  ctx: MutationCtx,
  input: {
    sourceRsvp: Doc<"rsvps">;
    targetRsvpId: Id<"rsvps">;
    canonicalClerkUserId: string;
    canonicalUserId: Id<"users">;
    now: number;
  },
): Promise<void> {
  const socialSnapshots = await ctx.db
    .query("rsvpSocialProfiles")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", input.sourceRsvp._id))
    .collect();
  for (const socialSnapshot of socialSnapshots) {
    const targetSnapshot = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp_platform", (queryBuilder) =>
        queryBuilder.eq("rsvpId", input.targetRsvpId).eq("platformKey", socialSnapshot.platformKey),
      )
      .first();
    if (targetSnapshot && targetSnapshot._id !== socialSnapshot._id) {
      if (socialSnapshot.updatedAt > targetSnapshot.updatedAt) {
        await ctx.db.patch(targetSnapshot._id, {
          handle: socialSnapshot.handle,
          normalizedHandle: socialSnapshot.normalizedHandle,
          updatedAt: socialSnapshot.updatedAt,
        });
      }
      await ctx.db.delete(socialSnapshot._id);
    } else {
      await ctx.db.patch(socialSnapshot._id, {
        rsvpId: input.targetRsvpId,
        clerkUserId: input.canonicalClerkUserId,
        updatedAt: Math.max(socialSnapshot.updatedAt, input.now),
      });
    }
  }

  const approvals = await ctx.db
    .query("approvals")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", input.sourceRsvp.eventId))
    .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("rsvpId"), input.sourceRsvp._id))
    .collect();
  for (const approval of approvals) {
    await ctx.db.patch(approval._id, {
      rsvpId: input.targetRsvpId,
      clerkUserId: input.canonicalClerkUserId,
    });
  }

  const handoffs = await ctx.db
    .query("rsvpGuestHandoffs")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", input.sourceRsvp._id))
    .collect();
  for (const handoff of handoffs) {
    await ctx.db.patch(handoff._id, { rsvpId: input.targetRsvpId });
  }

  const organizerPreferences = await ctx.db.query("userSmsOrganizerPreferences").collect();
  for (const organizerPreference of organizerPreferences) {
    if (organizerPreference.sourceRsvpId === input.sourceRsvp._id) {
      await ctx.db.patch(organizerPreference._id, { sourceRsvpId: input.targetRsvpId });
    }
  }

  const profileValues = await ctx.db.query("profileFieldValues").collect();
  for (const profileValue of profileValues) {
    if (profileValue.sourceRsvpId === input.sourceRsvp._id) {
      await ctx.db.patch(profileValue._id, { sourceRsvpId: input.targetRsvpId });
    }
  }

  const profileGrants = await ctx.db.query("workspaceProfileValueGrants").collect();
  for (const profileGrant of profileGrants) {
    if (profileGrant.sourceRsvpId === input.sourceRsvp._id) {
      await ctx.db.patch(profileGrant._id, { sourceRsvpId: input.targetRsvpId });
    }
  }

  const blastRecipients = await ctx.db.query("textBlastRecipients").collect();
  for (const blastRecipient of blastRecipients) {
    if (!blastRecipient.sourceRsvpIds.includes(input.sourceRsvp._id)) continue;
    await ctx.db.patch(blastRecipient._id, {
      sourceRsvpIds: Array.from(
        new Set(
          blastRecipient.sourceRsvpIds.map((rsvpId) =>
            rsvpId === input.sourceRsvp._id ? input.targetRsvpId : rsvpId,
          ),
        ),
      ),
      updatedAt: input.now,
    });
  }

  const replyAttempts = await ctx.db.query("textBlastReplyAttempts").collect();
  for (const replyAttempt of replyAttempts) {
    const sourceRsvpId =
      replyAttempt.sourceRsvpId === input.sourceRsvp._id
        ? input.targetRsvpId
        : replyAttempt.sourceRsvpId;
    const destinationRsvpId =
      replyAttempt.destinationRsvpId === input.sourceRsvp._id
        ? input.targetRsvpId
        : replyAttempt.destinationRsvpId;
    if (
      sourceRsvpId !== replyAttempt.sourceRsvpId ||
      destinationRsvpId !== replyAttempt.destinationRsvpId
    ) {
      await ctx.db.patch(replyAttempt._id, { sourceRsvpId, destinationRsvpId });
    }
  }
}

async function mergeRsvpCollision(
  ctx: MutationCtx,
  input: {
    sourceRsvp: Doc<"rsvps">;
    targetRsvp: Doc<"rsvps">;
    canonicalClerkUserId: string;
    canonicalUserId: Id<"users">;
    now: number;
  },
): Promise<void> {
  const { sourceRsvp, targetRsvp } = input;
  const statusSource = chooseStatusSource(targetRsvp, sourceRsvp);
  const newestRsvp = sourceRsvp.updatedAt >= targetRsvp.updatedAt ? sourceRsvp : targetRsvp;
  const consentSourceTimestamp = sourceRsvp.smsConsentTimestamp ?? sourceRsvp.updatedAt;
  const targetConsentTimestamp = targetRsvp.smsConsentTimestamp ?? targetRsvp.updatedAt;
  const redemption = await mergeRedemptions(ctx, {
    eventId: sourceRsvp.eventId,
    sourceClerkUserId: sourceRsvp.clerkUserId,
    canonicalClerkUserId: input.canonicalClerkUserId,
  });
  const oldTargetRsvp = await ctx.db.get(targetRsvp._id);
  await ctx.db.patch(targetRsvp._id, {
    listKey: statusSource.listKey,
    userName: newestRsvp.userName ?? targetRsvp.userName ?? sourceRsvp.userName,
    ticketStatus:
      ticketStatusFromRedemption(redemption) ??
      statusSource.ticketStatus ??
      targetRsvp.ticketStatus,
    shareContact: targetRsvp.shareContact || sourceRsvp.shareContact,
    note: combineDistinctText(targetRsvp.note, sourceRsvp.note),
    attendees: Math.max(targetRsvp.attendees ?? 1, sourceRsvp.attendees ?? 1),
    smsConsent: chooseNewestExplicitValue(
      targetRsvp.smsConsent,
      targetConsentTimestamp,
      sourceRsvp.smsConsent,
      consentSourceTimestamp,
    ),
    smsConsentTimestamp:
      Math.max(targetRsvp.smsConsentTimestamp ?? 0, sourceRsvp.smsConsentTimestamp ?? 0) ||
      undefined,
    smsConsentIpAddress: chooseNewestExplicitValue(
      targetRsvp.smsConsentIpAddress,
      targetConsentTimestamp,
      sourceRsvp.smsConsentIpAddress,
      consentSourceTimestamp,
    ),
    customFieldValues: mergeNewestCustomFieldValues(targetRsvp, sourceRsvp),
    invitedByName: newestRsvp.invitedByName ?? targetRsvp.invitedByName ?? sourceRsvp.invitedByName,
    invitedByNormalizedName:
      newestRsvp.invitedByNormalizedName ??
      targetRsvp.invitedByNormalizedName ??
      sourceRsvp.invitedByNormalizedName,
    invitedBySocialPlatformKey:
      newestRsvp.invitedBySocialPlatformKey ??
      targetRsvp.invitedBySocialPlatformKey ??
      sourceRsvp.invitedBySocialPlatformKey,
    invitedBySocialHandle:
      newestRsvp.invitedBySocialHandle ??
      targetRsvp.invitedBySocialHandle ??
      sourceRsvp.invitedBySocialHandle,
    invitedByUserId:
      newestRsvp.invitedByUserId ?? targetRsvp.invitedByUserId ?? sourceRsvp.invitedByUserId,
    referralCode: newestRsvp.referralCode ?? targetRsvp.referralCode ?? sourceRsvp.referralCode,
    referrerUserId:
      newestRsvp.referrerUserId ?? targetRsvp.referrerUserId ?? sourceRsvp.referrerUserId,
    referrerClerkUserId:
      newestRsvp.referrerClerkUserId ??
      targetRsvp.referrerClerkUserId ??
      sourceRsvp.referrerClerkUserId,
    referredByName:
      newestRsvp.referredByName ?? targetRsvp.referredByName ?? sourceRsvp.referredByName,
    status: resolveApprovalStatus(statusSource),
    approvalStatus: resolveApprovalStatus(statusSource),
    attendanceStatus: chooseNewestExplicitValue(
      targetRsvp.attendanceStatus,
      targetRsvp.updatedAt,
      sourceRsvp.attendanceStatus,
      sourceRsvp.updatedAt,
    ),
    ticketViewedAt:
      Math.max(targetRsvp.ticketViewedAt ?? 0, sourceRsvp.ticketViewedAt ?? 0) || undefined,
    createdAt: Math.min(targetRsvp.createdAt, sourceRsvp.createdAt),
    updatedAt: Math.max(targetRsvp.updatedAt, sourceRsvp.updatedAt, input.now),
  });
  const updatedTargetRsvp = await ctx.db.get(targetRsvp._id);
  if (oldTargetRsvp && updatedTargetRsvp) {
    await replaceRsvpAggregateSafely(ctx, oldTargetRsvp, updatedTargetRsvp);
  }

  await repointRsvpReferences(ctx, {
    sourceRsvp,
    targetRsvpId: targetRsvp._id,
    canonicalClerkUserId: input.canonicalClerkUserId,
    canonicalUserId: input.canonicalUserId,
    now: input.now,
  });
  await upsertRsvpAlias(ctx, {
    retiredRsvpId: sourceRsvp._id,
    canonicalRsvpId: targetRsvp._id,
    retiredClerkUserId: sourceRsvp.clerkUserId,
    canonicalClerkUserId: input.canonicalClerkUserId,
    now: input.now,
  });
  await ctx.db.delete(sourceRsvp._id);
  await deleteRsvpFromAggregate(ctx, sourceRsvp);
}

async function moveUserRsvps(
  ctx: MutationCtx,
  input: {
    sourceClerkUserId: string;
    canonicalClerkUserId: string;
    canonicalUserId: Id<"users">;
    now: number;
  },
): Promise<{ moved: number; collided: number }> {
  const sourceRsvps = await loadRsvpsByUser(ctx, input.sourceClerkUserId);
  let moved = 0;
  let collided = 0;
  for (const sourceRsvp of sourceRsvps) {
    const targetRsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (queryBuilder) =>
        queryBuilder
          .eq("eventId", sourceRsvp.eventId)
          .eq("clerkUserId", input.canonicalClerkUserId),
      )
      .first();
    if (targetRsvp && targetRsvp._id !== sourceRsvp._id) {
      await mergeRsvpCollision(ctx, { sourceRsvp, targetRsvp, ...input });
      collided += 1;
      continue;
    }

    const oldSourceRsvp = await ctx.db.get(sourceRsvp._id);
    await ctx.db.patch(sourceRsvp._id, {
      clerkUserId: input.canonicalClerkUserId,
      guestPhoneHash: undefined,
      pairedAt: sourceRsvp.pairedAt ?? input.now,
      updatedAt: Math.max(sourceRsvp.updatedAt, input.now),
    });
    const movedRsvp = await ctx.db.get(sourceRsvp._id);
    if (oldSourceRsvp && movedRsvp) {
      await replaceRsvpAggregateSafely(ctx, oldSourceRsvp, movedRsvp);
    }
    await repointRsvpReferences(ctx, {
      sourceRsvp,
      targetRsvpId: sourceRsvp._id,
      canonicalClerkUserId: input.canonicalClerkUserId,
      canonicalUserId: input.canonicalUserId,
      now: input.now,
    });
    await mergeRedemptions(ctx, {
      eventId: sourceRsvp.eventId,
      sourceClerkUserId: input.sourceClerkUserId,
      canonicalClerkUserId: input.canonicalClerkUserId,
    });
    moved += 1;
  }
  return { moved, collided };
}

function membershipRoleRank(role: string): number {
  switch (role.replace(/^org:/, "")) {
    case "admin":
      return 4;
    case "host":
      return 3;
    case "door":
    case "member":
      return 2;
    case "guest":
      return 1;
    default:
      return 0;
  }
}

async function mergeOrganizationMemberships(
  ctx: MutationCtx,
  sourceClerkUserId: string,
  canonicalClerkUserId: string,
): Promise<void> {
  const sourceMemberships = await ctx.db
    .query("orgMemberships")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", sourceClerkUserId))
    .collect();
  for (const sourceMembership of sourceMemberships) {
    const canonicalMembership = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", canonicalClerkUserId))
      .filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("organizationId"), sourceMembership.organizationId),
      )
      .first();
    if (!canonicalMembership) {
      await ctx.db.patch(sourceMembership._id, { clerkUserId: canonicalClerkUserId });
      continue;
    }

    const sourceWins =
      membershipRoleRank(sourceMembership.role) > membershipRoleRank(canonicalMembership.role) ||
      (membershipRoleRank(sourceMembership.role) === membershipRoleRank(canonicalMembership.role) &&
        sourceMembership.updatedAt > canonicalMembership.updatedAt);
    await ctx.db.patch(canonicalMembership._id, {
      role: sourceWins ? sourceMembership.role : canonicalMembership.role,
      createdAt: Math.min(sourceMembership.createdAt, canonicalMembership.createdAt),
      updatedAt: Math.max(sourceMembership.updatedAt, canonicalMembership.updatedAt),
    });
    await ctx.db.delete(sourceMembership._id);
  }
}

async function mergeDashboardPreferences(
  ctx: MutationCtx,
  sourceClerkUserId: string,
  canonicalClerkUserId: string,
): Promise<void> {
  const sourcePreferences = await ctx.db
    .query("dashboardTablePreferences")
    .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("clerkUserId"), sourceClerkUserId))
    .collect();
  for (const sourcePreference of sourcePreferences) {
    const canonicalPreference = await ctx.db
      .query("dashboardTablePreferences")
      .withIndex("by_user_workspace_table_scope", (queryBuilder) =>
        queryBuilder
          .eq("clerkUserId", canonicalClerkUserId)
          .eq("workspaceId", sourcePreference.workspaceId)
          .eq("tableKey", sourcePreference.tableKey)
          .eq("scopeKey", sourcePreference.scopeKey),
      )
      .first();
    if (!canonicalPreference) {
      await ctx.db.patch(sourcePreference._id, { clerkUserId: canonicalClerkUserId });
      continue;
    }
    if (sourcePreference.updatedAt > canonicalPreference.updatedAt) {
      await ctx.db.patch(canonicalPreference._id, {
        columnOrder: sourcePreference.columnOrder,
        hiddenColumnIds: sourcePreference.hiddenColumnIds,
        updatedAt: sourcePreference.updatedAt,
      });
    }
    await ctx.db.delete(sourcePreference._id);
  }
}

async function mergeLegacyProfiles(
  ctx: MutationCtx,
  sourceClerkUserId: string,
  canonicalClerkUserId: string,
): Promise<void> {
  const sourceProfiles = await ctx.db
    .query("profiles")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", sourceClerkUserId))
    .collect();
  const canonicalProfiles = await ctx.db
    .query("profiles")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", canonicalClerkUserId))
    .collect();
  let canonicalProfile = canonicalProfiles.sort(
    (firstProfile, secondProfile) => secondProfile.updatedAt - firstProfile.updatedAt,
  )[0];
  for (const duplicateCanonicalProfile of canonicalProfiles.slice(1)) {
    await ctx.db.delete(duplicateCanonicalProfile._id);
  }
  for (const sourceProfile of sourceProfiles) {
    if (!canonicalProfile) {
      await ctx.db.patch(sourceProfile._id, { clerkUserId: canonicalClerkUserId });
      canonicalProfile = { ...sourceProfile, clerkUserId: canonicalClerkUserId };
      continue;
    }
    if (sourceProfile.updatedAt > canonicalProfile.updatedAt) {
      await ctx.db.patch(canonicalProfile._id, {
        phoneEnc: sourceProfile.phoneEnc ?? canonicalProfile.phoneEnc,
        phoneObfuscated: sourceProfile.phoneObfuscated ?? canonicalProfile.phoneObfuscated,
        updatedAt: sourceProfile.updatedAt,
      });
    }
    await ctx.db.delete(sourceProfile._id);
  }
}

async function mergeWorkspaceGuestProfiles(
  ctx: MutationCtx,
  input: {
    sourceClerkUserId: string;
    canonicalClerkUserId: string;
    phoneHash: string;
    now: number;
  },
): Promise<void> {
  const matchingProfiles = (await ctx.db.query("workspaceGuestProfiles").collect()).filter(
    (profile) =>
      profile.clerkUserId === input.sourceClerkUserId ||
      profile.clerkUserId === input.canonicalClerkUserId ||
      profile.guestPhoneHash === input.phoneHash,
  );
  const workspaceIds = new Set(matchingProfiles.map((profile) => String(profile.workspaceId)));
  for (const workspaceId of workspaceIds) {
    const workspaceProfiles = matchingProfiles.filter(
      (profile) => String(profile.workspaceId) === workspaceId,
    );
    const targetProfile =
      workspaceProfiles.find(
        (profile) =>
          profile.guestPhoneHash === input.phoneHash &&
          profile.clerkUserId === input.canonicalClerkUserId,
      ) ??
      workspaceProfiles.find((profile) => profile.guestPhoneHash === input.phoneHash) ??
      workspaceProfiles.find((profile) => profile.clerkUserId === input.canonicalClerkUserId) ??
      workspaceProfiles[0];
    const newestProfile = [...workspaceProfiles].sort(
      (firstProfile, secondProfile) => secondProfile.updatedAt - firstProfile.updatedAt,
    )[0];
    const tags = Array.from(
      new Set(workspaceProfiles.flatMap((profile) => profile.tags ?? []).map((tag) => tag.trim())),
    ).filter(Boolean);
    const notes = workspaceProfiles
      .sort((firstProfile, secondProfile) => firstProfile.createdAt - secondProfile.createdAt)
      .reduce<string | undefined>(
        (combinedNotes, profile) => combineDistinctText(combinedNotes, profile.notes),
        undefined,
      );
    const invitedByHistory = workspaceProfiles.reduce(
      (history, profile) =>
        mergeInviterHistoryEntries(
          history,
          (profile.invitedByHistory ?? []).map((entry) => ({
            displayName: entry.displayName,
            seenAt: entry.lastSeenAt,
            firstSeenAt: entry.firstSeenAt,
          })),
        ),
      [] as NonNullable<Doc<"workspaceGuestProfiles">["invitedByHistory"]>,
    );
    await ctx.db.patch(targetProfile._id, {
      clerkUserId: input.canonicalClerkUserId,
      guestPhoneHash: input.phoneHash,
      tags,
      notes,
      defaultListKey: newestProfile.defaultListKey,
      invitedByHistory,
      createdAt: Math.min(...workspaceProfiles.map((profile) => profile.createdAt)),
      updatedAt: Math.max(input.now, ...workspaceProfiles.map((profile) => profile.updatedAt)),
    });
    for (const duplicateProfile of workspaceProfiles) {
      if (duplicateProfile._id !== targetProfile._id) await ctx.db.delete(duplicateProfile._id);
    }
  }
}

async function mergeSocialProfiles(
  ctx: MutationCtx,
  input: {
    sourceClerkUserId: string;
    canonicalClerkUserId: string;
    canonicalUserId: Id<"users">;
  },
): Promise<void> {
  const profiles = (
    await Promise.all(
      [input.canonicalClerkUserId, input.sourceClerkUserId].map(
        async (clerkUserId) =>
          await ctx.db
            .query("userSocialProfiles")
            .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
            .collect(),
      ),
    )
  ).flat();
  const platformKeys = new Set(profiles.map((profile) => profile.platformKey));
  for (const platformKey of platformKeys) {
    const platformProfiles = profiles
      .filter((profile) => profile.platformKey === platformKey)
      .sort(
        (firstProfile, secondProfile) =>
          secondProfile.updatedAt - firstProfile.updatedAt ||
          String(firstProfile._id).localeCompare(String(secondProfile._id)),
      );
    const targetProfile = platformProfiles[0];
    await ctx.db.patch(targetProfile._id, {
      clerkUserId: input.canonicalClerkUserId,
      userId: input.canonicalUserId,
    });
    for (const duplicateProfile of platformProfiles.slice(1)) {
      const snapshots = await ctx.db
        .query("rsvpSocialProfiles")
        .filter((queryBuilder) =>
          queryBuilder.eq(queryBuilder.field("userSocialProfileId"), duplicateProfile._id),
        )
        .collect();
      for (const snapshot of snapshots) {
        await ctx.db.patch(snapshot._id, {
          userSocialProfileId: targetProfile._id,
          clerkUserId: input.canonicalClerkUserId,
        });
      }
      await ctx.db.delete(duplicateProfile._id);
    }
  }
}

async function mergeProfileFieldValuesAndGrants(
  ctx: MutationCtx,
  input: {
    sourceClerkUserId: string;
    canonicalClerkUserId: string;
    canonicalUserId: Id<"users">;
  },
): Promise<void> {
  const profileValues = (
    await Promise.all(
      [input.canonicalClerkUserId, input.sourceClerkUserId].map(
        async (clerkUserId) =>
          await ctx.db
            .query("profileFieldValues")
            .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
            .collect(),
      ),
    )
  ).flat();
  const valueGroups = new Map<string, Doc<"profileFieldValues">[]>();
  for (const profileValue of profileValues) {
    const valueKey = `${profileValue.fieldKey}:${profileValue.normalizedValue}`;
    valueGroups.set(valueKey, [...(valueGroups.get(valueKey) ?? []), profileValue]);
  }
  for (const groupedValues of valueGroups.values()) {
    const orderedValues = groupedValues.sort(
      (firstValue, secondValue) =>
        secondValue.updatedAt - firstValue.updatedAt ||
        String(firstValue._id).localeCompare(String(secondValue._id)),
    );
    const targetValue = orderedValues[0];
    await ctx.db.patch(targetValue._id, {
      clerkUserId: input.canonicalClerkUserId,
      userId: input.canonicalUserId,
    });
    for (const duplicateValue of orderedValues.slice(1)) {
      const grants = await ctx.db
        .query("workspaceProfileValueGrants")
        .withIndex("by_profile_value", (queryBuilder) =>
          queryBuilder.eq("profileFieldValueId", duplicateValue._id),
        )
        .collect();
      for (const grant of grants) {
        await ctx.db.patch(grant._id, { profileFieldValueId: targetValue._id });
      }
      await ctx.db.delete(duplicateValue._id);
    }
  }

  const grants = (
    await Promise.all(
      [input.canonicalClerkUserId, input.sourceClerkUserId].map(
        async (clerkUserId) =>
          await ctx.db
            .query("workspaceProfileValueGrants")
            .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
            .collect(),
      ),
    )
  ).flat();
  const grantGroups = new Map<string, Doc<"workspaceProfileValueGrants">[]>();
  for (const grant of grants) {
    const grantKey = [
      grant.workspaceId ?? "",
      grant.workspaceSlug ?? "",
      grant.siteKey ?? "",
      grant.fieldKey,
      grant.profileFieldValueId,
    ].join(":");
    grantGroups.set(grantKey, [...(grantGroups.get(grantKey) ?? []), grant]);
  }
  for (const groupedGrants of grantGroups.values()) {
    const targetGrant = groupedGrants.sort(
      (firstGrant, secondGrant) =>
        secondGrant.updatedAt - firstGrant.updatedAt ||
        String(firstGrant._id).localeCompare(String(secondGrant._id)),
    )[0];
    const hasActiveGrant = groupedGrants.some((grant) => grant.revokedAt === undefined);
    await ctx.db.patch(targetGrant._id, {
      clerkUserId: input.canonicalClerkUserId,
      revokedAt: hasActiveGrant ? undefined : targetGrant.revokedAt,
      createdAt: Math.min(...groupedGrants.map((grant) => grant.createdAt)),
    });
    for (const duplicateGrant of groupedGrants) {
      if (duplicateGrant._id !== targetGrant._id) await ctx.db.delete(duplicateGrant._id);
    }
  }
}

async function mergeSmsOrganizerPreferences(
  ctx: MutationCtx,
  sourceClerkUserId: string,
  canonicalClerkUserId: string,
): Promise<void> {
  const sourcePreferences = await ctx.db
    .query("userSmsOrganizerPreferences")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", sourceClerkUserId))
    .collect();
  for (const sourcePreference of sourcePreferences) {
    const canonicalPreference = await ctx.db
      .query("userSmsOrganizerPreferences")
      .withIndex("by_user_organizer", (queryBuilder) =>
        queryBuilder
          .eq("clerkUserId", canonicalClerkUserId)
          .eq("organizerKey", sourcePreference.organizerKey),
      )
      .first();
    if (!canonicalPreference) {
      await ctx.db.patch(sourcePreference._id, { clerkUserId: canonicalClerkUserId });
      continue;
    }
    const sourceTimestamp = sourcePreference.smsConsentTimestamp ?? sourcePreference.updatedAt;
    const canonicalTimestamp =
      canonicalPreference.smsConsentTimestamp ?? canonicalPreference.updatedAt;
    if (sourceTimestamp > canonicalTimestamp) {
      await ctx.db.patch(canonicalPreference._id, {
        smsConsent: sourcePreference.smsConsent,
        smsConsentTimestamp: sourcePreference.smsConsentTimestamp,
        smsConsentIpAddress: sourcePreference.smsConsentIpAddress,
        sourceEventId: sourcePreference.sourceEventId,
        sourceRsvpId: sourcePreference.sourceRsvpId,
        updatedAt: sourcePreference.updatedAt,
      });
    }
    await ctx.db.delete(sourcePreference._id);
  }
}

async function canonicalizeCommunicationRecords(
  ctx: MutationCtx,
  input: {
    sourceClerkUserId: string;
    canonicalClerkUserId: string;
    canonicalUserId: Id<"users">;
    phoneHash: string;
    now: number;
  },
): Promise<void> {
  const notifications = await ctx.db
    .query("smsNotifications")
    .withIndex("by_user", (queryBuilder) =>
      queryBuilder.eq("recipientClerkUserId", input.sourceClerkUserId),
    )
    .collect();
  for (const notification of notifications) {
    await ctx.db.patch(notification._id, { recipientClerkUserId: input.canonicalClerkUserId });
  }

  const optOuts = await ctx.db
    .query("smsOptOuts")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", input.sourceClerkUserId))
    .collect();
  for (const optOut of optOuts) {
    const matchingOptOut = await ctx.db
      .query("smsOptOuts")
      .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneNumber", optOut.phoneNumber))
      .filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("clerkUserId"), input.canonicalClerkUserId),
      )
      .first();
    if (matchingOptOut) {
      await ctx.db.patch(matchingOptOut._id, {
        optedOutAt: Math.max(matchingOptOut.optedOutAt, optOut.optedOutAt),
        reOptInAt: Math.max(matchingOptOut.reOptInAt ?? 0, optOut.reOptInAt ?? 0) || undefined,
      });
      await ctx.db.delete(optOut._id);
    } else {
      await ctx.db.patch(optOut._id, { clerkUserId: input.canonicalClerkUserId });
    }
  }

  const sessions = await ctx.db.query("smsRsvpSessions").collect();
  for (const session of sessions) {
    if (
      session.clerkUserId === input.sourceClerkUserId ||
      session.registeredUserId === input.canonicalUserId ||
      session.phoneHash === input.phoneHash
    ) {
      await ctx.db.patch(session._id, {
        clerkUserId: input.canonicalClerkUserId,
        registeredUserId: input.canonicalUserId,
        updatedAt: Math.max(session.updatedAt, input.now),
      });
    }
  }

  const conversationThreads = await ctx.db
    .query("smsConversationThreads")
    .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", input.phoneHash))
    .collect();
  for (const conversationThread of conversationThreads) {
    const participants = Array.from(
      new Set(
        conversationThread.participantClerkUserIds.map((clerkUserId) =>
          clerkUserId === input.sourceClerkUserId ? input.canonicalClerkUserId : clerkUserId,
        ),
      ),
    );
    await ctx.db.patch(conversationThread._id, {
      participantClerkUserIds: participants,
      updatedAt: Math.max(conversationThread.updatedAt, input.now),
    });
  }

  const blastRecipients = await ctx.db
    .query("textBlastRecipients")
    .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", input.phoneHash))
    .collect();
  for (const blastRecipient of blastRecipients) {
    await ctx.db.patch(blastRecipient._id, {
      recipientClerkUserIds: Array.from(
        new Set(
          blastRecipient.recipientClerkUserIds.map((clerkUserId) =>
            clerkUserId === input.sourceClerkUserId ? input.canonicalClerkUserId : clerkUserId,
          ),
        ),
      ),
      updatedAt: Math.max(blastRecipient.updatedAt, input.now),
    });
  }
}

async function repointUserReferences(
  ctx: MutationCtx,
  input: {
    sourceUserId: Id<"users">;
    canonicalUserId: Id<"users">;
    sourceClerkUserId: string;
    canonicalClerkUserId: string;
  },
): Promise<void> {
  const allRsvps = await ctx.db.query("rsvps").collect();
  for (const rsvp of allRsvps) {
    const invitedByUserId =
      rsvp.invitedByUserId === input.sourceUserId ? input.canonicalUserId : rsvp.invitedByUserId;
    const referrerUserId =
      rsvp.referrerUserId === input.sourceUserId ? input.canonicalUserId : rsvp.referrerUserId;
    const referrerClerkUserId =
      rsvp.referrerClerkUserId === input.sourceClerkUserId
        ? input.canonicalClerkUserId
        : rsvp.referrerClerkUserId;
    if (
      invitedByUserId !== rsvp.invitedByUserId ||
      referrerUserId !== rsvp.referrerUserId ||
      referrerClerkUserId !== rsvp.referrerClerkUserId
    ) {
      await ctx.db.patch(rsvp._id, { invitedByUserId, referrerUserId, referrerClerkUserId });
    }
  }
}

async function upsertUserAlias(
  ctx: MutationCtx,
  input: {
    sourceUser: Doc<"users">;
    canonicalUser: Doc<"users">;
    phoneHash: string;
    now: number;
  },
): Promise<void> {
  const sourceClerkUserId = requireClerkUserId(input.sourceUser);
  const canonicalClerkUserId = requireClerkUserId(input.canonicalUser);
  const existingAlias = await ctx.db
    .query("userIdentityAliases")
    .withIndex("by_alias", (queryBuilder) => queryBuilder.eq("aliasClerkUserId", sourceClerkUserId))
    .first();
  const aliasPatch = {
    canonicalClerkUserId,
    canonicalUserId: input.canonicalUser._id,
    phoneHash: input.phoneHash,
    retiredUserId: input.sourceUser._id,
    legacyReferralCode: input.sourceUser.referralCode,
    updatedAt: input.now,
  };
  if (existingAlias) {
    await ctx.db.patch(existingAlias._id, aliasPatch);
  } else {
    await ctx.db.insert("userIdentityAliases", {
      aliasClerkUserId: sourceClerkUserId,
      ...aliasPatch,
      createdAt: input.now,
    });
  }

  const aliasesPointingToSource = await ctx.db
    .query("userIdentityAliases")
    .withIndex("by_canonical", (queryBuilder) =>
      queryBuilder.eq("canonicalClerkUserId", sourceClerkUserId),
    )
    .collect();
  for (const chainedAlias of aliasesPointingToSource) {
    await ctx.db.patch(chainedAlias._id, {
      canonicalClerkUserId,
      canonicalUserId: input.canonicalUser._id,
      phoneHash: input.phoneHash,
      updatedAt: input.now,
    });
  }
}

function newestNonEmptyUserValue(
  users: readonly Doc<"users">[],
  selectValue: (user: Doc<"users">) => string | undefined,
): string | undefined {
  return [...users]
    .sort((firstUser, secondUser) => secondUser.updatedAt - firstUser.updatedAt)
    .map(selectValue)
    .find((value) => Boolean(value?.trim()))
    ?.trim();
}

export async function consolidateDuplicatePhoneGroup(
  ctx: MutationCtx,
  input: {
    phoneHash: string;
    users: readonly Doc<"users">[];
    snapshotReference: string;
  },
): Promise<DuplicateUserMergeResult> {
  const report = await buildDuplicatePhoneGroupReport(ctx, input.phoneHash, input.users);
  const canonicalUser = input.users.find((user) => user._id === report.canonicalUserId);
  if (!canonicalUser) throw new Error("Canonical user disappeared before consolidation");
  const canonicalClerkUserId = requireClerkUserId(canonicalUser);
  const retiredUsers = input.users.filter((user) => user._id !== canonicalUser._id);
  const now = Date.now();
  let movedCount = 0;
  let collisionCount = 0;

  // The alias is written first. If a Clerk webhook arrives after this point,
  // it resolves the canonical user and cannot recreate the retiring row.
  for (const sourceUser of retiredUsers) {
    await upsertUserAlias(ctx, {
      sourceUser,
      canonicalUser,
      phoneHash: input.phoneHash,
      now,
    });
  }

  for (const sourceUser of retiredUsers) {
    const sourceClerkUserId = requireClerkUserId(sourceUser);
    const historicalRsvps = [
      ...(await loadRsvpsByUser(ctx, sourceClerkUserId)),
      ...(await loadRsvpsByUser(ctx, canonicalClerkUserId)),
    ];
    for (const historicalRsvp of historicalRsvps) {
      if (!historicalRsvp.invitedByName) continue;
      const event = await ctx.db.get(historicalRsvp.eventId);
      if (!event) continue;
      await appendInviterHistoryForContact(ctx, {
        event,
        clerkUserId: canonicalClerkUserId,
        guestPhoneHash: input.phoneHash,
        invitedByName: historicalRsvp.invitedByName,
        seenAt: historicalRsvp.updatedAt,
      });
    }
    const rsvpMoveResult = await moveUserRsvps(ctx, {
      sourceClerkUserId,
      canonicalClerkUserId,
      canonicalUserId: canonicalUser._id,
      now,
    });
    movedCount += rsvpMoveResult.moved;
    collisionCount += rsvpMoveResult.collided;

    await mergeOrganizationMemberships(ctx, sourceClerkUserId, canonicalClerkUserId);
    await mergeDashboardPreferences(ctx, sourceClerkUserId, canonicalClerkUserId);
    await mergeLegacyProfiles(ctx, sourceClerkUserId, canonicalClerkUserId);
    await mergeWorkspaceGuestProfiles(ctx, {
      sourceClerkUserId,
      canonicalClerkUserId,
      phoneHash: input.phoneHash,
      now,
    });
    await mergeSocialProfiles(ctx, {
      sourceClerkUserId,
      canonicalClerkUserId,
      canonicalUserId: canonicalUser._id,
    });
    await mergeProfileFieldValuesAndGrants(ctx, {
      sourceClerkUserId,
      canonicalClerkUserId,
      canonicalUserId: canonicalUser._id,
    });
    await mergeSmsOrganizerPreferences(ctx, sourceClerkUserId, canonicalClerkUserId);
    await canonicalizeCommunicationRecords(ctx, {
      sourceClerkUserId,
      canonicalClerkUserId,
      canonicalUserId: canonicalUser._id,
      phoneHash: input.phoneHash,
      now,
    });
    await repointUserReferences(ctx, {
      sourceUserId: sourceUser._id,
      canonicalUserId: canonicalUser._id,
      sourceClerkUserId,
      canonicalClerkUserId,
    });
    await ctx.db.delete(sourceUser._id);
  }

  const metadata = [...input.users]
    .sort((firstUser, secondUser) => firstUser.updatedAt - secondUser.updatedAt)
    .reduce<Record<string, string>>((mergedMetadata, user) => {
      return { ...mergedMetadata, ...(user.metadata ?? {}) };
    }, {});
  await ctx.db.patch(canonicalUser._id, {
    phone: canonicalUser.phone,
    phoneHash: input.phoneHash,
    firstName: newestNonEmptyUserValue(input.users, (user) => user.firstName),
    lastName: newestNonEmptyUserValue(input.users, (user) => user.lastName),
    imageUrl: newestNonEmptyUserValue(input.users, (user) => user.imageUrl),
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    updatedAt: now,
  });

  await writeAuditEntry(ctx, {
    action: "identity.samePhoneConsolidated",
    targetKind: "user",
    targetId: canonicalUser._id,
    summary: `Consolidated ${retiredUsers.length} same-phone user identities`,
    metadata: {
      phoneHash: input.phoneHash,
      canonicalClerkUserId,
      retiredClerkUserIds: retiredUsers.map(requireClerkUserId).join(","),
      movedRsvpCount: String(movedCount),
      collisionCount: String(collisionCount),
      snapshotReference: input.snapshotReference,
      outcome: "completed",
    },
  });

  return {
    ...report,
    rsvpMoveCount: movedCount,
    rsvpCollisionCount: collisionCount,
    mergedAt: now,
    removedRsvpCount: collisionCount,
  };
}
