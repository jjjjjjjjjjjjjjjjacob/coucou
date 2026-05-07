import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getCoucouOrganizationSlug } from "./platformAuth";

interface WorkspacePatch {
  name?: string;
  kind?: string;
  primaryDomain?: string;
  clerkOrganizationId?: string;
  clerkOrganizationSlug?: string;
  updatedAt: number;
}

export type ClerkSatelliteVerificationStatus =
  | "unconfigured"
  | "pending"
  | "verified"
  | "failed";

interface WorkspaceSitePatch {
  workspaceId?: Id<"workspaces">;
  domain?: string;
  appKind?: string;
  clerkFrontendApiUrl?: string;
  clerkSatelliteVerificationStatus?: ClerkSatelliteVerificationStatus;
  clerkSatelliteAuthEnabled?: boolean;
  clerkSatelliteLastSyncedAt?: number;
  updatedAt: number;
}

function optionalTrimmedString(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export function normalizeTenantWorkspaceSlug(value: string): string {
  const normalizedSlug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
    throw new Error("Workspace slug must contain letters or numbers");
  }

  if (normalizedSlug === getCoucouOrganizationSlug()) {
    throw new Error("Workspace slug is reserved");
  }

  return normalizedSlug;
}

export function normalizePrimaryDomain(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    throw new Error("Primary URL is required");
  }

  const valueWithProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(valueWithProtocol);
  } catch {
    throw new Error("Primary URL must be a valid domain or URL");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Primary URL must use http or https");
  }

  if (!parsedUrl.hostname) {
    throw new Error("Primary URL must include a hostname");
  }

  return parsedUrl.host.toLowerCase();
}

function normalizeOptionalPrimaryDomain(
  value: string | undefined,
): string | undefined {
  const trimmedValue = optionalTrimmedString(value);
  return trimmedValue ? normalizePrimaryDomain(trimmedValue) : undefined;
}

export async function upsertWorkspaceRecord(
  ctx: MutationCtx,
  args: {
    slug: string;
    name: string;
    kind?: string;
    primaryDomain?: string;
    clerkOrganizationId?: string;
    clerkOrganizationSlug?: string;
  },
): Promise<Id<"workspaces">> {
  const now = Date.now();
  const existingWorkspace = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", args.slug))
    .unique();

  if (existingWorkspace) {
    const patch: WorkspacePatch = {
      name: args.name,
      updatedAt: now,
    };
    if (args.kind !== undefined) patch.kind = args.kind;
    if (args.primaryDomain !== undefined) {
      patch.primaryDomain = args.primaryDomain;
    }
    if (args.clerkOrganizationId !== undefined) {
      patch.clerkOrganizationId = args.clerkOrganizationId;
    }
    if (args.clerkOrganizationSlug !== undefined) {
      patch.clerkOrganizationSlug = args.clerkOrganizationSlug;
    }

    await ctx.db.patch(existingWorkspace._id, patch);
    return existingWorkspace._id;
  }

  return await ctx.db.insert("workspaces", {
    slug: args.slug,
    name: args.name,
    kind: args.kind,
    primaryDomain: args.primaryDomain,
    clerkOrganizationId: args.clerkOrganizationId,
    clerkOrganizationSlug: args.clerkOrganizationSlug,
    createdAt: now,
    updatedAt: now,
  });
}

export async function upsertWorkspaceSiteRecord(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    siteKey: string;
    domain: string;
    appKind: string;
    clerkFrontendApiUrl?: string;
    clerkSatelliteVerificationStatus?: ClerkSatelliteVerificationStatus;
    clerkSatelliteAuthEnabled?: boolean;
    clerkSatelliteLastSyncedAt?: number;
  },
): Promise<Id<"workspaceSites">> {
  const now = Date.now();
  const existingWorkspaceSite = await ctx.db
    .query("workspaceSites")
    .withIndex("by_siteKey", (queryBuilder) =>
      queryBuilder.eq("siteKey", args.siteKey),
    )
    .unique();

  if (existingWorkspaceSite) {
    const patch: WorkspaceSitePatch = {
      workspaceId: args.workspaceId,
      domain: args.domain,
      appKind: args.appKind,
      updatedAt: now,
    };
    if (args.clerkFrontendApiUrl !== undefined) {
      patch.clerkFrontendApiUrl = args.clerkFrontendApiUrl;
    }
    if (args.clerkSatelliteVerificationStatus !== undefined) {
      patch.clerkSatelliteVerificationStatus =
        args.clerkSatelliteVerificationStatus;
    }
    if (args.clerkSatelliteAuthEnabled !== undefined) {
      patch.clerkSatelliteAuthEnabled = args.clerkSatelliteAuthEnabled;
    }
    if (args.clerkSatelliteLastSyncedAt !== undefined) {
      patch.clerkSatelliteLastSyncedAt = args.clerkSatelliteLastSyncedAt;
    }

    await ctx.db.patch(existingWorkspaceSite._id, patch);
    return existingWorkspaceSite._id;
  }

  return await ctx.db.insert("workspaceSites", {
    workspaceId: args.workspaceId,
    siteKey: args.siteKey,
    domain: args.domain,
    appKind: args.appKind,
    clerkFrontendApiUrl: args.clerkFrontendApiUrl,
    clerkSatelliteVerificationStatus: args.clerkSatelliteVerificationStatus,
    clerkSatelliteAuthEnabled: args.clerkSatelliteAuthEnabled,
    clerkSatelliteLastSyncedAt: args.clerkSatelliteLastSyncedAt,
    createdAt: now,
    updatedAt: now,
  });
}

export async function syncWorkspacePrimaryDomainSites(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    workspaceSlug: string;
    primaryDomain: string;
  },
): Promise<void> {
  const workspaceSites = await ctx.db
    .query("workspaceSites")
    .withIndex("by_workspace", (queryBuilder) =>
      queryBuilder.eq("workspaceId", args.workspaceId),
    )
    .collect();

  if (workspaceSites.length === 0) {
    await upsertWorkspaceSiteRecord(ctx, {
      workspaceId: args.workspaceId,
      siteKey: args.workspaceSlug,
      domain: args.primaryDomain,
      appKind: "client",
    });
    return;
  }

  const now = Date.now();
  for (const workspaceSite of workspaceSites) {
    await ctx.db.patch(workspaceSite._id, {
      domain: args.primaryDomain,
      updatedAt: now,
    });
  }
}

export async function upsertTenantWorkspaceRecordForClerkOrganization(
  ctx: MutationCtx,
  args: {
    slug: string;
    name: string;
    clerkOrganizationId: string;
    clerkOrganizationSlug?: string;
    primaryDomain?: string;
  },
): Promise<{
  workspaceId: Id<"workspaces">;
  workspaceSlug: string;
  primaryDomain?: string;
}> {
  const normalizedSlug = normalizeTenantWorkspaceSlug(args.slug);
  const normalizedClerkOrganizationSlug =
    optionalTrimmedString(args.clerkOrganizationSlug)?.toLowerCase() ??
    normalizedSlug;
  const normalizedPrimaryDomain = normalizeOptionalPrimaryDomain(
    args.primaryDomain,
  );
  const trimmedName = args.name.trim() || normalizedSlug;
  const now = Date.now();

  const workspaceBySlug = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (queryBuilder) =>
      queryBuilder.eq("slug", normalizedSlug),
    )
    .unique();

  if (
    workspaceBySlug?.clerkOrganizationId &&
    workspaceBySlug.clerkOrganizationId !== args.clerkOrganizationId
  ) {
    throw new Error("Workspace is already linked to another organization");
  }

  const workspaceByClerkOrganizationId = workspaceBySlug
    ? null
    : await ctx.db
        .query("workspaces")
        .withIndex("by_clerkOrg", (queryBuilder) =>
          queryBuilder.eq("clerkOrganizationId", args.clerkOrganizationId),
        )
        .unique();

  const existingWorkspace =
    workspaceBySlug ?? workspaceByClerkOrganizationId ?? null;

  if (existingWorkspace) {
    if (
      existingWorkspace.kind === "admin" ||
      existingWorkspace.slug === getCoucouOrganizationSlug()
    ) {
      throw new Error("Workspace slug is reserved");
    }

    const patch: WorkspacePatch = {
      name: trimmedName,
      kind: "client",
      clerkOrganizationId: args.clerkOrganizationId,
      clerkOrganizationSlug: normalizedClerkOrganizationSlug,
      updatedAt: now,
    };
    if (normalizedPrimaryDomain !== undefined) {
      patch.primaryDomain = normalizedPrimaryDomain;
    }

    await ctx.db.patch(existingWorkspace._id, patch);

    if (normalizedPrimaryDomain !== undefined) {
      await syncWorkspacePrimaryDomainSites(ctx, {
        workspaceId: existingWorkspace._id,
        workspaceSlug: existingWorkspace.slug,
        primaryDomain: normalizedPrimaryDomain,
      });
    }

    return {
      workspaceId: existingWorkspace._id,
      workspaceSlug: existingWorkspace.slug,
      primaryDomain: normalizedPrimaryDomain ?? existingWorkspace.primaryDomain,
    };
  }

  const workspaceId = await ctx.db.insert("workspaces", {
    slug: normalizedSlug,
    name: trimmedName,
    kind: "client",
    primaryDomain: normalizedPrimaryDomain,
    clerkOrganizationId: args.clerkOrganizationId,
    clerkOrganizationSlug: normalizedClerkOrganizationSlug,
    createdAt: now,
    updatedAt: now,
  });

  if (normalizedPrimaryDomain !== undefined) {
    await syncWorkspacePrimaryDomainSites(ctx, {
      workspaceId,
      workspaceSlug: normalizedSlug,
      primaryDomain: normalizedPrimaryDomain,
    });
  }

  return {
    workspaceId,
    workspaceSlug: normalizedSlug,
    primaryDomain: normalizedPrimaryDomain,
  };
}

export async function upsertAdminWorkspaceRecordForClerkOrganization(
  ctx: MutationCtx,
  args: {
    name: string;
    clerkOrganizationId: string;
    clerkOrganizationSlug?: string;
    primaryDomain?: string;
  },
): Promise<Id<"workspaces">> {
  const workspaceSlug = getCoucouOrganizationSlug();
  const normalizedClerkOrganizationSlug =
    optionalTrimmedString(args.clerkOrganizationSlug)?.toLowerCase() ??
    workspaceSlug;
  const normalizedPrimaryDomain = normalizeOptionalPrimaryDomain(
    args.primaryDomain,
  );
  const trimmedName = args.name.trim() || "Coucou";
  const workspaceId = await upsertWorkspaceRecord(ctx, {
    slug: workspaceSlug,
    name: trimmedName,
    kind: "admin",
    primaryDomain: normalizedPrimaryDomain,
    clerkOrganizationId: args.clerkOrganizationId,
    clerkOrganizationSlug: normalizedClerkOrganizationSlug,
  });

  if (normalizedPrimaryDomain !== undefined) {
    await upsertWorkspaceSiteRecord(ctx, {
      workspaceId,
      siteKey: workspaceSlug,
      domain: normalizedPrimaryDomain,
      appKind: "admin",
    });
  }

  return workspaceId;
}

export async function ensureTenantWorkspaceRecordForOrganization(
  ctx: MutationCtx,
  args: {
    slug: string;
    name: string;
    clerkOrganizationId: string;
    clerkOrganizationSlug?: string;
  },
): Promise<Id<"workspaces">> {
  const result = await upsertTenantWorkspaceRecordForClerkOrganization(ctx, args);
  return result.workspaceId;
}
