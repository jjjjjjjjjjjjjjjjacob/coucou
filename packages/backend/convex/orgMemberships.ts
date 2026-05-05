import { mutation, query } from "./functions";
import { v } from "convex/values";
import {
  getCoucouOrganizationSlug,
  requireCoucouPlatformMember,
} from "./lib/platformAuth";

export const upsertMembership = mutation({
  args: {
    clerkUserId: v.string(),
    organizationId: v.string(),
    role: v.string(),
  },
  handler: async (ctx, { clerkUserId, organizationId, role }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .filter((q) => q.eq(q.field("organizationId"), organizationId))
      .unique();
    if (!existing) {
      await ctx.db.insert("orgMemberships", {
        clerkUserId,
        organizationId,
        role,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true } as const;
    } else {
      await ctx.db.patch(existing._id, { role, updatedAt: now });
      return { created: false } as const;
    }
  },
});

export const removeMembership = mutation({
  args: {
    clerkUserId: v.string(),
    organizationId: v.string(),
  },
  handler: async (ctx, { clerkUserId, organizationId }) => {
    const existing = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .filter((q) => q.eq(q.field("organizationId"), organizationId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { removed: true } as const;
    }
    return { removed: false } as const;
  },
});

export const listForUser = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();
  },
});

export const listAllMembershipsPaginated = query({
  args: {
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    search: v.optional(v.string()),
    roleFilter: v.optional(v.string()),
    organizationId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { cursor, pageSize = 25, search, roleFilter, organizationId },
  ) => {
    await requireCoucouPlatformMember(ctx);
    const allMemberships = await ctx.db.query("orgMemberships").collect();

    const trimmedSearch = search?.trim().toLowerCase() ?? "";

    const userIds = new Set(
      allMemberships.map((membership) => membership.clerkUserId),
    );
    const usersByClerkId = new Map<
      string,
      { firstName?: string; lastName?: string; phone?: string; email?: string }
    >();
    for (const userId of userIds) {
      const userDoc = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
        .unique();
      if (userDoc) {
        const email = userDoc.metadata?.email;
        usersByClerkId.set(userId, {
          firstName: userDoc.firstName,
          lastName: userDoc.lastName,
          phone: userDoc.phone,
          email,
        });
      }
    }

    const allWorkspaces = await ctx.db.query("workspaces").collect();
    const workspaceByOrgId = new Map<
      string,
      { name: string; slug: string; _id: string }
    >();
    for (const workspace of allWorkspaces) {
      if (workspace.clerkOrganizationId) {
        workspaceByOrgId.set(workspace.clerkOrganizationId, {
          name: workspace.name,
          slug: workspace.slug,
          _id: workspace._id,
        });
      }
    }

    const tenanciesByUser = new Map<string, Set<string>>();
    for (const membership of allMemberships) {
      const set =
        tenanciesByUser.get(membership.clerkUserId) ?? new Set<string>();
      set.add(membership.organizationId);
      tenanciesByUser.set(membership.clerkUserId, set);
    }

    const filtered = allMemberships.filter((membership) => {
      const workspace = workspaceByOrgId.get(membership.organizationId);
      if (
        membership.organizationId === getCoucouOrganizationSlug() ||
        workspace?.slug === "coucou"
      ) {
        return false;
      }
      if (
        roleFilter &&
        roleFilter !== "all" &&
        membership.role !== roleFilter
      ) {
        return false;
      }
      if (organizationId && membership.organizationId !== organizationId) {
        return false;
      }
      if (trimmedSearch) {
        const userInfo = usersByClerkId.get(membership.clerkUserId);
        const haystack = [
          userInfo?.firstName ?? "",
          userInfo?.lastName ?? "",
          userInfo?.email ?? "",
          membership.clerkUserId,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(trimmedSearch)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => b.updatedAt - a.updatedAt);

    const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
    const page = filtered.slice(cursorIndex, cursorIndex + pageSize);

    return {
      page: page.map((membership) => {
        const userInfo = usersByClerkId.get(membership.clerkUserId);
        const workspace = workspaceByOrgId.get(membership.organizationId);
        return {
          ...membership,
          firstName: userInfo?.firstName ?? null,
          lastName: userInfo?.lastName ?? null,
          email: userInfo?.email ?? null,
          phone: userInfo?.phone ?? null,
          workspace: workspace ?? null,
          tenancyCount:
            tenanciesByUser.get(membership.clerkUserId)?.size ?? 0,
        };
      }),
      nextCursor:
        cursorIndex + pageSize < filtered.length
          ? String(cursorIndex + pageSize)
          : null,
      isDone: cursorIndex + pageSize >= filtered.length,
      totalCount: filtered.length,
    };
  },
});

export const updateMembershipRole = mutation({
  args: {
    clerkUserId: v.string(),
    organizationId: v.string(),
    role: v.string(),
  },
  handler: async (ctx, { clerkUserId, organizationId, role }) => {
    await requireCoucouPlatformMember(ctx);
    const existing = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .filter((q) => q.eq(q.field("organizationId"), organizationId))
      .unique();
    if (!existing) {
      throw new Error("Membership not found");
    }
    await ctx.db.patch(existing._id, { role, updatedAt: Date.now() });
  },
});
