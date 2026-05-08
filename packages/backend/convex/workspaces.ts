import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAuditEntry } from "./audit";
import { internalMutation, mutation, query } from "./functions";
import {
  getCoucouOrganizationSlug,
  getIdentityOrganizationId,
  getIdentityOrganizationRole,
  getIdentityOrganizationSlug,
  requireCoucouPlatformMember,
} from "./lib/platformAuth";
import {
  sanitizeWorkspaceEventDefaults,
  workspaceEventDefaultsValidator,
} from "./lib/primaryFields";
import {
  requireWorkspaceAdmin,
  resolveWorkspaceAuthScopeFromDatabase,
  roleHasWorkspaceReadAccess,
  roleHasWorkspaceWriteAccess,
} from "./lib/workspaceAuth";
import {
  type ClerkSatelliteVerificationStatus,
  ensureTenantWorkspaceRecordForOrganization,
  normalizePrimaryDomain,
  normalizeTenantWorkspaceSlug,
  syncWorkspacePrimaryDomainSites,
  upsertAdminWorkspaceRecordForClerkOrganization,
  upsertTenantWorkspaceRecordForClerkOrganization,
  upsertWorkspaceRecord,
  upsertWorkspaceSiteRecord,
} from "./lib/workspaceRecords";

const dashboardMembershipValidator = v.object({
  organizationId: v.string(),
  organizationName: v.optional(v.string()),
  organizationSlug: v.optional(v.string()),
  role: v.string(),
});

interface NavigationMembership {
  organizationId: string;
  organizationSlug?: string | null;
  role: string;
}

interface AccessibleWorkspaceNavigationEntry {
  _id: Id<"workspaces">;
  workspaceId: Id<"workspaces">;
  slug: string;
  name: string;
  primaryDomain?: string;
  clerkOrganizationId?: string;
  clerkOrganizationSlug?: string;
  organizationId: string;
  organizationSlug?: string | null;
  membershipRole: string;
  isWorkspaceConfigured: boolean;
}

function normalizeOptionalClerkFrontendApiUrl(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new Error("Clerk Frontend API URL must be a valid URL");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Clerk Frontend API URL must use HTTPS");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  ) {
    throw new Error("Clerk Frontend API URL must be a production host");
  }

  return parsedUrl.origin;
}

async function getCoucouWorkspace(
  ctx: QueryCtx,
  coucouOrganizationSlug: string,
): Promise<Doc<"workspaces"> | null> {
  const workspaceBySlug = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", coucouOrganizationSlug))
    .unique();

  if (workspaceBySlug) {
    return workspaceBySlug;
  }

  return await ctx.db
    .query("workspaces")
    .withIndex("by_kind", (queryBuilder) => queryBuilder.eq("kind", "admin"))
    .first();
}

async function getWorkspaceForNavigationMembership(
  ctx: QueryCtx,
  membership: NavigationMembership,
): Promise<Doc<"workspaces"> | null> {
  const workspaceByOrganizationId = await ctx.db
    .query("workspaces")
    .withIndex("by_clerkOrg", (queryBuilder) =>
      queryBuilder.eq("clerkOrganizationId", membership.organizationId),
    )
    .first();

  if (workspaceByOrganizationId) {
    return workspaceByOrganizationId;
  }

  const organizationSlug = membership.organizationSlug?.toLowerCase();
  if (!organizationSlug) {
    return null;
  }

  const workspaceByOrganizationSlug = await ctx.db
    .query("workspaces")
    .withIndex("by_clerkOrgSlug", (queryBuilder) =>
      queryBuilder.eq("clerkOrganizationSlug", organizationSlug),
    )
    .first();

  if (workspaceByOrganizationSlug) {
    return workspaceByOrganizationSlug;
  }

  return await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", organizationSlug))
    .unique();
}

export const upsertWorkspace = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    kind: v.optional(v.string()),
    primaryDomain: v.optional(v.string()),
    clerkOrganizationId: v.optional(v.string()),
    clerkOrganizationSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCoucouPlatformMember(ctx);
    const workspaceId = await upsertWorkspaceRecord(ctx, args);
    await writeAuditEntry(ctx, {
      action: "workspace.upsert",
      targetKind: "workspace",
      targetId: workspaceId,
      workspaceId,
      summary: `${args.name} (${args.slug})`,
    });
    return workspaceId;
  },
});

export const getWorkspaceAuthScope = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await resolveWorkspaceAuthScopeFromDatabase(ctx, args);
  },
});

const presetValidator = v.union(
  v.literal("maison"),
  v.literal("dojo"),
  v.literal("atrium"),
  v.literal("coucou"),
);

const brandMarkStyleValidator = v.union(
  v.literal("filled-circle"),
  v.literal("square-serif"),
  v.literal("thin-ring"),
  v.literal("logo-upload"),
  v.literal("wordmark-only"),
);

const clerkSatelliteVerificationStatusValidator = v.union(
  v.literal("unconfigured"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("failed"),
);

export const setPreset = mutation({
  args: {
    slug: v.string(),
    preset: v.optional(presetValidator),
  },
  handler: async (ctx, { slug, preset }) => {
    await requireCoucouPlatformMember(ctx);
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", slug))
      .unique();

    if (!workspace) {
      throw new Error(`Workspace not found: ${slug}`);
    }

    await ctx.db.patch(workspace._id, {
      preset,
      updatedAt: Date.now(),
    });

    await writeAuditEntry(ctx, {
      action: "workspace.setPreset",
      targetKind: "workspace",
      targetId: workspace._id,
      workspaceId: workspace._id,
      summary: preset ? `${slug} → ${preset}` : `${slug} → cleared`,
    });

    return workspace._id;
  },
});

export const setAuthBranding = mutation({
  args: {
    slug: v.string(),
    authBranding: v.optional(
      v.object({
        heading: v.optional(v.string()),
        sub: v.optional(v.string()),
        eyebrow: v.optional(v.string()),
        brandMarkStyle: v.optional(brandMarkStyleValidator),
        logoStorageId: v.optional(v.id("_storage")),
        showCoucouAttribution: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { slug, authBranding }) => {
    await requireCoucouPlatformMember(ctx);
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", slug))
      .unique();

    if (!workspace) {
      throw new Error(`Workspace not found: ${slug}`);
    }

    await ctx.db.patch(workspace._id, {
      authBranding,
      updatedAt: Date.now(),
    });

    await writeAuditEntry(ctx, {
      action: "workspace.setAuthBranding",
      targetKind: "workspace",
      targetId: workspace._id,
      workspaceId: workspace._id,
      summary: authBranding
        ? `heading="${authBranding.heading ?? ""}", style=${authBranding.brandMarkStyle ?? "—"}`
        : "cleared",
    });

    return workspace._id;
  },
});

export const upsertWorkspaceSite = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    siteKey: v.string(),
    domain: v.string(),
    appKind: v.string(),
    clerkFrontendApiUrl: v.optional(v.string()),
    clerkSatelliteVerificationStatus: v.optional(clerkSatelliteVerificationStatusValidator),
    clerkSatelliteAuthEnabled: v.optional(v.boolean()),
    clerkSatelliteLastSyncedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCoucouPlatformMember(ctx);
    return await upsertWorkspaceSiteRecord(ctx, {
      ...args,
      clerkFrontendApiUrl: normalizeOptionalClerkFrontendApiUrl(args.clerkFrontendApiUrl),
    });
  },
});

export const setWorkspaceSiteClerkSatelliteAuth = mutation({
  args: {
    siteKey: v.string(),
    clerkFrontendApiUrl: v.optional(v.string()),
    clerkSatelliteVerificationStatus: clerkSatelliteVerificationStatusValidator,
    clerkSatelliteAuthEnabled: v.boolean(),
    clerkSatelliteLastSyncedAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    {
      siteKey,
      clerkFrontendApiUrl,
      clerkSatelliteVerificationStatus,
      clerkSatelliteAuthEnabled,
      clerkSatelliteLastSyncedAt,
    },
  ) => {
    await requireCoucouPlatformMember(ctx);

    const workspaceSite = await ctx.db
      .query("workspaceSites")
      .withIndex("by_siteKey", (queryBuilder) => queryBuilder.eq("siteKey", siteKey))
      .unique();

    if (!workspaceSite) {
      throw new Error(`Workspace site not found: ${siteKey}`);
    }

    const workspaceSitePatch: {
      clerkFrontendApiUrl?: string;
      clerkSatelliteVerificationStatus: ClerkSatelliteVerificationStatus;
      clerkSatelliteAuthEnabled: boolean;
      clerkSatelliteLastSyncedAt: number;
      updatedAt: number;
    } = {
      clerkSatelliteVerificationStatus,
      clerkSatelliteAuthEnabled,
      clerkSatelliteLastSyncedAt: clerkSatelliteLastSyncedAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    const normalizedClerkFrontendApiUrl = normalizeOptionalClerkFrontendApiUrl(clerkFrontendApiUrl);
    if (normalizedClerkFrontendApiUrl !== undefined) {
      workspaceSitePatch.clerkFrontendApiUrl = normalizedClerkFrontendApiUrl;
    }

    await ctx.db.patch(workspaceSite._id, workspaceSitePatch);

    await writeAuditEntry(ctx, {
      action: "workspaceSite.setClerkSatelliteAuth",
      targetKind: "workspaceSite",
      targetId: workspaceSite._id,
      workspaceId: workspaceSite.workspaceId,
      summary: `${siteKey} → ${clerkSatelliteVerificationStatus}, enabled=${clerkSatelliteAuthEnabled}`,
    });

    return workspaceSite._id;
  },
});

export const upsertTenantWorkspaceForClerkOrganization = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
    clerkOrganizationId: v.string(),
    clerkOrganizationSlug: v.optional(v.string()),
    primaryDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await upsertTenantWorkspaceRecordForClerkOrganization(ctx, args);
  },
});

export const upsertCoucouAdminWorkspaceForClerkOrganization = internalMutation({
  args: {
    name: v.string(),
    clerkOrganizationId: v.string(),
    clerkOrganizationSlug: v.optional(v.string()),
    primaryDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await upsertAdminWorkspaceRecordForClerkOrganization(ctx, args);
  },
});

async function requireWorkspaceWriteAccessForOrganization(
  ctx: MutationCtx,
  clerkOrganizationId: string,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }

  if (
    getIdentityOrganizationId(identity) === clerkOrganizationId &&
    roleHasWorkspaceWriteAccess(getIdentityOrganizationRole(identity))
  ) {
    return;
  }

  const storedMembership = await ctx.db
    .query("orgMemberships")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identity.subject))
    .filter((queryBuilder) =>
      queryBuilder.eq(queryBuilder.field("organizationId"), clerkOrganizationId),
    )
    .unique();

  if (!storedMembership) {
    throw new Error("Forbidden: organization membership required");
  }

  if (!roleHasWorkspaceWriteAccess(storedMembership.role)) {
    throw new Error("Forbidden: admin role required");
  }
}

export const setTenantWorkspacePrimaryDomain = mutation({
  args: {
    slug: v.string(),
    clerkOrganizationId: v.string(),
    primaryDomain: v.string(),
  },
  handler: async (ctx, { slug, clerkOrganizationId, primaryDomain }) => {
    const normalizedSlug = normalizeTenantWorkspaceSlug(slug);
    const existingWorkspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", normalizedSlug))
      .unique();

    if (
      existingWorkspace?.clerkOrganizationId &&
      existingWorkspace.clerkOrganizationId !== clerkOrganizationId
    ) {
      throw new Error("Forbidden: organization mismatch");
    }

    if (!existingWorkspace || !existingWorkspace.clerkOrganizationId) {
      await requireWorkspaceWriteAccessForOrganization(ctx, clerkOrganizationId);
      await ensureTenantWorkspaceRecordForOrganization(ctx, {
        slug: normalizedSlug,
        name: existingWorkspace?.name ?? normalizedSlug,
        clerkOrganizationId,
        clerkOrganizationSlug: existingWorkspace?.clerkOrganizationSlug ?? normalizedSlug,
      });
    }

    const resolvedScope = await requireWorkspaceAdmin(ctx, {
      workspaceSlug: normalizedSlug,
    });

    if (resolvedScope.clerkOrganizationId !== clerkOrganizationId) {
      throw new Error("Forbidden: organization mismatch");
    }

    const workspace = await ctx.db.get(resolvedScope.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${normalizedSlug}`);
    }

    const normalizedPrimaryDomain = normalizePrimaryDomain(primaryDomain);
    await ctx.db.patch(workspace._id, {
      primaryDomain: normalizedPrimaryDomain,
      updatedAt: Date.now(),
    });

    await syncWorkspacePrimaryDomainSites(ctx, {
      workspaceId: workspace._id,
      workspaceSlug: workspace.slug,
      primaryDomain: normalizedPrimaryDomain,
    });

    await writeAuditEntry(ctx, {
      action: "workspace.setPrimaryDomain",
      targetKind: "workspace",
      targetId: workspace._id,
      workspaceId: workspace._id,
      summary: `${normalizedSlug} → ${normalizedPrimaryDomain}`,
    });

    return {
      workspaceId: workspace._id,
      primaryDomain: normalizedPrimaryDomain,
    };
  },
});

export const setTenantWorkspaceAuthBranding = mutation({
  args: {
    slug: v.string(),
    clerkOrganizationId: v.string(),
    authBranding: v.optional(
      v.object({
        heading: v.optional(v.string()),
        sub: v.optional(v.string()),
        eyebrow: v.optional(v.string()),
        brandMarkStyle: v.optional(brandMarkStyleValidator),
        logoStorageId: v.optional(v.id("_storage")),
        showCoucouAttribution: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { slug, clerkOrganizationId, authBranding }) => {
    const normalizedSlug = normalizeTenantWorkspaceSlug(slug);
    const resolvedScope = await requireWorkspaceAdmin(ctx, {
      workspaceSlug: normalizedSlug,
    });

    if (resolvedScope.clerkOrganizationId !== clerkOrganizationId) {
      throw new Error("Forbidden: organization mismatch");
    }

    const workspace = await ctx.db.get(resolvedScope.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${normalizedSlug}`);
    }

    await ctx.db.patch(workspace._id, {
      authBranding,
      updatedAt: Date.now(),
    });

    await writeAuditEntry(ctx, {
      action: "workspace.setTenantAuthBranding",
      targetKind: "workspace",
      targetId: workspace._id,
      workspaceId: workspace._id,
      summary: authBranding
        ? `heading="${authBranding.heading ?? ""}", style=${authBranding.brandMarkStyle ?? "—"}`
        : "cleared",
    });

    return { workspaceId: workspace._id };
  },
});

export const setTenantWorkspaceProfileLinkSettings = mutation({
  args: {
    slug: v.string(),
    clerkOrganizationId: v.string(),
    showCoucouProfileLink: v.optional(v.boolean()),
  },
  handler: async (ctx, { slug, clerkOrganizationId, showCoucouProfileLink }) => {
    const normalizedSlug = normalizeTenantWorkspaceSlug(slug);
    const resolvedScope = await requireWorkspaceAdmin(ctx, {
      workspaceSlug: normalizedSlug,
    });

    if (resolvedScope.clerkOrganizationId !== clerkOrganizationId) {
      throw new Error("Forbidden: organization mismatch");
    }

    const workspace = await ctx.db.get(resolvedScope.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${normalizedSlug}`);
    }

    await ctx.db.patch(workspace._id, {
      showCoucouProfileLink,
      updatedAt: Date.now(),
    });

    await writeAuditEntry(ctx, {
      action: "workspace.setTenantProfileLinkSettings",
      targetKind: "workspace",
      targetId: workspace._id,
      workspaceId: workspace._id,
      summary: `showCoucouProfileLink=${showCoucouProfileLink ?? false}`,
    });

    return { workspaceId: workspace._id };
  },
});

export const listTenantWorkspaceSites = query({
  args: {
    slug: v.string(),
    clerkOrganizationId: v.string(),
  },
  handler: async (ctx, { slug, clerkOrganizationId }) => {
    const normalizedSlug = normalizeTenantWorkspaceSlug(slug);
    const resolvedScope = await requireWorkspaceAdmin(ctx, {
      workspaceSlug: normalizedSlug,
    });

    if (resolvedScope.clerkOrganizationId !== clerkOrganizationId) {
      throw new Error("Forbidden: organization mismatch");
    }

    const sites = await ctx.db
      .query("workspaceSites")
      .withIndex("by_workspace", (queryBuilder) =>
        queryBuilder.eq("workspaceId", resolvedScope.workspaceId),
      )
      .collect();

    return sites
      .map((site) => ({
        _id: site._id,
        siteKey: site.siteKey,
        domain: site.domain,
        appKind: site.appKind,
        clerkFrontendApiUrl: site.clerkFrontendApiUrl,
        clerkSatelliteVerificationStatus: site.clerkSatelliteVerificationStatus,
        clerkSatelliteAuthEnabled: site.clerkSatelliteAuthEnabled,
        clerkSatelliteLastSyncedAt: site.clerkSatelliteLastSyncedAt,
      }))
      .sort((firstSite, secondSite) => firstSite.domain.localeCompare(secondSite.domain));
  },
});

export const setTenantWorkspaceDefaults = mutation({
  args: {
    slug: v.string(),
    clerkOrganizationId: v.string(),
    eventDefaults: v.optional(workspaceEventDefaultsValidator),
  },
  handler: async (ctx, { slug, clerkOrganizationId, eventDefaults }) => {
    const normalizedSlug = normalizeTenantWorkspaceSlug(slug);
    const existingWorkspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", normalizedSlug))
      .unique();

    if (
      existingWorkspace?.clerkOrganizationId &&
      existingWorkspace.clerkOrganizationId !== clerkOrganizationId
    ) {
      throw new Error("Forbidden: organization mismatch");
    }

    if (!existingWorkspace || !existingWorkspace.clerkOrganizationId) {
      await requireWorkspaceWriteAccessForOrganization(ctx, clerkOrganizationId);
      await ensureTenantWorkspaceRecordForOrganization(ctx, {
        slug: normalizedSlug,
        name: existingWorkspace?.name ?? normalizedSlug,
        clerkOrganizationId,
        clerkOrganizationSlug: existingWorkspace?.clerkOrganizationSlug ?? normalizedSlug,
      });
    }

    const resolvedScope = await requireWorkspaceAdmin(ctx, {
      workspaceSlug: normalizedSlug,
    });

    if (resolvedScope.clerkOrganizationId !== clerkOrganizationId) {
      throw new Error("Forbidden: organization mismatch");
    }

    const workspace = await ctx.db.get(resolvedScope.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${normalizedSlug}`);
    }

    const sanitizedEventDefaults = sanitizeWorkspaceEventDefaults(eventDefaults);
    await ctx.db.patch(workspace._id, {
      eventDefaults: sanitizedEventDefaults,
      updatedAt: Date.now(),
    });

    await writeAuditEntry(ctx, {
      action: "workspace.setEventDefaults",
      targetKind: "workspace",
      targetId: workspace._id,
      workspaceId: workspace._id,
      summary: `${normalizedSlug} event defaults updated`,
    });

    return {
      workspaceId: workspace._id,
      eventDefaults: sanitizedEventDefaults ?? null,
    };
  },
});

/**
 * Top open attention flags shown on the /admin landing.
 */
export const listAttentionFlags = query({
  args: {},
  handler: async (ctx) => {
    await requireCoucouPlatformMember(ctx);
    const open = await ctx.db
      .query("attentionFlags")
      .withIndex("by_status", (queryBuilder) => queryBuilder.eq("status", "open"))
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

/**
 * Top pending tenant applications shown on the /admin landing.
 */
export const listPendingApplications = query({
  args: {},
  handler: async (ctx) => {
    await requireCoucouPlatformMember(ctx);
    const pending = await ctx.db
      .query("tenantApplications")
      .withIndex("by_status", (queryBuilder) => queryBuilder.eq("status", "pending"))
      .collect();

    pending.sort((a, b) => b.submittedAt - a.submittedAt);

    return pending.map((application) => ({
      name: application.name,
      city: application.city ?? "",
      operator: application.operator,
      submittedAt: application.submittedAt,
    }));
  },
});

export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    await requireCoucouPlatformMember(ctx);
    const workspaces = await ctx.db.query("workspaces").collect();

    return await Promise.all(
      workspaces.map(async (workspace) => {
        const sites = await ctx.db
          .query("workspaceSites")
          .withIndex("by_workspace", (queryBuilder) =>
            queryBuilder.eq("workspaceId", workspace._id),
          )
          .collect();

        return {
          ...workspace,
          sites,
        };
      }),
    );
  },
});

export const listVerifiedClerkFrontendApiUrls = query({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const workspaceSites = await ctx.db.query("workspaceSites").collect();
    const clerkFrontendApiUrls = new Set<string>();

    for (const workspaceSite of workspaceSites) {
      if (workspaceSite.clerkSatelliteAuthEnabled !== true) {
        continue;
      }
      if (workspaceSite.clerkSatelliteVerificationStatus !== "verified") {
        continue;
      }

      const clerkFrontendApiUrl = workspaceSite.clerkFrontendApiUrl?.trim() ?? "";
      if (clerkFrontendApiUrl.length === 0) {
        continue;
      }

      clerkFrontendApiUrls.add(clerkFrontendApiUrl);
    }

    return Array.from(clerkFrontendApiUrls).sort();
  },
});

export const getWorkspaceBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, { slug }) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", slug))
      .unique();

    if (!workspace) {
      return null;
    }

    const sites = await ctx.db
      .query("workspaceSites")
      .withIndex("by_workspace", (queryBuilder) => queryBuilder.eq("workspaceId", workspace._id))
      .collect();

    return {
      ...workspace,
      sites,
    };
  },
});

export const listWorkspaceNavigation = query({
  args: {},
  handler: async (ctx) => {
    const workspaces = await ctx.db.query("workspaces").collect();
    return workspaces
      .filter(
        (workspace) =>
          workspace.slug !== "coucou" &&
          workspace.kind !== "admin" &&
          Boolean(workspace.clerkOrganizationId),
      )
      .map((workspace) => ({
        _id: workspace._id,
        slug: workspace.slug,
        name: workspace.name,
        primaryDomain: workspace.primaryDomain,
        clerkOrganizationId: workspace.clerkOrganizationId,
        clerkOrganizationSlug: workspace.clerkOrganizationSlug,
      }));
  },
});

export const listAccessibleWorkspaceNavigationForUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        hasCoucouOrganizationAccess: false,
        coucouOrganizationId: null,
        tenantWorkspaces: [],
      };
    }

    const coucouOrganizationSlug = getCoucouOrganizationSlug();
    const coucouWorkspace = await getCoucouWorkspace(ctx, coucouOrganizationSlug);
    const coucouOrganizationId = coucouWorkspace?.clerkOrganizationId ?? null;
    const activeOrganizationId = getIdentityOrganizationId(identity);
    const activeOrganizationSlug = getIdentityOrganizationSlug(identity);
    const activeOrganizationRole = getIdentityOrganizationRole(identity);
    const membershipByOrganizationId = new Map<string, NavigationMembership>();

    const storedMemberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identity.subject))
      .collect();

    for (const membership of storedMemberships) {
      membershipByOrganizationId.set(membership.organizationId, {
        organizationId: membership.organizationId,
        role: membership.role,
      });
    }

    if (activeOrganizationId && activeOrganizationRole) {
      membershipByOrganizationId.set(activeOrganizationId, {
        organizationId: activeOrganizationId,
        organizationSlug: activeOrganizationSlug,
        role: activeOrganizationRole,
      });
    }

    const hasCoucouOrganizationAccess =
      activeOrganizationSlug?.toLowerCase() === coucouOrganizationSlug ||
      (coucouOrganizationId !== null &&
        (activeOrganizationId === coucouOrganizationId ||
          membershipByOrganizationId.has(coucouOrganizationId)));
    const seenWorkspaceSlugs = new Set<string>();
    const tenantWorkspaces: AccessibleWorkspaceNavigationEntry[] = [];

    for (const membership of membershipByOrganizationId.values()) {
      const organizationSlug = membership.organizationSlug?.toLowerCase();
      if (
        organizationSlug === coucouOrganizationSlug ||
        membership.organizationId === coucouOrganizationId ||
        !roleHasWorkspaceReadAccess(membership.role)
      ) {
        continue;
      }

      const workspace = await getWorkspaceForNavigationMembership(ctx, membership);

      if (
        !workspace ||
        workspace.kind === "admin" ||
        workspace.slug === coucouOrganizationSlug ||
        seenWorkspaceSlugs.has(workspace.slug)
      ) {
        continue;
      }

      seenWorkspaceSlugs.add(workspace.slug);
      tenantWorkspaces.push({
        _id: workspace._id,
        workspaceId: workspace._id,
        slug: workspace.slug,
        name: workspace.name,
        primaryDomain: workspace.primaryDomain,
        clerkOrganizationId: workspace.clerkOrganizationId,
        clerkOrganizationSlug: workspace.clerkOrganizationSlug,
        organizationId: membership.organizationId,
        organizationSlug: membership.organizationSlug,
        membershipRole: membership.role,
        isWorkspaceConfigured: true,
      });
    }

    tenantWorkspaces.sort((leftWorkspace, rightWorkspace) =>
      leftWorkspace.name.localeCompare(rightWorkspace.name),
    );

    return {
      hasCoucouOrganizationAccess,
      coucouOrganizationId,
      tenantWorkspaces,
    };
  },
});

export const getDashboardWorkspaceAccess = query({
  args: {
    memberships: v.array(dashboardMembershipValidator),
  },
  handler: async (ctx, { memberships }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        hasCoucouOrganizationAccess: false,
        tenantWorkspaces: [],
      };
    }

    const coucouOrganizationSlug = getCoucouOrganizationSlug();
    const workspaces = await ctx.db.query("workspaces").collect();
    const coucouWorkspace = workspaces.find(
      (workspace) => workspace.slug === coucouOrganizationSlug || workspace.kind === "admin",
    );
    const hasCoucouOrganizationAccess = memberships.some((membership) => {
      const organizationSlug = membership.organizationSlug?.toLowerCase();
      return (
        organizationSlug === coucouOrganizationSlug ||
        membership.organizationId === coucouWorkspace?.clerkOrganizationId
      );
    });
    const workspaceByClerkOrganizationId = new Map(
      workspaces
        .filter((workspace) => workspace.clerkOrganizationId)
        .map((workspace) => [workspace.clerkOrganizationId ?? "", workspace]),
    );
    const workspaceByClerkOrganizationSlug = new Map(
      workspaces
        .filter((workspace) => workspace.clerkOrganizationSlug)
        .map((workspace) => [workspace.clerkOrganizationSlug?.toLowerCase() ?? "", workspace]),
    );
    const workspaceBySlug = new Map(
      workspaces.map((workspace) => [workspace.slug.toLowerCase(), workspace]),
    );
    const seenWorkspaceSlugs = new Set<string>();

    const tenantWorkspaces = memberships
      .flatMap((membership) => {
        const organizationSlug = membership.organizationSlug?.toLowerCase();
        if (
          organizationSlug === coucouOrganizationSlug ||
          membership.organizationId === coucouWorkspace?.clerkOrganizationId ||
          !roleHasWorkspaceReadAccess(membership.role)
        ) {
          return [];
        }

        const workspace =
          workspaceByClerkOrganizationId.get(membership.organizationId) ??
          (organizationSlug ? workspaceByClerkOrganizationSlug.get(organizationSlug) : undefined) ??
          (organizationSlug ? workspaceBySlug.get(organizationSlug) : undefined);

        if (workspace?.kind === "admin" || workspace?.slug === coucouOrganizationSlug) {
          return [];
        }

        const slug = workspace?.slug ?? organizationSlug;
        if (!slug || seenWorkspaceSlugs.has(slug)) {
          return [];
        }
        seenWorkspaceSlugs.add(slug);

        return [
          {
            workspaceId: workspace?._id,
            slug,
            name:
              workspace?.name ??
              membership.organizationName ??
              membership.organizationSlug ??
              "Untitled organization",
            primaryDomain: workspace?.primaryDomain,
            clerkOrganizationId: workspace?.clerkOrganizationId ?? membership.organizationId,
            clerkOrganizationSlug: workspace?.clerkOrganizationSlug ?? membership.organizationSlug,
            organizationId: membership.organizationId,
            organizationSlug: membership.organizationSlug,
            membershipRole: membership.role,
            isWorkspaceConfigured: Boolean(workspace),
          },
        ];
      })
      .sort((leftWorkspace, rightWorkspace) =>
        leftWorkspace.name.localeCompare(rightWorkspace.name),
      );

    return {
      hasCoucouOrganizationAccess,
      tenantWorkspaces,
    };
  },
});

export const getActiveOrganizationContext = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        organizationId: null,
        organizationSlug: null,
      };
    }

    return {
      organizationId: getIdentityOrganizationId(identity),
      organizationSlug: getIdentityOrganizationSlug(identity),
    };
  },
});

export const ensureTenantWorkspaceForActiveOrganization = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    clerkOrganizationId: v.string(),
    clerkOrganizationSlug: v.optional(v.string()),
  },
  handler: async (ctx, { slug, name, clerkOrganizationId, clerkOrganizationSlug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const normalizedSlug = normalizeTenantWorkspaceSlug(slug);
    const activeOrganizationId = getIdentityOrganizationId(identity);
    const storedMembership = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identity.subject))
      .filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("organizationId"), clerkOrganizationId),
      )
      .unique();

    if (activeOrganizationId !== clerkOrganizationId && !storedMembership) {
      throw new Error("Forbidden: organization membership required");
    }

    return await ensureTenantWorkspaceRecordForOrganization(ctx, {
      slug: normalizedSlug,
      name,
      clerkOrganizationId,
      clerkOrganizationSlug,
    });
  },
});

export const ensureTenantWorkspaceInDatabase = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
    clerkOrganizationId: v.string(),
    clerkOrganizationSlug: v.optional(v.string()),
  },
  handler: async (ctx, { slug, name, clerkOrganizationId, clerkOrganizationSlug }) => {
    return await ensureTenantWorkspaceRecordForOrganization(ctx, {
      slug,
      name,
      clerkOrganizationId,
      clerkOrganizationSlug,
    });
  },
});

/**
 * Paginated list of workspaces enriched with per-tenancy aggregates
 * (event count, RSVP/guest count, plan/limits) for the /admin Tenancies page.
 */
export const listWorkspacesPaginated = query({
  args: {
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    search: v.optional(v.string()),
    kindFilter: v.optional(v.string()),
  },
  handler: async (ctx, { cursor, pageSize = 25, search, kindFilter }) => {
    await requireCoucouPlatformMember(ctx);
    const allWorkspaces = await ctx.db.query("workspaces").collect();
    const trimmedSearch = search?.trim().toLowerCase() ?? "";

    const filtered = allWorkspaces.filter((workspace) => {
      if (workspace.slug === "coucou" || workspace.kind === "admin") {
        return false;
      }
      if (kindFilter && kindFilter !== "all" && workspace.kind !== kindFilter) {
        return false;
      }
      if (trimmedSearch) {
        const haystack = [workspace.name, workspace.slug, workspace.primaryDomain ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(trimmedSearch)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
    const page = filtered.slice(cursorIndex, cursorIndex + pageSize);

    const allEvents = await ctx.db.query("events").collect();
    const eventCountBySlug = new Map<string, number>();
    const eventIdsBySlug = new Map<string, Set<Id<"events">>>();
    for (const event of allEvents) {
      const slug = event.workspaceSlug ?? event.siteKey ?? "";
      if (!slug) continue;
      eventCountBySlug.set(slug, (eventCountBySlug.get(slug) ?? 0) + 1);
      const set = eventIdsBySlug.get(slug) ?? new Set<Id<"events">>();
      set.add(event._id);
      eventIdsBySlug.set(slug, set);
    }

    const allRsvps = await ctx.db.query("rsvps").collect();
    const rsvpCountByEventId = new Map<string, number>();
    for (const rsvp of allRsvps) {
      rsvpCountByEventId.set(rsvp.eventId, (rsvpCountByEventId.get(rsvp.eventId) ?? 0) + 1);
    }

    const enriched = await Promise.all(
      page.map(async (workspace) => {
        const sites = await ctx.db
          .query("workspaceSites")
          .withIndex("by_workspace", (queryBuilder) =>
            queryBuilder.eq("workspaceId", workspace._id),
          )
          .collect();

        const eventIds = eventIdsBySlug.get(workspace.slug) ?? new Set();
        let guestCount = 0;
        for (const eventId of eventIds) {
          guestCount += rsvpCountByEventId.get(eventId) ?? 0;
        }

        return {
          ...workspace,
          sites,
          eventCount: eventCountBySlug.get(workspace.slug) ?? 0,
          guestCount,
        };
      }),
    );

    return {
      page: enriched,
      nextCursor: cursorIndex + pageSize < filtered.length ? String(cursorIndex + pageSize) : null,
      isDone: cursorIndex + pageSize >= filtered.length,
      totalCount: filtered.length,
    };
  },
});

export const setWorkspacePlan = mutation({
  args: {
    slug: v.string(),
    plan: v.optional(
      v.object({
        tier: v.string(),
        priceCents: v.optional(v.number()),
        billingStatus: v.optional(
          v.union(v.literal("ok"), v.literal("watch"), v.literal("overdue")),
        ),
        nextInvoiceAt: v.optional(v.number()),
        lastInvoiceAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { slug, plan }) => {
    await requireCoucouPlatformMember(ctx);
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", slug))
      .unique();
    if (!workspace) throw new Error(`Workspace not found: ${slug}`);

    await ctx.db.patch(workspace._id, { plan, updatedAt: Date.now() });

    await writeAuditEntry(ctx, {
      action: "workspace.setPlan",
      targetKind: "workspace",
      targetId: workspace._id,
      workspaceId: workspace._id,
      summary: plan ? `${plan.tier} ($${(plan.priceCents ?? 0) / 100}/mo)` : "cleared",
    });

    return workspace._id;
  },
});

export const setWorkspaceLimits = mutation({
  args: {
    slug: v.string(),
    limits: v.optional(
      v.object({
        smsPerDay: v.optional(v.number()),
        smsPerMonth: v.optional(v.number()),
        rsvpsPerEvent: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { slug, limits }) => {
    await requireCoucouPlatformMember(ctx);
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", slug))
      .unique();
    if (!workspace) throw new Error(`Workspace not found: ${slug}`);

    await ctx.db.patch(workspace._id, { limits, updatedAt: Date.now() });

    await writeAuditEntry(ctx, {
      action: "workspace.setLimits",
      targetKind: "workspace",
      targetId: workspace._id,
      workspaceId: workspace._id,
      summary: limits
        ? `sms/day=${limits.smsPerDay ?? "—"}, sms/mo=${limits.smsPerMonth ?? "—"}, rsvps/event=${limits.rsvpsPerEvent ?? "—"}`
        : "cleared",
    });

    return workspace._id;
  },
});

export const setClerkOrganizationId = mutation({
  args: {
    slug: v.string(),
    clerkOrganizationId: v.optional(v.string()),
    clerkOrganizationSlug: v.optional(v.string()),
  },
  handler: async (ctx, { slug, clerkOrganizationId, clerkOrganizationSlug }) => {
    await requireCoucouPlatformMember(ctx);
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", slug))
      .unique();
    if (!workspace) throw new Error(`Workspace not found: ${slug}`);

    await ctx.db.patch(workspace._id, {
      clerkOrganizationId,
      clerkOrganizationSlug,
      updatedAt: Date.now(),
    });

    await writeAuditEntry(ctx, {
      action: "workspace.setClerkOrg",
      targetKind: "workspace",
      targetId: workspace._id,
      workspaceId: workspace._id,
      summary: clerkOrganizationId ? `linked ${clerkOrganizationId}` : "unlinked",
    });

    return workspace._id;
  },
});

export const seedDefaultWorkspaces = mutation({
  args: {},
  handler: async (ctx) => {
    const dojoWorkspaceId = await upsertWorkspaceRecord(ctx, {
      slug: "dojo-pomodoro",
      name: "Dojo Pomodoro",
      kind: "client",
      primaryDomain: "dojopomodoro.club",
    });

    const clubChlorineWorkspaceId = await upsertWorkspaceRecord(ctx, {
      slug: "club-chlorine",
      name: "Club Chlorine",
      kind: "client",
      primaryDomain: "clubchlorine.party",
    });

    const coucouWorkspaceId = await upsertWorkspaceRecord(ctx, {
      slug: "coucou",
      name: "Coucou",
      kind: "admin",
      primaryDomain: "coucou.events",
    });

    await upsertWorkspaceSiteRecord(ctx, {
      workspaceId: dojoWorkspaceId,
      siteKey: "dojo",
      domain: "dojopomodoro.club",
      appKind: "client",
    });
    await upsertWorkspaceSiteRecord(ctx, {
      workspaceId: clubChlorineWorkspaceId,
      siteKey: "club-chlorine",
      domain: "clubchlorine.party",
      appKind: "client",
    });
    await upsertWorkspaceSiteRecord(ctx, {
      workspaceId: coucouWorkspaceId,
      siteKey: "coucou",
      domain: "coucou.events",
      appKind: "admin",
    });

    return {
      dojoWorkspaceId,
      clubChlorineWorkspaceId,
      coucouWorkspaceId,
    };
  },
});
