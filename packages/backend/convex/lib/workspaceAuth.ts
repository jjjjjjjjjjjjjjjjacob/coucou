import type { UserIdentity } from "convex/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import { getCoucouOrganizationSlug, requireCoucouPlatformMember } from "./platformAuth";

type WorkspaceCapability = "host" | "door" | "admin" | "read";

type StoredOrganizationMembership = {
  organizationId: string;
  role: string;
};

export interface WorkspaceAuthScope {
  siteKey?: string | null;
  workspaceSlug?: string | null;
}

export interface ResolvedWorkspaceAuthScope {
  workspaceId: Id<"workspaces">;
  siteKey?: string | null;
  workspaceSlug: string;
  brandName: string;
  clerkOrganizationId: string;
  clerkOrganizationSlug?: string | null;
}

interface AuthReader {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
  db?: QueryCtx["db"];
  runQuery?: ActionCtx["runQuery"];
}

interface WorkspaceDatabaseReader {
  db: QueryCtx["db"];
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

function getIdentityOrganizationId(identity: UserIdentity): string | null {
  return getStringClaim(identity, ["orgId", "org_id", "organizationId", "organization_id"]);
}

function getIdentityRole(identity: UserIdentity): string | null {
  return getStringClaim(identity, ["role", "orgRole", "org_role"]);
}

export function roleHasWorkspaceWriteAccess(role: string | null | undefined): boolean {
  return role === "org:admin" || role === "admin" || role === "org:host" || role === "host";
}

export function roleHasWorkspaceDoorAccess(role: string | null | undefined): boolean {
  return roleHasWorkspaceWriteAccess(role) || role === "org:door" || role === "door";
}

export function roleHasWorkspaceReadAccess(role: string | null | undefined): boolean {
  return roleHasWorkspaceDoorAccess(role) || role === "org:member" || role === "member";
}

function roleHasCapability(
  role: string | null | undefined,
  capability: WorkspaceCapability,
): boolean {
  if (capability === "host" || capability === "admin") {
    return roleHasWorkspaceWriteAccess(role);
  }

  if (capability === "door") {
    return roleHasWorkspaceDoorAccess(role);
  }

  if (capability === "read") {
    return roleHasWorkspaceReadAccess(role);
  }

  return false;
}

function identityHasCapability(identity: UserIdentity, capability: WorkspaceCapability): boolean {
  return roleHasCapability(getIdentityRole(identity), capability);
}

async function getStoredOrganizationMembershipRole(
  ctx: AuthReader,
  clerkUserId: string,
  organizationId: string,
): Promise<string | null> {
  if (ctx.db) {
    const membership = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
      .filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("organizationId"), organizationId),
      )
      .unique();
    return membership?.role ?? null;
  }

  if (ctx.runQuery) {
    const memberships = (await ctx.runQuery(api.orgMemberships.listForUser, {
      clerkUserId,
    })) as StoredOrganizationMembership[];
    const membership = memberships.find(
      (storedMembership) => storedMembership.organizationId === organizationId,
    );
    return membership?.role ?? null;
  }

  return null;
}

async function hasCoucouPlatformAccess(ctx: AuthReader): Promise<boolean> {
  try {
    await requireCoucouPlatformMember(ctx);
    return true;
  } catch {
    return false;
  }
}

async function getSiteKeyForWorkspace(
  ctx: WorkspaceDatabaseReader,
  workspaceId: Id<"workspaces">,
): Promise<string | null> {
  const workspaceSites = await ctx.db
    .query("workspaceSites")
    .withIndex("by_workspace", (queryBuilder) => queryBuilder.eq("workspaceId", workspaceId))
    .collect();

  return workspaceSites[0]?.siteKey ?? null;
}

export async function resolveWorkspaceAuthScopeFromDatabase(
  ctx: WorkspaceDatabaseReader,
  scope: WorkspaceAuthScope,
): Promise<ResolvedWorkspaceAuthScope | null> {
  let workspace: Doc<"workspaces"> | null = null;

  const workspaceSlug = scope.workspaceSlug;
  if (workspaceSlug) {
    workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", workspaceSlug))
      .unique();
  }

  const siteKey = scope.siteKey;
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

  if (!workspace) {
    return null;
  }

  const coucouOrganizationSlug = getCoucouOrganizationSlug();
  if (
    workspace.slug === coucouOrganizationSlug ||
    workspace.clerkOrganizationSlug === coucouOrganizationSlug ||
    workspace.kind === "admin"
  ) {
    return null;
  }

  return {
    workspaceId: workspace._id,
    siteKey: scope.siteKey ?? (await getSiteKeyForWorkspace(ctx, workspace._id)),
    workspaceSlug: workspace.slug,
    brandName: workspace.name,
    clerkOrganizationId: workspace.clerkOrganizationId ?? "",
    clerkOrganizationSlug: workspace.clerkOrganizationSlug ?? null,
  };
}

async function resolveWorkspaceAuthScope(
  ctx: AuthReader,
  scope: WorkspaceAuthScope,
): Promise<ResolvedWorkspaceAuthScope> {
  const queryScope = {
    siteKey: scope.siteKey ?? undefined,
    workspaceSlug: scope.workspaceSlug ?? undefined,
  };
  const resolvedScope = ctx.db
    ? await resolveWorkspaceAuthScopeFromDatabase({ db: ctx.db }, scope)
    : ctx.runQuery
      ? await ctx.runQuery(api.workspaces.getWorkspaceAuthScope, queryScope)
      : null;

  if (!resolvedScope) {
    throw new Error("Workspace scope required");
  }

  if (!resolvedScope.clerkOrganizationId) {
    throw new Error(`Clerk organization ID not configured for ${resolvedScope.workspaceSlug}`);
  }

  return resolvedScope;
}

export async function requireWorkspaceCapabilityForResolvedScope(
  ctx: AuthReader,
  resolvedScope: ResolvedWorkspaceAuthScope,
  capability: WorkspaceCapability,
): Promise<ResolvedWorkspaceAuthScope> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }

  const activeOrganizationId = getIdentityOrganizationId(identity);
  const activeOrganizationMatches = activeOrganizationId === resolvedScope.clerkOrganizationId;
  if (activeOrganizationMatches && identityHasCapability(identity, capability)) {
    return resolvedScope;
  }

  const storedMembershipRole = await getStoredOrganizationMembershipRole(
    ctx,
    identity.subject,
    resolvedScope.clerkOrganizationId,
  );
  if (storedMembershipRole) {
    if (roleHasCapability(storedMembershipRole, capability)) {
      return resolvedScope;
    }

    if (await hasCoucouPlatformAccess(ctx)) {
      return resolvedScope;
    }

    throw new Error(`Forbidden: ${capability} role required`);
  }

  if (await hasCoucouPlatformAccess(ctx)) {
    return resolvedScope;
  }

  if (activeOrganizationMatches) {
    throw new Error(`Forbidden: ${capability} role required`);
  }

  throw new Error("Forbidden: organization membership required");
}

async function requireWorkspaceCapability(
  ctx: AuthReader,
  scope: WorkspaceAuthScope,
  capability: WorkspaceCapability,
): Promise<ResolvedWorkspaceAuthScope> {
  const resolvedScope = await resolveWorkspaceAuthScope(ctx, scope);
  return await requireWorkspaceCapabilityForResolvedScope(ctx, resolvedScope, capability);
}

export async function requireWorkspaceHost(
  ctx: AuthReader,
  scope: WorkspaceAuthScope,
): Promise<ResolvedWorkspaceAuthScope> {
  return requireWorkspaceCapability(ctx, scope, "host");
}

export async function requireWorkspaceDoor(
  ctx: AuthReader,
  scope: WorkspaceAuthScope,
): Promise<ResolvedWorkspaceAuthScope> {
  return requireWorkspaceCapability(ctx, scope, "door");
}

export async function requireWorkspaceRead(
  ctx: AuthReader,
  scope: WorkspaceAuthScope,
): Promise<ResolvedWorkspaceAuthScope> {
  return requireWorkspaceCapability(ctx, scope, "read");
}

export async function requireWorkspaceAdmin(
  ctx: AuthReader,
  scope: WorkspaceAuthScope,
): Promise<ResolvedWorkspaceAuthScope> {
  return requireWorkspaceCapability(ctx, scope, "admin");
}
