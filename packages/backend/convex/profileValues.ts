import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import {
  normalizePrimaryFieldLookupText,
  normalizeSocialHandleInput,
} from "@coucou/sdk/shared/primary-fields";
import {
  grantWorkspaceProfileValue,
  isSocialProfileFieldKey,
  listWorkspaceProfileValueGrantsForUser,
  normalizeProfileFieldKey,
  socialPlatformKeyFromProfileFieldKey,
  upsertProfileFieldValue,
} from "./lib/profileValueRecords";
import { requireWorkspaceRead } from "./lib/workspaceAuth";

interface ResolvedWorkspaceProfileScope {
  workspaceId?: Id<"workspaces">;
  workspaceSlug?: string;
  siteKey?: string;
}

interface GrantedProfileFieldValue {
  grant: Doc<"workspaceProfileValueGrants">;
  profileFieldValue: Doc<"profileFieldValues">;
}

function normalizeProfileFieldKeySet(
  fieldKeys: string[] | undefined,
): Set<string> | null {
  if (!fieldKeys) return null;

  const normalizedFieldKeys = fieldKeys
    .map((fieldKey) => normalizeProfileFieldKey(fieldKey))
    .filter((fieldKey) => fieldKey.length > 0);
  return new Set(normalizedFieldKeys);
}

function normalizeProfileFieldValueInput(
  fieldKey: string,
  value: string,
): { value: string; normalizedValue: string } {
  const normalizedFieldKey = normalizeProfileFieldKey(fieldKey);
  const trimmedValue = value.trim();
  if (!normalizedFieldKey) {
    throw new Error("Profile field key is required");
  }
  if (!trimmedValue) {
    throw new Error("Profile field value is required");
  }

  if (isSocialProfileFieldKey(normalizedFieldKey)) {
    const platformKey = socialPlatformKeyFromProfileFieldKey(normalizedFieldKey);
    const handle = normalizeSocialHandleInput(trimmedValue, platformKey ?? "");
    if (!handle) {
      throw new Error("Social handle is required");
    }

    return {
      value: handle,
      normalizedValue: normalizePrimaryFieldLookupText(handle),
    };
  }

  return {
    value: trimmedValue,
    normalizedValue: normalizePrimaryFieldLookupText(trimmedValue),
  };
}

async function resolveWorkspaceProfileScope(
  ctx: MutationCtx | QueryCtx,
  {
    workspaceSlug,
    siteKey,
  }: {
    workspaceSlug?: string;
    siteKey?: string;
  },
): Promise<ResolvedWorkspaceProfileScope> {
  let workspace: Doc<"workspaces"> | null = null;

  if (workspaceSlug) {
    workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) =>
        queryBuilder.eq("slug", workspaceSlug),
      )
      .unique();
  }

  if (!workspace && siteKey) {
    const workspaceSite = await ctx.db
      .query("workspaceSites")
      .withIndex("by_siteKey", (queryBuilder) =>
        queryBuilder.eq("siteKey", siteKey),
      )
      .unique();

    if (workspaceSite) {
      workspace = await ctx.db.get(workspaceSite.workspaceId);
    }
  }

  if (!workspace && siteKey) {
    workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) =>
        queryBuilder.eq("slug", siteKey),
      )
      .unique();
  }

  return {
    workspaceId: workspace?._id,
    workspaceSlug: workspace?.slug ?? workspaceSlug ?? siteKey,
    siteKey,
  };
}

async function resolveGrantedProfileFieldValues(
  ctx: Parameters<typeof listWorkspaceProfileValueGrantsForUser>[0],
  grants: Doc<"workspaceProfileValueGrants">[],
): Promise<GrantedProfileFieldValue[]> {
  const grantedProfileFieldValues = await Promise.all(
    grants.map(async (grant) => {
      const profileFieldValue = await ctx.db.get(grant.profileFieldValueId);
      if (!profileFieldValue) return null;
      if (profileFieldValue.clerkUserId !== grant.clerkUserId) return null;
      return { grant, profileFieldValue };
    }),
  );

  return grantedProfileFieldValues.filter(
    (
      entry,
    ): entry is GrantedProfileFieldValue => entry !== null,
  );
}

export const listForCurrentUser = query({
  args: {
    fieldKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { fieldKeys }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const normalizedFieldKeys = normalizeProfileFieldKeySet(fieldKeys);
    const profileFieldValues = await ctx.db
      .query("profileFieldValues")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", identity.subject),
      )
      .collect();

    return profileFieldValues
      .filter(
        (profileFieldValue) =>
          !normalizedFieldKeys ||
          normalizedFieldKeys.has(profileFieldValue.fieldKey),
      )
      .sort(
        (firstProfileFieldValue, secondProfileFieldValue) =>
          secondProfileFieldValue.updatedAt - firstProfileFieldValue.updatedAt,
      );
  },
});

export const createForCurrentUser = mutation({
  args: {
    fieldKey: v.string(),
    value: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, { fieldKey, value, label }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", identity.subject),
      )
      .unique();
    const normalizedFieldKey = normalizeProfileFieldKey(fieldKey);
    const profileFieldValueInput = normalizeProfileFieldValueInput(
      normalizedFieldKey,
      value,
    );

    return await upsertProfileFieldValue(ctx, {
      clerkUserId: identity.subject,
      userId: user?._id,
      fieldKey: normalizedFieldKey,
      value: profileFieldValueInput.value,
      normalizedValue: profileFieldValueInput.normalizedValue,
      label,
      source: "profile",
    });
  },
});

export const listWorkspaceGrantsForCurrentUser = query({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceSlug, siteKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const workspaceScope = await resolveWorkspaceProfileScope(ctx, {
      workspaceSlug,
      siteKey,
    });
    const grants = await listWorkspaceProfileValueGrantsForUser(ctx, {
      clerkUserId: identity.subject,
      ...workspaceScope,
    });

    return await resolveGrantedProfileFieldValues(ctx, grants);
  },
});

export const grantForCurrentUser = mutation({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    profileFieldValueId: v.id("profileFieldValues"),
  },
  handler: async (ctx, { workspaceSlug, siteKey, profileFieldValueId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    if (!workspaceSlug && !siteKey) {
      throw new Error("Workspace scope required");
    }

    const profileFieldValue = await ctx.db.get(profileFieldValueId);
    if (!profileFieldValue) {
      throw new Error("Profile field value not found");
    }
    if (profileFieldValue.clerkUserId !== identity.subject) {
      throw new Error("Forbidden");
    }

    const workspaceScope = await resolveWorkspaceProfileScope(ctx, {
      workspaceSlug,
      siteKey,
    });

    return await grantWorkspaceProfileValue(ctx, {
      ...workspaceScope,
      clerkUserId: identity.subject,
      fieldKey: profileFieldValue.fieldKey,
      profileFieldValueId,
    });
  },
});

export const revokeWorkspaceGrantForCurrentUser = mutation({
  args: {
    workspaceProfileValueGrantId: v.id("workspaceProfileValueGrants"),
  },
  handler: async (ctx, { workspaceProfileValueGrantId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const grant = await ctx.db.get(workspaceProfileValueGrantId);
    if (!grant) {
      throw new Error("Workspace profile grant not found");
    }
    if (grant.clerkUserId !== identity.subject) {
      throw new Error("Forbidden");
    }

    await ctx.db.patch(workspaceProfileValueGrantId, {
      revokedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

export const listGrantedForWorkspaceGuest = query({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    clerkUserId: v.string(),
  },
  handler: async (ctx, { workspaceSlug, siteKey, clerkUserId }) => {
    const workspaceScope = await requireWorkspaceRead(ctx, {
      workspaceSlug,
      siteKey,
    });
    const grants = await listWorkspaceProfileValueGrantsForUser(ctx, {
      clerkUserId,
      workspaceId: workspaceScope.workspaceId,
      workspaceSlug: workspaceScope.workspaceSlug,
      siteKey: workspaceScope.siteKey ?? undefined,
    });

    return await resolveGrantedProfileFieldValues(ctx, grants);
  },
});
