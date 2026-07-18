import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./functions";
import { buildGuestClerkUserId, isGuestClerkUserId } from "./lib/guestIdentity";
import { normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { formatPhoneNumberForSms, obfuscatePhoneNumber } from "./lib/phoneUtils";
import { countRsvpsWithAggregate, insertRsvpIntoAggregate } from "./lib/rsvpAggregate";
import { resolveApprovalStatus, sanitizeAttendanceStatus } from "./lib/rsvpStatus";

export const API_EVENTS_DEFAULT_PAGE_SIZE = 25;
export const API_EVENTS_MAX_PAGE_SIZE = 100;

function isPublishedEvent(event: Doc<"events">): boolean {
  // Legacy events created before the lifecycle field are treated as published.
  return event.lifecycle !== "draft";
}

async function resolveEventFlyerUrl(ctx: QueryCtx, event: Doc<"events">): Promise<string | null> {
  if (event.flyerUrl) {
    return event.flyerUrl;
  }
  if (event.flyerStorageId) {
    return await ctx.storage.getUrl(event.flyerStorageId);
  }
  return null;
}

async function buildApiEventSummary(ctx: QueryCtx, event: Doc<"events">) {
  return {
    id: event._id,
    shortId: event.shortId ?? null,
    name: event.name,
    secondaryTitle: event.secondaryTitle ?? null,
    description: event.description ?? null,
    location: event.location,
    eventDate: event.eventDate,
    eventEndDate: event.eventEndDate ?? null,
    eventTimezone: event.eventTimezone ?? null,
    flyerUrl: await resolveEventFlyerUrl(ctx, event),
    status: event.status ?? null,
    lifecycle: event.lifecycle ?? null,
    publishedAt: event.publishedAt ?? null,
    isFeatured: event.isFeatured ?? false,
    maxAttendeesPerRsvp: event.maxAttendees ?? 1,
    workspaceSlug: event.workspaceSlug ?? null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

async function getEventInWorkspaceByRouteId(
  ctx: QueryCtx,
  workspaceSlug: string,
  eventRouteId: string,
): Promise<Doc<"events"> | null> {
  const eventByShortId = await ctx.db
    .query("events")
    .withIndex("by_shortId", (queryBuilder) => queryBuilder.eq("shortId", eventRouteId))
    .unique();

  let event = eventByShortId;
  if (!event) {
    const normalizedEventId = ctx.db.normalizeId("events", eventRouteId);
    if (normalizedEventId) {
      event = await ctx.db.get(normalizedEventId);
    }
  }

  if (!event || event.workspaceSlug !== workspaceSlug) {
    return null;
  }
  return event;
}

export const listEventsForApiClient = internalQuery({
  args: {
    workspaceSlug: v.string(),
    statusFilter: v.union(v.literal("published"), v.literal("all")),
    cursor: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const paginationResult = await ctx.db
      .query("events")
      .withIndex("by_workspaceSlug", (queryBuilder) =>
        queryBuilder.eq("workspaceSlug", args.workspaceSlug),
      )
      .order("desc")
      .paginate({ numItems: args.limit, cursor: args.cursor ?? null });

    const visibleEvents =
      args.statusFilter === "published"
        ? paginationResult.page.filter(isPublishedEvent)
        : paginationResult.page;

    return {
      data: await Promise.all(visibleEvents.map((event) => buildApiEventSummary(ctx, event))),
      nextCursor: paginationResult.isDone ? null : paginationResult.continueCursor,
    };
  },
});

export const getEventForApiClient = internalQuery({
  args: {
    workspaceSlug: v.string(),
    eventRouteId: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await getEventInWorkspaceByRouteId(ctx, args.workspaceSlug, args.eventRouteId);
    if (!event) {
      return null;
    }

    const listCredentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", event._id))
      .collect();

    const approvedCount = await countRsvpsWithAggregate(ctx, event._id, "approved");
    const pendingCount = await countRsvpsWithAggregate(ctx, event._id, "pending");
    const deniedCount = await countRsvpsWithAggregate(ctx, event._id, "denied");
    const totalCount = await countRsvpsWithAggregate(ctx, event._id, "all");

    return {
      ...(await buildApiEventSummary(ctx, event)),
      lists: listCredentials.map((listCredential) => ({
        listKey: listCredential.listKey,
        isPasswordProtected: Boolean(listCredential.passwordNormalized?.trim()),
      })),
      attendanceCounts: {
        approved: approvedCount,
        pending: pendingCount,
        denied: deniedCount,
        total: totalCount,
      },
    };
  },
});

export const lookupRsvpForPhoneForApiClient = internalQuery({
  args: {
    workspaceSlug: v.string(),
    eventRouteId: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await getEventInWorkspaceByRouteId(ctx, args.workspaceSlug, args.eventRouteId);
    if (!event) {
      return { eventFound: false as const };
    }

    const normalizedPhoneNumber = formatPhoneNumberForSms(args.phone);
    const { phoneHash } = await normalizeAndHashPhoneNumber(args.phone);

    let rsvp: Doc<"rsvps"> | null = null;
    let isGuest = false;

    const matchedUser = await ctx.db
      .query("users")
      .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phone", normalizedPhoneNumber))
      .first();
    if (matchedUser?.clerkUserId) {
      rsvp = await ctx.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", event._id).eq("clerkUserId", matchedUser.clerkUserId ?? ""),
        )
        .unique();
    }

    if (!rsvp) {
      rsvp = await ctx.db
        .query("rsvps")
        .withIndex("by_event_guestPhoneHash", (queryBuilder) =>
          queryBuilder.eq("eventId", event._id).eq("guestPhoneHash", phoneHash),
        )
        .first();
      isGuest = rsvp !== null;
    }

    if (!rsvp) {
      return { eventFound: true as const, rsvp: null };
    }

    return {
      eventFound: true as const,
      rsvp: {
        rsvpId: rsvp._id,
        approvalStatus: resolveApprovalStatus(rsvp),
        attendanceStatus: sanitizeAttendanceStatus(rsvp.attendanceStatus),
        listKey: rsvp.listKey,
        attendees: rsvp.attendees ?? 1,
        name: rsvp.userName ?? null,
        isGuest,
        createdAt: rsvp.createdAt,
        updatedAt: rsvp.updatedAt,
      },
    };
  },
});

const apiAttendanceStatusValidator = v.union(v.literal("yes"), v.literal("no"), v.literal("maybe"));

interface ApiWriteFailure {
  ok: false;
  errorCode: "not_found" | "invalid_request";
  message: string;
}

function buildApiRsvpSummary(rsvp: Doc<"rsvps">, isGuest: boolean) {
  return {
    rsvpId: rsvp._id,
    approvalStatus: resolveApprovalStatus(rsvp),
    attendanceStatus: sanitizeAttendanceStatus(rsvp.attendanceStatus),
    listKey: rsvp.listKey,
    attendees: rsvp.attendees ?? 1,
    name: rsvp.userName ?? null,
    isGuest,
    createdAt: rsvp.createdAt,
    updatedAt: rsvp.updatedAt,
  };
}

async function upsertGuestContact(
  ctx: MutationCtx,
  phoneHash: string,
  normalizedPhoneNumber: string,
) {
  const now = Date.now();
  const existingGuestContact = await ctx.db
    .query("guestContacts")
    .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
    .unique();
  if (existingGuestContact) {
    if (existingGuestContact.phoneNumber !== normalizedPhoneNumber) {
      await ctx.db.patch(existingGuestContact._id, {
        phoneNumber: normalizedPhoneNumber,
        updatedAt: now,
      });
    }
    return;
  }
  await ctx.db.insert("guestContacts", {
    phoneHash,
    phoneNumber: normalizedPhoneNumber,
    createdAt: now,
    updatedAt: now,
  });
}

export const createRsvpFromApiClient = internalMutation({
  args: {
    apiClientId: v.id("apiClients"),
    workspaceSlug: v.string(),
    eventRouteId: v.string(),
    phone: v.string(),
    name: v.string(),
    listKey: v.string(),
    attendees: v.optional(v.number()),
    attendanceStatus: v.optional(apiAttendanceStatusValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await getEventInWorkspaceByRouteId(ctx, args.workspaceSlug, args.eventRouteId);
    if (!event) {
      return {
        ok: false,
        errorCode: "not_found",
        message: "Event not found",
      } satisfies ApiWriteFailure;
    }

    // The host installed this API key, so the key is workspace-trusted and
    // list passwords are deliberately bypassed — but the list must exist.
    const listCredential = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (queryBuilder) =>
        queryBuilder.eq("eventId", event._id).eq("listKey", args.listKey),
      )
      .first();
    if (!listCredential) {
      return {
        ok: false,
        errorCode: "invalid_request",
        message: `Unknown listKey: ${args.listKey}`,
      } satisfies ApiWriteFailure;
    }

    const maxAttendeesPerRsvp = event.maxAttendees ?? 1;
    const requestedAttendees = args.attendees ?? 1;
    if (
      !Number.isInteger(requestedAttendees) ||
      requestedAttendees < 1 ||
      requestedAttendees > maxAttendeesPerRsvp
    ) {
      return {
        ok: false,
        errorCode: "invalid_request",
        message: `attendees must be an integer between 1 and ${maxAttendeesPerRsvp}`,
      } satisfies ApiWriteFailure;
    }

    const trimmedName = args.name.trim();
    if (trimmedName.length === 0) {
      return {
        ok: false,
        errorCode: "invalid_request",
        message: "name is required",
      } satisfies ApiWriteFailure;
    }

    const normalizedPhoneNumber = formatPhoneNumberForSms(args.phone);
    const { phoneHash } = await normalizeAndHashPhoneNumber(args.phone);

    // Identity precedence: attach to the real account matched by phone,
    // otherwise fall back to the synthetic guest identity.
    const matchedUser = await ctx.db
      .query("users")
      .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phone", normalizedPhoneNumber))
      .first();
    const matchedRealClerkUserId =
      matchedUser?.clerkUserId && !isGuestClerkUserId(matchedUser.clerkUserId)
        ? matchedUser.clerkUserId
        : null;

    const now = Date.now();

    let existingRsvp: Doc<"rsvps"> | null = null;
    if (matchedRealClerkUserId) {
      existingRsvp = await ctx.db
        .query("rsvps")
        .withIndex("by_event_user", (queryBuilder) =>
          queryBuilder.eq("eventId", event._id).eq("clerkUserId", matchedRealClerkUserId),
        )
        .unique();
    }
    if (!existingRsvp) {
      const guestRsvps = await ctx.db
        .query("rsvps")
        .withIndex("by_event_guestPhoneHash", (queryBuilder) =>
          queryBuilder.eq("eventId", event._id).eq("guestPhoneHash", phoneHash),
        )
        .collect();
      existingRsvp = guestRsvps.find((rsvp) => isGuestClerkUserId(rsvp.clerkUserId)) ?? null;
    }

    if (existingRsvp) {
      // Update only consumer-writable fields; approval/ticket state is
      // host-only. A no-op patch emits no webhook (prevents echo loops).
      const patch: Partial<Doc<"rsvps">> = {};
      const submittedAttendanceStatus = args.attendanceStatus;
      if (
        submittedAttendanceStatus !== undefined &&
        sanitizeAttendanceStatus(existingRsvp.attendanceStatus) !== submittedAttendanceStatus
      ) {
        patch.attendanceStatus = submittedAttendanceStatus;
      }
      if ((existingRsvp.attendees ?? 1) !== requestedAttendees && args.attendees !== undefined) {
        patch.attendees = requestedAttendees;
      }
      if (existingRsvp.userName !== trimmedName) {
        patch.userName = trimmedName;
      }
      if (args.note !== undefined && existingRsvp.note !== args.note) {
        patch.note = args.note;
      }

      if (Object.keys(patch).length > 0) {
        patch.apiClientId = args.apiClientId;
        patch.updatedAt = now;
        await ctx.db.patch(existingRsvp._id, patch);
      }

      const updatedRsvp = await ctx.db.get(existingRsvp._id);
      return {
        ok: true as const,
        created: false,
        rsvp: buildApiRsvpSummary(updatedRsvp ?? existingRsvp, !matchedRealClerkUserId),
      };
    }

    let clerkUserId: string;
    let guestFields: Partial<Doc<"rsvps">> = {};
    if (matchedRealClerkUserId) {
      clerkUserId = matchedRealClerkUserId;
    } else {
      clerkUserId = buildGuestClerkUserId(phoneHash);
      guestFields = {
        guestPhoneHash: phoneHash,
        guestPhoneObfuscated: obfuscatePhoneNumber(normalizedPhoneNumber),
      };
      // Written before the RSVP row because the webhook trigger resolves
      // guest identity at RSVP-write time.
      await upsertGuestContact(ctx, phoneHash, normalizedPhoneNumber);
    }

    const rsvpId = await ctx.db.insert("rsvps", {
      eventId: event._id,
      clerkUserId,
      listKey: args.listKey,
      ticketStatus: "not-issued",
      userName: trimmedName,
      note: args.note,
      // The consumer acts on the matched user's behalf.
      shareContact: true,
      attendees: requestedAttendees,
      status: "pending",
      approvalStatus: "pending",
      attendanceStatus: sanitizeAttendanceStatus(args.attendanceStatus),
      apiClientId: args.apiClientId,
      createdAt: now,
      updatedAt: now,
      ...guestFields,
    });

    const insertedRsvp = await ctx.db.get(rsvpId);
    if (insertedRsvp) {
      await insertRsvpIntoAggregate(ctx, insertedRsvp);
    }

    return {
      ok: true as const,
      created: true,
      rsvp: buildApiRsvpSummary(insertedRsvp as Doc<"rsvps">, !matchedRealClerkUserId),
    };
  },
});

export const updateAttendanceFromApiClient = internalMutation({
  args: {
    apiClientId: v.id("apiClients"),
    workspaceSlug: v.string(),
    rsvpId: v.string(),
    attendanceStatus: apiAttendanceStatusValidator,
  },
  handler: async (ctx, args) => {
    const notFoundFailure = {
      ok: false,
      errorCode: "not_found",
      message: "RSVP not found",
    } satisfies ApiWriteFailure;

    const normalizedRsvpId = ctx.db.normalizeId("rsvps", args.rsvpId);
    if (!normalizedRsvpId) {
      return notFoundFailure;
    }
    const rsvp = await ctx.db.get(normalizedRsvpId);
    if (!rsvp) {
      return notFoundFailure;
    }

    // Cross-workspace access reads as not-found — do not leak existence.
    const event = await ctx.db.get(rsvp.eventId);
    if (!event || event.workspaceSlug !== args.workspaceSlug) {
      return notFoundFailure;
    }

    if (sanitizeAttendanceStatus(rsvp.attendanceStatus) !== args.attendanceStatus) {
      await ctx.db.patch(normalizedRsvpId, {
        attendanceStatus: args.attendanceStatus,
        apiClientId: args.apiClientId,
        updatedAt: Date.now(),
      });
    }

    const updatedRsvp = await ctx.db.get(normalizedRsvpId);
    return {
      ok: true as const,
      rsvp: buildApiRsvpSummary(updatedRsvp ?? rsvp, isGuestClerkUserId(rsvp.clerkUserId)),
    };
  },
});
