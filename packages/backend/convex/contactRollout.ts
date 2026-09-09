import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { beginContactPreview } from "./contactAudiences";
import { contactToPerson, readContactPage } from "./lib/contactQueries";
import { resolveContact } from "./lib/contactRecords";
import { ensureEventInSiteScope } from "./lib/siteScope";
import { resolveTenantWorkspaceScope } from "./lib/workspaceScope";

// Operator-only rollout probes. These functions never create blasts or schedule SMS delivery.
export const workspaces = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("workspaces")
      .paginate({ cursor: args.cursor ?? null, numItems: 40 });
    const page = [];
    for (const workspace of result.page) {
      const state = await ctx.db
        .query("contactDirectoryState")
        .withIndex("by_workspace", (builder) => builder.eq("workspaceId", workspace._id))
        .first();
      const events = await ctx.db
        .query("events")
        .withIndex("by_workspace_date", (builder) => builder.eq("workspaceSlug", workspace.slug))
        .order("desc")
        .take(3);
      page.push({
        slug: workspace.slug,
        state,
        events: events.map((event) => ({ eventId: event._id, name: event.name })),
      });
    }
    return { page, nextCursor: result.isDone ? null : result.continueCursor };
  },
});

type AuditTotals = {
  contacts: number;
  aliases: number;
  invalidAliases: number;
  pendingMerges: number;
  duplicatePhones: number;
  eventRelationships: number;
  pages: number;
  sourceRsvps: number;
  missingRsvps: number;
  sourceProfiles: number;
  missingProfiles: number;
};
export const auditWorkspace = internalAction({
  args: { workspaceSlug: v.string() },
  handler: async (ctx, args): Promise<AuditTotals> => {
    const totals: AuditTotals = {
      contacts: 0,
      aliases: 0,
      invalidAliases: 0,
      pendingMerges: 0,
      duplicatePhones: 0,
      eventRelationships: 0,
      pages: 0,
      sourceRsvps: 0,
      missingRsvps: 0,
      sourceProfiles: 0,
      missingProfiles: 0,
    };
    let cursor: string | undefined;
    do {
      const page = await ctx.runQuery(internal.contactRollout.auditPage, { ...args, cursor });
      totals.contacts += page.contacts;
      totals.aliases += page.aliases;
      totals.invalidAliases += page.invalidAliases;
      totals.pendingMerges += page.pendingMerges;
      totals.duplicatePhones += page.duplicatePhones;
      totals.eventRelationships += page.eventRelationships;
      totals.pages++;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    for (const source of ["rsvps", "profiles"] as const) {
      do {
        const page = await ctx.runQuery(internal.contactRollout.auditSourcePage, {
          ...args,
          source,
          cursor,
        });
        if (source === "rsvps") {
          totals.sourceRsvps += page.total;
          totals.missingRsvps += page.missing;
        } else {
          totals.sourceProfiles += page.total;
          totals.missingProfiles += page.missing;
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    }
    return totals;
  },
});

export const auditSourcePage = internalQuery({
  args: {
    workspaceSlug: v.string(),
    source: v.union(v.literal("rsvps"), v.literal("profiles")),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (builder) => builder.eq("slug", args.workspaceSlug))
      .unique();
    if (!workspace) throw new Error("Workspace not found");
    const pagination = { cursor: args.cursor ?? null, numItems: 40 };
    let total = 0;
    let missing = 0;
    if (args.source === "rsvps") {
      const result = await ctx.db.query("rsvps").paginate(pagination);
      for (const rsvp of result.page) {
        const event = await ctx.db.get(rsvp.eventId);
        const scope = event
          ? await resolveTenantWorkspaceScope(ctx, {
              workspaceSlug: event.workspaceSlug,
              siteKey: event.siteKey ?? "dojo",
            })
          : null;
        if (scope?.workspaceId !== workspace._id) continue;
        total++;
        const relationship = await ctx.db
          .query("contactEvents")
          .withIndex("by_rsvp", (builder) => builder.eq("rsvpId", rsvp._id))
          .first();
        if (!relationship || relationship.workspaceId !== workspace._id) missing++;
      }
      return { total, missing, nextCursor: result.isDone ? null : result.continueCursor };
    }
    const result = await ctx.db
      .query("workspaceGuestProfiles")
      .withIndex("by_workspace", (builder) => builder.eq("workspaceId", workspace._id))
      .paginate(pagination);
    for (const profile of result.page) {
      if (!profile.clerkUserId && !profile.guestPhoneHash) continue;
      total++;
      const identity = profile.clerkUserId
        ? await ctx.db
            .query("workspaceContactIdentities")
            .withIndex("by_workspace_user", (builder) =>
              builder
                .eq("workspaceId", workspace._id)
                .eq("clerkUserId", profile.clerkUserId as string),
            )
            .first()
        : null;
      const contact = identity
        ? await resolveContact(ctx, identity.contactId)
        : profile.guestPhoneHash
          ? await ctx.db
              .query("workspaceContacts")
              .withIndex("by_workspace_phone", (builder) =>
                builder.eq("workspaceId", workspace._id).eq("phoneHash", profile.guestPhoneHash),
              )
              .first()
          : null;
      if (!contact || contact.workspaceId !== workspace._id) missing++;
    }
    return { total, missing, nextCursor: result.isDone ? null : result.continueCursor };
  },
});

export const auditPage = internalQuery({
  args: { workspaceSlug: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (builder) => builder.eq("slug", args.workspaceSlug))
      .unique();
    if (!workspace) throw new Error("Workspace not found");
    const result = await ctx.db
      .query("workspaceContacts")
      .withIndex("by_workspace_phone", (builder) => builder.eq("workspaceId", workspace._id))
      .paginate({ cursor: args.cursor ?? null, numItems: 40 });
    let contacts = 0;
    let aliases = 0;
    let invalidAliases = 0;
    let pendingMerges = 0;
    let duplicatePhones = 0;
    let eventRelationships = 0;
    for (const contact of result.page) {
      if (contact.mergedInto) {
        aliases++;
        const canonical = await resolveContact(ctx, contact._id);
        if (!canonical || canonical.workspaceId !== workspace._id) invalidAliases++;
        if (
          await ctx.db
            .query("contactEvents")
            .withIndex("by_contact_event", (builder) => builder.eq("contactId", contact._id))
            .first()
        )
          pendingMerges++;
      } else {
        contacts++;
        eventRelationships += contact.eventCount;
        if (contact.phoneHash) {
          const matches = await ctx.db
            .query("workspaceContacts")
            .withIndex("by_workspace_phone", (builder) =>
              builder.eq("workspaceId", workspace._id).eq("phoneHash", contact.phoneHash),
            )
            .take(40);
          if (matches.filter((candidate) => !candidate.mergedInto).length > 1) duplicatePhones++;
        }
      }
    }
    return {
      contacts,
      aliases,
      invalidAliases,
      pendingMerges,
      duplicatePhones,
      eventRelationships,
      nextCursor: result.isDone ? null : result.continueCursor,
    };
  },
});

export const verifyDirectoryPage = internalQuery({
  args: {
    workspaceSlug: v.string(),
    eventIds: v.optional(v.array(v.id("events"))),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (builder) => builder.eq("slug", args.workspaceSlug))
      .unique();
    if (!workspace) throw new Error("Workspace not found");
    const scope = {
      workspaceId: workspace._id,
      workspaceSlug: workspace.slug,
      brandName: workspace.name,
      clerkOrganizationId: workspace.clerkOrganizationId ?? "",
    };
    const page = await readContactPage(ctx, {
      ...scope,
      filters: { eventIds: args.eventIds },
      cursor: args.cursor,
    });
    // Exercise the complete public summary path, but return no personal information to operator logs.
    for (const contact of page.contacts)
      await contactToPerson(ctx, contact, scope, page.latestEvent?._id);
    return { count: page.contacts.length, nextCursor: page.nextCursor, isDone: page.isDone };
  },
});

export const prepareVerificationPreview = internalMutation({
  args: { workspaceSlug: v.string(), eventIds: v.array(v.id("events")) },
  handler: async (ctx, args) => {
    if (args.eventIds.length > 200) throw new Error("Too many event filters");
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (builder) => builder.eq("slug", args.workspaceSlug))
      .unique();
    if (!workspace) throw new Error("Workspace not found");
    const state = await ctx.db
      .query("contactDirectoryState")
      .withIndex("by_workspace", (builder) => builder.eq("workspaceId", workspace._id))
      .first();
    if (state?.status !== "ready") throw new Error("Backfill is not ready");
    for (const eventId of args.eventIds) await ensureEventInSiteScope(ctx, eventId, args);
    return await beginContactPreview(ctx, {
      workspaceId: workspace._id,
      createdBy: "contact-rollout-verification",
      audience: { type: "filter", filters: { eventIds: args.eventIds } },
      includeQrCodes: false,
    });
  },
});

export const verificationStatus = internalQuery({
  args: { previewId: v.id("contactAudiencePreviews") },
  handler: async (ctx, args) => {
    const preview = await ctx.db.get(args.previewId);
    if (!preview || preview.createdBy !== "contact-rollout-verification")
      throw new Error("Verification preview not found");
    return {
      status: preview.status,
      processed: preview.processedCount,
      eligible: preview.eligibleCount,
      excluded: preview.excludedCount,
      reasons: preview.exclusionCounts,
      error: preview.error,
      updatedAt: preview.updatedAt,
    };
  },
});
