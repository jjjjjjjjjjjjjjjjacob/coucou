/* eslint-disable no-restricted-imports */
import {
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
  query as rawQuery,
  internalQuery as rawInternalQuery,
  action as rawAction,
  internalAction as rawInternalAction
} from "./_generated/server";
/* eslint-enable no-restricted-imports */

import { DataModel } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { cascadeListKeyUpdate, shouldBatchCascade } from "./lib/cascadeHelpers";
import { internal } from "./_generated/api";

// Initialize triggers with our data model types
export const triggers = new Triggers<DataModel>();

// Register trigger for listCredentials table - handles listKey updates and deletes
triggers.register("listCredentials", async (ctx, change) => {
  // Handle listKey updates
  if (
    change.operation === "update" &&
    change.oldDoc?.listKey !== change.newDoc?.listKey
  ) {
    console.log(`[TRIGGER] listCredentials listKey changed: ${change.oldDoc?.listKey} → ${change.newDoc?.listKey}`);

    if (change.newDoc && change.oldDoc) {
      await cascadeListKeyUpdate(
        ctx,
        change.newDoc.eventId,
        change.oldDoc.listKey,
        change.newDoc.listKey
      );
    }
  }

  // Handle credential deletes - no cascade needed since credentialId no longer exists
  if (change.operation === "delete" && change.oldDoc) {
    console.log(`[TRIGGER] listCredentials deleted: ${change.oldDoc.listKey} for event ${change.oldDoc.eventId}`);
    // Note: No cascade operation needed since dependent tables only reference listKey now
  }
});

// Register trigger for events table - handles deletes and status changes
triggers.register("events", async (ctx, change) => {
  // Handle event deletes - cascade to all dependent records
  if (change.operation === "delete" && change.oldDoc) {
    console.log(`[TRIGGER] Event deleted: ${change.oldDoc.name} (${change.oldDoc._id})`);

    const { shouldBatch, estimatedSize } = await shouldBatchCascade(ctx, change.oldDoc._id);

    if (shouldBatch) {
      console.log(`[TRIGGER] Event has ${estimatedSize} records, using batched deletion`);

      // Schedule batched deletion for large events
      await ctx.scheduler.runAfter(0, internal.cascades.batchDeleteEventData, {
        eventId: change.oldDoc._id,
        cursor: undefined,
        batchSize: 500,
        phase: "rsvps"
      });
    } else {
      console.log(`[TRIGGER] Event has ${estimatedSize} records, using inline deletion`);

      // Inline delete for small events
      // Delete credentials for this event
      const creds = await ctx.db
        .query("listCredentials")
        .withIndex("by_event", (q) => q.eq("eventId", change.oldDoc._id))
        .collect();
      for (const credential of creds) await ctx.db.delete(credential._id);

      // Delete RSVPs
      const rsvps = await ctx.db
        .query("rsvps")
        .withIndex("by_event", (q) => q.eq("eventId", change.oldDoc._id))
        .collect();
      for (const rsvp of rsvps) await ctx.db.delete(rsvp._id);

      // Delete approvals
      const approvals = await ctx.db
        .query("approvals")
        .withIndex("by_event", (q) => q.eq("eventId", change.oldDoc._id))
        .collect();
      for (const approval of approvals) await ctx.db.delete(approval._id);

      // Delete redemptions
      const redemptions = await ctx.db
        .query("redemptions")
        .withIndex("by_event_user", (q) => q.eq("eventId", change.oldDoc._id))
        .collect();
      for (const redemption of redemptions) await ctx.db.delete(redemption._id);
    }
  }

  // Handle event status changes (future use)
  if (
    change.operation === "update" &&
    change.oldDoc?.status !== change.newDoc?.status
  ) {
    console.log(`[TRIGGER] Event status changed: ${change.oldDoc?.status} → ${change.newDoc?.status}`);
    // Future implementation: cascade event status changes
  }
});

// Register trigger for users table - keeps userName synchronized in RSVPs
triggers.register("users", async (ctx, change) => {
  // Only react to updates where name fields might have changed
  if (change.operation === "insert" || change.operation === "update") {
    const user = change.newDoc;

    // Skip if user doesn't have a clerkUserId (shouldn't happen but be safe)
    if (!user.clerkUserId) return;

    // Construct userName from users table data
    const userName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ") || "";

    console.log(`[TRIGGER] User name changed for ${user.clerkUserId}: updating RSVPs with userName: ${userName}`);

    // Find all RSVPs for this user
    const userRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (q) => q.eq("clerkUserId", user.clerkUserId!))
      .collect();

    // Update userName in all their RSVPs to keep search data fresh
    for (const rsvp of userRsvps) {
      // Only update if userName actually changed (avoid unnecessary writes)
      if (rsvp.userName !== userName) {
        await ctx.db.patch(rsvp._id, {
          userName,
          updatedAt: Date.now(),
        });
      }
    }
  }
});

// Create custom mutation wrappers that enable triggers
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));

// Queries don't need triggers - they're read-only
export const query = rawQuery;
export const internalQuery = rawInternalQuery;

// Actions don't use customCtx because they run in Node.js runtime
// They call mutations/queries which have triggers enabled
export const action = rawAction;
export const internalAction = rawInternalAction;

// Note: triggers instance already exported above as const