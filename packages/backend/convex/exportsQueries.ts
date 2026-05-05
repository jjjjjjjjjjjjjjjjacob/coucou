import { internalQuery } from "./functions";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { ensureEventInSiteScope } from "./lib/siteScope";

export type ExportContext = {
  event: Doc<"events">;
  rsvps: Doc<"rsvps">[];
  rsvpSocialProfiles: Doc<"rsvpSocialProfiles">[];
  listCredentials: Doc<"listCredentials">[];
  usersByClerkUserId: Record<string, Doc<"users">>;
};

export const getRsvpsForExportInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    listKeys: v.optional(v.array(v.string())),
    statusFilters: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    { eventId, siteKey, workspaceSlug, listKeys, statusFilters },
  ): Promise<ExportContext> => {
    const event = await ensureEventInSiteScope(ctx, eventId, {
      siteKey,
      workspaceSlug,
    });

    const allowedStatuses: Array<Doc<"rsvps">["status"]> = [
      "pending",
      "approved",
      "denied",
      "attending",
    ];
    const requestedStatuses =
      statusFilters && statusFilters.length > 0
        ? statusFilters.filter((status): status is Doc<"rsvps">["status"] =>
            allowedStatuses.includes(status as Doc<"rsvps">["status"]),
          )
        : allowedStatuses;

    let rsvps: Doc<"rsvps">[] = [];
    if (requestedStatuses.length === allowedStatuses.length) {
      rsvps = await ctx.db
        .query("rsvps")
        .withIndex("by_event", (query) => query.eq("eventId", eventId))
        .collect();
    } else if (requestedStatuses.length === 0) {
      rsvps = [];
    } else {
      const results = await Promise.all(
        requestedStatuses.map((status) =>
          ctx.db
            .query("rsvps")
            .withIndex("by_event_status", (query) =>
              query.eq("eventId", eventId).eq("status", status),
            )
            .collect(),
        ),
      );
      rsvps = results.flat();
    }

    if (listKeys && listKeys.length > 0) {
      rsvps = rsvps.filter((rsvp) => listKeys.includes(rsvp.listKey));
    }

    if (requestedStatuses.length !== allowedStatuses.length) {
      rsvps = rsvps.filter((rsvp) =>
        requestedStatuses.includes(rsvp.status),
      );
    }

    const clerkUserIds = [
      ...new Set(rsvps.map((rsvp) => rsvp.clerkUserId)),
    ];

    const usersByClerkUserId: Record<string, Doc<"users">> = {};
    if (clerkUserIds.length > 0) {
      const userDocs = await Promise.all(
        clerkUserIds.map((clerkUserId) =>
          ctx.db
            .query("users")
            .withIndex("by_clerkUserId", (query) =>
              query.eq("clerkUserId", clerkUserId),
            )
            .unique(),
        ),
      );
      for (const user of userDocs) {
        if (user?.clerkUserId) {
          usersByClerkUserId[user.clerkUserId] = user;
        }
      }
    }

    const listCredentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (query) => query.eq("eventId", eventId))
      .collect();
    const rsvpSocialProfiles = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_event", (query) => query.eq("eventId", eventId))
      .collect();

    return {
      event,
      rsvps,
      rsvpSocialProfiles,
      listCredentials,
      usersByClerkUserId,
    };
  },
});
