import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export interface TenantWorkspaceScopeInput {
  workspaceSlug?: string;
  siteKey?: string;
}

export interface ResolvedTenantWorkspaceScope {
  workspaceId: Id<"workspaces">;
  workspaceSlug: string;
  siteKey: string | null;
}

export async function resolveTenantWorkspaceScope(
  ctx: MutationCtx | QueryCtx,
  { workspaceSlug, siteKey }: TenantWorkspaceScopeInput,
): Promise<ResolvedTenantWorkspaceScope | null> {
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

  if (!workspace) return null;

  return {
    workspaceId: workspace._id,
    workspaceSlug: workspace.slug,
    siteKey: siteKey ?? null,
  };
}

export function eventMatchesTenantScope(
  event: Pick<Doc<"events">, "workspaceSlug" | "siteKey">,
  scope: Pick<ResolvedTenantWorkspaceScope, "workspaceSlug" | "siteKey">,
): boolean {
  if (event.workspaceSlug && event.workspaceSlug === scope.workspaceSlug) {
    return true;
  }
  if (scope.siteKey && event.siteKey && event.siteKey === scope.siteKey) {
    return true;
  }
  return false;
}
