import { mutation, query } from "./functions";
import { v } from "convex/values";
import {
  normalizePrimaryFieldLookupText,
  normalizeSocialHandleInput,
  normalizeSocialPlatformKey,
} from "@coucou/sdk/shared/primary-fields";
import { upsertUserSocialProfile } from "./lib/socialProfileRecords";

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("userSocialProfiles")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", identity.subject),
      )
      .collect();
  },
});

export const upsertForCurrentUser = mutation({
  args: {
    platformKey: v.string(),
    handle: v.string(),
  },
  handler: async (ctx, { platformKey, handle }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const normalizedPlatformKey = normalizeSocialPlatformKey(platformKey);
    const normalizedHandle = normalizeSocialHandleInput(
      handle,
      normalizedPlatformKey,
    );
    if (!normalizedPlatformKey) {
      throw new Error("Social platform is required");
    }
    if (!normalizedHandle) {
      throw new Error("Social handle is required");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", identity.subject),
      )
      .unique();

    return await upsertUserSocialProfile(ctx, {
      clerkUserId: identity.subject,
      userId: user?._id,
      platformKey: normalizedPlatformKey,
      handle: normalizedHandle,
      normalizedHandle: normalizePrimaryFieldLookupText(normalizedHandle),
    });
  },
});
