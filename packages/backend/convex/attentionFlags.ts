import { mutation, query } from "./functions";
import { v } from "convex/values";
import { writeAuditEntry } from "./audit";
import { requireCoucouPlatformMember } from "./lib/platformAuth";

const kindValidator = v.union(v.literal("flag"), v.literal("watch"));
const statusValidator = v.union(
  v.literal("open"),
  v.literal("ack"),
  v.literal("resolved"),
);

export const create = mutation({
  args: {
    kind: kindValidator,
    label: v.string(),
    detail: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    sourceModule: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("attentionFlags", {
      ...args,
      observedAt: Date.now(),
      status: "open",
    });

    await writeAuditEntry(ctx, {
      action: "attentionFlag.create",
      targetKind: "attentionFlag",
      targetId: id,
      workspaceId: args.workspaceId,
      summary: `${args.kind}: ${args.label}`,
    });

    return id;
  },
});

export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    await requireCoucouPlatformMember(ctx);
    const open = await ctx.db
      .query("attentionFlags")
      .withIndex("by_status", (queryBuilder) =>
        queryBuilder.eq("status", "open"),
      )
      .collect();

    open.sort((a, b) => b.observedAt - a.observedAt);

    return open.map((flag) => ({
      kind: flag.kind,
      label: flag.label,
      detail: flag.detail ?? "",
      observedAt: flag.observedAt,
    }));
  },
});

export const listPaginated = query({
  args: {
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    statusFilter: v.optional(
      v.union(statusValidator, v.literal("all")),
    ),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { cursor, pageSize = 25, statusFilter, search }) => {
    await requireCoucouPlatformMember(ctx);
    const all = await ctx.db
      .query("attentionFlags")
      .withIndex("by_observedAt")
      .order("desc")
      .collect();

    const trimmedSearch = search?.trim().toLowerCase() ?? "";

    const filtered = all.filter((flag) => {
      if (statusFilter && statusFilter !== "all" && flag.status !== statusFilter) {
        return false;
      }
      if (trimmedSearch) {
        const haystack = [flag.label, flag.detail ?? "", flag.sourceModule ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(trimmedSearch)) return false;
      }
      return true;
    });

    const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
    const page = filtered.slice(cursorIndex, cursorIndex + pageSize);

    const workspaceIds = new Set<string>();
    page.forEach((flag) => {
      if (flag.workspaceId) workspaceIds.add(flag.workspaceId);
    });
    const workspacesById = new Map<string, { name: string; slug: string }>();
    for (const wid of workspaceIds) {
      const workspace = await ctx.db.get(wid as never);
      if (workspace && "slug" in workspace && "name" in workspace) {
        workspacesById.set(wid, { name: workspace.name, slug: workspace.slug });
      }
    }

    return {
      page: page.map((flag) => ({
        ...flag,
        workspace: flag.workspaceId
          ? workspacesById.get(flag.workspaceId) ?? null
          : null,
      })),
      nextCursor:
        cursorIndex + pageSize < filtered.length
          ? String(cursorIndex + pageSize)
          : null,
      isDone: cursorIndex + pageSize >= filtered.length,
      totalCount: filtered.length,
      openCount: all.filter((flag) => flag.status === "open").length,
    };
  },
});

export const ackFlag = mutation({
  args: { id: v.id("attentionFlags") },
  handler: async (ctx, { id }) => {
    const identity = await requireCoucouPlatformMember(ctx);
    await ctx.db.patch(id, { status: "ack" });
    await writeAuditEntry(ctx, {
      action: "attentionFlag.ack",
      actorClerkUserId: identity?.subject,
      targetKind: "attentionFlag",
      targetId: id,
    });
  },
});

export const resolveFlag = mutation({
  args: { id: v.id("attentionFlags") },
  handler: async (ctx, { id }) => {
    const identity = await requireCoucouPlatformMember(ctx);
    await ctx.db.patch(id, {
      status: "resolved",
      resolvedAt: Date.now(),
      resolvedByClerkUserId: identity?.subject,
    });
    await writeAuditEntry(ctx, {
      action: "attentionFlag.resolve",
      actorClerkUserId: identity?.subject,
      targetKind: "attentionFlag",
      targetId: id,
    });
  },
});
