import { createClerkClient } from "@clerk/backend";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { writeAuditEntry } from "./audit";
import { action, internalQuery, mutation, query } from "./functions";
import { generateReferralCode } from "./lib/codeGenerators";
import { resolveApprovalStatus } from "./lib/rsvpStatus";
import { ensureEventInSiteScope } from "./lib/siteScope";
import { requireWorkspaceAdmin, requireWorkspaceHost } from "./lib/workspaceAuth";

const REFERRAL_CODE_MAX_ATTEMPTS = 20;

function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase();
}

async function generateUniqueReferralCode(ctx: MutationCtx): Promise<string> {
  for (let attemptNumber = 0; attemptNumber < REFERRAL_CODE_MAX_ATTEMPTS; attemptNumber++) {
    const referralCode = generateReferralCode();
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_referralCode", (queryBuilder) => queryBuilder.eq("referralCode", referralCode))
      .first();
    if (!existingUser) {
      return referralCode;
    }
  }

  throw new Error("Unable to generate a unique referral code");
}

export const getAll = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    sortBy: v.optional(
      v.union(
        v.literal("createdAt"),
        v.literal("updatedAt"),
        v.literal("name"),
        v.literal("email"),
      ),
    ),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    filter: v.optional(
      v.object({
        clerkUserId: v.optional(v.string()),
        hasEmail: v.optional(v.boolean()),
        hasPhone: v.optional(v.boolean()),
        hasImage: v.optional(v.boolean()),
        createdAfter: v.optional(v.number()),
        createdBefore: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const all = await ctx.db.query("users").collect();

    // Apply search
    const search = args.search?.trim().toLowerCase();
    const filtered = all.filter((u) => {
      // Basic filter criteria
      if (args.filter?.clerkUserId && u.clerkUserId !== args.filter.clerkUserId) return false;
      // Email filtering not supported as email field doesn't exist in schema
      if (args.filter?.hasEmail === true) return false;
      if (args.filter?.hasEmail === false) return true;
      if (args.filter?.hasPhone === true && !u.phone) return false;
      if (args.filter?.hasPhone === false && !!u.phone) return false;
      if (args.filter?.hasImage === true && !u.imageUrl) return false;
      if (args.filter?.hasImage === false && !!u.imageUrl) return false;
      if (args.filter?.createdAfter && u.createdAt < args.filter.createdAfter) return false;
      if (args.filter?.createdBefore && u.createdAt > args.filter.createdBefore) return false;

      if (!search) return true;
      const firstName = (u.firstName ?? "").toLowerCase();
      const lastName = (u.lastName ?? "").toLowerCase();
      const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim().toLowerCase();
      const phone = (u.phone ?? "").toLowerCase();
      return (
        firstName.includes(search) ||
        lastName.includes(search) ||
        fullName.includes(search) ||
        phone.includes(search)
      );
    });

    // Sorting
    const sortBy = args.sortBy ?? "createdAt";
    const sortOrder = args.sortOrder ?? "desc";
    filtered.sort((a: Doc<"users">, b: Doc<"users">) => {
      const av = a[sortBy as keyof Doc<"users">];
      const bv = b[sortBy as keyof Doc<"users">];
      // Normalize undefined to empty/zero for stable sort
      const aNorm = av ?? (typeof bv === "string" ? "" : 0);
      const bNorm = bv ?? (typeof av === "string" ? "" : 0);
      if (aNorm < bNorm) return sortOrder === "asc" ? -1 : 1;
      if (aNorm > bNorm) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    // Pagination (offset/limit)
    const limit = Math.max(0, Math.min(200, args.limit ?? 50));
    const offset = Math.max(0, args.offset ?? 0);
    const items = filtered.slice(offset, offset + limit);
    const total = filtered.length;
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < total;

    return {
      items,
      page: {
        offset,
        limit,
        total,
        hasMore,
        nextOffset: hasMore ? nextOffset : null,
      },
      sort: { by: sortBy, order: sortOrder },
      applied: { search: search ?? null, filter: args.filter ?? null },
    } as const;
  },
});

export const upsertFromClerk = mutation({
  args: {
    clerkUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!existing) {
      await ctx.db.insert("users", {
        clerkUserId: args.clerkUserId,
        phone: args.phone,
        imageUrl: args.imageUrl,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true } as const;
    } else {
      await ctx.db.patch(existing._id, {
        phone: args.phone ?? existing.phone,
        imageUrl: args.imageUrl ?? existing.imageUrl,
        updatedAt: now,
      });
      return { created: false } as const;
    }
  },
});

export const getByClerkUser = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
  },
});

export const getByReferralCode = query({
  args: { referralCode: v.string() },
  handler: async (ctx, { referralCode }) => {
    const normalizedReferralCode = normalizeReferralCode(referralCode);
    if (!normalizedReferralCode) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_referralCode", (queryBuilder) =>
        queryBuilder.eq("referralCode", normalizedReferralCode),
      )
      .unique();
  },
});

export const ensureCurrentReferralCode = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const now = Date.now();
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", identity.subject),
      )
      .unique();

    if (existingUser?.referralCode) {
      return { referralCode: existingUser.referralCode };
    }

    const referralCode = await generateUniqueReferralCode(ctx);
    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        referralCode,
        updatedAt: now,
      });
      return { referralCode };
    }

    await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      phone: identity.phoneNumber ?? undefined,
      imageUrl: identity.pictureUrl ?? undefined,
      referralCode,
      createdAt: now,
      updatedAt: now,
    });
    return { referralCode };
  },
});

export const getByClerkUserInternal = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
  },
});

export const upsertContactPhone = mutation({
  args: {
    phone: v.optional(v.string()),
  },
  handler: async (ctx, { phone }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const normalizedPhone = phone?.trim() || undefined;
    const now = Date.now();
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) {
      await ctx.db.insert("users", {
        clerkUserId: identity.subject,
        phone: normalizedPhone,
        imageUrl: identity.pictureUrl ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true as const };
    }

    await ctx.db.patch(user._id, {
      phone: normalizedPhone ?? user.phone,
      updatedAt: now,
    });
    return { created: false as const };
  },
});

export const updateProfileMeta = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    const now = Date.now();
    if (!user) {
      await ctx.db.insert("users", {
        clerkUserId: identity.subject,
        phone: identity.phoneNumber ?? undefined,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: identity.pictureUrl ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true as const };
    }
    await ctx.db.patch(user._id, {
      firstName: args.firstName ?? user.firstName,
      lastName: args.lastName ?? user.lastName,
      updatedAt: now,
    });
    return { created: false as const };
  },
});

// Seed helper mutation - creates a user with any clerkUserId (for testing)
export const create = mutation({
  args: {
    clerkUserId: v.string(),
    phone: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      phone: args.phone,
      firstName: args.firstName,
      lastName: args.lastName,
      imageUrl: args.imageUrl,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  },
});

// Delete a user (for cleaning up test data)
export const deleteUser = mutation({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (user) {
      const workspaceProfileValueGrants = await ctx.db
        .query("workspaceProfileValueGrants")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", args.clerkUserId))
        .collect();
      const profileFieldValues = await ctx.db
        .query("profileFieldValues")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", args.clerkUserId))
        .collect();
      const userSocialProfiles = await ctx.db
        .query("userSocialProfiles")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", args.clerkUserId))
        .collect();

      for (const workspaceProfileValueGrant of workspaceProfileValueGrants) {
        await ctx.db.delete(workspaceProfileValueGrant._id);
      }
      for (const profileFieldValue of profileFieldValues) {
        await ctx.db.delete(profileFieldValue._id);
      }
      for (const userSocialProfile of userSocialProfiles) {
        await ctx.db.delete(userSocialProfile._id);
      }

      await ctx.db.delete(user._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});

export const listOrganizationUsers = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspaceScope = await requireWorkspaceAdmin(ctx, args);

    // Get all users and their org memberships
    const users = await ctx.db.query("users").collect();
    const orgMemberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org", (q) => q.eq("organizationId", workspaceScope.clerkOrganizationId))
      .collect();

    // Include ALL users, with role as "guest" if no membership
    const usersWithRoles = users.map((user) => {
      const membership = orgMemberships.find((m) => m.clerkUserId === user.clerkUserId);

      return {
        _id: user._id,
        clerkUserId: user.clerkUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
        role: membership?.role || "guest",
        organizationId: membership?.organizationId || null,
        hasOrganizationMembership: !!membership,
      };
    });

    return usersWithRoles.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const promoteUserToOrganization = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    organizationId: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { userId, role, organizationId, siteKey, workspaceSlug }) => {
    const workspaceScope = await requireWorkspaceAdmin(ctx, {
      siteKey,
      workspaceSlug,
    });
    if (organizationId && organizationId !== workspaceScope.clerkOrganizationId) {
      throw new Error("Organization does not match workspace");
    }
    const clerkRole = toClerkOrganizationRole(role);

    // Get the target user
    const targetUser = await ctx.db.get(userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    // Check if user already has membership
    const existingMembership = await ctx.db
      .query("orgMemberships")
      .filter((q) => q.eq(q.field("clerkUserId"), targetUser.clerkUserId))
      .filter((q) => q.eq(q.field("organizationId"), workspaceScope.clerkOrganizationId))
      .first();

    if (existingMembership) {
      throw new Error("User already has organization membership");
    }

    // Validate clerkUserId exists
    if (!targetUser.clerkUserId) {
      throw new Error("User does not have a valid Clerk ID");
    }

    // Create new organization membership
    await ctx.db.insert("orgMemberships", {
      clerkUserId: targetUser.clerkUserId,
      organizationId: workspaceScope.clerkOrganizationId,
      role: clerkRole,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.string(),
    organizationId: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { userId, newRole, organizationId, siteKey, workspaceSlug }) => {
    const workspaceScope = await requireWorkspaceAdmin(ctx, {
      siteKey,
      workspaceSlug,
    });
    if (organizationId && organizationId !== workspaceScope.clerkOrganizationId) {
      throw new Error("Organization does not match workspace");
    }
    const clerkRole = toClerkOrganizationRole(newRole);

    // Get the target user
    const targetUser = await ctx.db.get(userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    // Find the user's organization membership
    const targetMembership = await ctx.db
      .query("orgMemberships")
      .filter((q) => q.eq(q.field("clerkUserId"), targetUser.clerkUserId))
      .filter((q) => q.eq(q.field("organizationId"), workspaceScope.clerkOrganizationId))
      .first();

    if (!targetMembership) {
      // Validate clerkUserId exists
      if (!targetUser.clerkUserId) {
        throw new Error("User does not have a valid Clerk ID");
      }

      // User doesn't have membership yet, create one (promote from guest)
      await ctx.db.insert("orgMemberships", {
        clerkUserId: targetUser.clerkUserId,
        organizationId: workspaceScope.clerkOrganizationId,
        role: clerkRole,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      // User has membership, update their role
      await ctx.db.patch(targetMembership._id, {
        role: clerkRole,
        updatedAt: Date.now(),
      });
    }

    await writeAuditEntry(ctx, {
      action: "user.updateRole",
      targetKind: "user",
      targetId: userId,
      summary: `${targetUser.firstName ?? ""} ${targetUser.lastName ?? ""} → ${clerkRole}`.trim(),
      metadata: {
        clerkOrganizationId: workspaceScope.clerkOrganizationId,
      },
    });

    return { success: true };
  },
});

type OrganizationUserSortOption = "createdAt" | "name" | "role";
type OrganizationUserSortDirection = "asc" | "desc";

const normalizeRoleValue = (role: string): string => role.replace(/^org:/, "");

const toClerkOrganizationRole = (role: string): "org:admin" | "org:host" | "org:door" => {
  const normalizedRole = normalizeRoleValue(role);
  switch (normalizedRole) {
    case "admin":
      return "org:admin";
    case "host":
      return "org:host";
    case "door":
    case "member":
      return "org:door";
    default:
      throw new Error("Invalid role");
  }
};

const resolveRolePriority = (role: string): number => {
  const normalizedRole = normalizeRoleValue(role);
  switch (normalizedRole) {
    case "admin":
      return 0;
    case "host":
      return 1;
    case "door":
    case "member":
      return 2;
    case "guest":
      return 3;
    default:
      return 4;
  }
};

const resolveDisplayNameForSort = (user: {
  firstName?: string | null;
  lastName?: string | null;
  clerkUserId?: string | null;
}): string => {
  const firstName = (user.firstName ?? "").trim();
  const lastName = (user.lastName ?? "").trim();
  const combined = `${firstName} ${lastName}`.trim();
  if (combined.length > 0) {
    return combined.toLowerCase();
  }
  return (user.clerkUserId ?? "").toLowerCase();
};

const sortOrganizationUsers = (
  users: Array<{
    firstName?: string | null;
    lastName?: string | null;
    clerkUserId?: string | null;
    createdAt: number;
    role: string;
  }>,
  sortBy: OrganizationUserSortOption,
  sortDirection: OrganizationUserSortDirection,
) => {
  const directionMultiplier = sortDirection === "asc" ? 1 : -1;
  return users.sort((firstUser, secondUser) => {
    let comparison = 0;
    if (sortBy === "name") {
      comparison = resolveDisplayNameForSort(firstUser).localeCompare(
        resolveDisplayNameForSort(secondUser),
      );
      if (comparison === 0) {
        comparison = firstUser.createdAt - secondUser.createdAt;
      }
    } else if (sortBy === "role") {
      comparison = resolveRolePriority(firstUser.role) - resolveRolePriority(secondUser.role);
      if (comparison === 0) {
        comparison = resolveDisplayNameForSort(firstUser).localeCompare(
          resolveDisplayNameForSort(secondUser),
        );
      }
      if (comparison === 0) {
        comparison = firstUser.createdAt - secondUser.createdAt;
      }
    } else {
      comparison = firstUser.createdAt - secondUser.createdAt;
      if (comparison === 0) {
        comparison = resolveDisplayNameForSort(firstUser).localeCompare(
          resolveDisplayNameForSort(secondUser),
        );
      }
    }
    return directionMultiplier * comparison;
  });
};

export const listOrganizationUsersPaginated = query({
  args: {
    pageIndex: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    search: v.optional(v.string()),
    roleFilter: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    sortBy: v.optional(v.union(v.literal("createdAt"), v.literal("name"), v.literal("role"))),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const workspaceScope = await requireWorkspaceAdmin(ctx, args);

    const pageIndex = args.pageIndex ?? 0;
    const pageSize = Math.min(args.pageSize ?? 10, 100); // Limit max page size to 100

    // Get all users and their org memberships
    const users = await ctx.db.query("users").collect();
    const orgMemberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org", (q) => q.eq("organizationId", workspaceScope.clerkOrganizationId))
      .collect();

    // Include ALL users, with role as "guest" if no membership
    let usersWithRoles = users.map((user) => {
      const membership = orgMemberships.find((m) => m.clerkUserId === user.clerkUserId);

      return {
        _id: user._id,
        clerkUserId: user.clerkUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
        role: membership?.role || "guest",
        organizationId: membership?.organizationId || null,
        hasOrganizationMembership: !!membership,
      };
    });

    // Apply search filter
    const searchTerm = args.search?.trim().toLowerCase();
    if (searchTerm) {
      usersWithRoles = usersWithRoles.filter((user) => {
        const firstName = (user.firstName || "").toLowerCase();
        const lastName = (user.lastName || "").toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
        const role = (user.role || "").toLowerCase();

        return (
          firstName.includes(searchTerm) ||
          lastName.includes(searchTerm) ||
          fullName.includes(searchTerm) ||
          role.includes(searchTerm)
        );
      });
    }

    // Apply role filter
    if (args.roleFilter && args.roleFilter !== "all") {
      const normalizedRoleFilter = normalizeRoleValue(args.roleFilter);
      usersWithRoles = usersWithRoles.filter((user) => {
        const normalizedUserRole = normalizeRoleValue(user.role);
        if (normalizedRoleFilter === "door") {
          return normalizedUserRole === "door" || normalizedUserRole === "member";
        }
        return normalizedUserRole === normalizedRoleFilter;
      });
    }

    const sortBy: OrganizationUserSortOption = args.sortBy ?? "createdAt";
    const sortDirection: OrganizationUserSortDirection =
      args.sortDirection ?? (sortBy === "createdAt" ? "desc" : "asc");

    const sortedUsers = sortOrganizationUsers(usersWithRoles, sortBy, sortDirection);

    // Calculate pagination
    const totalCount = sortedUsers.length;
    const startIndex = pageIndex * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedUsers = sortedUsers.slice(startIndex, endIndex);

    const hasNextPage = endIndex < totalCount;
    const hasPreviousPage = pageIndex > 0;

    return {
      users: paginatedUsers,
      pagination: {
        pageIndex,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNextPage,
        hasPreviousPage,
        startIndex: startIndex + 1,
        endIndex: Math.min(endIndex, totalCount),
        sortBy,
        sortDirection,
      },
    };
  },
});

export const getUserStats = query({
  args: {
    clerkUserId: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { clerkUserId, siteKey, workspaceSlug }) => {
    const workspaceScope = await requireWorkspaceAdmin(ctx, {
      siteKey,
      workspaceSlug,
    });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== clerkUserId) {
      throw new Error("Unauthorized");
    }

    const totalRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();

    const organizationMembers = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org", (q) => q.eq("organizationId", workspaceScope.clerkOrganizationId))
      .collect();

    return {
      total: organizationMembers.length,
      admin: organizationMembers.filter((member) => normalizeRoleValue(member.role) === "admin")
        .length,
      host: organizationMembers.filter((member) => normalizeRoleValue(member.role) === "host")
        .length,
      door: organizationMembers.filter((member) =>
        ["door", "member"].includes(normalizeRoleValue(member.role)),
      ).length,
      member: organizationMembers.filter((member) =>
        ["door", "member"].includes(normalizeRoleValue(member.role)),
      ).length,
      guest: organizationMembers.filter((member) => normalizeRoleValue(member.role) === "guest")
        .length,
      organizationMembers: organizationMembers.length,
      totalRsvps: totalRsvps.length,
      approvedRsvps: totalRsvps.filter((rsvp) => resolveApprovalStatus(rsvp) === "approved").length,
      deniedRsvps: totalRsvps.filter((rsvp) => resolveApprovalStatus(rsvp) === "denied").length,
      lastUpdated: Date.now(),
    };
  },
});

export const promoteUserToOrganizationWithClerk = action({
  args: {
    userId: v.id("users"),
    role: v.string(),
    organizationId: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { userId, role, organizationId, siteKey, workspaceSlug }) => {
    const workspaceScope = await requireWorkspaceAdmin(ctx, {
      siteKey,
      workspaceSlug,
    });
    if (organizationId && organizationId !== workspaceScope.clerkOrganizationId) {
      throw new Error("Organization does not match workspace");
    }

    const targetUserRecord = await ctx.runQuery(api.users.getById, { userId });
    const targetClerkUserId = targetUserRecord?.clerkUserId;
    if (!targetClerkUserId) {
      throw new Error("Target user missing Clerk ID");
    }

    const targetUser = await ctx.runQuery(api.users.getByClerkUser, {
      clerkUserId: targetClerkUserId,
    });

    if (!targetUser || !targetUser.clerkUserId) {
      throw new Error("User not found or missing Clerk ID");
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    const clerkOrgId = workspaceScope.clerkOrganizationId;
    const clerkRole = toClerkOrganizationRole(role);

    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    await clerk.organizations.createOrganizationMembership({
      organizationId: clerkOrgId,
      userId: targetUser.clerkUserId,
      role: clerkRole,
    });

    await ctx.runMutation(api.users.promoteUserToOrganization, {
      userId,
      role,
      organizationId: clerkOrgId,
      siteKey,
      workspaceSlug,
    });

    return { success: true };
  },
});

export const updateUserRoleWithClerk = action({
  args: {
    userId: v.id("users"),
    newRole: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { userId, newRole, siteKey, workspaceSlug }) => {
    const workspaceScope = await requireWorkspaceAdmin(ctx, {
      siteKey,
      workspaceSlug,
    });

    const targetUserRecord = await ctx.runQuery(api.users.getById, { userId });
    const targetClerkUserId = targetUserRecord?.clerkUserId;
    if (!targetClerkUserId) {
      throw new Error("Target user missing Clerk ID");
    }

    const targetUser = await ctx.runQuery(api.users.getByClerkUser, {
      clerkUserId: targetClerkUserId,
    });

    if (!targetUser || !targetUser.clerkUserId) {
      throw new Error("User not found or missing Clerk ID");
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    const clerkOrgId = workspaceScope.clerkOrganizationId;
    const clerkRole = toClerkOrganizationRole(newRole);

    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    await clerk.organizations.updateOrganizationMembership({
      organizationId: clerkOrgId,
      userId: targetUser.clerkUserId,
      role: clerkRole,
    });

    await ctx.runMutation(api.users.updateUserRole, {
      userId,
      newRole,
      organizationId: clerkOrgId,
      siteKey,
      workspaceSlug,
    });

    return { success: true };
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  },
});

export const getOrganizationUserByReference = query({
  args: {
    userReference: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Host-level (not admin-only) so Guests directory rows can open details.
    const workspaceScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const rsvpReferencePrefix = "rsvp~";
    let user: Doc<"users"> | null = null;
    let fallbackRsvp: Doc<"rsvps"> | null = null;

    if (args.userReference.startsWith(rsvpReferencePrefix)) {
      const rsvpId = ctx.db.normalizeId(
        "rsvps",
        args.userReference.slice(rsvpReferencePrefix.length),
      );
      fallbackRsvp = rsvpId ? await ctx.db.get(rsvpId) : null;
      if (!fallbackRsvp) {
        throw new Error("Guest not found");
      }
      await ensureEventInSiteScope(ctx, fallbackRsvp.eventId, {
        siteKey: workspaceScope.siteKey,
        workspaceSlug: workspaceScope.workspaceSlug,
      });
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (queryBuilder) =>
          queryBuilder.eq("clerkUserId", fallbackRsvp?.clerkUserId),
        )
        .unique();
    } else {
      const userId = ctx.db.normalizeId("users", args.userReference);
      user = userId ? await ctx.db.get(userId) : null;
    }

    if (!user && !fallbackRsvp) {
      throw new Error("User not found");
    }

    const clerkUserId = user?.clerkUserId ?? fallbackRsvp?.clerkUserId;
    const membership = clerkUserId
      ? await ctx.db
          .query("orgMemberships")
          .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
          .filter((queryBuilder) =>
            queryBuilder.eq(
              queryBuilder.field("organizationId"),
              workspaceScope.clerkOrganizationId,
            ),
          )
          .unique()
      : null;
    const fallbackNameParts = fallbackRsvp?.userName?.trim().split(/\s+/) ?? [];

    return {
      _id: user?._id,
      clerkUserId,
      firstName: user?.firstName ?? fallbackNameParts[0],
      lastName: user?.lastName ?? (fallbackNameParts.slice(1).join(" ") || undefined),
      imageUrl: user?.imageUrl,
      phone: user?.phone ?? fallbackRsvp?.guestPhoneObfuscated,
      referralCode: user?.referralCode ?? fallbackRsvp?.referralCode,
      createdAt: user?.createdAt ?? fallbackRsvp?.createdAt ?? Date.now(),
      updatedAt:
        user?.updatedAt ?? fallbackRsvp?.updatedAt ?? fallbackRsvp?.createdAt ?? Date.now(),
      role: membership?.role ?? "guest",
      hasOrganizationMembership: !!membership,
    };
  },
});

export const getOrganizationUserById = query({
  args: {
    userId: v.id("users"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Host-level (not admin-only) so Guests directory rows can open details.
    const workspaceScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const clerkUserId = user.clerkUserId;
    const membership = clerkUserId
      ? await ctx.db
          .query("orgMemberships")
          .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
          .filter((queryBuilder) =>
            queryBuilder.eq(
              queryBuilder.field("organizationId"),
              workspaceScope.clerkOrganizationId,
            ),
          )
          .unique()
      : null;

    return {
      _id: user._id,
      clerkUserId: user.clerkUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      phone: user.phone,
      referralCode: user.referralCode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: membership?.role ?? "guest",
      hasOrganizationMembership: !!membership,
    };
  },
});
