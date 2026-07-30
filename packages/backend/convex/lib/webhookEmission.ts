import { API_VERSION, type CoucouWebhookEventType } from "@coucou/sdk/api-v1";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isGuestClerkUserId } from "./guestIdentity";
import { partnerResourceCanAccessEvent } from "./partnerEventAccess";
import { normalizeAndHashPhoneNumber } from "./phoneHash";
import { resolveApprovalStatus, sanitizeAttendanceStatus } from "./rsvpStatus";
import { buildRsvpTicketSnapshot } from "./rsvpTicketSnapshot";

interface RsvpChange {
  operation: "insert" | "update" | "delete";
  oldDoc: Doc<"rsvps"> | null;
  newDoc: Doc<"rsvps"> | null;
}

interface EventChange {
  operation: "insert" | "update" | "delete";
  oldDoc: Doc<"events"> | null;
  newDoc: Doc<"events"> | null;
}

// Event fields visible to partner integrations. Changes to any other field
// (theming, SMS copy, form config, ...) do not emit event.updated.
const PUBLIC_EVENT_FIELDS = [
  "name",
  "secondaryTitle",
  "description",
  "location",
  "eventDate",
  "eventEndDate",
  "eventTimezone",
  "flyerUrl",
  "flyerStorageId",
  "maxAttendees",
  "status",
] as const satisfies readonly (keyof Doc<"events">)[];

function isPublishedEvent(event: Doc<"events">): boolean {
  // Legacy events created before the lifecycle field are treated as published.
  return event.lifecycle !== "draft";
}

export function determineRsvpWebhookEventType(change: {
  operation: "insert" | "update" | "delete";
  oldDoc: Doc<"rsvps"> | null;
  newDoc: Doc<"rsvps"> | null;
}): CoucouWebhookEventType | null {
  if (change.operation === "insert") {
    return "rsvp.created";
  }
  if (change.operation === "delete") {
    return "rsvp.deleted";
  }

  const oldRsvp = change.oldDoc;
  const newRsvp = change.newDoc;
  if (!oldRsvp || !newRsvp) {
    return null;
  }

  const previousApprovalStatus = resolveApprovalStatus(oldRsvp);
  const nextApprovalStatus = resolveApprovalStatus(newRsvp);
  if (previousApprovalStatus !== nextApprovalStatus) {
    if (nextApprovalStatus === "approved") {
      return "rsvp.approved";
    }
    if (nextApprovalStatus === "denied") {
      return "rsvp.denied";
    }
    return "rsvp.updated";
  }

  if (oldRsvp.attendanceStatus !== newRsvp.attendanceStatus) {
    return "rsvp.attendance_updated";
  }

  if (
    oldRsvp.listKey !== newRsvp.listKey ||
    (oldRsvp.attendees ?? 1) !== (newRsvp.attendees ?? 1) ||
    oldRsvp.userName !== newRsvp.userName ||
    oldRsvp.clerkUserId !== newRsvp.clerkUserId
  ) {
    return "rsvp.updated";
  }

  // Everything else (updatedAt-only sync patches, ticket status flips, SMS
  // consent changes, migration backfills) is internal — no emission.
  return null;
}

export function determineEventWebhookEventType(change: {
  operation: "insert" | "update" | "delete";
  oldDoc: Doc<"events"> | null;
  newDoc: Doc<"events"> | null;
}): CoucouWebhookEventType | null {
  if (change.operation === "delete") {
    return "event.deleted";
  }

  if (change.operation === "insert") {
    return change.newDoc && isPublishedEvent(change.newDoc) ? "event.published" : null;
  }

  const oldEvent = change.oldDoc;
  const newEvent = change.newDoc;
  if (!oldEvent || !newEvent) {
    return null;
  }

  const wasPublished = isPublishedEvent(oldEvent);
  const isPublished = isPublishedEvent(newEvent);
  if (!wasPublished && isPublished) {
    return "event.published";
  }
  if (wasPublished && !isPublished) {
    return "event.unpublished";
  }
  if (!isPublished) {
    return null; // draft edits are invisible to partners
  }

  const hasPublicFieldChange = PUBLIC_EVENT_FIELDS.some(
    (fieldName) => oldEvent[fieldName] !== newEvent[fieldName],
  );
  return hasPublicFieldChange ? "event.updated" : null;
}

function buildEventSnapshot(event: Doc<"events">) {
  return {
    id: event._id,
    shortId: event.shortId ?? null,
    name: event.name,
    eventDate: event.eventDate,
    eventEndDate: event.eventEndDate ?? null,
    eventTimezone: event.eventTimezone ?? null,
    location: event.location,
    // Stored column only — storage URL resolution is not available in mutations;
    // consumers can GET /api/v1/events/{id} for a resolved flyer URL.
    flyerUrl: event.flyerUrl ?? null,
  };
}

async function resolveRsvpIdentity(ctx: MutationCtx, rsvp: Doc<"rsvps">) {
  if (isGuestClerkUserId(rsvp.clerkUserId)) {
    let guestPhoneNumber: string | null = null;
    const guestPhoneHash = rsvp.guestPhoneHash;
    if (guestPhoneHash) {
      const guestContact = await ctx.db
        .query("guestContacts")
        .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", guestPhoneHash))
        .unique();
      guestPhoneNumber = guestContact?.phoneNumber ?? null;
    }
    return {
      phone: guestPhoneNumber,
      phoneHash: rsvp.guestPhoneHash ?? null,
      name: rsvp.userName ?? null,
      isGuest: true,
    };
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", rsvp.clerkUserId))
    .first();
  const phone = user?.phone ?? null;
  const phoneHash = phone ? (await normalizeAndHashPhoneNumber(phone)).phoneHash : null;
  return {
    phone,
    phoneHash,
    name: rsvp.userName ?? null,
    isGuest: false,
  };
}

async function findActiveEndpointsForEventType(
  ctx: MutationCtx,
  workspaceSlug: string,
  eventId: Doc<"events">["_id"],
  eventType: CoucouWebhookEventType,
): Promise<{ workspace: Doc<"workspaces">; endpoints: Doc<"webhookEndpoints">[] } | null> {
  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", workspaceSlug))
    .unique();
  if (!workspace) {
    return null;
  }

  const activeEndpoints = await ctx.db
    .query("webhookEndpoints")
    .withIndex("by_workspace_active", (queryBuilder) =>
      queryBuilder.eq("workspaceId", workspace._id).eq("isActive", true),
    )
    .collect();

  const endpoints = activeEndpoints.filter(
    (endpoint) =>
      endpoint.subscribedEventTypes.includes(eventType) &&
      partnerResourceCanAccessEvent(endpoint, eventId),
  );
  return { workspace, endpoints };
}

function resolveRsvpWebhookOrigin(
  change: RsvpChange,
): { type: "api"; apiClientId: string } | { type: "app" } {
  const rsvp = change.newDoc ?? change.oldDoc;
  if (!rsvp || change.operation === "delete") {
    return { type: "app" };
  }

  const hasNewApiMutation =
    change.operation === "insert"
      ? Boolean(rsvp.webhookOriginMutationId)
      : change.oldDoc?.webhookOriginMutationId !== change.newDoc?.webhookOriginMutationId;
  if (hasNewApiMutation && rsvp.webhookOriginApiClientId) {
    return { type: "api", apiClientId: rsvp.webhookOriginApiClientId };
  }
  return { type: "app" };
}

function resolveEventWebhookOrigin(
  change: EventChange,
): { type: "api"; apiClientId: string } | { type: "app" } {
  const event = change.newDoc ?? change.oldDoc;
  if (!event || change.operation === "delete") {
    return { type: "app" };
  }

  const hasNewApiMutation =
    change.operation === "insert"
      ? Boolean(event.webhookOriginMutationId)
      : change.oldDoc?.webhookOriginMutationId !== change.newDoc?.webhookOriginMutationId;
  if (hasNewApiMutation && event.webhookOriginApiClientId) {
    return { type: "api", apiClientId: event.webhookOriginApiClientId };
  }
  return { type: "app" };
}

async function enqueueDeliveries(
  ctx: MutationCtx,
  {
    workspace,
    endpoints,
    eventType,
    payloadWithoutDeliveryId,
    eventId,
    rsvpId,
  }: {
    workspace: Doc<"workspaces">;
    endpoints: Doc<"webhookEndpoints">[];
    eventType: CoucouWebhookEventType;
    payloadWithoutDeliveryId: Record<string, unknown>;
    eventId?: Doc<"events">["_id"];
    rsvpId?: Doc<"rsvps">["_id"];
  },
) {
  const now = Date.now();
  for (const endpoint of endpoints) {
    const deliveryId = await ctx.db.insert("webhookDeliveries", {
      endpointId: endpoint._id,
      workspaceId: workspace._id,
      eventType,
      eventId,
      rsvpId,
      // deliveryId is injected into the payload at dispatch time.
      payloadJson: JSON.stringify(payloadWithoutDeliveryId),
      status: "pending",
      attemptCount: 0,
      occurredAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.webhookDispatch.attemptDelivery, { deliveryId });
  }
}

export async function enqueueRsvpWebhookDeliveries(
  ctx: MutationCtx,
  change: RsvpChange,
): Promise<void> {
  const eventType = determineRsvpWebhookEventType(change);
  if (!eventType) {
    return;
  }

  const rsvp = change.newDoc ?? change.oldDoc;
  if (!rsvp) {
    return;
  }

  // If the event row is already gone (event-delete cascade), skip per-RSVP
  // emissions — consumers get the single event.deleted notification instead.
  const event = await ctx.db.get(rsvp.eventId);
  if (!event?.workspaceSlug) {
    return;
  }

  const endpointMatch = await findActiveEndpointsForEventType(
    ctx,
    event.workspaceSlug,
    event._id,
    eventType,
  );
  if (!endpointMatch || endpointMatch.endpoints.length === 0) {
    return;
  }

  const identity = await resolveRsvpIdentity(ctx, rsvp);
  const ticket = await buildRsvpTicketSnapshot(ctx, event, rsvp);
  const previousRsvp = change.operation === "update" ? change.oldDoc : null;

  const payloadWithoutDeliveryId = {
    apiVersion: API_VERSION,
    eventType,
    occurredAt: Date.now(),
    workspaceSlug: event.workspaceSlug,
    data: {
      event: buildEventSnapshot(event),
      rsvp: {
        id: rsvp._id,
        listKey: rsvp.listKey,
        approvalStatus: resolveApprovalStatus(rsvp),
        attendanceStatus: sanitizeAttendanceStatus(rsvp.attendanceStatus),
        attendees: rsvp.attendees ?? 1,
        createdAt: rsvp.createdAt,
        updatedAt: rsvp.updatedAt,
      },
      identity,
      ...(ticket ? { ticket } : {}),
      origin: resolveRsvpWebhookOrigin(change),
      ...(previousRsvp
        ? {
            changes: {
              previousApprovalStatus: resolveApprovalStatus(previousRsvp),
              previousAttendanceStatus: previousRsvp.attendanceStatus ?? null,
            },
          }
        : {}),
    },
  };

  await enqueueDeliveries(ctx, {
    workspace: endpointMatch.workspace,
    endpoints: endpointMatch.endpoints,
    eventType,
    payloadWithoutDeliveryId,
    eventId: event._id,
    rsvpId: rsvp._id,
  });
}

export async function enqueueEventWebhookDeliveries(
  ctx: MutationCtx,
  change: EventChange,
): Promise<void> {
  const eventType = determineEventWebhookEventType(change);
  if (!eventType) {
    return;
  }

  const event = change.newDoc ?? change.oldDoc;
  if (!event?.workspaceSlug) {
    return;
  }

  const endpointMatch = await findActiveEndpointsForEventType(
    ctx,
    event.workspaceSlug,
    event._id,
    eventType,
  );
  if (!endpointMatch || endpointMatch.endpoints.length === 0) {
    return;
  }

  const previousEvent = change.operation === "update" ? change.oldDoc : null;
  const changedPublicFields = previousEvent
    ? PUBLIC_EVENT_FIELDS.filter(
        (fieldName) => previousEvent[fieldName] !== change.newDoc?.[fieldName],
      )
    : [];

  const payloadWithoutDeliveryId = {
    apiVersion: API_VERSION,
    eventType,
    occurredAt: Date.now(),
    workspaceSlug: event.workspaceSlug,
    data: {
      event: buildEventSnapshot(event),
      origin: resolveEventWebhookOrigin(change),
      ...(previousEvent
        ? {
            changes: {
              changedFields: changedPublicFields,
              previous: {
                eventDate: previousEvent.eventDate,
                eventEndDate: previousEvent.eventEndDate ?? null,
                location: previousEvent.location,
                status: previousEvent.status ?? null,
              },
            },
          }
        : {}),
    },
  };

  await enqueueDeliveries(ctx, {
    workspace: endpointMatch.workspace,
    endpoints: endpointMatch.endpoints,
    eventType,
    payloadWithoutDeliveryId,
    eventId: event._id,
  });
}
