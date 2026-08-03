import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./functions";
import { buildApiSmsProgram } from "./lib/apiSmsProgram";
import { normalizeCredentialPassword } from "./lib/credentialPasswords";
import { buildGuestClerkUserId, isGuestClerkUserId } from "./lib/guestIdentity";
import { partnerResourceCanAccessEvent } from "./lib/partnerEventAccess";
import { normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { formatPhoneNumberForSms, obfuscatePhoneNumber } from "./lib/phoneUtils";
import {
  buildInvitedByPatch,
  collectRequiredPrimaryFieldErrors,
  sanitizeSubmittedSocialProfiles,
  submittedSocialProfileValidator,
} from "./lib/primaryFields";
import { createProfileValuesAndWorkspaceGrantsForSocialProfiles } from "./lib/profileValueRecords";
import {
  countRsvpsWithAggregate,
  insertRsvpIntoAggregate,
  updateRsvpInAggregate,
} from "./lib/rsvpAggregate";
import { tryAutoApproveRsvp } from "./lib/rsvpApproval";
import { resolveApprovalStatus, sanitizeAttendanceStatus } from "./lib/rsvpStatus";
import { buildRsvpTicketSnapshot } from "./lib/rsvpTicketSnapshot";
import {
  resolveSmsOrganizerPreference,
  upsertSmsOrganizerPreference,
} from "./lib/smsOrganizerPreferences";
import { replaceRsvpSocialProfileSnapshots } from "./lib/socialProfileRecords";

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

async function getApiClientInWorkspace(
  ctx: QueryCtx | MutationCtx,
  apiClientId: Doc<"apiClients">["_id"],
  workspaceSlug: string,
): Promise<Doc<"apiClients"> | null> {
  const [apiClient, workspace] = await Promise.all([
    ctx.db.get(apiClientId),
    ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", workspaceSlug))
      .unique(),
  ]);
  if (!apiClient || !workspace || apiClient.workspaceId !== workspace._id) {
    return null;
  }
  return apiClient;
}

async function getAuthorizedEventForApiClient(
  ctx: QueryCtx | MutationCtx,
  apiClientId: Doc<"apiClients">["_id"],
  workspaceSlug: string,
  eventRouteId: string,
): Promise<Doc<"events"> | null> {
  const [apiClient, event] = await Promise.all([
    getApiClientInWorkspace(ctx, apiClientId, workspaceSlug),
    getEventInWorkspaceByRouteId(ctx, workspaceSlug, eventRouteId),
  ]);
  if (!apiClient || !event || !partnerResourceCanAccessEvent(apiClient, event._id)) {
    return null;
  }
  return event;
}

export const listEventsForApiClient = internalQuery({
  args: {
    apiClientId: v.id("apiClients"),
    workspaceSlug: v.string(),
    statusFilter: v.union(v.literal("published"), v.literal("all")),
    cursor: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const apiClient = await getApiClientInWorkspace(ctx, args.apiClientId, args.workspaceSlug);
    if (!apiClient) {
      return { data: [], nextCursor: null };
    }
    const paginationResult = await ctx.db
      .query("events")
      .withIndex("by_workspaceSlug", (queryBuilder) =>
        queryBuilder.eq("workspaceSlug", args.workspaceSlug),
      )
      .order("desc")
      .paginate({ numItems: args.limit, cursor: args.cursor ?? null });

    const authorizedEvents = paginationResult.page.filter((event) =>
      partnerResourceCanAccessEvent(apiClient, event._id),
    );
    const visibleEvents =
      args.statusFilter === "published"
        ? authorizedEvents.filter(isPublishedEvent)
        : authorizedEvents;

    return {
      data: await Promise.all(visibleEvents.map((event) => buildApiEventSummary(ctx, event))),
      nextCursor: paginationResult.isDone ? null : paginationResult.continueCursor,
    };
  },
});

export const getEventForApiClient = internalQuery({
  args: {
    apiClientId: v.id("apiClients"),
    workspaceSlug: v.string(),
    eventRouteId: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await getAuthorizedEventForApiClient(
      ctx,
      args.apiClientId,
      args.workspaceSlug,
      args.eventRouteId,
    );
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
        generatesQrCode: listCredential.generateQR === true,
      })),
      rsvpForm: {
        attendanceQuestionEnabled: event.attendanceQuestionEnabled === true,
        maxAttendees: event.maxAttendees ?? 1,
        acceptsListPassword: listCredentials.some((credential) =>
          Boolean(credential.passwordNormalized?.trim()),
        ),
        customFields: (event.customFields ?? []).map((field) => ({
          key: field.key,
          label: field.label,
          placeholder: field.placeholder,
          required: field.required === true,
          trimWhitespace: field.trimWhitespace !== false,
        })),
        socialPlatforms: (event.primaryFieldConfig?.socialPlatforms ?? []).map((platform) => ({
          platformKey: platform.platformKey,
          label: platform.label,
          placeholder: platform.placeholder,
          profileUrlPrefix: platform.profileUrlPrefix,
          required: platform.required === true,
        })),
        invitedBy:
          event.primaryFieldConfig?.invitedBy?.enabled === true
            ? {
                enabled: true,
                label: event.primaryFieldConfig.invitedBy.label,
                placeholder: event.primaryFieldConfig.invitedBy.placeholder,
                required: event.primaryFieldConfig.invitedBy.required === true,
              }
            : null,
      },
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
    apiClientId: v.id("apiClients"),
    workspaceSlug: v.string(),
    eventRouteId: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await getAuthorizedEventForApiClient(
      ctx,
      args.apiClientId,
      args.workspaceSlug,
      args.eventRouteId,
    );
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
      rsvp: await buildApiRsvpSummary(ctx, event, rsvp, isGuest),
    };
  },
});

export const getSmsConsentForApiClient = internalQuery({
  args: {
    apiClientId: v.id("apiClients"),
    workspaceSlug: v.string(),
    eventRouteId: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await getAuthorizedEventForApiClient(
      ctx,
      args.apiClientId,
      args.workspaceSlug,
      args.eventRouteId,
    );
    if (!event) {
      return { eventFound: false as const };
    }

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", args.workspaceSlug))
      .unique();
    if (!workspace) {
      return { eventFound: false as const };
    }

    const smsProgram = await buildApiSmsProgram(ctx, workspace);
    if (!args.phone?.trim()) {
      return {
        eventFound: true as const,
        smsConsent: null,
        smsConsentTimestamp: null,
        smsProgram,
      };
    }

    const normalizedPhoneNumber = formatPhoneNumberForSms(args.phone);
    const { phoneHash } = await normalizeAndHashPhoneNumber(args.phone);
    const matchedUser = await ctx.db
      .query("users")
      .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phone", normalizedPhoneNumber))
      .first();
    const clerkUserId =
      matchedUser?.clerkUserId && !isGuestClerkUserId(matchedUser.clerkUserId)
        ? matchedUser.clerkUserId
        : buildGuestClerkUserId(phoneHash);
    const preference = await resolveSmsOrganizerPreference(ctx, {
      clerkUserId,
      event,
      siteKey: event.siteKey,
    });

    return {
      eventFound: true as const,
      smsConsent: preference.smsConsent,
      smsConsentTimestamp: preference.smsConsentTimestamp ?? null,
      smsProgram,
    };
  },
});

const apiAttendanceStatusValidator = v.union(v.literal("yes"), v.literal("no"), v.literal("maybe"));

interface ApiWriteFailure {
  ok: false;
  errorCode: "not_found" | "invalid_request" | "conflict";
  message: string;
  field?: string;
}

async function buildApiRsvpSummary(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  rsvp: Doc<"rsvps">,
  isGuest: boolean,
) {
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
    ticket: await buildRsvpTicketSnapshot(ctx, event, rsvp),
  };
}

async function buildApiRsvpContactSummary(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  rsvp: Doc<"rsvps">,
) {
  const isGuest = isGuestClerkUserId(rsvp.clerkUserId);
  let phone: string | null = null;
  let phoneHash: string | null = rsvp.guestPhoneHash ?? null;

  if (isGuest && rsvp.guestPhoneHash) {
    const guestContact = await ctx.db
      .query("guestContacts")
      .withIndex("by_phoneHash", (queryBuilder) =>
        queryBuilder.eq("phoneHash", rsvp.guestPhoneHash ?? ""),
      )
      .unique();
    phone = guestContact?.phoneNumber ?? null;
  } else if (!isGuest) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", rsvp.clerkUserId),
      )
      .first();
    phone = user?.phone ?? null;
    phoneHash = phone ? (await normalizeAndHashPhoneNumber(phone)).phoneHash : null;
  }

  return {
    ...(await buildApiRsvpSummary(ctx, event, rsvp, isGuest)),
    phone,
    phoneHash,
  };
}

export const listRsvpsForApiClient = internalQuery({
  args: {
    apiClientId: v.id("apiClients"),
    workspaceSlug: v.string(),
    eventRouteId: v.string(),
    cursor: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await getAuthorizedEventForApiClient(
      ctx,
      args.apiClientId,
      args.workspaceSlug,
      args.eventRouteId,
    );
    if (!event) {
      return { eventFound: false as const };
    }

    const paginationResult = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", event._id))
      .order("desc")
      .paginate({
        numItems: args.limit,
        cursor: args.cursor ?? null,
      });

    return {
      eventFound: true as const,
      data: await Promise.all(
        paginationResult.page.map((rsvp) => buildApiRsvpContactSummary(ctx, event, rsvp)),
      ),
      nextCursor: paginationResult.isDone ? null : paginationResult.continueCursor,
    };
  },
});

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

type ApiRsvpListSelectorField = "listPassword" | "listKey";

async function resolveListCredentialForApiWrite(
  ctx: MutationCtx,
  event: Doc<"events">,
  apiClientId: Doc<"apiClients">["_id"],
  input: { listPassword?: string; listKey?: string },
): Promise<
  | {
      ok: true;
      listCredential: Doc<"listCredentials">;
      selectorField: ApiRsvpListSelectorField;
    }
  | ApiWriteFailure
> {
  const listCredentials = await ctx.db
    .query("listCredentials")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", event._id))
    .collect();
  const submittedPassword = input.listPassword?.trim();
  if (submittedPassword) {
    const normalizedPassword = normalizeCredentialPassword(submittedPassword);
    const matchedCredential = listCredentials.find(
      (credential) => credential.passwordNormalized === normalizedPassword,
    );
    if (!matchedCredential) {
      return {
        ok: false,
        errorCode: "invalid_request",
        message: "That list password is not valid for this event",
        field: "listPassword",
      };
    }
    return { ok: true, listCredential: matchedCredential, selectorField: "listPassword" };
  }

  const submittedListKey = input.listKey?.trim();
  if (submittedListKey) {
    const matchedCredential = listCredentials.find(
      (credential) => credential.listKey === submittedListKey,
    );
    if (!matchedCredential) {
      return {
        ok: false,
        errorCode: "invalid_request",
        message: `Unknown listKey: ${submittedListKey}`,
        field: "listKey",
      };
    }
    return { ok: true, listCredential: matchedCredential, selectorField: "listKey" };
  }

  const apiClient = await ctx.db.get(apiClientId);
  const defaultRsvpListKey = apiClient?.defaultRsvpListKey?.trim();
  if (defaultRsvpListKey) {
    const matchedCredential = listCredentials.find(
      (credential) => credential.listKey === defaultRsvpListKey,
    );
    if (!matchedCredential) {
      return {
        ok: false,
        errorCode: "conflict",
        message: `The API client's default RSVP list (${defaultRsvpListKey}) is not configured for this event`,
        field: "listKey",
      };
    }
    return { ok: true, listCredential: matchedCredential, selectorField: "listKey" };
  }

  const fallbackCredential =
    listCredentials.find((credential) => credential.listKey === "ga") ??
    listCredentials.find((credential) => !credential.passwordNormalized?.trim()) ??
    listCredentials[0];
  if (!fallbackCredential) {
    return {
      ok: false,
      errorCode: "conflict",
      message: "This event has no RSVP lists configured",
      field: "listKey",
    };
  }
  return { ok: true, listCredential: fallbackCredential, selectorField: "listKey" };
}

function sanitizeApiCustomFieldValues(
  event: Doc<"events">,
  submittedValues: Record<string, string> | undefined,
): { ok: true; values: Record<string, string> | undefined } | ApiWriteFailure {
  const sanitizedValues: Record<string, string> = {};
  for (const field of event.customFields ?? []) {
    const rawValue = submittedValues?.[field.key];
    const value =
      rawValue === undefined ? "" : field.trimWhitespace === false ? rawValue : rawValue.trim();
    if (field.required === true && value.length === 0) {
      return {
        ok: false,
        errorCode: "invalid_request",
        message: `${field.label} is required`,
        field: `customFieldValues.${field.key}`,
      };
    }
    if (value.length > 0) {
      sanitizedValues[field.key] = value;
    }
  }

  return {
    ok: true,
    values: Object.keys(sanitizedValues).length > 0 ? sanitizedValues : undefined,
  };
}

export const createRsvpFromApiClient = internalMutation({
  args: {
    apiClientId: v.id("apiClients"),
    workspaceSlug: v.string(),
    eventRouteId: v.string(),
    phone: v.string(),
    name: v.string(),
    listKey: v.optional(v.string()),
    listPassword: v.optional(v.string()),
    attendees: v.optional(v.number()),
    attendanceStatus: v.optional(apiAttendanceStatusValidator),
    note: v.optional(v.string()),
    customFieldValues: v.optional(v.record(v.string(), v.string())),
    socialProfiles: v.optional(v.array(submittedSocialProfileValidator)),
    invitedByName: v.optional(v.string()),
    smsConsent: v.optional(v.boolean()),
    smsConsentIpAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await getAuthorizedEventForApiClient(
      ctx,
      args.apiClientId,
      args.workspaceSlug,
      args.eventRouteId,
    );
    if (!event) {
      return {
        ok: false,
        errorCode: "not_found",
        message: "Event not found",
      } satisfies ApiWriteFailure;
    }

    const resolvedList = await resolveListCredentialForApiWrite(ctx, event, args.apiClientId, {
      listPassword: args.listPassword,
      listKey: args.listKey,
    });
    if (!resolvedList.ok) {
      return resolvedList;
    }
    const selectedListKey = resolvedList.listCredential.listKey;

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
        field: "attendees",
      } satisfies ApiWriteFailure;
    }

    const trimmedName = args.name.trim();
    if (trimmedName.length === 0) {
      return {
        ok: false,
        errorCode: "invalid_request",
        message: "name is required",
        field: "name",
      } satisfies ApiWriteFailure;
    }

    const sanitizedCustomFields = sanitizeApiCustomFieldValues(event, args.customFieldValues);
    if (!sanitizedCustomFields.ok) {
      return sanitizedCustomFields;
    }

    const sanitizedSocialProfiles = sanitizeSubmittedSocialProfiles(
      args.socialProfiles,
      event.primaryFieldConfig,
    );
    const primaryFieldErrors = collectRequiredPrimaryFieldErrors({
      primaryFieldConfig: event.primaryFieldConfig,
      submittedProfiles: sanitizedSocialProfiles,
      invitedByName: args.invitedByName,
    });
    if (primaryFieldErrors.length > 0) {
      const submittedPlatformKeys = new Set(
        sanitizedSocialProfiles.map((profile) => profile.platformKey),
      );
      const missingSocialPlatform = event.primaryFieldConfig?.socialPlatforms?.find(
        (platform) =>
          platform.required === true && !submittedPlatformKeys.has(platform.platformKey),
      );
      return {
        ok: false,
        errorCode: "invalid_request",
        message: primaryFieldErrors[0],
        field: missingSocialPlatform
          ? `socialProfiles.${missingSocialPlatform.platformKey}`
          : "invitedByName",
      } satisfies ApiWriteFailure;
    }
    const invitedByPatch =
      event.primaryFieldConfig?.invitedBy?.enabled === true
        ? buildInvitedByPatch(args.invitedByName)
        : {};

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
    const clerkUserId = matchedRealClerkUserId ?? buildGuestClerkUserId(phoneHash);
    const existingOrganizerPreference = await resolveSmsOrganizerPreference(ctx, {
      clerkUserId,
      event,
      siteKey: event.siteKey,
    });
    const smsConsentChange =
      args.smsConsent === undefined || args.smsConsent === existingOrganizerPreference.smsConsent
        ? null
        : args.smsConsent
          ? "enabled"
          : "disabled";
    const sanitizedSmsConsentIpAddress =
      args.smsConsent === true && typeof args.smsConsentIpAddress === "string"
        ? args.smsConsentIpAddress.slice(0, 256)
        : undefined;

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
      const existingApprovalStatus = resolveApprovalStatus(existingRsvp);
      if (existingApprovalStatus === "denied" && existingRsvp.listKey === selectedListKey) {
        return {
          ok: false,
          errorCode: "conflict",
          message: "Denied for this list; try a different list password",
          field: resolvedList.selectorField,
        } satisfies ApiWriteFailure;
      }
      if (existingApprovalStatus === "approved" && existingRsvp.listKey !== selectedListKey) {
        return {
          ok: false,
          errorCode: "conflict",
          message: "An approved RSVP cannot be moved to another list",
          field: resolvedList.selectorField,
        } satisfies ApiWriteFailure;
      }

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
      if (args.customFieldValues !== undefined) {
        patch.customFieldValues = sanitizedCustomFields.values;
      }
      if (args.smsConsent !== undefined) {
        patch.smsConsent = args.smsConsent;
        patch.smsConsentTimestamp = now;
        patch.smsConsentIpAddress =
          args.smsConsent === true
            ? (sanitizedSmsConsentIpAddress ?? existingRsvp.smsConsentIpAddress)
            : existingRsvp.smsConsentIpAddress;
      }
      Object.assign(patch, invitedByPatch);

      if (existingRsvp.listKey !== selectedListKey) {
        patch.listKey = selectedListKey;
        patch.status = "pending";
        patch.approvalStatus = "pending";
        patch.ticketStatus = "not-issued";
      }

      if (Object.keys(patch).length > 0) {
        const oldRsvp = existingRsvp;
        patch.apiClientId = args.apiClientId;
        patch.webhookOriginApiClientId = args.apiClientId;
        patch.webhookOriginMutationId = crypto.randomUUID();
        patch.updatedAt = now;
        await ctx.db.patch(existingRsvp._id, patch);
        const aggregateRsvp = await ctx.db.get(existingRsvp._id);
        if (aggregateRsvp) {
          await updateRsvpInAggregate(ctx, oldRsvp, aggregateRsvp);
          if (existingApprovalStatus !== "approved" && oldRsvp.listKey !== aggregateRsvp.listKey) {
            await tryAutoApproveRsvp(ctx, aggregateRsvp);
          }
        }
      }

      if (sanitizedSocialProfiles.length > 0) {
        await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
          event,
          rsvpId: existingRsvp._id,
          clerkUserId: existingRsvp.clerkUserId,
          userId: matchedUser?._id,
          submittedProfiles: sanitizedSocialProfiles,
        });
        await replaceRsvpSocialProfileSnapshots(ctx, {
          eventId: event._id,
          rsvpId: existingRsvp._id,
          clerkUserId: existingRsvp.clerkUserId,
          userId: matchedUser?._id,
          configuredPlatformKeys: new Set(
            sanitizedSocialProfiles.map((profile) => profile.platformKey),
          ),
          submittedProfiles: sanitizedSocialProfiles,
        });
      }

      if (args.smsConsent !== undefined) {
        await upsertSmsOrganizerPreference(ctx, {
          clerkUserId,
          event,
          siteKey: event.siteKey,
          smsConsent: args.smsConsent,
          smsConsentIpAddress: sanitizedSmsConsentIpAddress ?? existingRsvp.smsConsentIpAddress,
          sourceEventId: event._id,
          sourceRsvpId: existingRsvp._id,
          now,
        });
      }
      if (smsConsentChange) {
        await ctx.scheduler.runAfter(0, api.notifications.sendSmsConsentStatusMessage, {
          eventId: event._id,
          clerkUserId,
          consentEnabled: smsConsentChange === "enabled",
          phoneNumber: normalizedPhoneNumber,
          organizerName: existingOrganizerPreference.organizerName,
        });
      }

      const updatedRsvp = await ctx.db.get(existingRsvp._id);
      return {
        ok: true as const,
        created: false,
        rsvp: await buildApiRsvpSummary(
          ctx,
          event,
          updatedRsvp ?? existingRsvp,
          isGuestClerkUserId((updatedRsvp ?? existingRsvp).clerkUserId),
        ),
      };
    }

    let guestFields: Partial<Doc<"rsvps">> = {};
    if (!matchedRealClerkUserId) {
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
      listKey: selectedListKey,
      ticketStatus: "not-issued",
      userName: trimmedName,
      note: args.note,
      // The consumer acts on the matched user's behalf.
      shareContact: true,
      attendees: requestedAttendees,
      customFieldValues: sanitizedCustomFields.values,
      smsConsent: args.smsConsent,
      smsConsentTimestamp: args.smsConsent !== undefined ? now : undefined,
      smsConsentIpAddress: sanitizedSmsConsentIpAddress,
      ...invitedByPatch,
      status: "pending",
      approvalStatus: "pending",
      attendanceStatus: sanitizeAttendanceStatus(args.attendanceStatus),
      apiClientId: args.apiClientId,
      webhookOriginApiClientId: args.apiClientId,
      webhookOriginMutationId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...guestFields,
    });

    const insertedRsvp = await ctx.db.get(rsvpId);
    let finalizedRsvp = insertedRsvp;
    if (insertedRsvp) {
      await insertRsvpIntoAggregate(ctx, insertedRsvp);
      await tryAutoApproveRsvp(ctx, insertedRsvp);
      finalizedRsvp = await ctx.db.get(rsvpId);
    }

    if (insertedRsvp && sanitizedSocialProfiles.length > 0) {
      await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
        event,
        rsvpId,
        clerkUserId,
        userId: matchedUser?._id,
        submittedProfiles: sanitizedSocialProfiles,
      });
      await replaceRsvpSocialProfileSnapshots(ctx, {
        eventId: event._id,
        rsvpId,
        clerkUserId,
        userId: matchedUser?._id,
        configuredPlatformKeys: new Set(
          sanitizedSocialProfiles.map((profile) => profile.platformKey),
        ),
        submittedProfiles: sanitizedSocialProfiles,
      });
    }

    if (args.smsConsent !== undefined) {
      await upsertSmsOrganizerPreference(ctx, {
        clerkUserId,
        event,
        siteKey: event.siteKey,
        smsConsent: args.smsConsent,
        smsConsentIpAddress: sanitizedSmsConsentIpAddress,
        sourceEventId: event._id,
        sourceRsvpId: rsvpId,
        now,
      });
    }
    if (smsConsentChange) {
      await ctx.scheduler.runAfter(0, api.notifications.sendSmsConsentStatusMessage, {
        eventId: event._id,
        clerkUserId,
        consentEnabled: smsConsentChange === "enabled",
        phoneNumber: normalizedPhoneNumber,
        organizerName: existingOrganizerPreference.organizerName,
      });
    }

    return {
      ok: true as const,
      created: true,
      rsvp: await buildApiRsvpSummary(
        ctx,
        event,
        finalizedRsvp as Doc<"rsvps">,
        !matchedRealClerkUserId,
      ),
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
    const apiClient = await getApiClientInWorkspace(ctx, args.apiClientId, args.workspaceSlug);
    if (
      !event ||
      event.workspaceSlug !== args.workspaceSlug ||
      !apiClient ||
      !partnerResourceCanAccessEvent(apiClient, event._id)
    ) {
      return notFoundFailure;
    }

    if (sanitizeAttendanceStatus(rsvp.attendanceStatus) !== args.attendanceStatus) {
      await ctx.db.patch(normalizedRsvpId, {
        attendanceStatus: args.attendanceStatus,
        apiClientId: args.apiClientId,
        webhookOriginApiClientId: args.apiClientId,
        webhookOriginMutationId: crypto.randomUUID(),
        updatedAt: Date.now(),
      });
    }

    const updatedRsvp = await ctx.db.get(normalizedRsvpId);
    return {
      ok: true as const,
      rsvp: await buildApiRsvpSummary(
        ctx,
        event,
        updatedRsvp ?? rsvp,
        isGuestClerkUserId(rsvp.clerkUserId),
      ),
    };
  },
});

// Event fields a partner API consumer may update. Lifecycle, publish state,
// approval flows, theming, and form config remain host-only.
export const updateEventFromApiClient = internalMutation({
  args: {
    apiClientId: v.id("apiClients"),
    workspaceSlug: v.string(),
    eventRouteId: v.string(),
    name: v.optional(v.string()),
    secondaryTitle: v.optional(v.union(v.string(), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    location: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    eventEndDate: v.optional(v.union(v.number(), v.null())),
    eventTimezone: v.optional(v.union(v.string(), v.null())),
    maxAttendees: v.optional(v.number()),
    flyerUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const event = await getAuthorizedEventForApiClient(
      ctx,
      args.apiClientId,
      args.workspaceSlug,
      args.eventRouteId,
    );
    if (!event) {
      return {
        ok: false,
        errorCode: "not_found",
        message: "Event not found",
      } satisfies ApiWriteFailure;
    }

    const invalidRequest = (message: string): ApiWriteFailure => ({
      ok: false,
      errorCode: "invalid_request",
      message,
    });

    const patch: Partial<Doc<"events">> = {};

    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (trimmedName.length === 0) {
        return invalidRequest("name cannot be empty");
      }
      if (trimmedName !== event.name) {
        patch.name = trimmedName;
      }
    }

    if (args.location !== undefined) {
      const trimmedLocation = args.location.trim();
      if (trimmedLocation.length === 0) {
        return invalidRequest("location cannot be empty");
      }
      if (trimmedLocation !== event.location) {
        patch.location = trimmedLocation;
      }
    }

    if (args.eventDate !== undefined) {
      if (!Number.isInteger(args.eventDate) || args.eventDate <= 0) {
        return invalidRequest("eventDate must be a positive ms-epoch timestamp");
      }
      if (args.eventDate !== event.eventDate) {
        patch.eventDate = args.eventDate;
      }
    }

    if (args.eventEndDate !== undefined) {
      const nextEventEndDate = args.eventEndDate ?? undefined;
      if (
        nextEventEndDate !== undefined &&
        (!Number.isInteger(nextEventEndDate) || nextEventEndDate <= 0)
      ) {
        return invalidRequest("eventEndDate must be a positive ms-epoch timestamp or null");
      }
      if (nextEventEndDate !== event.eventEndDate) {
        patch.eventEndDate = nextEventEndDate;
      }
    }

    const resolvedEventDate = patch.eventDate ?? event.eventDate;
    const resolvedEventEndDate = "eventEndDate" in patch ? patch.eventEndDate : event.eventEndDate;
    if (resolvedEventEndDate !== undefined && resolvedEventEndDate <= resolvedEventDate) {
      return invalidRequest("eventEndDate must be after eventDate");
    }

    if (args.maxAttendees !== undefined) {
      if (!Number.isInteger(args.maxAttendees) || args.maxAttendees < 1) {
        return invalidRequest("maxAttendees must be an integer of at least 1");
      }
      if (args.maxAttendees !== (event.maxAttendees ?? 1)) {
        patch.maxAttendees = args.maxAttendees;
      }
    }

    const applyNullableStringField = (
      fieldName: "secondaryTitle" | "description" | "eventTimezone" | "flyerUrl",
      submittedValue: string | null | undefined,
    ): ApiWriteFailure | null => {
      if (submittedValue === undefined) {
        return null;
      }
      const nextValue = submittedValue === null ? undefined : submittedValue.trim() || undefined;
      if (fieldName === "flyerUrl" && nextValue !== undefined) {
        try {
          const parsedUrl = new URL(nextValue);
          if (parsedUrl.protocol !== "https:") {
            return invalidRequest("flyerUrl must be an https:// URL");
          }
        } catch {
          return invalidRequest("flyerUrl must be a valid URL");
        }
      }
      if (nextValue !== event[fieldName]) {
        patch[fieldName] = nextValue;
      }
      return null;
    };

    for (const [fieldName, submittedValue] of [
      ["secondaryTitle", args.secondaryTitle],
      ["description", args.description],
      ["eventTimezone", args.eventTimezone],
      ["flyerUrl", args.flyerUrl],
    ] as const) {
      const fieldFailure = applyNullableStringField(fieldName, submittedValue);
      if (fieldFailure) {
        return fieldFailure;
      }
    }

    // A no-op update patches nothing and therefore emits no webhook,
    // so consumers mirroring event.updated can't echo their own writes.
    if (Object.keys(patch).length > 0) {
      patch.webhookOriginApiClientId = args.apiClientId;
      patch.webhookOriginMutationId = crypto.randomUUID();
      patch.updatedAt = Date.now();
      await ctx.db.patch(event._id, patch);
    }

    const updatedEvent = await ctx.db.get(event._id);
    return {
      ok: true as const,
      changed: Object.keys(patch).length > 0,
      event: await buildApiEventSummary(ctx, updatedEvent ?? event),
    };
  },
});
