import { mutation, query } from "./functions";
import { v } from "convex/values";
import { writeAuditEntry } from "./audit";
import { requireCoucouPlatformMember } from "./lib/platformAuth";

export const listForWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    await requireCoucouPlatformMember(ctx);
    const workspaces = await ctx.db.query("workspaces").collect();
    const senders = await ctx.db.query("smsSenders").collect();

    const sendersByWorkspace = new Map<string, typeof senders>();
    for (const sender of senders) {
      const list = sendersByWorkspace.get(sender.workspaceId) ?? [];
      list.push(sender);
      sendersByWorkspace.set(sender.workspaceId, list);
    }

    return workspaces
      .filter(
        (workspace) => workspace.slug !== "coucou" && workspace.kind !== "admin",
      )
      .map((workspace) => ({
        workspace,
        senders: sendersByWorkspace.get(workspace._id) ?? [],
      }));
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("smsSenders")),
    workspaceId: v.id("workspaces"),
    phoneNumber: v.string(),
    brandLabel: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    verifiedAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { id, workspaceId, phoneNumber, brandLabel, isDefault, verifiedAt },
  ) => {
    const identity = await requireCoucouPlatformMember(ctx);
    const now = Date.now();

    if (isDefault) {
      const existingForWorkspace = await ctx.db
        .query("smsSenders")
        .withIndex("by_workspace", (queryBuilder) =>
          queryBuilder.eq("workspaceId", workspaceId),
        )
        .collect();
      for (const sender of existingForWorkspace) {
        if (sender.isDefault && sender._id !== id) {
          await ctx.db.patch(sender._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    let resultId;
    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing) throw new Error("Sender not found");
      await ctx.db.patch(id, {
        phoneNumber,
        brandLabel,
        isDefault,
        verifiedAt,
        updatedAt: now,
      });
      resultId = id;
    } else {
      resultId = await ctx.db.insert("smsSenders", {
        workspaceId,
        phoneNumber,
        brandLabel,
        isDefault,
        verifiedAt,
        createdAt: now,
        updatedAt: now,
      });
    }

    await writeAuditEntry(ctx, {
      action: id ? "smsSender.update" : "smsSender.create",
      actorClerkUserId: identity?.subject,
      targetKind: "smsSender",
      targetId: resultId,
      workspaceId,
      summary: `${phoneNumber}${brandLabel ? ` (${brandLabel})` : ""}`,
    });

    return resultId;
  },
});

export const remove = mutation({
  args: { id: v.id("smsSenders") },
  handler: async (ctx, { id }) => {
    const identity = await requireCoucouPlatformMember(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) return;
    await ctx.db.delete(id);
    await writeAuditEntry(ctx, {
      action: "smsSender.delete",
      actorClerkUserId: identity?.subject,
      targetKind: "smsSender",
      targetId: id,
      workspaceId: existing.workspaceId,
      summary: existing.phoneNumber,
    });
  },
});
