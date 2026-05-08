import {
  normalizePrimaryFieldLookupText,
  normalizeSocialHandleInput,
  normalizeSocialPlatformKey,
} from "@coucou/sdk/shared/primary-fields";
import { v } from "convex/values";
import { mutation, query } from "./functions";
import {
  socialPlatformKeyFromProfileFieldKey,
  upsertProfileFieldValue,
} from "./lib/profileValueRecords";
import { upsertUserSocialProfile } from "./lib/socialProfileRecords";
import { eventMatchesTenantScope, resolveTenantWorkspaceScope } from "./lib/workspaceScope";

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const profileFieldValues = await ctx.db
      .query("profileFieldValues")
      .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identity.subject))
      .collect();
    const socialProfileFieldValues = profileFieldValues
      .map((profileFieldValue) => {
        const platformKey = socialPlatformKeyFromProfileFieldKey(profileFieldValue.fieldKey);
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
          _id: (typeof profileFieldValues)[number]["_id"];
          platformKey: string;
          handle: string;
          normalizedHandle: string;
          profileFieldValueId: (typeof profileFieldValues)[number]["_id"];
          fieldKey: string;
          label: string | undefined;
          createdAt: number;
          updatedAt: number;
        } => profile !== null,
      )
      .sort((firstProfile, secondProfile) => secondProfile.updatedAt - firstProfile.updatedAt);

    if (socialProfileFieldValues.length > 0) {
      return socialProfileFieldValues;
    }

    return await ctx.db
      .query("userSocialProfiles")
      .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identity.subject))
      .collect();
  },
});

export const listForCurrentUserInWorkspace = query({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceSlug, siteKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    if (!workspaceSlug && !siteKey) return [];

    const scope = await resolveTenantWorkspaceScope(ctx, {
      workspaceSlug,
      siteKey,
    });
    if (!scope) return [];

    const userRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identity.subject))
      .collect();

    if (userRsvps.length === 0) return [];

    const eventEntries = await Promise.all(
      Array.from(new Set(userRsvps.map((rsvp) => rsvp.eventId))).map(async (eventId) => ({
        eventId,
        event: await ctx.db.get(eventId),
      })),
    );
    const inScopeEventIds = new Set<string>();
    for (const entry of eventEntries) {
      if (!entry.event) continue;
      if (eventMatchesTenantScope(entry.event, scope)) {
        inScopeEventIds.add(entry.eventId);
      }
    }
    if (inScopeEventIds.size === 0) return [];

    const inScopeRsvps = userRsvps.filter((rsvp) => inScopeEventIds.has(rsvp.eventId));

    const socialRows = await Promise.all(
      inScopeRsvps.map((rsvp) =>
        ctx.db
          .query("rsvpSocialProfiles")
          .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
          .collect(),
      ),
    );

    const dedupedByPlatform = new Map<
      string,
      {
        platformKey: string;
        handle: string;
        normalizedHandle: string;
        updatedAt: number;
      }
    >();
    for (const rows of socialRows) {
      for (const row of rows) {
        const existing = dedupedByPlatform.get(row.platformKey);
        if (!existing || row.updatedAt > existing.updatedAt) {
          dedupedByPlatform.set(row.platformKey, {
            platformKey: row.platformKey,
            handle: row.handle,
            normalizedHandle: row.normalizedHandle,
            updatedAt: row.updatedAt,
          });
        }
      }
    }

    return Array.from(dedupedByPlatform.values()).sort(
      (firstSocialProfile, secondSocialProfile) =>
        secondSocialProfile.updatedAt - firstSocialProfile.updatedAt,
    );
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
    const normalizedHandle = normalizeSocialHandleInput(handle, normalizedPlatformKey);
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
