import { createClerkClient } from "@clerk/backend";
import { v } from "convex/values";
import { action } from "./functions";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  getCoucouOrganizationSlug,
  getIdentityOrganizationId,
  getIdentityOrganizationRole,
} from "./lib/platformAuth";

type StoredOrganizationMembership = {
  organizationId: string;
  role: string;
};

async function getStoredOrganizationMembership(
  ctx: Pick<ActionCtx, "runQuery">,
  clerkUserId: string,
  organizationId: string,
): Promise<StoredOrganizationMembership | null> {
  const storedMemberships = (await ctx.runQuery(
    api.orgMemberships.listForUser,
    {
      clerkUserId,
    },
  )) as StoredOrganizationMembership[];

  return (
    storedMemberships.find(
      (membership) => membership.organizationId === organizationId,
    ) ?? null
  );
}

async function fetchClerkOrganizationMembershipRole(
  clerkOrganizationId: string,
  clerkUserId: string,
): Promise<string> {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    throw new Error("CLERK_SECRET_KEY not configured");
  }

  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  const membershipList =
    await clerk.organizations.getOrganizationMembershipList({
      organizationId: clerkOrganizationId,
      userId: [clerkUserId],
      limit: 1,
    });
  const clerkMembership = membershipList.data[0] ?? null;
  if (!clerkMembership) {
    throw new Error("Forbidden: organization membership required");
  }

  return clerkMembership.role;
}

async function ensureVerifiedOrganizationMembership(
  ctx: ActionCtx,
  {
    clerkOrganizationId,
    organizationName,
    organizationSlug,
  }: {
    clerkOrganizationId: string;
    organizationName?: string;
    organizationSlug?: string;
  },
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }

  const activeOrganizationId = getIdentityOrganizationId(identity);
  const activeOrganizationRole =
    activeOrganizationId === clerkOrganizationId
      ? getIdentityOrganizationRole(identity)
      : null;
  const storedMembership = await getStoredOrganizationMembership(
    ctx,
    identity.subject,
    clerkOrganizationId,
  );
  const verifiedMembershipRole =
    activeOrganizationRole ??
    storedMembership?.role ??
    (await fetchClerkOrganizationMembershipRole(
      clerkOrganizationId,
      identity.subject,
    ));

  if (storedMembership?.role !== verifiedMembershipRole) {
    await ctx.runMutation(api.orgMemberships.upsertMembership, {
      clerkUserId: identity.subject,
      organizationId: clerkOrganizationId,
      role: verifiedMembershipRole,
    });
  }

  const normalizedOrganizationSlug = organizationSlug?.trim().toLowerCase();
  if (normalizedOrganizationSlug === getCoucouOrganizationSlug()) {
    await ctx.runMutation(
      internal.workspaces.upsertCoucouAdminWorkspaceForClerkOrganization,
      {
        name: organizationName ?? "Coucou",
        clerkOrganizationId,
        clerkOrganizationSlug: normalizedOrganizationSlug,
      },
    );
  }

  return verifiedMembershipRole;
}

export const ensureCurrentUserOrganizationMembership = action({
  args: {
    clerkOrganizationId: v.string(),
    organizationName: v.optional(v.string()),
    organizationSlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { clerkOrganizationId, organizationName, organizationSlug },
  ): Promise<{ role: string }> => {
    const role = await ensureVerifiedOrganizationMembership(ctx, {
      clerkOrganizationId,
      organizationName,
      organizationSlug,
    });

    return { role };
  },
});

export const ensureTenantWorkspaceForOrganizationMembership = action({
  args: {
    slug: v.string(),
    name: v.string(),
    clerkOrganizationId: v.string(),
    clerkOrganizationSlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { slug, name, clerkOrganizationId, clerkOrganizationSlug },
  ): Promise<Id<"workspaces">> => {
    await ensureVerifiedOrganizationMembership(ctx, {
      clerkOrganizationId,
      organizationName: name,
      organizationSlug: clerkOrganizationSlug,
    });

    return await ctx.runMutation(
      internal.workspaces.ensureTenantWorkspaceInDatabase,
      {
        slug,
        name,
        clerkOrganizationId,
        clerkOrganizationSlug,
      },
    );
  },
});
