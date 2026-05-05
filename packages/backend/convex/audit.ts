import { query } from "./functions";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireCoucouPlatformMember } from "./lib/platformAuth";

export type AuditWriteEntry = {
  action: string;
  actorClerkUserId?: string;
  actorEmail?: string;
  targetKind?: string;
  targetId?: string;
  workspaceId?: Id<"workspaces">;
  summary?: string;
  metadata?: Record<string, string>;
};

export async function writeAuditEntry(
  ctx: MutationCtx,
  entry: AuditWriteEntry,
): Promise<Id<"auditLog">> {
  let actorClerkUserId = entry.actorClerkUserId;
  if (!actorClerkUserId) {
    const identity = await ctx.auth.getUserIdentity();
    actorClerkUserId = identity?.subject ?? undefined;
  }

  return await ctx.db.insert("auditLog", {
    at: Date.now(),
    actorClerkUserId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    targetKind: entry.targetKind,
    targetId: entry.targetId,
    workspaceId: entry.workspaceId,
    summary: entry.summary,
    metadata: entry.metadata,
  });
}

export const listPaginated = query({
  args: {
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    actionFilter: v.optional(v.string()),
    actorSearch: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (
    ctx,
    {
      cursor,
      pageSize = 25,
      actionFilter,
      actorSearch,
      workspaceId,
    },
  ) => {
    await requireCoucouPlatformMember(ctx);
    const all = await ctx.db
      .query("auditLog")
      .withIndex("by_at")
      .order("desc")
      .collect();

    const trimmedActorSearch = actorSearch?.trim().toLowerCase() ?? "";

    const filtered = all.filter((entry) => {
      if (actionFilter && actionFilter !== "all" && entry.action !== actionFilter) {
        return false;
      }
      if (workspaceId && entry.workspaceId !== workspaceId) {
        return false;
      }
      if (trimmedActorSearch) {
        const actor = (entry.actorEmail ?? entry.actorClerkUserId ?? "").toLowerCase();
        if (!actor.includes(trimmedActorSearch)) {
          return false;
        }
      }
      return true;
    });

    const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
    const page = filtered.slice(cursorIndex, cursorIndex + pageSize);
    const nextCursor =
      cursorIndex + pageSize < filtered.length
        ? String(cursorIndex + pageSize)
        : null;
    const isDone = cursorIndex + pageSize >= filtered.length;

    const workspaceIdsSet = new Set<Id<"workspaces">>();
    page.forEach((entry) => {
      if (entry.workspaceId) workspaceIdsSet.add(entry.workspaceId);
    });

    const workspacesById = new Map<string, { name: string; slug: string }>();
    for (const wid of workspaceIdsSet) {
      const workspace = await ctx.db.get(wid);
      if (workspace) {
        workspacesById.set(wid, { name: workspace.name, slug: workspace.slug });
      }
    }

    const totalCount = filtered.length;

    return {
      page: page.map((entry) => ({
        ...entry,
        workspace: entry.workspaceId
          ? workspacesById.get(entry.workspaceId) ?? null
          : null,
      })),
      nextCursor,
      isDone,
      totalCount,
    };
  },
});

export const listDistinctActions = query({
  args: {},
  handler: async (ctx) => {
    await requireCoucouPlatformMember(ctx);
    const all = await ctx.db.query("auditLog").collect();
    const actions = new Set<string>();
    for (const entry of all) actions.add(entry.action);
    return Array.from(actions).sort();
  },
});
