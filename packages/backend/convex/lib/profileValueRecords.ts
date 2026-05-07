import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  normalizePrimaryFieldLookupText,
  normalizeSocialPlatformKey,
} from "@coucou/sdk/shared/primary-fields";
import type { SanitizedSubmittedSocialProfile } from "./primaryFields";

export interface ProfileFieldValueWriteResult {
  profileFieldValueId: Id<"profileFieldValues">;
  created: boolean;
}

export interface WorkspaceProfileValueGrantWriteResult {
  workspaceProfileValueGrantId?: Id<"workspaceProfileValueGrants">;
  created: boolean;
  reactivated: boolean;
}

export interface SocialProfileGrantSyncResult {
  profileFieldValueCount: number;
  createdProfileFieldValueCount: number;
  workspaceGrantCount: number;
  createdWorkspaceGrantCount: number;
  reactivatedWorkspaceGrantCount: number;
}

interface WorkspaceProfileScope {
  workspaceId?: Id<"workspaces">;
  workspaceSlug?: string;
  siteKey?: string;
}

interface UpsertProfileFieldValueArgs {
  clerkUserId: string;
  userId?: Id<"users">;
  fieldKey: string;
  value: string;
  normalizedValue?: string;
  label?: string;
  source?: string;
  sourceEventId?: Id<"events">;
  sourceRsvpId?: Id<"rsvps">;
}

interface GrantWorkspaceProfileValueArgs extends WorkspaceProfileScope {
  clerkUserId: string;
  fieldKey: string;
  profileFieldValueId: Id<"profileFieldValues">;
  sourceEventId?: Id<"events">;
  sourceRsvpId?: Id<"rsvps">;
}

interface ListWorkspaceProfileValueGrantsArgs extends WorkspaceProfileScope {
  clerkUserId: string;
}

export function normalizeProfileFieldKey(fieldKey: string): string {
  const trimmedFieldKey = fieldKey.trim();
  if (!trimmedFieldKey) return "";

  const socialPrefix = "social.";
  if (trimmedFieldKey.toLowerCase().startsWith(socialPrefix)) {
    const platformKey = trimmedFieldKey.slice(socialPrefix.length);
    const normalizedPlatformKey = normalizeSocialPlatformKey(platformKey);
    return normalizedPlatformKey ? `${socialPrefix}${normalizedPlatformKey}` : "";
  }

  return trimmedFieldKey;
}

export function socialProfileFieldKey(platformKey: string): string {
  return normalizeProfileFieldKey(`social.${platformKey}`);
}

export function isSocialProfileFieldKey(fieldKey: string): boolean {
  return normalizeProfileFieldKey(fieldKey).startsWith("social.");
}

export function socialPlatformKeyFromProfileFieldKey(
  fieldKey: string,
): string | null {
  const normalizedFieldKey = normalizeProfileFieldKey(fieldKey);
  if (!normalizedFieldKey.startsWith("social.")) return null;
  return normalizedFieldKey.slice("social.".length) || null;
}

async function resolveWorkspaceProfileScopeForEvent(
  ctx: QueryCtx | MutationCtx,
  event: Pick<Doc<"events">, "workspaceSlug" | "siteKey">,
): Promise<WorkspaceProfileScope> {
  let workspace: Doc<"workspaces"> | null = null;
  const workspaceSlug = event.workspaceSlug;
  const siteKey = event.siteKey;

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

export async function upsertProfileFieldValue(
  ctx: MutationCtx,
  {
    clerkUserId,
    userId,
    fieldKey,
    value,
    normalizedValue,
    label,
    source,
    sourceEventId,
    sourceRsvpId,
  }: UpsertProfileFieldValueArgs,
): Promise<ProfileFieldValueWriteResult> {
  const normalizedFieldKey = normalizeProfileFieldKey(fieldKey);
  const trimmedValue = value.trim();
  const finalNormalizedValue =
    normalizedValue?.trim() || normalizePrimaryFieldLookupText(trimmedValue);

  if (!normalizedFieldKey) {
    throw new Error("Profile field key is required");
  }
  if (!trimmedValue || !finalNormalizedValue) {
    throw new Error("Profile field value is required");
  }

  const existingProfileFieldValue = await ctx.db
    .query("profileFieldValues")
    .withIndex("by_user_field_value", (queryBuilder) =>
      queryBuilder
        .eq("clerkUserId", clerkUserId)
        .eq("fieldKey", normalizedFieldKey)
        .eq("normalizedValue", finalNormalizedValue),
    )
    .unique();
  const now = Date.now();

  if (existingProfileFieldValue) {
    await ctx.db.patch(existingProfileFieldValue._id, {
      userId: userId ?? existingProfileFieldValue.userId,
      value: trimmedValue,
      label: label?.trim() || existingProfileFieldValue.label,
      source: source ?? existingProfileFieldValue.source,
      sourceEventId: sourceEventId ?? existingProfileFieldValue.sourceEventId,
      sourceRsvpId: sourceRsvpId ?? existingProfileFieldValue.sourceRsvpId,
      updatedAt: now,
    });
    return {
      profileFieldValueId: existingProfileFieldValue._id,
      created: false,
    };
  }

  const profileFieldValueId = await ctx.db.insert("profileFieldValues", {
    clerkUserId,
    userId,
    fieldKey: normalizedFieldKey,
    value: trimmedValue,
    normalizedValue: finalNormalizedValue,
    label: label?.trim() || undefined,
    source,
    sourceEventId,
    sourceRsvpId,
    createdAt: now,
    updatedAt: now,
  });

  return { profileFieldValueId, created: true };
}

async function findExistingWorkspaceProfileValueGrant(
  ctx: MutationCtx,
  {
    workspaceId,
    workspaceSlug,
    siteKey,
    clerkUserId,
    fieldKey,
    profileFieldValueId,
  }: GrantWorkspaceProfileValueArgs,
): Promise<Doc<"workspaceProfileValueGrants"> | null> {
  if (workspaceId) {
    return await ctx.db
      .query("workspaceProfileValueGrants")
      .withIndex("by_workspace_user_field_value", (queryBuilder) =>
        queryBuilder
          .eq("workspaceId", workspaceId)
          .eq("clerkUserId", clerkUserId)
          .eq("fieldKey", fieldKey)
          .eq("profileFieldValueId", profileFieldValueId),
      )
      .unique();
  }

  if (workspaceSlug) {
    return await ctx.db
      .query("workspaceProfileValueGrants")
      .withIndex("by_workspaceSlug_user_field_value", (queryBuilder) =>
        queryBuilder
          .eq("workspaceSlug", workspaceSlug)
          .eq("clerkUserId", clerkUserId)
          .eq("fieldKey", fieldKey)
          .eq("profileFieldValueId", profileFieldValueId),
      )
      .unique();
  }

  if (siteKey) {
    return await ctx.db
      .query("workspaceProfileValueGrants")
      .withIndex("by_siteKey_user_field_value", (queryBuilder) =>
        queryBuilder
          .eq("siteKey", siteKey)
          .eq("clerkUserId", clerkUserId)
          .eq("fieldKey", fieldKey)
          .eq("profileFieldValueId", profileFieldValueId),
      )
      .unique();
  }

  return null;
}

export async function grantWorkspaceProfileValue(
  ctx: MutationCtx,
  args: GrantWorkspaceProfileValueArgs,
): Promise<WorkspaceProfileValueGrantWriteResult> {
  const normalizedFieldKey = normalizeProfileFieldKey(args.fieldKey);
  if (!normalizedFieldKey) {
    throw new Error("Profile field key is required");
  }

  if (!args.workspaceId && !args.workspaceSlug && !args.siteKey) {
    return {
      created: false,
      reactivated: false,
    };
  }

  const existingGrant = await findExistingWorkspaceProfileValueGrant(ctx, {
    ...args,
    fieldKey: normalizedFieldKey,
  });
  const now = Date.now();

  if (existingGrant) {
    const wasRevoked = existingGrant.revokedAt !== undefined;
    await ctx.db.patch(existingGrant._id, {
      workspaceId: args.workspaceId ?? existingGrant.workspaceId,
      workspaceSlug: args.workspaceSlug ?? existingGrant.workspaceSlug,
      siteKey: args.siteKey ?? existingGrant.siteKey,
      sourceEventId: args.sourceEventId ?? existingGrant.sourceEventId,
      sourceRsvpId: args.sourceRsvpId ?? existingGrant.sourceRsvpId,
      revokedAt: undefined,
      updatedAt: now,
    });
    return {
      workspaceProfileValueGrantId: existingGrant._id,
      created: false,
      reactivated: wasRevoked,
    };
  }

  const workspaceProfileValueGrantId = await ctx.db.insert(
    "workspaceProfileValueGrants",
    {
      workspaceId: args.workspaceId,
      workspaceSlug: args.workspaceSlug,
      siteKey: args.siteKey,
      clerkUserId: args.clerkUserId,
      fieldKey: normalizedFieldKey,
      profileFieldValueId: args.profileFieldValueId,
      sourceEventId: args.sourceEventId,
      sourceRsvpId: args.sourceRsvpId,
      createdAt: now,
      updatedAt: now,
    },
  );

  return {
    workspaceProfileValueGrantId,
    created: true,
    reactivated: false,
  };
}

export async function createProfileValuesAndWorkspaceGrantsForSocialProfiles(
  ctx: MutationCtx,
  {
    event,
    rsvpId,
    clerkUserId,
    userId,
    submittedProfiles,
  }: {
    event: Pick<Doc<"events">, "_id" | "workspaceSlug" | "siteKey">;
    rsvpId: Id<"rsvps">;
    clerkUserId: string;
    userId?: Id<"users">;
    submittedProfiles: SanitizedSubmittedSocialProfile[];
  },
): Promise<SocialProfileGrantSyncResult> {
  const workspaceScope = await resolveWorkspaceProfileScopeForEvent(ctx, event);
  const result: SocialProfileGrantSyncResult = {
    profileFieldValueCount: 0,
    createdProfileFieldValueCount: 0,
    workspaceGrantCount: 0,
    createdWorkspaceGrantCount: 0,
    reactivatedWorkspaceGrantCount: 0,
  };

  for (const profile of submittedProfiles) {
    const fieldKey = socialProfileFieldKey(profile.platformKey);
    const profileFieldValue = await upsertProfileFieldValue(ctx, {
      clerkUserId,
      userId,
      fieldKey,
      value: profile.handle,
      normalizedValue: profile.normalizedHandle,
      source: "rsvp",
      sourceEventId: event._id,
      sourceRsvpId: rsvpId,
    });
    result.profileFieldValueCount += 1;
    if (profileFieldValue.created) {
      result.createdProfileFieldValueCount += 1;
    }

    const workspaceGrant = await grantWorkspaceProfileValue(ctx, {
      ...workspaceScope,
      clerkUserId,
      fieldKey,
      profileFieldValueId: profileFieldValue.profileFieldValueId,
      sourceEventId: event._id,
      sourceRsvpId: rsvpId,
    });
    if (workspaceGrant.workspaceProfileValueGrantId) {
      result.workspaceGrantCount += 1;
    }
    if (workspaceGrant.created) {
      result.createdWorkspaceGrantCount += 1;
    }
    if (workspaceGrant.reactivated) {
      result.reactivatedWorkspaceGrantCount += 1;
    }
  }

  return result;
}

function workspaceGrantMatchesScope(
  grant: Doc<"workspaceProfileValueGrants">,
  scope: WorkspaceProfileScope,
): boolean {
  if (scope.workspaceId && grant.workspaceId === scope.workspaceId) {
    return true;
  }
  if (scope.workspaceSlug && grant.workspaceSlug === scope.workspaceSlug) {
    return true;
  }
  if (scope.siteKey && grant.siteKey === scope.siteKey) {
    return true;
  }
  return false;
}

export async function listWorkspaceProfileValueGrantsForUser(
  ctx: QueryCtx,
  {
    clerkUserId,
    workspaceId,
    workspaceSlug,
    siteKey,
  }: ListWorkspaceProfileValueGrantsArgs,
): Promise<Doc<"workspaceProfileValueGrants">[]> {
  const grants = await ctx.db
    .query("workspaceProfileValueGrants")
    .withIndex("by_user", (queryBuilder) =>
      queryBuilder.eq("clerkUserId", clerkUserId),
    )
    .collect();

  return grants.filter(
    (grant) =>
      grant.revokedAt === undefined &&
      workspaceGrantMatchesScope(grant, { workspaceId, workspaceSlug, siteKey }),
  );
}
