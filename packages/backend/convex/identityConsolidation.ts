import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import { resolveCanonicalClerkUserId } from "./lib/canonicalUserIdentity";
import { appendInviterHistoryForContact } from "./lib/inviterHistory";
import { normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { requireCoucouPlatformMember } from "./lib/platformAuth";
import { rsvpAggregate } from "./lib/rsvpAggregate";
import {
  buildDuplicatePhoneGroupReport,
  consolidateDuplicatePhoneGroup,
} from "./lib/userIdentityMerge";

const EXECUTION_CONFIRMATION = "CONSOLIDATE_SAME_PHONE_USERS";

function resolveBatchSize(batchSize: number | undefined, maximumBatchSize: number): number {
  return Math.max(1, Math.min(batchSize ?? 1, maximumBatchSize));
}

export const backfillUserPhoneHashes = mutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { cursor, batchSize, dryRun = true }) => {
    await requireCoucouPlatformMember(ctx);
    const paginationResult = await ctx.db.query("users").paginate({
      cursor: cursor ?? null,
      numItems: resolveBatchSize(batchSize, 200),
    });
    const updates: Array<{
      userId: Id<"users">;
      normalizedPhoneNumber: string;
      phoneHash: string;
    }> = [];
    const invalidPhones: Array<{ userId: Id<"users">; phone: string; error: string }> = [];

    for (const user of paginationResult.page) {
      if (!user.phone) continue;
      try {
        const phoneResolution = await normalizeAndHashPhoneNumber(user.phone);
        if (
          user.phone !== phoneResolution.normalizedPhoneNumber ||
          user.phoneHash !== phoneResolution.phoneHash
        ) {
          updates.push({ userId: user._id, ...phoneResolution });
          if (!dryRun) {
            await ctx.db.patch(user._id, {
              phone: phoneResolution.normalizedPhoneNumber,
              phoneHash: phoneResolution.phoneHash,
              updatedAt: Math.max(user.updatedAt, Date.now()),
            });
          }
        }
      } catch (error) {
        invalidPhones.push({
          userId: user._id,
          phone: user.phone,
          error: error instanceof Error ? error.message : "Invalid phone number",
        });
      }
    }

    return {
      dryRun,
      updates,
      invalidPhones,
      nextCursor: paginationResult.isDone ? null : paginationResult.continueCursor,
      isDone: paginationResult.isDone,
    };
  },
});

async function loadDuplicatePhoneGroups(
  ctx: { db: Parameters<typeof buildDuplicatePhoneGroupReport>[0]["db"] },
): Promise<Map<string, Doc<"users">[]>> {
  const users = await ctx.db.query("users").collect();
  const usersByPhoneHash = new Map<string, Doc<"users">[]>();
  for (const user of users) {
    if (!user.phoneHash) continue;
    usersByPhoneHash.set(user.phoneHash, [...(usersByPhoneHash.get(user.phoneHash) ?? []), user]);
  }
  return new Map(
    Array.from(usersByPhoneHash.entries()).filter(([, matchingUsers]) => matchingUsers.length > 1),
  );
}

export const processDuplicatePhoneGroups = mutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    confirmation: v.optional(v.string()),
    snapshotReference: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { cursor, batchSize, dryRun = true, confirmation, snapshotReference },
  ) => {
    await requireCoucouPlatformMember(ctx);
    if (!dryRun) {
      if (confirmation !== EXECUTION_CONFIRMATION) {
        throw new Error(`Execution requires confirmation=${EXECUTION_CONFIRMATION}`);
      }
      if (!snapshotReference?.trim()) {
        throw new Error("A recoverable production snapshot reference is required before execution");
      }
    }

    const duplicateGroups = await loadDuplicatePhoneGroups(ctx);
    const allPhoneHashes = Array.from(duplicateGroups.keys()).sort();
    const remainingPhoneHashes = allPhoneHashes.filter((phoneHash) => !cursor || phoneHash > cursor);
    const selectedPhoneHashes = remainingPhoneHashes.slice(0, resolveBatchSize(batchSize, 5));
    const reports = [];
    const unresolvedGroups: Array<{ phoneHash: string; userIds: Id<"users">[]; reason: string }> = [];

    for (const phoneHash of selectedPhoneHashes) {
      const users = duplicateGroups.get(phoneHash) ?? [];
      if (users.some((user) => !user.clerkUserId)) {
        unresolvedGroups.push({
          phoneHash,
          userIds: users.map((user) => user._id),
          reason: "One or more users have no Clerk user ID",
        });
        continue;
      }
      reports.push(
        dryRun
          ? await buildDuplicatePhoneGroupReport(ctx, phoneHash, users)
          : await consolidateDuplicatePhoneGroup(ctx, {
              phoneHash,
              users,
              snapshotReference: snapshotReference as string,
            }),
      );
    }

    const lastProcessedPhoneHash = selectedPhoneHashes.at(-1) ?? cursor ?? null;
    const isDone = selectedPhoneHashes.length >= remainingPhoneHashes.length;
    return {
      dryRun,
      reports,
      unresolvedGroups,
      nextCursor: isDone ? null : lastProcessedPhoneHash,
      isDone,
      remainingGroupCount: Math.max(0, remainingPhoneHashes.length - selectedPhoneHashes.length),
    };
  },
});

export const backfillInviterHistory = mutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { cursor, batchSize, dryRun = true }) => {
    await requireCoucouPlatformMember(ctx);
    const paginationResult = await ctx.db.query("rsvps").paginate({
      cursor: cursor ?? null,
      numItems: resolveBatchSize(batchSize, 200),
    });
    let inviterValueCount = 0;
    for (const rsvp of paginationResult.page) {
      if (!rsvp.invitedByName?.trim()) continue;
      inviterValueCount += 1;
      if (dryRun) continue;
      const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, rsvp.clerkUserId);
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (queryBuilder) =>
          queryBuilder.eq("clerkUserId", canonicalClerkUserId),
        )
        .first();
      const event = await ctx.db.get(rsvp.eventId);
      if (!event) continue;
      await appendInviterHistoryForContact(ctx, {
        event,
        clerkUserId: canonicalClerkUserId,
        guestPhoneHash: rsvp.guestPhoneHash ?? user?.phoneHash,
        invitedByName: rsvp.invitedByName,
        seenAt: rsvp.updatedAt,
      });
    }
    return {
      dryRun,
      scannedCount: paginationResult.page.length,
      inviterValueCount,
      nextCursor: paginationResult.isDone ? null : paginationResult.continueCursor,
      isDone: paginationResult.isDone,
    };
  },
});

export const getPostMigrationHealth = query({
  args: { phoneHash: v.optional(v.string()) },
  handler: async (ctx, { phoneHash }) => {
    await requireCoucouPlatformMember(ctx);
    const users = await ctx.db.query("users").collect();
    const activeUserCountByPhoneHash = new Map<string, number>();
    for (const user of users) {
      if (!user.phoneHash) continue;
      activeUserCountByPhoneHash.set(
        user.phoneHash,
        (activeUserCountByPhoneHash.get(user.phoneHash) ?? 0) + 1,
      );
    }
    const duplicatePhoneHashes = Array.from(activeUserCountByPhoneHash.entries())
      .filter(([, activeUserCount]) => activeUserCount > 1)
      .map(([phoneHash, activeUserCount]) => ({ phoneHash, activeUserCount }));

    const aliases = await ctx.db.query("userIdentityAliases").collect();
    const danglingAliases: string[] = [];
    for (const alias of aliases) {
      const canonicalUser = await ctx.db.get(alias.canonicalUserId);
      if (
        !canonicalUser ||
        canonicalUser.clerkUserId !== alias.canonicalClerkUserId ||
        canonicalUser._id === alias.retiredUserId
      ) {
        danglingAliases.push(alias.aliasClerkUserId);
      }
    }

    const retiredClerkUserIds = new Set(aliases.map((alias) => alias.aliasClerkUserId));
    const retiredUserIds = new Set(
      aliases.flatMap((alias) => (alias.retiredUserId ? [String(alias.retiredUserId)] : [])),
    );
    let liveRetiredReferenceCount = 0;
    const rsvps = await ctx.db.query("rsvps").collect();
    for (const rsvp of rsvps) {
      if (
        retiredClerkUserIds.has(rsvp.clerkUserId) ||
        (rsvp.referrerClerkUserId && retiredClerkUserIds.has(rsvp.referrerClerkUserId)) ||
        (rsvp.invitedByUserId && retiredUserIds.has(String(rsvp.invitedByUserId))) ||
        (rsvp.referrerUserId && retiredUserIds.has(String(rsvp.referrerUserId)))
      ) {
        liveRetiredReferenceCount += 1;
      }
    }
    const membershipReferences = (await ctx.db.query("orgMemberships").collect()).filter(
      (membership) => retiredClerkUserIds.has(membership.clerkUserId),
    ).length;
    const profileReferences = (await ctx.db.query("profileFieldValues").collect()).filter(
      (profileValue) => retiredClerkUserIds.has(profileValue.clerkUserId),
    ).length;
    const socialProfileReferences = (await ctx.db.query("userSocialProfiles").collect()).filter(
      (socialProfile) =>
        retiredClerkUserIds.has(socialProfile.clerkUserId) ||
        (socialProfile.userId && retiredUserIds.has(String(socialProfile.userId))),
    ).length;
    const grantReferences = (await ctx.db.query("workspaceProfileValueGrants").collect()).filter(
      (grant) => retiredClerkUserIds.has(grant.clerkUserId),
    ).length;
    const preferenceReferences = (await ctx.db.query("userSmsOrganizerPreferences").collect()).filter(
      (preference) => retiredClerkUserIds.has(preference.clerkUserId),
    ).length;
    const notificationReferences = (await ctx.db.query("smsNotifications").collect()).filter(
      (notification) => retiredClerkUserIds.has(notification.recipientClerkUserId),
    ).length;
    const sessionReferences = (await ctx.db.query("smsRsvpSessions").collect()).filter(
      (session) =>
        retiredClerkUserIds.has(session.clerkUserId) ||
        (session.registeredUserId && retiredUserIds.has(String(session.registeredUserId))),
    ).length;
    const threadReferences = (await ctx.db.query("smsConversationThreads").collect()).filter(
      (thread) =>
        thread.participantClerkUserIds.some((clerkUserId) =>
          retiredClerkUserIds.has(clerkUserId),
        ),
    ).length;
    const blastRecipientReferences = (await ctx.db.query("textBlastRecipients").collect()).filter(
      (recipient) =>
        recipient.recipientClerkUserIds.some((clerkUserId) =>
          retiredClerkUserIds.has(clerkUserId),
        ),
    ).length;
    liveRetiredReferenceCount +=
      membershipReferences +
      profileReferences +
      socialProfileReferences +
      grantReferences +
      preferenceReferences +
      notificationReferences +
      sessionReferences +
      threadReferences +
      blastRecipientReferences;

    const aggregateCount = await rsvpAggregate.count(ctx, {
      bounds: {
        lower: { key: ["", "", ""], inclusive: true },
        upper: { key: ["\uFFFF", "\uFFFF", "\uFFFF"], inclusive: true },
      },
    });

    const targetUsers = phoneHash
      ? await ctx.db
          .query("users")
          .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
          .collect()
      : [];
    const targetCanonicalUser = targetUsers[0] ?? null;
    const targetRsvps = targetCanonicalUser?.clerkUserId
      ? await ctx.db
          .query("rsvps")
          .withIndex("by_user", (queryBuilder) =>
            queryBuilder.eq("clerkUserId", targetCanonicalUser.clerkUserId as string),
          )
          .collect()
      : [];
    const targetSocialProfiles = targetCanonicalUser?.clerkUserId
      ? await ctx.db
          .query("userSocialProfiles")
          .withIndex("by_user", (queryBuilder) =>
            queryBuilder.eq("clerkUserId", targetCanonicalUser.clerkUserId as string),
          )
          .collect()
      : [];

    return {
      duplicatePhoneHashes,
      danglingAliases,
      liveRetiredReferenceCount,
      rsvpAggregate: {
        storedCount: rsvps.length,
        aggregateCount,
        healthy: rsvps.length === aggregateCount,
      },
      targetPhone: phoneHash
        ? {
            phoneHash,
            activeUserCount: targetUsers.length,
            canonicalUserId: targetCanonicalUser?._id ?? null,
            canonicalClerkUserId: targetCanonicalUser?.clerkUserId ?? null,
            rsvpCount: targetRsvps.length,
            socialProfileCount: targetSocialProfiles.length,
            distinctSocialIdentityCount: new Set(
              targetSocialProfiles.map(
                (profile) => `${profile.platformKey}:${profile.normalizedHandle}`,
              ),
            ).size,
          }
        : null,
      healthy:
        duplicatePhoneHashes.length === 0 &&
        danglingAliases.length === 0 &&
        liveRetiredReferenceCount === 0 &&
        rsvps.length === aggregateCount,
    };
  },
});
