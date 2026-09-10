import { buildEventPath } from "@coucou/sdk/shared/event-routes";
import { siteConfigurations } from "@coucou/sdk/site-config";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

type MessageEvent = {
  _id?: string;
  shortId?: string | null;
  siteKey?: string | null;
  workspaceSlug?: string | null;
};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolvePublicBaseUrlForSite(siteKey?: string | null): string | null {
  const normalizedSiteKey = siteKey ?? "dojo";
  const siteConfiguration =
    siteConfigurations[normalizedSiteKey as keyof typeof siteConfigurations];

  if (siteConfiguration?.domain) {
    return trimTrailingSlash(siteConfiguration.domain);
  }

  const fallbackBaseUrl = process.env.APP_BASE_URL?.trim();
  return fallbackBaseUrl ? trimTrailingSlash(fallbackBaseUrl) : null;
}

export function resolvePublicBaseUrlForEvent(
  event: { siteKey?: string | null } | null,
): string | null {
  return resolvePublicBaseUrlForSite(event?.siteKey);
}

export function buildEventStatusUrl(
  event: MessageEvent,
  baseUrl = resolvePublicBaseUrlForEvent(event),
): string {
  if (!event._id || !baseUrl) return "";
  return `${trimTrailingSlash(baseUrl)}${buildEventPath({ _id: event._id, shortId: event.shortId }, "status")}`;
}

/** Honor the destination workspace's configured domain in every message channel. */
export async function resolveEventMessageBaseUrl(
  ctx: Pick<ActionCtx, "runQuery"> | Pick<QueryCtx | MutationCtx, "db">,
  event: MessageEvent,
): Promise<string | null> {
  const configuredSite =
    siteConfigurations[(event.siteKey ?? "dojo") as keyof typeof siteConfigurations];
  const workspaceSlug = event.workspaceSlug ?? configuredSite?.workspaceSlug;
  const workspace: {
    _id: Id<"workspaces">;
    primaryDomain?: string;
    sites?: Array<{ siteKey: string; domain: string }>;
  } | null = workspaceSlug
    ? "db" in ctx
      ? await ctx.db
          .query("workspaces")
          .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", workspaceSlug))
          .unique()
      : await ctx.runQuery(api.workspaces.getWorkspaceBySlug, { slug: workspaceSlug })
    : null;
  const sites =
    workspace && "db" in ctx
      ? await ctx.db
          .query("workspaceSites")
          .withIndex("by_workspace", (queryBuilder) =>
            queryBuilder.eq("workspaceId", workspace._id),
          )
          .collect()
      : (workspace?.sites ?? []);
  const site = sites.find((site) => site.siteKey === event.siteKey);
  const domain = workspace?.primaryDomain ?? site?.domain;
  if (domain) return trimTrailingSlash(/^https?:\/\//.test(domain) ? domain : `https://${domain}`);
  return resolvePublicBaseUrlForEvent(event);
}
