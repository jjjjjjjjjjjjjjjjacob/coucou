import { v } from "convex/values";
import { mutation, query } from "./functions";
import { requireWorkspaceRead } from "./lib/workspaceAuth";

const MAX_TABLE_IDENTIFIER_COUNT = 120;
const MAX_TABLE_IDENTIFIER_LENGTH = 160;

const tablePreferenceArgsValidator = {
  siteKey: v.optional(v.string()),
  workspaceSlug: v.optional(v.string()),
  tableKey: v.string(),
  scopeKey: v.string(),
};

function normalizeTablePreferenceIdentifier(identifier: string): string | null {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) {
    return null;
  }
  if (normalizedIdentifier.length > MAX_TABLE_IDENTIFIER_LENGTH) {
    return normalizedIdentifier.slice(0, MAX_TABLE_IDENTIFIER_LENGTH);
  }
  return normalizedIdentifier;
}

export function normalizeDashboardTablePreferenceIdentifiers(identifiers: string[]): string[] {
  const normalizedIdentifiers: string[] = [];
  const seenIdentifiers = new Set<string>();

  for (const identifier of identifiers) {
    const normalizedIdentifier = normalizeTablePreferenceIdentifier(identifier);
    if (!normalizedIdentifier || seenIdentifiers.has(normalizedIdentifier)) {
      continue;
    }

    seenIdentifiers.add(normalizedIdentifier);
    normalizedIdentifiers.push(normalizedIdentifier);

    if (normalizedIdentifiers.length >= MAX_TABLE_IDENTIFIER_COUNT) {
      break;
    }
  }

  return normalizedIdentifiers;
}

function normalizeRequiredTablePreferenceIdentifier(identifier: string, label: string): string {
  const normalizedIdentifier = normalizeTablePreferenceIdentifier(identifier);
  if (!normalizedIdentifier) {
    throw new Error(`${label} is required`);
  }
  return normalizedIdentifier;
}

export const getCurrentUserTablePreference = query({
  args: tablePreferenceArgsValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const resolvedScope = await requireWorkspaceRead(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const tableKey = normalizeRequiredTablePreferenceIdentifier(args.tableKey, "Table key");
    const scopeKey = normalizeRequiredTablePreferenceIdentifier(args.scopeKey, "Scope key");

    const preference = await ctx.db
      .query("dashboardTablePreferences")
      .withIndex("by_user_workspace_table_scope", (queryBuilder) =>
        queryBuilder
          .eq("clerkUserId", identity.subject)
          .eq("workspaceId", resolvedScope.workspaceId)
          .eq("tableKey", tableKey)
          .eq("scopeKey", scopeKey),
      )
      .unique();

    if (!preference) {
      return null;
    }

    return {
      columnOrder: preference.columnOrder,
      hiddenColumnIds: preference.hiddenColumnIds,
      updatedAt: preference.updatedAt,
    };
  },
});

export const upsertCurrentUserTablePreference = mutation({
  args: {
    ...tablePreferenceArgsValidator,
    columnOrder: v.array(v.string()),
    hiddenColumnIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const resolvedScope = await requireWorkspaceRead(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const tableKey = normalizeRequiredTablePreferenceIdentifier(args.tableKey, "Table key");
    const scopeKey = normalizeRequiredTablePreferenceIdentifier(args.scopeKey, "Scope key");
    const columnOrder = normalizeDashboardTablePreferenceIdentifiers(args.columnOrder);
    const hiddenColumnIds = normalizeDashboardTablePreferenceIdentifiers(args.hiddenColumnIds);
    const now = Date.now();

    const existingPreference = await ctx.db
      .query("dashboardTablePreferences")
      .withIndex("by_user_workspace_table_scope", (queryBuilder) =>
        queryBuilder
          .eq("clerkUserId", identity.subject)
          .eq("workspaceId", resolvedScope.workspaceId)
          .eq("tableKey", tableKey)
          .eq("scopeKey", scopeKey),
      )
      .unique();

    if (existingPreference) {
      await ctx.db.patch(existingPreference._id, {
        columnOrder,
        hiddenColumnIds,
        updatedAt: now,
      });
      return existingPreference._id;
    }

    return await ctx.db.insert("dashboardTablePreferences", {
      clerkUserId: identity.subject,
      workspaceId: resolvedScope.workspaceId,
      tableKey,
      scopeKey,
      columnOrder,
      hiddenColumnIds,
      createdAt: now,
      updatedAt: now,
    });
  },
});
