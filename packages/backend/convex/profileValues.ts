import {
  normalizePrimaryFieldLookupText,
  normalizeSocialHandleInput,
} from "@coucou/sdk/shared/primary-fields";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { resolveCanonicalClerkUserId } from "./lib/canonicalUserIdentity";
import {
  grantWorkspaceProfileValue,
  isSocialProfileFieldKey,
  listWorkspaceProfileValueGrantsForUser,
  normalizeProfileFieldKey,
  socialPlatformKeyFromProfileFieldKey,
  upsertProfileFieldValue,
} from "./lib/profileValueRecords";
import { requireWorkspaceRead } from "./lib/workspaceAuth";
import { eventMatchesTenantScope, resolveTenantWorkspaceScope } from "./lib/workspaceScope";

interface ResolvedWorkspaceProfileScope {
  workspaceId?: Id<"workspaces">;
  workspaceSlug?: string;
  siteKey?: string;
}

interface GrantedProfileFieldValue {
  grant: Doc<"workspaceProfileValueGrants">;
  profileFieldValue: Doc<"profileFieldValues">;
}

function normalizeProfileFieldKeySet(fieldKeys: string[] | undefined): Set<string> | null {
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
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", workspaceSlug))
      .unique();
  }

  if (!workspace && siteKey) {
    const workspaceSite = await ctx.db
      .query("workspaceSites")
      .withIndex("by_siteKey", (queryBuilder) => queryBuilder.eq("siteKey", siteKey))
      .unique();

    if (workspaceSite) {
      workspace = await ctx.db.get(workspaceSite.workspaceId);
    }
  }

  if (!workspace && siteKey) {
    workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", siteKey))
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
    (entry): entry is GrantedProfileFieldValue => entry !== null,
  );
}

export const listForCurrentUser = query({
  args: {
    fieldKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { fieldKeys }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, identity.subject);

    const normalizedFieldKeys = normalizeProfileFieldKeySet(fieldKeys);
    const profileFieldValues = await ctx.db
      .query("profileFieldValues")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", canonicalClerkUserId),
      )
      .collect();

    return profileFieldValues
      .filter(
        (profileFieldValue) =>
          !normalizedFieldKeys || normalizedFieldKeys.has(profileFieldValue.fieldKey),
      )
      .sort(
        (firstProfileFieldValue, secondProfileFieldValue) =>
          secondProfileFieldValue.updatedAt - firstProfileFieldValue.updatedAt,
      );
  },
});

export const listForCurrentUserInWorkspace = query({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    fieldKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { workspaceSlug, siteKey, fieldKeys }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    if (!workspaceSlug && !siteKey) return [];
    const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, identity.subject);

    const scope = await resolveTenantWorkspaceScope(ctx, {
      workspaceSlug,
      siteKey,
    });
    if (!scope) return [];

    const normalizedFieldKeys = normalizeProfileFieldKeySet(fieldKeys);
    const profileFieldValues = await ctx.db
      .query("profileFieldValues")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", canonicalClerkUserId),
      )
      .collect();

    if (profileFieldValues.length === 0) return [];

    const sourceEventIds = Array.from(
      new Set(
        profileFieldValues
          .map((profileFieldValue) => profileFieldValue.sourceEventId)
          .filter((sourceEventId): sourceEventId is Id<"events"> => sourceEventId !== undefined),
      ),
    );
    const sourceEventEntries = await Promise.all(
      sourceEventIds.map(async (eventId) => ({
        eventId,
        event: await ctx.db.get(eventId),
      })),
    );
    const sourceEventInScope = new Set<string>();
    for (const entry of sourceEventEntries) {
      if (!entry.event) continue;
      if (eventMatchesTenantScope(entry.event, scope)) {
        sourceEventInScope.add(entry.eventId);
      }
    }

    const grantedIds = new Set<string>();
    const activeGrants = await listWorkspaceProfileValueGrantsForUser(ctx, {
      clerkUserId: canonicalClerkUserId,
      workspaceId: scope.workspaceId,
      workspaceSlug: scope.workspaceSlug,
      siteKey: scope.siteKey ?? undefined,
    });
    for (const grant of activeGrants) {
      grantedIds.add(grant.profileFieldValueId);
    }

    return profileFieldValues
      .filter(
        (profileFieldValue) =>
          !normalizedFieldKeys || normalizedFieldKeys.has(profileFieldValue.fieldKey),
      )
      .filter((profileFieldValue) => {
        if (
          profileFieldValue.sourceEventId &&
          sourceEventInScope.has(profileFieldValue.sourceEventId)
        ) {
          return true;
        }
        if (grantedIds.has(profileFieldValue._id)) {
          return true;
        }
        return false;
      })
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
    const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, identity.subject);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", canonicalClerkUserId),
      )
      .unique();
    const normalizedFieldKey = normalizeProfileFieldKey(fieldKey);
    const profileFieldValueInput = normalizeProfileFieldValueInput(normalizedFieldKey, value);

    return await upsertProfileFieldValue(ctx, {
      clerkUserId: canonicalClerkUserId,
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
    const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, identity.subject);

    const workspaceScope = await resolveWorkspaceProfileScope(ctx, {
      workspaceSlug,
      siteKey,
    });
    const grants = await listWorkspaceProfileValueGrantsForUser(ctx, {
      clerkUserId: canonicalClerkUserId,
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
    const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, identity.subject);
    if (!workspaceSlug && !siteKey) {
      throw new Error("Workspace scope required");
    }

    const profileFieldValue = await ctx.db.get(profileFieldValueId);
    if (!profileFieldValue) {
      throw new Error("Profile field value not found");
    }
    if (profileFieldValue.clerkUserId !== canonicalClerkUserId) {
      throw new Error("Forbidden");
    }

    const workspaceScope = await resolveWorkspaceProfileScope(ctx, {
      workspaceSlug,
      siteKey,
    });

    return await grantWorkspaceProfileValue(ctx, {
      ...workspaceScope,
      clerkUserId: canonicalClerkUserId,
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
    const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, identity.subject);

    const grant = await ctx.db.get(workspaceProfileValueGrantId);
    if (!grant) {
      throw new Error("Workspace profile grant not found");
    }
    if (grant.clerkUserId !== canonicalClerkUserId) {
      throw new Error("Forbidden");
    }

    await ctx.db.patch(workspaceProfileValueGrantId, {
      revokedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

export const listAllGrantsForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, identity.subject);

    const grants = await ctx.db
      .query("workspaceProfileValueGrants")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", canonicalClerkUserId),
      )
      .collect();

    const activeGrants = grants.filter((grant) => grant.revokedAt === undefined);

    const workspaceCache = new Map<Id<"workspaces">, Doc<"workspaces"> | null>();
    async function loadWorkspace(
      workspaceId: Id<"workspaces"> | undefined,
    ): Promise<Doc<"workspaces"> | null> {
      if (!workspaceId) return null;
      if (workspaceCache.has(workspaceId)) {
        return workspaceCache.get(workspaceId) ?? null;
      }
      const workspace = await ctx.db.get(workspaceId);
      workspaceCache.set(workspaceId, workspace);
      return workspace;
    }

    const grantsWithProfile = await Promise.all(
      activeGrants.map(async (grant) => {
        const profileFieldValue = await ctx.db.get(grant.profileFieldValueId);
        if (!profileFieldValue) return null;
        if (profileFieldValue.clerkUserId !== grant.clerkUserId) return null;
        const workspace = await loadWorkspace(grant.workspaceId);
        return {
          grant,
          profileFieldValue,
          workspace,
        };
      }),
    );

    return grantsWithProfile.filter(
      (
        entry,
      ): entry is {
        grant: Doc<"workspaceProfileValueGrants">;
        profileFieldValue: Doc<"profileFieldValues">;
        workspace: Doc<"workspaces"> | null;
      } => entry !== null,
    );
  },
});

export const listGrantedForWorkspaceGuest = query({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    clerkUserId: v.string(),
  },
  handler: async (ctx, { workspaceSlug, siteKey, clerkUserId }) => {
    const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, clerkUserId);
    const workspaceScope = await requireWorkspaceRead(ctx, {
      workspaceSlug,
      siteKey,
    });
    const grants = await listWorkspaceProfileValueGrantsForUser(ctx, {
      clerkUserId: canonicalClerkUserId,
      workspaceId: workspaceScope.workspaceId,
      workspaceSlug: workspaceScope.workspaceSlug,
      siteKey: workspaceScope.siteKey ?? undefined,
    });

    return await resolveGrantedProfileFieldValues(ctx, grants);
  },
});
