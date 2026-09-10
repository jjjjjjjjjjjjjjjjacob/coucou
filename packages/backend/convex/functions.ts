/* eslint-disable no-restricted-imports */
import {
  action as rawAction,
  internalAction as rawInternalAction,
  internalMutation as rawInternalMutation,
  internalQuery as rawInternalQuery,
  mutation as rawMutation,
  query as rawQuery,
} from "./_generated/server";

/* eslint-enable no-restricted-imports */

import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { cascadeListKeyUpdate, shouldBatchCascade } from "./lib/cascadeHelpers";
import { resolveStoredUserDisplayName } from "./lib/rsvpUserName";
import { enqueueEventWebhookDeliveries, enqueueRsvpWebhookDeliveries } from "./lib/webhookEmission";
import { resolveTenantWorkspaceScope } from "./lib/workspaceScope";

// Initialize triggers with our data model types
export const triggers = new Triggers<DataModel>();

async function contactsEnabled(ctx: MutationCtx): Promise<boolean> {
  return (await ctx.db.query("contactDirectoryState").first()) !== null;
}

triggers.register("workspaceGuestProfiles", async (ctx, change) => {
  const profile = change.newDoc ?? change.oldDoc;
  if (profile && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncProfile, {
      workspaceId: profile.workspaceId,
      clerkUserId: profile.clerkUserId,
      guestPhoneHash: profile.guestPhoneHash,
    });
});
triggers.register("userSocialProfiles", async (ctx, change) => {
  const socialProfile = change.newDoc ?? change.oldDoc;
  if (socialProfile && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncUser, {
      clerkUserId: socialProfile.clerkUserId,
      phase: "contacts",
    });
});
triggers.register("rsvpSocialProfiles", async (ctx, change) => {
  const socialProfile = change.newDoc ?? change.oldDoc;
  if (socialProfile && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncRsvp, {
      rsvpId: socialProfile.rsvpId,
    });
});
triggers.register("userSmsOrganizerPreferences", async (ctx, change) => {
  const preference = change.newDoc ?? change.oldDoc;
  if (preference && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncUser, {
      clerkUserId: preference.clerkUserId,
      phase: "contacts",
    });
});
triggers.register("smsOptOuts", async (ctx, change) => {
  const optOut = change.newDoc ?? change.oldDoc;
  if (optOut && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncPhone, {
      phoneHash: optOut.phoneNumber,
    });
});
triggers.register("guestContacts", async (ctx, change) => {
  const contact = change.newDoc ?? change.oldDoc;
  if (contact && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncPhone, {
      phoneHash: contact.phoneHash,
    });
});
triggers.register("userIdentityAliases", async (ctx, change) => {
  const alias = change.newDoc ?? change.oldDoc;
  if (alias && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncUser, {
      clerkUserId: alias.aliasClerkUserId,
    });
});
triggers.register("redemptions", async (ctx, change) => {
  const redemption = change.newDoc ?? change.oldDoc;
  if (redemption && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncUser, {
      clerkUserId: redemption.clerkUserId,
    });
});
triggers.register("textBlastRecipients", async (ctx, change) => {
  const delivery = change.newDoc ?? change.oldDoc;
  if (delivery && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncDelivery, {
      deliveryId: delivery._id,
    });
});
triggers.register("smsNotifications", async (ctx, change) => {
  const notification = change.newDoc ?? change.oldDoc;
  if (change.newDoc?.eventId && !change.newDoc.workspaceId) {
    const event = await ctx.db.get(change.newDoc.eventId);
    const workspace = event ? await resolveTenantWorkspaceScope(ctx, event) : null;
    if (workspace) await ctx.db.patch(change.newDoc._id, { workspaceId: workspace.workspaceId });
  }
  if (notification?.type === "approval" && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncUser, {
      clerkUserId: notification.recipientClerkUserId,
    });
});

// Register trigger for listCredentials table - handles listKey updates and deletes
triggers.register("listCredentials", async (ctx, change) => {
  // Handle listKey updates
  if (change.operation === "update" && change.oldDoc?.listKey !== change.newDoc?.listKey) {
    console.log(
      `[TRIGGER] listCredentials listKey changed: ${change.oldDoc?.listKey} → ${change.newDoc?.listKey}`,
    );

    if (change.newDoc && change.oldDoc) {
      await cascadeListKeyUpdate(
        ctx,
        change.newDoc.eventId,
        change.oldDoc.listKey,
        change.newDoc.listKey,
      );
    }
  }

  // Handle credential deletes - no cascade needed since credentialId no longer exists
  if (change.operation === "delete" && change.oldDoc) {
    console.log(
      `[TRIGGER] listCredentials deleted: ${change.oldDoc.listKey} for event ${change.oldDoc.eventId}`,
    );
    // Note: No cascade operation needed since dependent tables only reference listKey now
  }
});

// Register trigger for rsvps table - emits partner webhook deliveries for
// every RSVP change, regardless of which mutation performed it.
triggers.register("rsvps", async (ctx, change) => {
  await enqueueRsvpWebhookDeliveries(ctx, change);
  const rsvp = change.newDoc ?? change.oldDoc;
  if (rsvp && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncRsvp, { rsvpId: rsvp._id });
});

// Register trigger for events table - handles deletes and status changes
triggers.register("events", async (ctx, change) => {
  const contactEvent = change.newDoc ?? change.oldDoc;
  if (contactEvent && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncEvent, { eventId: contactEvent._id });
  // Emit partner webhooks for publish/unpublish/public-field/delete changes.
  await enqueueEventWebhookDeliveries(ctx, change);

  // Handle event deletes - cascade to all dependent records
  if (change.operation === "delete" && change.oldDoc) {
    console.log(`[TRIGGER] Event deleted: ${change.oldDoc.name} (${change.oldDoc._id})`);

    const twilioCredential = await ctx.db
      .query("twilioCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", change.oldDoc._id))
      .unique();
    if (twilioCredential) {
      await ctx.db.delete(twilioCredential._id);
    }

    const { shouldBatch, estimatedSize } = await shouldBatchCascade(ctx, change.oldDoc._id);

    if (shouldBatch) {
      console.log(`[TRIGGER] Event has ${estimatedSize} records, using batched deletion`);

      // Schedule batched deletion for large events
      await ctx.scheduler.runAfter(0, internal.cascades.batchDeleteEventData, {
        eventId: change.oldDoc._id,
        cursor: undefined,
        batchSize: 500,
        phase: "rsvps",
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
  if (change.operation === "update" && change.oldDoc?.status !== change.newDoc?.status) {
    console.log(
      `[TRIGGER] Event status changed: ${change.oldDoc?.status} → ${change.newDoc?.status}`,
    );
    // Future implementation: cascade event status changes
  }
});

// Register trigger for users table - keeps userName synchronized in RSVPs
triggers.register("users", async (ctx, change) => {
  const contactUser = change.newDoc ?? change.oldDoc;
  if (contactUser?.clerkUserId && (await contactsEnabled(ctx)))
    await ctx.scheduler.runAfter(0, internal.contactSync.syncUser, {
      clerkUserId: contactUser.clerkUserId,
    });
  // Only react to updates where name fields might have changed
  if (change.operation === "insert" || change.operation === "update") {
    const user = change.newDoc;

    // Skip if user doesn't have a clerkUserId (shouldn't happen but be safe)
    if (!user.clerkUserId) return;

    // Construct userName from users table data. If a Clerk/user update
    // has no name fields, leave existing RSVP names intact.
    const userName = resolveStoredUserDisplayName(user);
    if (!userName) return;

    console.log(
      `[TRIGGER] User name changed for ${user.clerkUserId}: updating RSVPs with userName: ${userName}`,
    );

    const userRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (builder) => builder.eq("clerkUserId", user.clerkUserId as string))
      .take(41);
    if (userRsvps.length > 40)
      await ctx.scheduler.runAfter(0, internal.contactSync.syncUserNames, {
        clerkUserId: user.clerkUserId,
      });
    // Update userName in all their RSVPs to keep search data fresh
    for (const rsvp of userRsvps.slice(0, 40)) {
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
