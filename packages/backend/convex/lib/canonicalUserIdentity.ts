import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DatabaseReader = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export type CanonicalUserIdentity = {
  clerkUserId: string;
  user: Doc<"users"> | null;
  wasAlias: boolean;
};

/**
 * Resolve a Clerk identity through the durable alias table. Merge writes keep
 * aliases flattened, but the bounded loop also safely handles older chained
 * aliases if a canonical account is consolidated again later.
 */
export async function resolveCanonicalClerkUserId(
  ctx: DatabaseReader,
  clerkUserId: string,
): Promise<string> {
  let currentClerkUserId = clerkUserId;
  const visitedClerkUserIds = new Set<string>();

  for (let aliasDepth = 0; aliasDepth < 20; aliasDepth += 1) {
    if (visitedClerkUserIds.has(currentClerkUserId)) {
      throw new Error(`Circular user identity alias detected for ${clerkUserId}`);
    }
    visitedClerkUserIds.add(currentClerkUserId);

    const alias = await ctx.db
      .query("userIdentityAliases")
      .withIndex("by_alias", (queryBuilder) =>
        queryBuilder.eq("aliasClerkUserId", currentClerkUserId),
      )
      .unique();
    if (!alias) {
      return currentClerkUserId;
    }
    currentClerkUserId = alias.canonicalClerkUserId;
  }

  throw new Error(`User identity alias depth exceeded for ${clerkUserId}`);
}

export async function resolveCanonicalUserIdentity(
  ctx: DatabaseReader,
  clerkUserId: string,
): Promise<CanonicalUserIdentity> {
  const canonicalClerkUserId = await resolveCanonicalClerkUserId(ctx, clerkUserId);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (queryBuilder) =>
      queryBuilder.eq("clerkUserId", canonicalClerkUserId),
    )
    .unique();

  return {
    clerkUserId: canonicalClerkUserId,
    user,
    wasAlias: canonicalClerkUserId !== clerkUserId,
  };
}

export async function canonicalizeClerkUserIds(
  ctx: DatabaseReader,
  clerkUserIds: readonly string[],
): Promise<string[]> {
  const canonicalClerkUserIds = await Promise.all(
    clerkUserIds.map(async (clerkUserId) => await resolveCanonicalClerkUserId(ctx, clerkUserId)),
  );
  return Array.from(new Set(canonicalClerkUserIds));
}

export async function resolveCanonicalUserById(
  ctx: DatabaseReader,
  userId: Id<"users">,
): Promise<Doc<"users"> | null> {
  const directUser = await ctx.db.get(userId);
  if (directUser) return directUser;
  const alias = await ctx.db
    .query("userIdentityAliases")
    .withIndex("by_retired_user", (queryBuilder) => queryBuilder.eq("retiredUserId", userId))
    .first();
  return alias ? await ctx.db.get(alias.canonicalUserId) : null;
}

export async function resolveCanonicalRsvpId(
  ctx: DatabaseReader,
  rsvpId: Id<"rsvps">,
): Promise<Id<"rsvps">> {
  const directRsvp = await ctx.db.get(rsvpId);
  if (directRsvp) return rsvpId;
  const alias = await ctx.db
    .query("rsvpIdentityAliases")
    .withIndex("by_retired", (queryBuilder) => queryBuilder.eq("retiredRsvpId", rsvpId))
    .first();
  return alias?.canonicalRsvpId ?? rsvpId;
}
