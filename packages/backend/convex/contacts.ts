import { v } from "convex/values";
import { query } from "./_generated/server";
import { contactToPerson, readContactPage, validateContactFilters } from "./lib/contactQueries";
import { resolveContact } from "./lib/contactRecords";
import {
  contactDirectionValidator,
  contactFilterFields,
  contactSortValidator,
} from "./lib/contactValidators";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

export const list = query({
  args: {
    workspaceSlug: v.string(),
    siteKey: v.optional(v.string()),
    ...contactFilterFields,
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    sortBy: v.optional(contactSortValidator),
    sortDirection: v.optional(contactDirectionValidator),
  },
  handler: async (ctx, args) => {
    const scope = await requireWorkspaceHost(ctx, args);
    await validateContactFilters(ctx, scope, args);
    const state = await ctx.db
      .query("contactDirectoryState")
      .withIndex("by_workspace", (builder) => builder.eq("workspaceId", scope.workspaceId))
      .first();
    if (state?.status !== "ready")
      return {
        people: [],
        nextCursor: null,
        isDone: false,
        directoryStatus: state?.status ?? "not_started",
      };
    const result = await readContactPage(ctx, {
      ...args,
      workspaceId: scope.workspaceId,
      filters: args,
    });
    const people = [];
    for (const contact of result.contacts)
      people.push(await contactToPerson(ctx, contact, scope, result.latestEvent?._id));
    return {
      people,
      nextCursor: result.nextCursor,
      isDone: result.isDone,
      directoryStatus: "ready" as const,
    };
  },
});

export const history = query({
  args: {
    workspaceSlug: v.string(),
    siteKey: v.optional(v.string()),
    contactId: v.id("workspaceContacts"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await requireWorkspaceHost(ctx, args);
    const contact = await resolveContact(ctx, args.contactId);
    if (!contact || contact.workspaceId !== scope.workspaceId) throw new Error("Contact not found");
    const result = await ctx.db
      .query("contactEvents")
      .withIndex("by_contact_date", (builder) => builder.eq("contactId", contact._id))
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: 20 });
    return {
      page: result.page,
      nextCursor: result.isDone ? null : result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const get = query({
  args: { workspaceSlug: v.string(), contactId: v.id("workspaceContacts") },
  handler: async (ctx, args) => {
    const scope = await requireWorkspaceHost(ctx, args);
    const contact = await resolveContact(ctx, args.contactId);
    if (!contact || contact.workspaceId !== scope.workspaceId) throw new Error("Contact not found");
    return await contactToPerson(ctx, contact, scope);
  },
});

export const facetPage = query({
  args: { workspaceSlug: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await requireWorkspaceHost(ctx, args);
    const result = await ctx.db
      .query("contactFacets")
      .withIndex("by_workspace", (builder) => builder.eq("workspaceId", scope.workspaceId))
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    return { page: result.page, nextCursor: result.isDone ? null : result.continueCursor };
  },
});

export const eventOptions = query({
  args: { workspaceSlug: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = await requireWorkspaceHost(ctx, args);
    const result = await ctx.db
      .query("events")
      .withIndex("by_workspace_date", (builder) => builder.eq("workspaceSlug", scope.workspaceSlug))
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: 50 });
    return {
      page: result.page.map((event) => ({
        eventId: event._id,
        eventName: event.name,
        eventDate: event.eventDate,
        customFields: event.customFields ?? [],
      })),
      nextCursor: result.isDone ? null : result.continueCursor,
    };
  },
});

export const messageHistory = query({
  args: {
    workspaceSlug: v.string(),
    contactId: v.id("workspaceContacts"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await requireWorkspaceHost(ctx, args);
    const contact = await resolveContact(ctx, args.contactId);
    if (!contact || contact.workspaceId !== scope.workspaceId) throw new Error("Contact not found");
    const result = await ctx.db
      .query("contactDeliveries")
      .withIndex("by_contact", (builder) => builder.eq("contactId", contact._id))
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: 20 });
    const page = [];
    for (const record of result.page) {
      const delivery = await ctx.db.get(record.deliveryId);
      const notification = delivery?.smsNotificationId
        ? await ctx.db.get(delivery.smsNotificationId)
        : null;
      const blast = await ctx.db.get(record.textBlastId);
      if (delivery)
        page.push({
          deliveryId: delivery._id,
          blastName: blast?.name ?? "Text blast",
          message: notification?.message ?? blast?.message ?? "",
          sentAt: delivery.sentAt ?? delivery.updatedAt,
          status: delivery.status,
        });
    }
    return { page, nextCursor: result.isDone ? null : result.continueCursor };
  },
});
