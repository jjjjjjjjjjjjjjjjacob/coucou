import { mutation, query } from "./functions";
import { v } from "convex/values";
import { EventPatch, ValidationError, NotFoundError } from "./lib/types";
import { internal } from "./_generated/api";
import {
  ensureEventInSiteScope,
  eventMatchesSiteScope,
} from "./lib/siteScope";
import { requireWorkspaceHost } from "./lib/workspaceAuth";
import { writeAuditEntry } from "./audit";
import { primaryFieldConfigValidator } from "./lib/primaryFields";
import {
  eventActValidator,
  eventStatusValidator,
} from "./lib/eventMetadata";

// Node crypto-based creation is handled in eventsNode.ts (action).
// This module contains only queries/mutations compatible with the standard runtime.

export const insertWithCreds = mutation({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    name: v.string(),
    secondaryTitle: v.optional(v.string()),
    description: v.optional(v.string()),
    acts: v.optional(v.array(eventActValidator)),
    hosts: v.array(v.string()),
    productionCompany: v.optional(v.string()),
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    guestPortalImageStorageId: v.optional(v.id("_storage")),
    guestPortalLinkLabel: v.optional(v.string()),
    guestPortalLinkUrl: v.optional(v.string()),
    eventDate: v.number(),
    eventTimezone: v.optional(v.string()),
    status: v.optional(eventStatusValidator),
    maxAttendees: v.optional(v.number()),
    customFields: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          required: v.optional(v.boolean()),
          copyEnabled: v.optional(v.boolean()),
          prependUrl: v.optional(v.string()),
          trimWhitespace: v.optional(v.boolean()),
        }),
      ),
    ),
    primaryFieldConfig: v.optional(primaryFieldConfigValidator),
    themeBackgroundColor: v.optional(v.string()),
    themeTextColor: v.optional(v.string()),
    approvalMessage: v.optional(v.string()),
    qrCodeColor: v.optional(v.string()),
    creds: v.array(
      v.object({
        listKey: v.string(),
        password: v.string(),
        passwordNormalized: v.string(),
        generateQR: v.optional(v.boolean()),
        approvalMessage: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const now = Date.now();
    if (args.eventDate < now)
      throw new Error("Event date must be in the future");
    const eventId = await ctx.db.insert("events", {
      workspaceSlug: args.workspaceSlug,
      siteKey: args.siteKey,
      name: args.name,
      secondaryTitle: args.secondaryTitle,
      description: args.description,
      acts: args.acts,
      hosts: args.hosts,
      productionCompany: args.productionCompany,
      location: args.location,
      flyerUrl: args.flyerUrl,
      flyerStorageId: args.flyerStorageId,
      customIconStorageId: args.customIconStorageId ?? null,
      guestPortalImageStorageId: args.guestPortalImageStorageId,
      guestPortalLinkLabel: args.guestPortalLinkLabel,
      guestPortalLinkUrl: args.guestPortalLinkUrl,
      eventDate: args.eventDate,
      eventTimezone: args.eventTimezone,
      status: args.status ?? "inactive",
      maxAttendees: args.maxAttendees,
      customFields: args.customFields,
      primaryFieldConfig: args.primaryFieldConfig,
      themeBackgroundColor: args.themeBackgroundColor,
      themeTextColor: args.themeTextColor,
      approvalMessage: args.approvalMessage,
      qrCodeColor: args.qrCodeColor,
      createdAt: now,
      updatedAt: now,
    });
    for (const credential of args.creds) {
      await ctx.db.insert("listCredentials", {
        eventId,
        ...credential,
        createdAt: now,
      });
    }
    return { eventId };
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    name: v.optional(v.string()),
    secondaryTitle: v.optional(v.string()),
    description: v.optional(v.string()),
    acts: v.optional(v.array(eventActValidator)),
    hosts: v.optional(v.array(v.string())),
    productionCompany: v.optional(v.string()),
    location: v.optional(v.string()),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    eventDate: v.optional(v.number()),
    eventTimezone: v.optional(v.string()),
    guestPortalImageStorageId: v.optional(v.id("_storage")),
    guestPortalLinkLabel: v.optional(v.string()),
    guestPortalLinkUrl: v.optional(v.string()),
    maxAttendees: v.optional(v.number()),
    status: v.optional(eventStatusValidator),
    isFeatured: v.optional(v.boolean()),
    customFields: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          required: v.optional(v.boolean()),
          copyEnabled: v.optional(v.boolean()),
          prependUrl: v.optional(v.string()),
          trimWhitespace: v.optional(v.boolean()),
        }),
      ),
    ),
    primaryFieldConfig: v.optional(primaryFieldConfigValidator),
    themeBackgroundColor: v.optional(v.string()),
    themeTextColor: v.optional(v.string()),
    approvalMessage: v.optional(v.string()),
    qrCodeColor: v.optional(v.string()),
    customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const event = await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    if (!event) throw new NotFoundError("Event");

    // Detect custom field key renames before updating
    let keyMappings: Record<string, string> | undefined;
    if (args.customFields !== undefined && event.customFields) {
      const oldFields = event.customFields;
      const newFields = args.customFields;

      // Build maps for comparison (keyed by label to detect renames)
      const oldFieldMap = new Map<string, typeof oldFields[0]>();
      const newFieldMap = new Map<string, typeof newFields[0]>();
      
      for (const field of oldFields) {
        oldFieldMap.set(field.label, field);
      }
      for (const field of newFields) {
        newFieldMap.set(field.label, field);
      }

      // Find keys that were renamed (same label but different key)
      keyMappings = {};
      for (const [label, oldField] of oldFieldMap) {
        const newField = newFieldMap.get(label);
        if (newField && oldField.key !== newField.key) {
          // Same label but different key = rename detected
          keyMappings[oldField.key] = newField.key;
        }
      }

      // Remove empty mappings
      if (Object.keys(keyMappings).length === 0) {
        keyMappings = undefined;
      }
    }

    const patch: EventPatch & { updatedAt: number } = { updatedAt: Date.now() };
    const updateableFields = [
      "name",
      "secondaryTitle",
      "description",
      "acts",
      "hosts",
      "productionCompany",
      "location",
      "flyerUrl",
      "flyerStorageId",
      "customIconStorageId",
      "guestPortalImageStorageId",
      "guestPortalLinkLabel",
      "guestPortalLinkUrl",
      "eventDate",
      "eventTimezone",
      "maxAttendees",
      "status",
      "isFeatured",
      "customFields",
      "primaryFieldConfig",
      "themeBackgroundColor",
      "themeTextColor",
      "approvalMessage",
      "qrCodeColor",
    ] as const;

    for (const fieldKey of updateableFields) {
      if (args[fieldKey] !== undefined) {
        (patch as Record<string, unknown>)[fieldKey] = args[fieldKey];
      }
    }
    await ctx.db.patch(args.eventId, patch);

    // If custom field keys were renamed, update all RSVPs for this event
    if (keyMappings && Object.keys(keyMappings).length > 0) {
      console.log(
        `[EVENT UPDATE] Detected custom field key renames for event ${args.eventId}:`,
        keyMappings,
      );
      await ctx.runMutation(internal.migrations.renameCustomFieldKeys, {
        keyMappings,
        eventId: args.eventId,
      });
    }

    await writeAuditEntry(ctx, {
      action: "event.update",
      targetKind: "event",
      targetId: args.eventId,
      summary: `${event.name}${args.name && args.name !== event.name ? ` → ${args.name}` : ""}`,
    });

    return { ok: true };
  },
});

export const remove = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const event = await ensureEventInSiteScope(ctx, eventId, {
      siteKey,
      workspaceSlug,
    });

    // Simply delete the event - trigger handles all cascading automatically!
    await ctx.db.delete(eventId);

    if (event) {
      await writeAuditEntry(ctx, {
        action: "event.remove",
        targetKind: "event",
        targetId: eventId,
        summary: event.name,
      });
    }

    return { ok: true };
  },
});

export const addListCredential = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    listKey: v.string(),
    password: v.string(),
    passwordNormalized: v.string(),
    generateQR: v.optional(v.boolean()),
    approvalMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const now = Date.now();
    await ctx.db.insert("listCredentials", {
      eventId: args.eventId,
      listKey: args.listKey,
      password: args.password,
      passwordNormalized: args.passwordNormalized,
      generateQR: args.generateQR,
      approvalMessage: args.approvalMessage,
      createdAt: now,
    });
    return { ok: true as const };
  },
});

export const updateListCredential = mutation({
  args: {
    id: v.id("listCredentials"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    patch: v.object({
      listKey: v.optional(v.string()),
      password: v.optional(v.string()),
      passwordNormalized: v.optional(v.string()),
      generateQR: v.optional(v.boolean()),
      approvalMessage: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, patch, siteKey, workspaceSlug }) => {
    const credential = await ctx.db.get(id);
    if (!credential) throw new NotFoundError("List credential");

    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    await ensureEventInSiteScope(ctx, credential.eventId, {
      siteKey,
      workspaceSlug,
    });

    await ctx.db.patch(id, patch);
    return { ok: true as const };
  },
});

export const removeListCredential = mutation({
  args: {
    id: v.id("listCredentials"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { id, siteKey, workspaceSlug }) => {
    // Get credential info for logging
    const credential = await ctx.db.get(id);
    if (!credential) throw new NotFoundError("List credential");

    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    await ensureEventInSiteScope(ctx, credential.eventId, {
      siteKey,
      workspaceSlug,
    });

    console.log(`[DELETE] Removing list credential ${id} (${credential.listKey}) for event ${credential.eventId}`);

    // Simply delete the credential - trigger handles cascading automatically!
    await ctx.db.delete(id);

    return { ok: true as const };
  },
});

// New mutation that handles listKey updates with cascading
export const updateListCredentialWithCascade = mutation({
  args: {
    id: v.id("listCredentials"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    patch: v.object({
      listKey: v.optional(v.string()),
      password: v.optional(v.string()),
      passwordNormalized: v.optional(v.string()),
      generateQR: v.optional(v.boolean()),
      approvalMessage: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, patch, siteKey, workspaceSlug }) => {
    const credential = await ctx.db.get(id);
    if (!credential) throw new NotFoundError("List credential");

    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    await ensureEventInSiteScope(ctx, credential.eventId, {
      siteKey,
      workspaceSlug,
    });

    // Check if listKey is changing
    if (patch.listKey && patch.listKey !== credential.listKey) {
      console.log(`[UPDATE] ListKey changing: ${credential.listKey} → ${patch.listKey} for credential ${id}`);

      // Count affected records to determine if we should batch
      const [rsvpCount, approvalCount, redemptionCount] = await Promise.all([
        ctx.db.query("rsvps")
          .withIndex("by_event", (q) => q.eq("eventId", credential.eventId))
          .filter((q) => q.eq(q.field("listKey"), credential.listKey))
          .collect()
          .then(results => results.length),
        ctx.db.query("approvals")
          .withIndex("by_event", (q) => q.eq("eventId", credential.eventId))
          .filter((q) => q.eq(q.field("listKey"), credential.listKey))
          .collect()
          .then(results => results.length),
        ctx.db.query("redemptions")
          .withIndex("by_event_user", (q) => q.eq("eventId", credential.eventId))
          .filter((q) => q.eq(q.field("listKey"), credential.listKey))
          .collect()
          .then(results => results.length)
      ]);

      const totalAffected = rsvpCount + approvalCount + redemptionCount;

      if (totalAffected > 100) {
        // Use batched update for large operations
        console.log(`[UPDATE] ${totalAffected} records affected, using batched update`);

        // Update the credential first
        await ctx.db.patch(id, patch);

        // Schedule batched listKey update
        await ctx.scheduler.runAfter(0, internal.cascades.batchUpdateListKey, {
          eventId: credential.eventId,
          credentialId: id,
          oldListKey: credential.listKey,
          newListKey: patch.listKey,
          cursor: undefined,
          batchSize: 500,
          phase: "rsvps"
        });

        return { ok: true, batched: true, affectedRecords: totalAffected };
      } else {
        // Inline update for smaller operations - triggers will handle cascade
        console.log(`[UPDATE] ${totalAffected} records affected, using inline update with triggers`);

        await ctx.db.patch(id, patch);
        return { ok: true, batched: false, affectedRecords: totalAffected };
      }
    } else {
      // No listKey change, simple update
      await ctx.db.patch(id, patch);
      return { ok: true, batched: false, affectedRecords: 0 };
    }
  },
});

export const get = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    const event = await ctx.db.get(eventId);
    return eventMatchesSiteScope(event, { siteKey, workspaceSlug })
      ? event
      : null;
  },
});

export const listAll = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { siteKey, workspaceSlug }) => {
    const events = await ctx.db.query("events").collect();
    return events.filter((event) =>
      eventMatchesSiteScope(event, { siteKey, workspaceSlug }),
    );
  },
});

export const getFeaturedEvent = query({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { siteKey, workspaceSlug }) => {
    const featuredEvents = await ctx.db
      .query("events")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();

    return (
      featuredEvents.find((event) =>
        eventMatchesSiteScope(event, { siteKey, workspaceSlug }),
      ) ?? null
    );
  },
});

export const setFeaturedEvent = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    // Set all other events to not featured
    const allEvents = await ctx.db.query("events").collect();
    for (const event of allEvents) {
      if (
        event._id !== eventId &&
        event.isFeatured &&
        eventMatchesSiteScope(event, { siteKey, workspaceSlug })
      ) {
        await ctx.db.patch(event._id, {
          isFeatured: false,
          updatedAt: Date.now(),
        });
      }
    }

    // Set the selected event as featured
    await ctx.db.patch(eventId, {
      isFeatured: true,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});
