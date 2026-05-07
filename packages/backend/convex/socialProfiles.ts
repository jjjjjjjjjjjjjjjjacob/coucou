import { mutation, query } from "./functions";
import { v } from "convex/values";
import {
  normalizePrimaryFieldLookupText,
  normalizeSocialHandleInput,
  normalizeSocialPlatformKey,
} from "@coucou/sdk/shared/primary-fields";
import {
  socialPlatformKeyFromProfileFieldKey,
  upsertProfileFieldValue,
} from "./lib/profileValueRecords";
import { upsertUserSocialProfile } from "./lib/socialProfileRecords";

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const profileFieldValues = await ctx.db
      .query("profileFieldValues")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", identity.subject),
      )
      .collect();
    const socialProfileFieldValues = profileFieldValues
      .map((profileFieldValue) => {
        const platformKey = socialPlatformKeyFromProfileFieldKey(
          profileFieldValue.fieldKey,
        );
        if (!platformKey) return null;
        return {
          _id: profileFieldValue._id,
          platformKey,
          handle: profileFieldValue.value,
          normalizedHandle: profileFieldValue.normalizedValue,
          profileFieldValueId: profileFieldValue._id,
          fieldKey: profileFieldValue.fieldKey,
          label: profileFieldValue.label,
          createdAt: profileFieldValue.createdAt,
          updatedAt: profileFieldValue.updatedAt,
        };
      })
      .filter(
        (
          profile,
        ): profile is {
          _id: typeof profileFieldValues[number]["_id"];
          platformKey: string;
          handle: string;
          normalizedHandle: string;
          profileFieldValueId: typeof profileFieldValues[number]["_id"];
          fieldKey: string;
          label: string | undefined;
          createdAt: number;
          updatedAt: number;
        } => profile !== null,
      )
      .sort(
        (firstProfile, secondProfile) =>
          secondProfile.updatedAt - firstProfile.updatedAt,
      );

    if (socialProfileFieldValues.length > 0) {
      return socialProfileFieldValues;
    }

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

    await upsertProfileFieldValue(ctx, {
      clerkUserId: identity.subject,
      userId: user?._id,
      fieldKey: `social.${normalizedPlatformKey}`,
      value: normalizedHandle,
      normalizedValue: normalizePrimaryFieldLookupText(normalizedHandle),
      source: "profile",
    });

    return await upsertUserSocialProfile(ctx, {
      clerkUserId: identity.subject,
      userId: user?._id,
      platformKey: normalizedPlatformKey,
      handle: normalizedHandle,
      normalizedHandle: normalizePrimaryFieldLookupText(normalizedHandle),
    });
  },
});
