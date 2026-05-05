import { internalMutation } from "./functions";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { updateRsvpInAggregate, deleteRsvpFromAggregate } from "./lib/rsvpAggregate";

/**
 * Scheduled cascade operations for handling large-scale deletions
 * These functions use pagination to handle large datasets without hitting size limits
 */

interface BatchOperationArgs {
  eventId: Id<"events">;
  cursor?: string | null;
  batchSize?: number;
}

/**
 * Batch delete all event-related data when an event is deleted
 * Uses cursor-based pagination to handle large datasets
 */
export const batchDeleteEventData = internalMutation({
  args: {
    eventId: v.id("events"),
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    phase: v.optional(v.string()) // "rsvps", "approvals", "redemptions", "credentials"
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const phase = args.phase ?? "rsvps";

    console.log(`[BATCH DELETE] Phase: ${phase}, Event: ${args.eventId}, Cursor: ${args.cursor}`);

    if (phase === "rsvps") {
      // Delete RSVPs in batches
      const paginatedResult = await ctx.db
        .query("rsvps")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .order("asc")
        .paginate({
          cursor: args.cursor ?? null,
          numItems: batchSize
        });

      let deletedCount = 0;
      for (const rsvp of paginatedResult.page) {
        // Remove from aggregate before deleting
        await deleteRsvpFromAggregate(ctx, rsvp);
        await ctx.db.delete(rsvp._id);
        deletedCount++;
      }

      console.log(`[BATCH DELETE] Deleted ${deletedCount} RSVPs`);

      if (!paginatedResult.isDone) {
        // Continue with next batch of RSVPs
        await ctx.scheduler.runAfter(0, internal.cascades.batchDeleteEventData, {
          eventId: args.eventId,
          cursor: paginatedResult.continueCursor,
          batchSize,
          phase: "rsvps"
        });
      } else {
        // Move to next phase: approvals
        await ctx.scheduler.runAfter(0, internal.cascades.batchDeleteEventData, {
          eventId: args.eventId,
          cursor: undefined,
          batchSize,
          phase: "approvals"
        });
      }
    } else if (phase === "approvals") {
      // Delete approvals in batches
      const approvals = await ctx.db
        .query("approvals")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(); // Approvals are typically fewer, so collect all

      for (const approval of approvals) {
        await ctx.db.delete(approval._id);
      }

      console.log(`[BATCH DELETE] Deleted ${approvals.length} approvals`);

      // Move to next phase: redemptions
      await ctx.scheduler.runAfter(0, internal.cascades.batchDeleteEventData, {
        eventId: args.eventId,
        cursor: undefined,
        batchSize,
        phase: "redemptions"
      });
    } else if (phase === "redemptions") {
      // Delete redemptions in batches
      const redemptions = await ctx.db
        .query("redemptions")
        .withIndex("by_event_user", (q) => q.eq("eventId", args.eventId))
        .collect(); // Redemptions are typically fewer

      for (const redemption of redemptions) {
        await ctx.db.delete(redemption._id);
      }

      console.log(`[BATCH DELETE] Deleted ${redemptions.length} redemptions`);

      // Move to final phase: credentials
      await ctx.scheduler.runAfter(0, internal.cascades.batchDeleteEventData, {
        eventId: args.eventId,
        cursor: undefined,
        batchSize,
        phase: "credentials"
      });
    } else if (phase === "credentials") {
      // Delete list credentials
      const credentials = await ctx.db
        .query("listCredentials")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();

      for (const credential of credentials) {
        await ctx.db.delete(credential._id);
      }

      console.log(`[BATCH DELETE] Deleted ${credentials.length} credentials`);
      console.log(`[BATCH DELETE] Event cascade deletion completed for event ${args.eventId}`);
    }

    return { phase, processed: true };
  }
});

/**
 * Batch update listKey across all dependent tables for a credential
 * Used when listKey changes need to be propagated to many records
 */
export const batchUpdateListKey = internalMutation({
  args: {
    eventId: v.id("events"),
    credentialId: v.id("listCredentials"),
    oldListKey: v.string(),
    newListKey: v.string(),
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    phase: v.optional(v.string()) // "rsvps", "approvals", "redemptions"
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const phase = args.phase ?? "rsvps";

    console.log(`[BATCH UPDATE] Phase: ${phase}, ${args.oldListKey} → ${args.newListKey}`);

    if (phase === "rsvps") {
      // Update RSVPs in batches
      const rsvpsToUpdate = await ctx.db
        .query("rsvps")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .filter((q) => q.eq(q.field("listKey"), args.oldListKey))
        .collect();

      let updatedCount = 0;
      for (const rsvp of rsvpsToUpdate.slice(0, batchSize)) {
        const oldRsvp = { ...rsvp };
        await ctx.db.patch(rsvp._id, {
          listKey: args.newListKey,
          updatedAt: Date.now()
        });

        // Update aggregate
        const newRsvp = await ctx.db.get(rsvp._id);
        if (newRsvp) {
          await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
        }

        updatedCount++;
      }

      console.log(`[BATCH UPDATE] Updated ${updatedCount} RSVPs`);

      if (rsvpsToUpdate.length > batchSize) {
        // Continue with next batch of RSVPs
        await ctx.scheduler.runAfter(0, internal.cascades.batchUpdateListKey, {
          ...args,
          phase: "rsvps"
        });
      } else {
        // Move to next phase: approvals
        await ctx.scheduler.runAfter(0, internal.cascades.batchUpdateListKey, {
          ...args,
          cursor: undefined,
          phase: "approvals"
        });
      }
    } else if (phase === "approvals") {
      // Update approvals
      const approvalsToUpdate = await ctx.db
        .query("approvals")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .filter((q) => q.eq(q.field("listKey"), args.oldListKey))
        .collect();

      for (const approval of approvalsToUpdate) {
        await ctx.db.patch(approval._id, { listKey: args.newListKey });
      }

      console.log(`[BATCH UPDATE] Updated ${approvalsToUpdate.length} approvals`);

      // Move to final phase: redemptions
      await ctx.scheduler.runAfter(0, internal.cascades.batchUpdateListKey, {
        ...args,
        cursor: undefined,
        phase: "redemptions"
      });
    } else if (phase === "redemptions") {
      // Update redemptions
      const redemptionsToUpdate = await ctx.db
        .query("redemptions")
        .withIndex("by_event_user", (q) => q.eq("eventId", args.eventId))
        .filter((q) => q.eq(q.field("listKey"), args.oldListKey))
        .collect();

      for (const redemption of redemptionsToUpdate) {
        await ctx.db.patch(redemption._id, { listKey: args.newListKey });
      }

      console.log(`[BATCH UPDATE] Updated ${redemptionsToUpdate.length} redemptions`);
      console.log(`[BATCH UPDATE] ListKey update completed: ${args.oldListKey} → ${args.newListKey}`);
    }

    return { phase, processed: true };
  }
});

/**
 * Batch disable redemption codes for an event (e.g., when event is cancelled)
 */
export const batchDisableRedemptions = internalMutation({
  args: {
    eventId: v.id("events"),
    reason: v.optional(v.string()),
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const now = Date.now();

    console.log(`[BATCH DISABLE] Disabling redemptions for event ${args.eventId}`);

    const paginatedResult = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("disabledAt"), undefined))
      .order("asc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: batchSize
      });

    let disabledCount = 0;
    for (const redemption of paginatedResult.page) {
      await ctx.db.patch(redemption._id, { disabledAt: now });
      disabledCount++;
    }

    console.log(`[BATCH DISABLE] Disabled ${disabledCount} redemptions`);

    if (!paginatedResult.isDone) {
      // Continue with next batch
      await ctx.scheduler.runAfter(0, internal.cascades.batchDisableRedemptions, {
        eventId: args.eventId,
        reason: args.reason,
        cursor: paginatedResult.continueCursor,
        batchSize
      });
    } else {
      console.log(`[BATCH DISABLE] Completed disabling redemptions for event ${args.eventId}`);
    }

    return { disabledCount, isDone: paginatedResult.isDone };
  }
});