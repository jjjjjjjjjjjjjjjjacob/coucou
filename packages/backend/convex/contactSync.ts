import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { internalMutation as triggeredInternalMutation } from "./functions";
import {
  ensureContact,
  refreshContactProfile,
  resolveContact,
  syncContactDelivery,
  syncContactRsvp,
} from "./lib/contactRecords";
import { CONTACT_BATCH_SIZE } from "./lib/contactValidators";
import { resolveStoredUserDisplayName } from "./lib/rsvpUserName";
import { requireWorkspaceHost } from "./lib/workspaceAuth";
import { resolveTenantWorkspaceScope } from "./lib/workspaceScope";

export const status = query({
  args: { workspaceSlug: v.string(), siteKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await requireWorkspaceHost(ctx, args);
    return await ctx.db
      .query("contactDirectoryState")
      .withIndex("by_workspace", (builder) => builder.eq("workspaceId", scope.workspaceId))
      .first();
  },
});

async function beginBackfill(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  options: { force?: boolean } = {},
) {
  let state = await ctx.db
    .query("contactDirectoryState")
    .withIndex("by_workspace", (builder) => builder.eq("workspaceId", workspaceId))
    .first();
  if (state?.status === "building" || (state?.status === "ready" && !options.force))
    return state._id;
  if (!state) {
    const stateId = await ctx.db.insert("contactDirectoryState", {
      workspaceId,
      status: "building",
      phase: "rsvps",
      processed: 0,
      updatedAt: Date.now(),
    });
    state = await ctx.db.get(stateId);
  } else
    await ctx.db.patch(state._id, {
      status: "building",
      phase: "rsvps",
      cursor: undefined,
      processed: 0,
      error: undefined,
      updatedAt: Date.now(),
    });
  if (!state) throw new Error("Could not start contact backfill");
  await ctx.scheduler.runAfter(0, internal.contactSync.backfillBatch, { stateId: state._id });
  return state._id;
}

export const startBackfill = mutation({
  args: { workspaceSlug: v.string(), siteKey: v.optional(v.string()) },
  handler: async (ctx, args) =>
    beginBackfill(ctx, (await requireWorkspaceHost(ctx, args)).workspaceId),
});

// Deployment operators can prepare a workspace before enabling the new readers.
export const startBackfillInternal = internalMutation({
  args: { workspaceSlug: v.string() },
  handler: async (ctx, args) => {
    const scope = await resolveTenantWorkspaceScope(ctx, args);
    if (!scope) throw new Error("Workspace not found");
    return await beginBackfill(ctx, scope.workspaceId);
  },
});

// Rebuild denormalized contact search data after the projection format changes.
export const restartBackfillInternal = internalMutation({
  args: { workspaceSlug: v.string() },
  handler: async (ctx, args) => {
    const scope = await resolveTenantWorkspaceScope(ctx, args);
    if (!scope) throw new Error("Workspace not found");
    return await beginBackfill(ctx, scope.workspaceId, { force: true });
  },
});

const backfillPhases = [
  "rsvps",
  "profiles",
  "blasts",
  "deliveries",
  "notifications",
  "threads",
  "messages",
  "events",
];

export const backfillBatch = internalMutation({
  args: { stateId: v.id("contactDirectoryState") },
  handler: async (ctx, { stateId }) => {
    const state = await ctx.db.get(stateId);
    if (!state || state.status !== "building") return;
    const workspace = await ctx.db.get(state.workspaceId);
    if (!workspace) throw new Error("Workspace no longer exists");
    const paginationOpts = { cursor: state.cursor ?? null, numItems: CONTACT_BATCH_SIZE };
    try {
      let nextCursor: string;
      let isDone: boolean;
      let processed: number;
      if (state.phase === "rsvps") {
        const batch = await ctx.db.query("rsvps").paginate(paginationOpts);
        for (const rsvp of batch.page) {
          const event = await ctx.db.get(rsvp.eventId);
          const eventScope = event
            ? await resolveTenantWorkspaceScope(ctx, {
                workspaceSlug: event.workspaceSlug,
                siteKey: event.siteKey ?? "dojo",
              })
            : null;
          if (eventScope?.workspaceId === workspace._id) await syncContactRsvp(ctx, rsvp._id);
        }
        nextCursor = batch.continueCursor;
        isDone = batch.isDone;
        processed = batch.page.length;
      } else if (state.phase === "profiles") {
        const batch = await ctx.db
          .query("workspaceGuestProfiles")
          .withIndex("by_workspace", (builder) => builder.eq("workspaceId", workspace._id))
          .paginate(paginationOpts);
        for (const profile of batch.page) {
          if (!profile.clerkUserId && !profile.guestPhoneHash) continue;
          const contact = await ensureContact(ctx, workspace._id, profile);
          await refreshContactProfile(ctx, contact._id);
        }
        nextCursor = batch.continueCursor;
        isDone = batch.isDone;
        processed = batch.page.length;
      } else if (state.phase === "deliveries") {
        const batch = await ctx.db.query("textBlastRecipients").paginate(paginationOpts);
        for (const delivery of batch.page) await syncContactDelivery(ctx, delivery._id);
        nextCursor = batch.continueCursor;
        isDone = batch.isDone;
        processed = batch.page.length;
      } else if (state.phase === "events") {
        const batch = await ctx.db.query("events").paginate(paginationOpts);
        for (const event of batch.page) {
          if (event.workspaceSlug) continue;
          const scope = await resolveTenantWorkspaceScope(ctx, {
            workspaceSlug: event.workspaceSlug,
            siteKey: event.siteKey ?? "dojo",
          });
          if (scope?.workspaceId === workspace._id) {
            await ctx.db.patch(event._id, { workspaceSlug: workspace.slug });
            // Older events may have been skipped before their workspace scope was normalized.
            await ctx.scheduler.runAfter(0, internal.contactSync.syncEvent, { eventId: event._id });
          }
        }
        nextCursor = batch.continueCursor;
        isDone = batch.isDone;
        processed = batch.page.length;
      } else {
        const table =
          state.phase === "blasts"
            ? "textBlasts"
            : state.phase === "notifications"
              ? "smsNotifications"
              : state.phase === "threads"
                ? "smsConversationThreads"
                : "smsConversationMessages";
        const batch = await ctx.db.query(table).paginate(paginationOpts);
        for (const record of batch.page) {
          if (record.workspaceId || !record.eventId) continue;
          const event = await ctx.db.get(record.eventId);
          const eventScope = event
            ? await resolveTenantWorkspaceScope(ctx, {
                workspaceSlug: event.workspaceSlug,
                siteKey: event.siteKey ?? "dojo",
              })
            : null;
          if (eventScope?.workspaceId === workspace._id)
            await ctx.db.patch(record._id, { workspaceId: workspace._id });
        }
        nextCursor = batch.continueCursor;
        isDone = batch.isDone;
        processed = batch.page.length;
      }
      const nextPhase = backfillPhases[backfillPhases.indexOf(state.phase) + 1];
      const finished = isDone && !nextPhase;
      await ctx.db.patch(stateId, {
        status: finished ? "ready" : "building",
        phase: isDone ? (nextPhase ?? state.phase) : state.phase,
        cursor: isDone ? undefined : nextCursor,
        processed: state.processed + processed,
        updatedAt: Date.now(),
      });
      if (!finished)
        await ctx.scheduler.runAfter(0, internal.contactSync.backfillBatch, { stateId });
    } catch (error) {
      // Every projection is idempotent, so a partially processed application batch can be resumed.
      await ctx.db.patch(stateId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Contact backfill failed",
        updatedAt: Date.now(),
      });
    }
  },
});

export const syncRsvp = internalMutation({
  args: { rsvpId: v.id("rsvps") },
  handler: async (ctx, args) => {
    await syncContactRsvp(ctx, args.rsvpId);
  },
});

export const syncEvent = internalMutation({
  args: { eventId: v.id("events"), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (builder) => builder.eq("eventId", args.eventId))
      .paginate({ cursor: args.cursor ?? null, numItems: CONTACT_BATCH_SIZE });
    for (const rsvp of batch.page) await syncContactRsvp(ctx, rsvp._id);
    if (!batch.isDone)
      await ctx.scheduler.runAfter(0, internal.contactSync.syncEvent, {
        ...args,
        cursor: batch.continueCursor,
      });
  },
});

export const syncUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    cursor: v.optional(v.string()),
    phase: v.optional(v.union(v.literal("rsvps"), v.literal("contacts"))),
  },
  handler: async (ctx, args) => {
    if (args.phase !== "contacts") {
      const batch = await ctx.db
        .query("rsvps")
        .withIndex("by_user", (builder) => builder.eq("clerkUserId", args.clerkUserId))
        .paginate({ cursor: args.cursor ?? null, numItems: CONTACT_BATCH_SIZE });
      for (const rsvp of batch.page) await syncContactRsvp(ctx, rsvp._id);
      await ctx.scheduler.runAfter(0, internal.contactSync.syncUser, {
        clerkUserId: args.clerkUserId,
        phase: batch.isDone ? "contacts" : "rsvps",
        cursor: batch.isDone ? undefined : batch.continueCursor,
      });
    } else {
      const batch = await ctx.db
        .query("workspaceContactIdentities")
        .withIndex("by_user", (builder) => builder.eq("clerkUserId", args.clerkUserId))
        .paginate({ cursor: args.cursor ?? null, numItems: CONTACT_BATCH_SIZE });
      for (const record of batch.page) {
        const contact = await ensureContact(ctx, record.workspaceId, {
          clerkUserId: args.clerkUserId,
        });
        await refreshContactProfile(ctx, contact._id);
      }
      if (!batch.isDone)
        await ctx.scheduler.runAfter(0, internal.contactSync.syncUser, {
          ...args,
          cursor: batch.continueCursor,
        });
    }
  },
});

export const syncProfile = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    clerkUserId: v.optional(v.string()),
    guestPhoneHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.clerkUserId && !args.guestPhoneHash) return;
    const contact = await ensureContact(ctx, args.workspaceId, args);
    await refreshContactProfile(ctx, contact._id);
  },
});

export const syncPhone = internalMutation({
  args: { phoneHash: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("workspaceContacts")
      .withIndex("by_phone", (builder) => builder.eq("phoneHash", args.phoneHash))
      .paginate({ cursor: args.cursor ?? null, numItems: CONTACT_BATCH_SIZE });
    for (const contact of batch.page) {
      if (contact.mergedInto) continue;
      const refreshed = await ensureContact(ctx, contact.workspaceId, {
        clerkUserId: contact.primaryClerkUserId,
        guestPhoneHash: args.phoneHash,
      });
      await refreshContactProfile(ctx, refreshed._id);
    }
    if (!batch.isDone)
      await ctx.scheduler.runAfter(0, internal.contactSync.syncPhone, {
        ...args,
        cursor: batch.continueCursor,
      });
  },
});

export const mergeRelationships = internalMutation({
  args: { sourceId: v.id("workspaceContacts"), targetId: v.id("workspaceContacts") },
  handler: async (ctx, args) => {
    const target = await resolveContact(ctx, args.targetId);
    if (!target || target._id === args.sourceId) return;
    const relationships = await ctx.db
      .query("contactEvents")
      .withIndex("by_contact_event", (builder) => builder.eq("contactId", args.sourceId))
      .take(CONTACT_BATCH_SIZE);
    for (const relationship of relationships) await syncContactRsvp(ctx, relationship.rsvpId);
    const deliveries = await ctx.db
      .query("contactDeliveries")
      .withIndex("by_contact", (builder) => builder.eq("contactId", args.sourceId))
      .take(CONTACT_BATCH_SIZE);
    for (const delivery of deliveries) await syncContactDelivery(ctx, delivery.deliveryId);
    if (relationships.length === CONTACT_BATCH_SIZE || deliveries.length === CONTACT_BATCH_SIZE)
      await ctx.scheduler.runAfter(0, internal.contactSync.mergeRelationships, args);
  },
});

export const syncDelivery = internalMutation({
  args: { deliveryId: v.id("textBlastRecipients") },
  handler: async (ctx, args) => syncContactDelivery(ctx, args.deliveryId),
});

export const syncUserNames = triggeredInternalMutation({
  args: { clerkUserId: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (builder) => builder.eq("clerkUserId", args.clerkUserId))
      .first();
    const name = user ? resolveStoredUserDisplayName(user) : null;
    if (!name) return;
    const batch = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (builder) => builder.eq("clerkUserId", args.clerkUserId))
      .paginate({ cursor: args.cursor ?? null, numItems: 20 });
    for (const rsvp of batch.page)
      if (rsvp.userName !== name)
        await ctx.db.patch(rsvp._id, { userName: name, updatedAt: Date.now() });
    if (!batch.isDone)
      await ctx.scheduler.runAfter(0, internal.contactSync.syncUserNames, {
        ...args,
        cursor: batch.continueCursor,
      });
  },
});
