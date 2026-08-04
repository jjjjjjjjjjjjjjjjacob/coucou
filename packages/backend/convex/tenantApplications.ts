import { createClerkClient } from "@clerk/backend";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { writeAuditEntry } from "./audit";
import { action, internalMutation, mutation, query } from "./functions";
import {
  getOrCreateCoucouTenantOrganization,
  getOrCreateTenantAdminMembership,
} from "./lib/clerkTenantProvisioning";
import { requireCoucouPlatformMember } from "./lib/platformAuth";
import {
  normalizeTenantWorkspaceSlug,
  upsertTenantWorkspaceRecordForClerkOrganization,
} from "./lib/workspaceRecords";

const statusValidator = v.union(v.literal("pending"), v.literal("accepted"), v.literal("denied"));

export const submitApplication = mutation({
  args: {
    name: v.string(),
    city: v.optional(v.string()),
    operator: v.string(),
    operatorEmail: v.optional(v.string()),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("tenantApplications", {
      ...args,
      submittedAt: Date.now(),
      status: "pending",
    });

    await writeAuditEntry(ctx, {
      action: "tenantApplication.submit",
      targetKind: "tenantApplication",
      targetId: id,
      summary: `${args.operator} applied for ${args.name}`,
    });

    return id;
  },
});

export const listPaginated = query({
  args: {
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    statusFilter: v.optional(statusValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { cursor, pageSize = 25, statusFilter, search }) => {
    await requireCoucouPlatformMember(ctx);
    const all = await ctx.db
      .query("tenantApplications")
      .withIndex("by_submittedAt")
      .order("desc")
      .collect();

    const trimmedSearch = search?.trim().toLowerCase() ?? "";

    const filtered = all.filter((application) => {
      if (statusFilter && application.status !== statusFilter) return false;
      if (trimmedSearch) {
        const haystack = [
          application.name,
          application.operator,
          application.operatorEmail ?? "",
          application.city ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(trimmedSearch)) return false;
      }
      return true;
    });

    const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
    const page = filtered.slice(cursorIndex, cursorIndex + pageSize);
    const nextCursor =
      cursorIndex + pageSize < filtered.length ? String(cursorIndex + pageSize) : null;

    return {
      page,
      nextCursor,
      isDone: cursorIndex + pageSize >= filtered.length,
      totalCount: filtered.length,
    };
  },
});

export const get = query({
  args: { id: v.id("tenantApplications") },
  handler: async (ctx, { id }) => {
    await requireCoucouPlatformMember(ctx);
    return await ctx.db.get(id);
  },
});

export const acceptApplicationInDatabase = internalMutation({
  args: {
    id: v.id("tenantApplications"),
    slug: v.string(),
    primaryDomain: v.optional(v.string()),
    tenantAdminClerkUserId: v.string(),
    clerkOrganizationId: v.string(),
    clerkOrganizationSlug: v.string(),
    decidedByClerkUserId: v.string(),
  },
  handler: async (
    ctx,
    {
      id,
      slug,
      primaryDomain,
      tenantAdminClerkUserId,
      clerkOrganizationId,
      clerkOrganizationSlug,
      decidedByClerkUserId,
    },
  ) => {
    const application = await ctx.db.get(id);
    if (!application) throw new Error("Application not found");
    if (application.status !== "pending") {
      throw new Error("Application has already been decided");
    }

    const now = Date.now();
    const { workspaceId } = await upsertTenantWorkspaceRecordForClerkOrganization(ctx, {
      slug,
      name: application.name,
      primaryDomain,
      clerkOrganizationId,
      clerkOrganizationSlug,
    });

    await ctx.db.patch(id, {
      status: "accepted",
      tenantAdminClerkUserId,
      clerkOrganizationId,
      clerkOrganizationSlug,
      decidedAt: now,
      decidedByClerkUserId,
      workspaceId,
    });

    await writeAuditEntry(ctx, {
      action: "tenantApplication.accept",
      actorClerkUserId: decidedByClerkUserId,
      targetKind: "tenantApplication",
      targetId: id,
      workspaceId,
      summary: `Accepted ${application.name} as workspace ${slug}`,
      metadata: {
        tenantAdminClerkUserId,
        clerkOrganizationId,
        clerkOrganizationSlug,
        provisioningMethod: "direct_membership",
      },
    });

    return workspaceId;
  },
});

export const acceptApplication = action({
  args: {
    id: v.id("tenantApplications"),
    slug: v.string(),
    primaryDomain: v.optional(v.string()),
  },
  handler: async (ctx, { id, slug, primaryDomain }): Promise<Id<"workspaces">> => {
    const identity = await requireCoucouPlatformMember(ctx);
    const normalizedSlug = normalizeTenantWorkspaceSlug(slug);

    const existingWorkspace = await ctx.runQuery(api.workspaces.getWorkspaceBySlug, {
      slug: normalizedSlug,
    });
    if (existingWorkspace?.clerkOrganizationId) {
      throw new Error("Workspace is already linked to a Clerk organization");
    }

    const application = await ctx.runQuery(api.tenantApplications.get, { id });
    if (!application) {
      throw new Error("Application not found");
    }
    if (application.status !== "pending") {
      throw new Error("Application has already been decided");
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const organization = await getOrCreateCoucouTenantOrganization(clerk.organizations, {
      name: application.name,
      slug: normalizedSlug,
      createdByClerkUserId: identity.subject,
    });
    await getOrCreateTenantAdminMembership(clerk.organizations, {
      organizationId: organization.id,
      tenantAdminClerkUserId: identity.subject,
    });

    return await ctx.runMutation(internal.tenantApplications.acceptApplicationInDatabase, {
      id,
      slug: normalizedSlug,
      primaryDomain,
      tenantAdminClerkUserId: identity.subject,
      clerkOrganizationId: organization.id,
      clerkOrganizationSlug: organization.slug,
      decidedByClerkUserId: identity.subject,
    });
  },
});

export const denyApplication = mutation({
  args: {
    id: v.id("tenantApplications"),
    denialReason: v.optional(v.string()),
  },
  handler: async (ctx, { id, denialReason }) => {
    const identity = await requireCoucouPlatformMember(ctx);
    const application = await ctx.db.get(id);
    if (!application) throw new Error("Application not found");
    if (application.status !== "pending") {
      throw new Error("Application has already been decided");
    }

    const decidedBy = identity.subject;

    const now = Date.now();
    await ctx.db.patch(id, {
      status: "denied",
      decidedAt: now,
      decidedByClerkUserId: decidedBy,
      denialReason,
    });

    await writeAuditEntry(ctx, {
      action: "tenantApplication.deny",
      actorClerkUserId: decidedBy,
      targetKind: "tenantApplication",
      targetId: id,
      summary: `Denied ${application.name}${denialReason ? `: ${denialReason}` : ""}`,
    });
  },
});
