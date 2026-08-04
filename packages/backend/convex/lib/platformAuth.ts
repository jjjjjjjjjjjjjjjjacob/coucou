import type { UserIdentity } from "convex/server";
import { api } from "../_generated/api";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import { resolveCanonicalClerkUserId } from "./canonicalUserIdentity";

interface PlatformAuthReader {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
  db?: QueryCtx["db"];
  runQuery?: ActionCtx["runQuery"];
}

async function resolveAuthenticatedClerkUserId(
  ctx: PlatformAuthReader,
  identity: UserIdentity,
): Promise<string> {
  if (ctx.db) {
    return await resolveCanonicalClerkUserId({ db: ctx.db }, identity.subject);
  }
  if (ctx.runQuery) {
    return await ctx.runQuery(api.users.getCurrentCanonicalClerkUserId, {});
  }
  return identity.subject;
}

function getStringClaim(identity: UserIdentity, keys: string[]): string | null {
  const identityRecord = identity as unknown as Record<string, unknown>;

  for (const key of keys) {
    const value = identityRecord[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

export function getCoucouOrganizationSlug(): string {
  return (process.env.COUCOU_CLERK_ORGANIZATION_SLUG ?? "coucou").toLowerCase();
}

export function getIdentityOrganizationSlug(identity: UserIdentity): string | null {
  return getStringClaim(identity, ["orgSlug", "org_slug", "organizationSlug", "organization_slug"]);
}

export function getIdentityOrganizationId(identity: UserIdentity): string | null {
  return getStringClaim(identity, ["orgId", "org_id", "organizationId", "organization_id"]);
}

export function getIdentityOrganizationRole(identity: UserIdentity): string | null {
  return getStringClaim(identity, ["role", "orgRole", "org_role"]);
}

async function getCoucouWorkspaceOrganizationId(ctx: PlatformAuthReader): Promise<string | null> {
  if (!ctx.db) {
    return null;
  }

  const coucouOrganizationSlug = getCoucouOrganizationSlug();
  const workspaceBySlug = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", coucouOrganizationSlug))
    .unique();

  if (workspaceBySlug?.clerkOrganizationId) {
    return workspaceBySlug.clerkOrganizationId;
  }

  const adminWorkspace = await ctx.db
    .query("workspaces")
    .withIndex("by_kind", (queryBuilder) => queryBuilder.eq("kind", "admin"))
    .first();

  return adminWorkspace?.clerkOrganizationId ?? null;
}

async function hasStoredCoucouMembership(
  ctx: PlatformAuthReader,
  identity: UserIdentity,
  coucouOrganizationId: string,
): Promise<boolean> {
  if (!ctx.db) {
    return false;
  }

  const canonicalClerkUserId = await resolveAuthenticatedClerkUserId(ctx, identity);

  const membership = await ctx.db
    .query("orgMemberships")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", canonicalClerkUserId))
    .filter((queryBuilder) =>
      queryBuilder.eq(queryBuilder.field("organizationId"), coucouOrganizationId),
    )
    .unique();

  return Boolean(membership);
}

async function hasStoredCoucouMembershipFromAction(
  ctx: PlatformAuthReader,
  identity: UserIdentity,
): Promise<boolean> {
  if (!ctx.runQuery) {
    return false;
  }

  const canonicalClerkUserId = await resolveAuthenticatedClerkUserId(ctx, identity);

  const storedMemberships = await ctx.runQuery(api.orgMemberships.listForUser, {
    clerkUserId: canonicalClerkUserId,
  });
  const dashboardWorkspaceAccess = await ctx.runQuery(api.workspaces.getDashboardWorkspaceAccess, {
    memberships: storedMemberships.map((storedMembership) => ({
      organizationId: storedMembership.organizationId,
      role: storedMembership.role,
    })),
  });

  return dashboardWorkspaceAccess.hasCoucouOrganizationAccess;
}

export async function requireCoucouPlatformMember(ctx: PlatformAuthReader): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }

  const activeOrganizationSlug = getIdentityOrganizationSlug(identity);
  if (activeOrganizationSlug?.toLowerCase() !== getCoucouOrganizationSlug()) {
    if (ctx.runQuery && (await hasStoredCoucouMembershipFromAction(ctx, identity))) {
      return identity;
    }

    const coucouOrganizationId = await getCoucouWorkspaceOrganizationId(ctx);
    const activeOrganizationId = getIdentityOrganizationId(identity);
    const hasActiveCoucouOrganization =
      Boolean(coucouOrganizationId) && activeOrganizationId === coucouOrganizationId;
    const hasSyncedCoucouMembership =
      coucouOrganizationId === null
        ? false
        : await hasStoredCoucouMembership(ctx, identity, coucouOrganizationId);

    if (!hasActiveCoucouOrganization && !hasSyncedCoucouMembership) {
      throw new Error("Forbidden: Coucou organization required");
    }
  }

  return identity;
}
