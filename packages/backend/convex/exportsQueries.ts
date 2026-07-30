import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalQuery } from "./functions";
import {
  type ApprovalStatus,
  type AttendanceStatus,
  resolveApprovalStatus,
  sanitizeAttendanceStatus,
} from "./lib/rsvpStatus";
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
    attendanceFilters: v.optional(v.array(v.string())),
    ticketStatusFilters: v.optional(v.array(v.string())),
    search: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      eventId,
      siteKey,
      workspaceSlug,
      listKeys,
      statusFilters,
      attendanceFilters,
      ticketStatusFilters,
      search,
    },
  ): Promise<ExportContext> => {
    const event = await ensureEventInSiteScope(ctx, eventId, {
      siteKey,
      workspaceSlug,
    });

    const allowedStatuses: ApprovalStatus[] = ["pending", "approved", "denied"];
    const requestedStatuses =
      statusFilters && statusFilters.length > 0
        ? statusFilters.filter((status): status is ApprovalStatus =>
            allowedStatuses.includes(status as ApprovalStatus),
          )
        : allowedStatuses;

    let rsvps: Doc<"rsvps">[] =
      requestedStatuses.length === 0
        ? []
        : await ctx.db
            .query("rsvps")
            .withIndex("by_event", (query) => query.eq("eventId", eventId))
            .collect();

    if (listKeys && listKeys.length > 0) {
      rsvps = rsvps.filter((rsvp) => listKeys.includes(rsvp.listKey));
    }

    if (requestedStatuses.length !== allowedStatuses.length) {
      rsvps = rsvps.filter((rsvp) => requestedStatuses.includes(resolveApprovalStatus(rsvp)));
    }

    const allowedAttendanceStatuses: AttendanceStatus[] = ["yes", "no", "maybe"];
    const requestedAttendanceStatuses =
      attendanceFilters && attendanceFilters.length > 0
        ? attendanceFilters.filter((status): status is AttendanceStatus =>
            allowedAttendanceStatuses.includes(status as AttendanceStatus),
          )
        : allowedAttendanceStatuses;
    if (requestedAttendanceStatuses.length !== allowedAttendanceStatuses.length) {
      rsvps = rsvps.filter((rsvp) =>
        requestedAttendanceStatuses.includes(sanitizeAttendanceStatus(rsvp.attendanceStatus)),
      );
    }

    const allowedTicketStatuses = ["not-issued", "issued", "disabled", "redeemed"] as const;
    const requestedTicketStatuses =
      ticketStatusFilters && ticketStatusFilters.length > 0
        ? ticketStatusFilters.filter((status) =>
            allowedTicketStatuses.includes(status as (typeof allowedTicketStatuses)[number]),
          )
        : [...allowedTicketStatuses];
    if (requestedTicketStatuses.length !== allowedTicketStatuses.length) {
      rsvps = rsvps.filter((rsvp) =>
        requestedTicketStatuses.includes(
          (rsvp.ticketStatus ?? "not-issued") as (typeof allowedTicketStatuses)[number],
        ),
      );
    }

    const normalizedSearch = search?.trim().toLowerCase();
    if (normalizedSearch) {
      rsvps = rsvps.filter((rsvp) =>
        `${rsvp.userName ?? ""} ${rsvp.guestPhoneObfuscated ?? ""}`
          .toLowerCase()
          .includes(normalizedSearch),
      );
    }

    const clerkUserIds = [...new Set(rsvps.map((rsvp) => rsvp.clerkUserId))];

    const usersByClerkUserId: Record<string, Doc<"users">> = {};
    if (clerkUserIds.length > 0) {
      const userDocs = await Promise.all(
        clerkUserIds.map((clerkUserId) =>
          ctx.db
            .query("users")
            .withIndex("by_clerkUserId", (query) => query.eq("clerkUserId", clerkUserId))
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
