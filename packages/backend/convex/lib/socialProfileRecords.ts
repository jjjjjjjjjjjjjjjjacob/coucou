import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { SanitizedSubmittedSocialProfile } from "./primaryFields";

interface UpsertUserSocialProfileArgs {
  clerkUserId: string;
  userId?: Id<"users">;
  platformKey: string;
  handle: string;
  normalizedHandle: string;
}

export async function listUserSocialProfilesForClerkUser(ctx: QueryCtx, clerkUserId: string) {
  return await ctx.db
    .query("userSocialProfiles")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
    .collect();
}

export async function upsertUserSocialProfile(
  ctx: MutationCtx,
  { clerkUserId, userId, platformKey, handle, normalizedHandle }: UpsertUserSocialProfileArgs,
): Promise<Id<"userSocialProfiles">> {
  const now = Date.now();
  const existingProfile = await ctx.db
    .query("userSocialProfiles")
    .withIndex("by_user_platform", (queryBuilder) =>
      queryBuilder.eq("clerkUserId", clerkUserId).eq("platformKey", platformKey),
    )
    .unique();

  if (existingProfile) {
    await ctx.db.patch(existingProfile._id, {
      userId: userId ?? existingProfile.userId,
      handle,
      normalizedHandle,
      updatedAt: now,
    });
    return existingProfile._id;
  }

  return await ctx.db.insert("userSocialProfiles", {
    clerkUserId,
    userId,
    platformKey,
    handle,
    normalizedHandle,
    createdAt: now,
    updatedAt: now,
  });
}

export async function replaceRsvpSocialProfileSnapshots(
  ctx: MutationCtx,
  {
    eventId,
    rsvpId,
    clerkUserId,
    userId,
    configuredPlatformKeys,
    submittedProfiles,
    persistUserProfiles = true,
  }: {
    eventId: Id<"events">;
    rsvpId: Id<"rsvps">;
    clerkUserId: string;
    userId?: Id<"users">;
    configuredPlatformKeys: Set<string>;
    submittedProfiles: SanitizedSubmittedSocialProfile[];
    persistUserProfiles?: boolean;
  },
): Promise<void> {
  const submittedPlatformKeys = new Set(submittedProfiles.map((profile) => profile.platformKey));
  const existingSnapshots = await ctx.db
    .query("rsvpSocialProfiles")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpId))
    .collect();

  for (const existingSnapshot of existingSnapshots) {
    if (
      configuredPlatformKeys.has(existingSnapshot.platformKey) &&
      !submittedPlatformKeys.has(existingSnapshot.platformKey)
    ) {
      await ctx.db.delete(existingSnapshot._id);
    }
  }

  for (const profile of submittedProfiles) {
    const userSocialProfileId = persistUserProfiles
      ? await upsertUserSocialProfile(ctx, {
          clerkUserId,
          userId,
          platformKey: profile.platformKey,
          handle: profile.handle,
          normalizedHandle: profile.normalizedHandle,
        })
      : undefined;
    const existingSnapshot = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp_platform", (queryBuilder) =>
        queryBuilder.eq("rsvpId", rsvpId).eq("platformKey", profile.platformKey),
      )
      .unique();
    const now = Date.now();

    if (existingSnapshot) {
      await ctx.db.patch(existingSnapshot._id, {
        clerkUserId,
        userSocialProfileId,
        handle: profile.handle,
        normalizedHandle: profile.normalizedHandle,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("rsvpSocialProfiles", {
        eventId,
        rsvpId,
        clerkUserId,
        userSocialProfileId,
        platformKey: profile.platformKey,
        handle: profile.handle,
        normalizedHandle: profile.normalizedHandle,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}
