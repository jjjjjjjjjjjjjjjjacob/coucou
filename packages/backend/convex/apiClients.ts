import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./functions";
import { generateApiClientKey, hashApiClientKey, isApiClientScope } from "./lib/apiKeys";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

const apiClientScopeValidator = v.union(
  v.literal("events:read"),
  v.literal("rsvps:read"),
  v.literal("rsvps:write"),
);

export const create = mutation({
  args: {
    workspaceSlug: v.string(),
    displayName: v.string(),
    scopes: v.array(apiClientScopeValidator),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, { workspaceSlug: args.workspaceSlug });

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const trimmedDisplayName = args.displayName.trim();
    if (trimmedDisplayName.length === 0) {
      throw new Error("API key name is required");
    }

    const requestedScopes = [...new Set(args.scopes)];
    if (requestedScopes.length === 0) {
      throw new Error("At least one scope is required");
    }
    for (const requestedScope of requestedScopes) {
      if (!isApiClientScope(requestedScope)) {
        throw new Error(`Unknown scope: ${requestedScope}`);
      }
    }

    const { plaintextKey, keyPrefix } = generateApiClientKey();
    const keyHash = await hashApiClientKey(plaintextKey);

    const apiClientId = await ctx.db.insert("apiClients", {
      workspaceId: resolvedScope.workspaceId,
      displayName: trimmedDisplayName,
      keyPrefix,
      keyHash,
      scopes: requestedScopes,
      createdByClerkUserId: identity.subject,
      createdAt: Date.now(),
    });

    // The plaintext key is returned exactly once and never stored.
    return { apiClientId, plaintextKey, keyPrefix };
  },
});

export const revoke = mutation({
  args: {
    workspaceSlug: v.string(),
    apiClientId: v.id("apiClients"),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, { workspaceSlug: args.workspaceSlug });

    const apiClient = await ctx.db.get(args.apiClientId);
    if (!apiClient || apiClient.workspaceId !== resolvedScope.workspaceId) {
      throw new Error("API key not found");
    }
    if (apiClient.revokedAt !== undefined) {
      return { alreadyRevoked: true };
    }

    await ctx.db.patch(args.apiClientId, { revokedAt: Date.now() });
    return { alreadyRevoked: false };
  },
});

export const listForWorkspace = query({
  args: {
    workspaceSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, { workspaceSlug: args.workspaceSlug });

    const apiClients = await ctx.db
      .query("apiClients")
      .withIndex("by_workspace", (queryBuilder) =>
        queryBuilder.eq("workspaceId", resolvedScope.workspaceId),
      )
      .collect();

    // Never expose keyHash — the prefix is the only key material hosts see after creation.
    return apiClients.map((apiClient) => ({
      apiClientId: apiClient._id,
      displayName: apiClient.displayName,
      keyPrefix: apiClient.keyPrefix,
      scopes: apiClient.scopes,
      createdByClerkUserId: apiClient.createdByClerkUserId,
      createdAt: apiClient.createdAt,
      lastUsedAt: apiClient.lastUsedAt ?? null,
      revokedAt: apiClient.revokedAt ?? null,
    }));
  },
});

export const resolveByKeyHash = internalQuery({
  args: {
    keyHash: v.string(),
  },
  handler: async (ctx, args) => {
    const apiClient = await ctx.db
      .query("apiClients")
      .withIndex("by_keyHash", (queryBuilder) => queryBuilder.eq("keyHash", args.keyHash))
      .unique();
    if (!apiClient) {
      return null;
    }

    const workspace = await ctx.db.get(apiClient.workspaceId);
    if (!workspace) {
      return null;
    }

    return { apiClient, workspaceSlug: workspace.slug };
  },
});

export const recordUsage = internalMutation({
  args: {
    apiClientId: v.id("apiClients"),
  },
  handler: async (ctx, args) => {
    const apiClient = await ctx.db.get(args.apiClientId);
    if (!apiClient) {
      return;
    }
    await ctx.db.patch(args.apiClientId, { lastUsedAt: Date.now() });
  },
});
