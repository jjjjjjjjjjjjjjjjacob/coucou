import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveTenantWorkspaceScope } from "./workspaceScope";

export type SiteScope = {
  siteKey?: string | null;
  workspaceSlug?: string | null;
};

type EventScopeRecord = Pick<Doc<"events">, "_id" | "siteKey" | "workspaceSlug">;

type TextBlastScopeRecord = Doc<"textBlasts">;

type SiteScopedDatabaseReader = Pick<QueryCtx | MutationCtx, "db">;

export function eventMatchesSiteScope(event: EventScopeRecord | null, scope: SiteScope): boolean {
  if (!event) {
    return false;
  }

  if (scope.siteKey) {
    const normalizedSiteKey = event.siteKey ?? "dojo";
    if (normalizedSiteKey !== scope.siteKey) {
      return false;
    }
  }

  if (scope.workspaceSlug) {
    const normalizedWorkspaceSlug = event.workspaceSlug ?? event.siteKey ?? "dojo";
    if (normalizedWorkspaceSlug !== scope.workspaceSlug) {
      return false;
    }
  }

  return true;
}

export async function getEventInSiteScope(
  ctx: SiteScopedDatabaseReader,
  eventId: Id<"events">,
  scope: SiteScope,
): Promise<Doc<"events"> | null> {
  const event = await ctx.db.get(eventId);
  if (!eventMatchesSiteScope(event, scope)) {
    return null;
  }

  return event;
}

export async function ensureEventInSiteScope(
  ctx: SiteScopedDatabaseReader,
  eventId: Id<"events">,
  scope: SiteScope,
): Promise<Doc<"events">> {
  const event = await getEventInSiteScope(ctx, eventId, scope);
  if (!event) {
    throw new Error("Event not found");
  }

  return event;
}

export async function getTextBlastInSiteScope(
  ctx: SiteScopedDatabaseReader,
  blastId: Id<"textBlasts">,
  scope: SiteScope,
): Promise<{ blast: TextBlastScopeRecord; event: Doc<"events"> | null } | null> {
  const blast = await ctx.db.get(blastId);
  if (!blast) {
    return null;
  }

  if (blast.workspaceId) {
    const workspace = await resolveTenantWorkspaceScope(ctx, {
      workspaceSlug: scope.workspaceSlug ?? undefined,
      siteKey: scope.siteKey ?? undefined,
    });
    if (!workspace || workspace.workspaceId !== blast.workspaceId) return null;
    const event = blast.eventId ? await getEventInSiteScope(ctx, blast.eventId, scope) : null;
    if (blast.eventId && !event) return null;
    return { blast, event };
  }
  if (!blast.eventId) return null;
  const event = await getEventInSiteScope(ctx, blast.eventId, scope);
  if (!event) {
    return null;
  }

  return { blast, event };
}

export async function ensureTextBlastInSiteScope(
  ctx: SiteScopedDatabaseReader,
  blastId: Id<"textBlasts">,
  scope: SiteScope,
): Promise<{ blast: TextBlastScopeRecord; event: Doc<"events"> | null }> {
  const blastRecord = await getTextBlastInSiteScope(ctx, blastId, scope);
  if (!blastRecord) {
    throw new Error("Text blast not found");
  }

  return blastRecord;
}
