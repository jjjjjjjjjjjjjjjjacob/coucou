import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import {
  normalizePrimaryFieldLookupText,
  normalizeSocialPlatformKey,
} from "@coucou/sdk/shared/primary-fields";
import { v } from "convex/values";
import { api, components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import {
  assertRequiredPrimaryFieldValues,
  buildInvitedByPatch,
  sanitizeSubmittedSocialProfiles,
  submittedSocialProfileValidator,
} from "./lib/primaryFields";
import { createProfileValuesAndWorkspaceGrantsForSocialProfiles } from "./lib/profileValueRecords";
import {
  countRsvpsWithAggregate,
  deleteRsvpFromAggregate,
  insertRsvpIntoAggregate,
  updateRsvpInAggregate,
} from "./lib/rsvpAggregate";
import {
  collectRsvpsMatchingFilters,
  filtersRequireDirectRsvpCount,
  normalizeTicketStatusFilter,
  type ValidRsvpStatus,
  validRsvpStatuses,
} from "./lib/rsvpFilters";
import { type ApprovalStatus, deriveApprovalStatus } from "./lib/rsvpStatus";
import { ensureEventInSiteScope, getEventInSiteScope } from "./lib/siteScope";
import { replaceRsvpSocialProfileSnapshots } from "./lib/socialProfileRecords";
import { NotFoundError } from "./lib/types";
import {
  requireWorkspaceDoor,
  requireWorkspaceHost,
  requireWorkspaceRead,
} from "./lib/workspaceAuth";
import { eventMatchesTenantScope, resolveTenantWorkspaceScope } from "./lib/workspaceScope";

export const submitRequest = mutation({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    listKey: v.string(),
    note: v.optional(v.string()),
    shareContact: v.boolean(),
    attendees: v.optional(v.number()),
    smsConsent: v.optional(v.boolean()), // SMS consent from user
    smsConsentIpAddress: v.optional(v.string()), // IP address for compliance
    // Contact is optional because the user may already have a phone on file.
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    customFields: v.optional(v.record(v.string(), v.string())),
    socialProfiles: v.optional(v.array(submittedSocialProfileValidator)),
    invitedByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Require authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    // Fetch user to populate userName for search
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();

    const userName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "" : "";

    // Ensure event exists and is active
    const event = await getEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
    });
    const now = Date.now();
    if (!event || !isEventOpenForRsvp(event, now)) throw new Error("Event not available");
    const eventFieldMap = new Map((event.customFields ?? []).map((field) => [field.key, field]));
    const primaryFieldConfig = event.primaryFieldConfig;
    const sanitizedSocialProfiles = sanitizeSubmittedSocialProfiles(
      args.socialProfiles,
      primaryFieldConfig,
    );
    assertRequiredPrimaryFieldValues({
      primaryFieldConfig,
      submittedProfiles: sanitizedSocialProfiles,
      invitedByName: args.invitedByName,
    });
    const configuredSocialPlatformKeys = new Set(
      (primaryFieldConfig?.socialPlatforms ?? []).map((platform) => platform.platformKey),
    );
    const invitedByPatch =
      primaryFieldConfig?.invitedBy?.enabled === true
        ? buildInvitedByPatch(args.invitedByName)
        : {};

    const sanitizedCustomFieldValues = args.customFields
      ? Object.fromEntries(
          Object.entries(args.customFields)
            .map(([fieldKey, rawValue]) => {
              const fieldConfig = eventFieldMap.get(fieldKey);
              if (!fieldConfig) return null;
              const stringValue = typeof rawValue === "string" ? rawValue : `${rawValue ?? ""}`;
              const finalValue =
                fieldConfig.trimWhitespace === false ? stringValue : stringValue.trim();
              if (!finalValue) return null;
              return [fieldKey, finalValue];
            })
            .filter((entry): entry is [string, string] => entry !== null),
        )
      : undefined;

    // Validate attendees against event's maxAttendees setting
    const maxAttendeesAllowed = event.maxAttendees ?? 1;
    const requestedAttendees = args.attendees ?? 1;
    if (requestedAttendees > maxAttendeesAllowed) {
      throw new Error(`Maximum ${maxAttendeesAllowed} attendees allowed for this event`);
    }
    if (requestedAttendees < 1) {
      throw new Error("At least 1 attendee required");
    }

    // Upsert RSVP per (eventId, clerkUserId)
    const existing = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
      .unique();

    let smsConsentChange: "enabled" | "disabled" | null = null;
    if (!existing) {
      if (args.smsConsent === true) {
        smsConsentChange = "enabled";
      }
    } else {
      if (args.smsConsent === true && existing.smsConsent !== true) {
        smsConsentChange = "enabled";
      } else if (args.smsConsent === false && existing.smsConsent === true) {
        smsConsentChange = "disabled";
      }
    }

    const sanitizedSmsConsentIpAddress =
      args.smsConsent === true && typeof args.smsConsentIpAddress === "string"
        ? args.smsConsentIpAddress.slice(0, 256)
        : undefined;

    if (!existing) {
      const rsvpId = await ctx.db.insert("rsvps", {
        eventId: args.eventId,
        clerkUserId,
        listKey: args.listKey,
        ticketStatus: "not-issued",
        userName, // For search functionality
        note: args.note,
        shareContact: args.shareContact,
        attendees: requestedAttendees,
        smsConsent: args.smsConsent,
        smsConsentTimestamp: args.smsConsent !== undefined ? now : undefined,
        smsConsentIpAddress: args.smsConsent === true ? sanitizedSmsConsentIpAddress : undefined,
        customFieldValues:
          sanitizedCustomFieldValues && Object.keys(sanitizedCustomFieldValues).length > 0
            ? sanitizedCustomFieldValues
            : undefined,
        ...invitedByPatch,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      if (configuredSocialPlatformKeys.size > 0) {
        await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
          event,
          rsvpId,
          clerkUserId,
          userId: user?._id,
          submittedProfiles: sanitizedSocialProfiles,
        });
        await replaceRsvpSocialProfileSnapshots(ctx, {
          eventId: args.eventId,
          rsvpId,
          clerkUserId,
          userId: user?._id,
          configuredPlatformKeys: configuredSocialPlatformKeys,
          submittedProfiles: sanitizedSocialProfiles,
        });
      }

      // Sync with aggregate
      const newRsvp = await ctx.db.get(rsvpId);
      if (newRsvp) {
        await insertRsvpIntoAggregate(ctx, newRsvp);
      }
    } else {
      // Prevent re-requesting the same denied list
      if (existing.status === "denied" && existing.listKey === args.listKey) {
        throw new Error("Denied for this list; try a different password");
      }
      // Get old state before update for aggregate sync
      const oldRsvp = await ctx.db.get(existing._id);

      await ctx.db.patch(existing._id, {
        listKey: args.listKey,
        userName, // Keep userName in sync
        note: args.note,
        shareContact: args.shareContact,
        attendees: requestedAttendees,
        smsConsent: args.smsConsent,
        smsConsentTimestamp: args.smsConsent !== undefined ? now : existing.smsConsentTimestamp,
        smsConsentIpAddress:
          args.smsConsent === true
            ? (sanitizedSmsConsentIpAddress ?? existing.smsConsentIpAddress)
            : existing.smsConsentIpAddress,
        customFieldValues:
          sanitizedCustomFieldValues !== undefined
            ? Object.keys(sanitizedCustomFieldValues).length > 0
              ? sanitizedCustomFieldValues
              : undefined
            : existing.customFieldValues,
        ...invitedByPatch,
        // Reset to pending when re-requesting (unless already approved)
        status: existing.status === "approved" ? existing.status : "pending",
        updatedAt: now,
      });

      if (configuredSocialPlatformKeys.size > 0) {
        await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
          event,
          rsvpId: existing._id,
          clerkUserId,
          userId: user?._id,
          submittedProfiles: sanitizedSocialProfiles,
        });
        await replaceRsvpSocialProfileSnapshots(ctx, {
          eventId: args.eventId,
          rsvpId: existing._id,
          clerkUserId,
          userId: user?._id,
          configuredPlatformKeys: configuredSocialPlatformKeys,
          submittedProfiles: sanitizedSocialProfiles,
        });
      }

      // Sync with aggregate
      const newRsvp = await ctx.db.get(existing._id);
      if (oldRsvp && newRsvp) {
        await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
      }
    }

    if (smsConsentChange) {
      await ctx.scheduler.runAfter(0, api.notifications.sendSmsConsentStatusMessage, {
        eventId: args.eventId,
        clerkUserId,
        consentEnabled: smsConsentChange === "enabled",
      });
    }

    return { ok: true as const };
  },
});

/**
 * Internal query to check if a user has consented to SMS for a specific event.
 * Used by SMS infrastructure to verify consent before sending messages.
 * NOTE: Consent is recorded per RSVP when the guest explicitly opts in.
 */
export const checkSmsConsentForUserEvent = internalQuery({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, { eventId, clerkUserId }) => {
    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId).eq("clerkUserId", clerkUserId))
      .unique();

    const hasConsented = rsvp?.smsConsent === true;
    return {
      hasConsented,
      consentTimestamp: rsvp?.smsConsentTimestamp ?? null,
      consentIpAddress: rsvp?.smsConsentIpAddress,
      rsvpStatus: rsvp?.status,
    };
  },
});

export const getApprovedRsvpWithRedemption = internalQuery({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, { eventId, clerkUserId }) => {
    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId).eq("clerkUserId", clerkUserId))
      .unique();

    if (!rsvp || (rsvp.status !== "approved" && rsvp.status !== "attending")) {
      return null;
    }

    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId).eq("clerkUserId", clerkUserId))
      .unique();

    if (!redemption) {
      return null;
    }

    return {
      rsvpId: rsvp._id,
      listKey: rsvp.listKey,
      shareContact: rsvp.shareContact,
      redemptionCode: redemption.code,
    };
  },
});

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await collectUserSharedEvents(ctx, null);
  },
});

export const listForCurrentUserInWorkspace = query({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceSlug, siteKey }) => {
    if (!workspaceSlug && !siteKey) return [];
    const scope = await resolveTenantWorkspaceScope(ctx, {
      workspaceSlug,
      siteKey,
    });
    if (!scope) return [];
    return await collectUserSharedEvents(ctx, scope);
  },
});

async function collectUserSharedEvents(
  ctx: QueryCtx,
  scope: { workspaceSlug: string; siteKey: string | null } | null,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return [];
  const clerkUserId = identity.subject;
  const rsvps = await ctx.db
    .query("rsvps")
    .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
    .order("desc")
    .collect();

  if (rsvps.length === 0) return [];

  const uniqueEventIds = Array.from(new Set(rsvps.map((rsvp) => rsvp.eventId)));
  const eventEntries = await Promise.all(
    uniqueEventIds.map(async (eventId) => ({
      eventId,
      event: await ctx.db.get(eventId),
    })),
  );
  const eventMap = new Map(
    eventEntries.filter((entry) => entry.event).map((entry) => [entry.eventId, entry.event!]),
  );

  const filteredRsvps = scope
    ? rsvps.filter((rsvp) => {
        const event = eventMap.get(rsvp.eventId);
        if (!event) return false;
        return eventMatchesTenantScope(event, scope);
      })
    : rsvps;

  return await Promise.all(
    filteredRsvps.map(async (rsvp) => {
      const event = eventMap.get(rsvp.eventId);
      const customFieldDefinitions = event?.customFields ?? [];
      const customFields = customFieldDefinitions.map((definition) => ({
        key: definition.key,
        label: definition.label,
        value: rsvp.customFieldValues?.[definition.key] ?? "",
        required: definition.required ?? false,
        copyEnabled: definition.copyEnabled ?? false,
        prependUrl: definition.prependUrl ?? "",
        trimWhitespace: definition.trimWhitespace !== false,
      }));
      const socialProfiles = await ctx.db
        .query("rsvpSocialProfiles")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
        .collect();

      return {
        rsvpId: rsvp._id,
        eventId: rsvp.eventId,
        eventName: event?.name ?? "Untitled Event",
        eventSecondaryTitle: event?.secondaryTitle,
        eventDate: event?.eventDate ?? null,
        eventTimezone: event?.eventTimezone,
        eventHostNames: event?.hosts ?? [],
        productionCompany: event?.productionCompany,
        listKey: rsvp.listKey,
        smsConsent: rsvp.smsConsent ?? false,
        shareContact: rsvp.shareContact,
        updatedAt: rsvp.updatedAt,
        customFields,
        socialProfiles: socialProfiles.map((profile) => ({
          platformKey: profile.platformKey,
          handle: profile.handle,
        })),
        invitedByName: rsvp.invitedByName,
      };
    }),
  );
}

export const updateSmsPreference = mutation({
  args: {
    rsvpId: v.optional(v.id("rsvps")),
    smsConsent: v.boolean(),
    applyToAll: v.optional(v.boolean()),
    smsConsentIpAddress: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, smsConsent, applyToAll, smsConsentIpAddress }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;
    const now = Date.now();
    const sanitizedSmsConsentIpAddress =
      smsConsent && typeof smsConsentIpAddress === "string"
        ? smsConsentIpAddress.slice(0, 256)
        : undefined;

    const notificationsByEvent = new Map<Id<"events">, boolean>();
    let updatedCount = 0;

    if (applyToAll || !rsvpId) {
      const rsvps = await ctx.db
        .query("rsvps")
        .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
        .collect();
      await Promise.all(
        rsvps.map((rsvp) =>
          ctx.db.patch(rsvp._id, {
            smsConsent,
            smsConsentTimestamp: now,
            smsConsentIpAddress: smsConsent
              ? (sanitizedSmsConsentIpAddress ?? rsvp.smsConsentIpAddress)
              : rsvp.smsConsentIpAddress,
            updatedAt: now,
          }),
        ),
      );
      rsvps.forEach((rsvp) => {
        if (rsvp.smsConsent !== smsConsent) {
          notificationsByEvent.set(rsvp.eventId, smsConsent);
        }
      });
      updatedCount = rsvps.length;
    } else {
      const rsvp = await ctx.db.get(rsvpId);
      if (!rsvp) throw new NotFoundError("RSVP");
      if (rsvp.clerkUserId !== clerkUserId) throw new Error("Forbidden");
      if (rsvp.smsConsent === smsConsent) return { updated: 0 };

      await ctx.db.patch(rsvpId, {
        smsConsent,
        smsConsentTimestamp: now,
        smsConsentIpAddress: smsConsent
          ? (sanitizedSmsConsentIpAddress ?? rsvp.smsConsentIpAddress)
          : rsvp.smsConsentIpAddress,
        updatedAt: now,
      });
      notificationsByEvent.set(rsvp.eventId, smsConsent);
      updatedCount = 1;
    }

    if (notificationsByEvent.size > 0) {
      await Promise.all(
        Array.from(notificationsByEvent.entries()).map(([eventId, consentEnabled]) =>
          ctx.scheduler.runAfter(0, api.notifications.sendSmsConsentStatusMessage, {
            eventId,
            clerkUserId,
            consentEnabled,
          }),
        ),
      );
    }

    return { updated: updatedCount };
  },
});

export const updateSharedFields = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    fields: v.record(v.string(), v.string()),
  },
  handler: async (ctx, { rsvpId, fields }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new NotFoundError("RSVP");
    if (rsvp.clerkUserId !== clerkUserId) throw new Error("Forbidden");

    const event = await ctx.db.get(rsvp.eventId);
    if (!event) throw new NotFoundError("Event");

    const fieldDefinitions = new Map(
      (event.customFields ?? []).map((definition) => [definition.key, definition]),
    );

    const nextValues: Record<string, string> = {
      ...(rsvp.customFieldValues ?? {}),
    };

    for (const [fieldKey, rawValue] of Object.entries(fields)) {
      const definition = fieldDefinitions.get(fieldKey);
      if (!definition) continue;
      const stringValue = typeof rawValue === "string" ? rawValue : `${rawValue ?? ""}`;
      const finalValue = definition.trimWhitespace === false ? stringValue : stringValue.trim();
      if (finalValue) {
        nextValues[fieldKey] = finalValue;
      } else {
        delete nextValues[fieldKey];
      }
    }

    await ctx.db.patch(rsvpId, {
      customFieldValues: Object.keys(nextValues).length > 0 ? nextValues : undefined,
      updatedAt: Date.now(),
    });

    return {
      ok: true as const,
      customFieldValues: Object.keys(nextValues).length > 0 ? nextValues : undefined,
    };
  },
});

export const updateSharedPrimaryFields = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    socialProfiles: v.optional(v.array(submittedSocialProfileValidator)),
    invitedByName: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, socialProfiles, invitedByName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new NotFoundError("RSVP");
    if (rsvp.clerkUserId !== clerkUserId) throw new Error("Forbidden");

    const event = await ctx.db.get(rsvp.eventId);
    if (!event) throw new NotFoundError("Event");

    const primaryFieldConfig = event.primaryFieldConfig;
    const configuredSocialPlatformKeys = new Set(
      (primaryFieldConfig?.socialPlatforms ?? []).map((platform) => platform.platformKey),
    );
    const sanitizedSocialProfiles =
      socialProfiles === undefined
        ? []
        : sanitizeSubmittedSocialProfiles(socialProfiles, primaryFieldConfig);
    if (socialProfiles !== undefined || invitedByName !== undefined) {
      assertRequiredPrimaryFieldValues({
        primaryFieldConfig:
          socialProfiles === undefined
            ? {
                invitedBy: primaryFieldConfig?.invitedBy,
              }
            : invitedByName === undefined
              ? {
                  socialPlatforms: primaryFieldConfig?.socialPlatforms,
                }
              : primaryFieldConfig,
        submittedProfiles: sanitizedSocialProfiles,
        invitedByName,
      });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
      .unique();

    if (socialProfiles !== undefined && configuredSocialPlatformKeys.size > 0) {
      await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
        event,
        rsvpId,
        clerkUserId,
        userId: user?._id,
        submittedProfiles: sanitizedSocialProfiles,
      });
      await replaceRsvpSocialProfileSnapshots(ctx, {
        eventId: rsvp.eventId,
        rsvpId,
        clerkUserId,
        userId: user?._id,
        configuredPlatformKeys: configuredSocialPlatformKeys,
        submittedProfiles: sanitizedSocialProfiles,
      });
    }

    if (primaryFieldConfig?.invitedBy?.enabled === true && invitedByName !== undefined) {
      await ctx.db.patch(rsvpId, {
        ...buildInvitedByPatch(invitedByName),
        updatedAt: Date.now(),
      });
    }

    return { ok: true as const };
  },
});

export const listForEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { eventId, siteKey, workspaceSlug },
  ): Promise<
    Array<{
      id: Id<"rsvps">;
      clerkUserId: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      listKey: string;
      note?: string;
      status: string;
      attendees?: number;
      contact?: { email?: string; phone?: string };
      socialProfiles: Array<{
        platformKey: string;
        handle: string;
        normalizedHandle: string;
      }>;
      invitedByName?: string;
      invitedByNormalizedName?: string;
      invitedBySocialPlatformKey?: string;
      invitedBySocialHandle?: string;
      redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
      redemptionCode?: string;
      createdAt: number;
    }>
  > => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const rows = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const enriched = await Promise.all(
      rows.map(
        async (
          r,
        ): Promise<{
          id: Id<"rsvps">;
          clerkUserId: string;
          name?: string;
          firstName?: string;
          lastName?: string;
          listKey: string;
          note?: string;
          status: string;
          attendees?: number;
          contact?: { email?: string; phone?: string };
          customFieldValues?: Record<string, string>;
          socialProfiles: Array<{
            platformKey: string;
            handle: string;
            normalizedHandle: string;
          }>;
          invitedByName?: string;
          invitedByNormalizedName?: string;
          invitedBySocialPlatformKey?: string;
          invitedBySocialHandle?: string;
          redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
          redemptionCode?: string;
          createdAt: number;
        }> => {
          // Look up user's display name
          const user = await ctx.db
            .query("users")
            .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", r.clerkUserId))
            .unique();
          // User name constructed from firstName/lastName in display logic
          const firstName = user?.firstName;
          const lastName = user?.lastName;
          const name = [firstName, lastName].filter(Boolean).join(" ") || undefined;
          // Redemption info for this user+event
          const redemption = await ctx.db
            .query("redemptions")
            .withIndex("by_event_user", (q) =>
              q.eq("eventId", eventId).eq("clerkUserId", r.clerkUserId),
            )
            .unique();
          let redemptionStatus: "none" | "issued" | "redeemed" | "disabled" = "none";
          if (redemption) {
            if (redemption.disabledAt) redemptionStatus = "disabled";
            else if (redemption.redeemedAt) redemptionStatus = "redeemed";
            else redemptionStatus = "issued";
          }
          let contact: { email?: string; phone?: string } | undefined;
          if (r.shareContact) {
            const prof: {
              hasEmail: boolean;
              hasPhone: boolean;
              emailObfuscated?: string;
              phoneObfuscated?: string;
            } | null = await ctx.runQuery(api.profiles.getForClerk, {
              clerkUserId: r.clerkUserId,
            });
            if (prof) {
              contact = {
                email: prof.emailObfuscated,
                phone: prof.phoneObfuscated,
              };
            }
          }
          const socialProfiles = await ctx.db
            .query("rsvpSocialProfiles")
            .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", r._id))
            .collect();
          return {
            id: r._id,
            clerkUserId: r.clerkUserId,
            name,
            firstName,
            lastName,
            listKey: r.listKey,
            note: r.note,
            status: r.status,
            attendees: r.attendees,
            contact,
            customFieldValues: r.customFieldValues ?? undefined,
            socialProfiles: socialProfiles.map((profile) => ({
              platformKey: profile.platformKey,
              handle: profile.handle,
              normalizedHandle: profile.normalizedHandle,
            })),
            invitedByName: r.invitedByName,
            invitedByNormalizedName: r.invitedByNormalizedName,
            invitedBySocialPlatformKey: r.invitedBySocialPlatformKey,
            invitedBySocialHandle: r.invitedBySocialHandle,
            redemptionStatus,
            redemptionCode: redemption?.code,
            createdAt: r.createdAt,
          };
        },
      ),
    );

    return enriched;
  },
});

// Count query for filtered RSVPs using aggregate
export const countForEventFiltered = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    approvalFilter: v.optional(
      v.union(v.literal("all"), v.literal("pending"), v.literal("approved"), v.literal("denied")),
    ),
    listFilter: v.optional(v.string()),
    guestSearch: v.optional(v.string()),
    redemptionFilter: v.optional(v.string()),
    socialPlatformFilter: v.optional(v.string()),
    socialSearch: v.optional(v.string()),
    invitedBySearch: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      eventId,
      siteKey,
      workspaceSlug,
      approvalFilter = "all",
      listFilter = "all",
      guestSearch = "",
      redemptionFilter = "all",
      socialPlatformFilter = "all",
      socialSearch = "",
      invitedBySearch = "",
    },
  ) => {
    await requireWorkspaceRead(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const ticketStatusFilter = normalizeTicketStatusFilter(redemptionFilter);

    const needsPrimaryFieldFiltering =
      socialPlatformFilter !== "all" ||
      socialSearch.trim().length > 0 ||
      invitedBySearch.trim().length > 0;

    if (
      filtersRequireDirectRsvpCount({ guestSearch, ticketStatusFilter }) ||
      needsPrimaryFieldFiltering
    ) {
      let matchingRsvps = await collectRsvpsMatchingFilters(ctx, {
        eventId,
        guestSearch,
        approvalFilter,
        listFilter,
        ticketStatusFilter,
      });
      matchingRsvps = await filterRsvpsByPrimaryFields(ctx, matchingRsvps, {
        socialPlatformFilter,
        socialSearch,
        invitedBySearch,
      });

      return matchingRsvps.length;
    }

    // Use aggregate for efficient counting
    return countRsvpsWithAggregate(ctx, eventId, approvalFilter, listFilter);
  },
});

async function filterRsvpsByPrimaryFields(
  ctx: QueryCtx,
  rsvps: Array<Doc<"rsvps">>,
  {
    socialPlatformFilter = "all",
    socialSearch = "",
    invitedBySearch = "",
  }: {
    socialPlatformFilter?: string;
    socialSearch?: string;
    invitedBySearch?: string;
  },
): Promise<Array<Doc<"rsvps">>> {
  const normalizedSocialPlatformFilter =
    socialPlatformFilter === "all" ? "all" : normalizeSocialPlatformKey(socialPlatformFilter);
  const normalizedSocialSearch = normalizePrimaryFieldLookupText(socialSearch);
  const normalizedInvitedBySearch = normalizePrimaryFieldLookupText(invitedBySearch);

  if (
    normalizedSocialPlatformFilter === "all" &&
    !normalizedSocialSearch &&
    !normalizedInvitedBySearch
  ) {
    return rsvps;
  }

  const filteredRsvps: Array<Doc<"rsvps">> = [];
  for (const rsvp of rsvps) {
    if (normalizedInvitedBySearch) {
      const invitedByValue = rsvp.invitedByNormalizedName ?? "";
      if (!invitedByValue.includes(normalizedInvitedBySearch)) {
        continue;
      }
    }

    if (normalizedSocialPlatformFilter !== "all" || normalizedSocialSearch) {
      const socialProfiles = await ctx.db
        .query("rsvpSocialProfiles")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
        .collect();
      const matchingSocialProfiles = socialProfiles.filter((profile) => {
        if (
          normalizedSocialPlatformFilter !== "all" &&
          profile.platformKey !== normalizedSocialPlatformFilter
        ) {
          return false;
        }
        if (normalizedSocialSearch && !profile.normalizedHandle.includes(normalizedSocialSearch)) {
          return false;
        }
        return true;
      });

      if (matchingSocialProfiles.length === 0) {
        continue;
      }
    }

    filteredRsvps.push(rsvp);
  }

  return filteredRsvps;
}

// Type definitions for enriched RSVP data
type EnrichedRsvp = {
  id: Id<"rsvps">;
  clerkUserId: string;
  name: string;
  firstName: string;
  lastName: string;
  listKey: string;
  note?: string;
  status: ValidRsvpStatus;
  approvalStatus: ApprovalStatus;
  ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed";
  attendees?: number;
  contact?: {
    email?: string;
    phone?: string;
  };
  customFieldValues: Record<string, string> | undefined;
  socialProfiles: Array<{
    platformKey: string;
    handle: string;
    normalizedHandle: string;
  }>;
  invitedByName?: string;
  invitedByNormalizedName?: string;
  invitedBySocialPlatformKey?: string;
  invitedBySocialHandle?: string;
  redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
  redemptionCode?: string;
  createdAt: number;
  updatedAt: number;
};

type PaginatedRsvpResult = {
  page: EnrichedRsvp[];
  nextCursor: string | null;
  isDone: boolean;
};

export const listForEventPaginated = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    guestSearch: v.optional(v.string()),
    approvalFilter: v.optional(
      v.union(v.literal("all"), v.literal("pending"), v.literal("approved"), v.literal("denied")),
    ),
    listFilter: v.optional(v.string()), // Filter by list key
    redemptionFilter: v.optional(v.string()),
    socialPlatformFilter: v.optional(v.string()),
    socialSearch: v.optional(v.string()),
    invitedBySearch: v.optional(v.string()),
    sortBy: v.optional(v.string()),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (
    ctx,
    {
      eventId,
      siteKey,
      workspaceSlug,
      cursor,
      pageSize = 20,
      guestSearch = "",
      approvalFilter = "all",
      listFilter = "all",
      redemptionFilter = "all",
      socialPlatformFilter = "all",
      socialSearch = "",
      invitedBySearch = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    },
  ): Promise<PaginatedRsvpResult> => {
    // Debug logging for sorting
    console.log(
      `[RSVP_PAGINATED] Sort params: sortBy=${sortBy}, sortOrder=${sortOrder}, search="${guestSearch}", filters: approval=${approvalFilter}, list=${listFilter}, redemption=${redemptionFilter}`,
    );

    const ticketStatusFilter = normalizeTicketStatusFilter(redemptionFilter);

    // Fetch event once since all RSVPs are for the same event
    await requireWorkspaceRead(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    // For proper global sorting, we need to fetch all matching records, sort them, then paginate
    // This is necessary because Convex's .order() on an index only reverses index order,
    // not by createdAt or other fields. Cursor pagination requires consistent ordering.
    let allMatchingRsvps = await collectRsvpsMatchingFilters(ctx, {
      eventId,
      guestSearch,
      approvalFilter,
      listFilter,
      ticketStatusFilter,
    });
    allMatchingRsvps = await filterRsvpsByPrimaryFields(ctx, allMatchingRsvps, {
      socialPlatformFilter,
      socialSearch,
      invitedBySearch,
    });

    console.log(`[RSVP_PAGINATED] Fetched ${allMatchingRsvps.length} matching RSVPs for sorting`);

    // Sort all matching RSVPs before pagination
    // For fields that require enrichment (name, firstName, lastName), we'll sort after enrichment
    // For fields on the RSVP document directly, we can sort before enrichment
    const needsEnrichmentForSort =
      sortBy === "name" ||
      sortBy === "firstName" ||
      sortBy === "lastName" ||
      sortBy === "invitedByName" ||
      sortBy.startsWith("social:");

    if (!needsEnrichmentForSort) {
      // Sort before enrichment for better performance
      allMatchingRsvps.sort((a: Doc<"rsvps">, b: Doc<"rsvps">) => {
        let comparison = 0;
        const directionMultiplier = sortOrder === "asc" ? 1 : -1;

        switch (sortBy) {
          case "updatedAt":
            comparison = (a.updatedAt ?? a.createdAt) - (b.updatedAt ?? b.createdAt);
            break;
          case "createdAt":
            comparison = a.createdAt - b.createdAt;
            break;
          case "approvalStatus":
          case "status":
            comparison = deriveApprovalStatus(a.status).localeCompare(
              deriveApprovalStatus(b.status),
            );
            break;
          case "ticketStatus": {
            const aTicketStatus = (a.ticketStatus as string | undefined) ?? "not-issued";
            const bTicketStatus = (b.ticketStatus as string | undefined) ?? "not-issued";
            comparison = aTicketStatus.localeCompare(bTicketStatus);
            break;
          }
          case "listKey":
            comparison = (a.listKey || "").localeCompare(b.listKey || "");
            break;
          case "attendees":
            comparison = (a.attendees ?? 0) - (b.attendees ?? 0);
            break;
          case "invitedByName":
            comparison = (a.invitedByName ?? "").localeCompare(b.invitedByName ?? "");
            break;
          default:
            // Fallback to createdAt
            comparison = a.createdAt - b.createdAt;
            break;
        }

        // If values are equal, use createdAt as tiebreaker
        if (comparison === 0) {
          comparison = a.createdAt - b.createdAt;
        }

        return directionMultiplier * comparison;
      });

      console.log(
        `[RSVP_PAGINATED] Pre-sorted ${allMatchingRsvps.length} RSVPs by ${sortBy} ${sortOrder}`,
      );
    }

    // Manual pagination - we'll sort after enrichment if needed
    const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
    const startIndex = cursorIndex;
    const endIndex = startIndex + pageSize;
    const paginatedRsvps = needsEnrichmentForSort
      ? allMatchingRsvps // Will sort after enrichment
      : allMatchingRsvps.slice(startIndex, endIndex); // Pre-sorted, can paginate now
    const nextCursor = needsEnrichmentForSort
      ? null // Will be set after enrichment and sorting
      : endIndex < allMatchingRsvps.length
        ? String(endIndex)
        : null;
    const isDone = needsEnrichmentForSort
      ? false // Will be set after enrichment and sorting
      : endIndex >= allMatchingRsvps.length;

    // Batch fetch related data to avoid N+1 queries
    // Note: credentialId field has been removed from schema
    // We'll handle credential lookups via listKey when needed

    // Batch fetch user data for metadata (custom fields)
    // For name-based sorting, we need to fetch all users to sort properly
    const rsvpsToEnrich = needsEnrichmentForSort ? allMatchingRsvps : paginatedRsvps;
    const userClerkIds = [
      ...new Set(rsvpsToEnrich.map((r: Doc<"rsvps">) => r.clerkUserId)),
    ] as string[];
    const users = await Promise.all(
      userClerkIds.map(async (clerkUserId: string) =>
        ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (query) => query.eq("clerkUserId", clerkUserId))
          .unique(),
      ),
    );
    const userMap = Object.fromEntries(users.filter((u) => u).map((u) => [u!.clerkUserId, u]));

    // Batch fetch redemption data only for RSVPs with active codes
    const rsvpsNeedingRedemption = rsvpsToEnrich.filter(
      (rsvp: Doc<"rsvps">) =>
        ((rsvp.ticketStatus as string | undefined) ?? "not-issued") !== "not-issued",
    );
    const redemptions = await Promise.all(
      rsvpsNeedingRedemption.map(async (rsvp: Doc<"rsvps">) =>
        ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique(),
      ),
    );
    const redemptionMap = Object.fromEntries(
      redemptions.filter((r) => r).map((r) => [r!.clerkUserId, r]),
    );

    const socialProfileEntries = await Promise.all(
      rsvpsToEnrich.map(async (rsvp: Doc<"rsvps">) => ({
        rsvpId: rsvp._id,
        profiles: await ctx.db
          .query("rsvpSocialProfiles")
          .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
          .collect(),
      })),
    );
    const socialProfilesByRsvpId = new Map(
      socialProfileEntries.map((entry) => [entry.rsvpId, entry.profiles]),
    );

    // Enrich with batched data (avoid N+1 queries)
    let enrichedPage = rsvpsToEnrich.map((rsvp: Doc<"rsvps">) => {
      const redemption = redemptionMap[rsvp.clerkUserId];
      const ticketStatus =
        (rsvp.ticketStatus as "not-issued" | "issued" | "disabled" | "redeemed") ?? "not-issued";
      let redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
      switch (ticketStatus) {
        case "issued":
          redemptionStatus = "issued";
          break;
        case "disabled":
          redemptionStatus = "disabled";
          break;
        case "redeemed":
          redemptionStatus = "redeemed";
          break;
        case "not-issued":
        default:
          redemptionStatus = "none";
          break;
      }

      // credentialId field has been removed from schema
      // Credential lookups now use listKey only
      const user = userMap[rsvp.clerkUserId];

      // Ensure customFieldValues is always included in the response
      // Return empty object instead of undefined to ensure the field is always present
      // This ensures consistency when using search queries vs regular queries
      const customFieldValues = rsvp.customFieldValues ?? ({} as Record<string, string>);
      const socialProfiles = socialProfilesByRsvpId.get(rsvp._id) ?? [];

      return {
        id: rsvp._id,
        clerkUserId: rsvp.clerkUserId,
        name:
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.name ||
          rsvp.userName ||
          "", // PRIORITY: users table (fresh data) → rsvp.userName (fallback)
        firstName: user?.firstName || (rsvp.userName ? rsvp.userName.split(" ")[0] : ""),
        lastName:
          user?.lastName || (rsvp.userName ? rsvp.userName.split(" ").slice(1).join(" ") : ""),
        listKey: rsvp.listKey || "",
        note: rsvp.note,
        status: sanitizeStatus(rsvp.status),
        approvalStatus: deriveApprovalStatus(rsvp.status),
        ticketStatus,
        attendees: rsvp.attendees,
        contact: rsvp.shareContact
          ? {
              email: undefined,
              phone: undefined,
            }
          : undefined,
        customFieldValues,
        socialProfiles: socialProfiles.map((profile) => ({
          platformKey: profile.platformKey,
          handle: profile.handle,
          normalizedHandle: profile.normalizedHandle,
        })),
        invitedByName: rsvp.invitedByName,
        invitedByNormalizedName: rsvp.invitedByNormalizedName,
        invitedBySocialPlatformKey: rsvp.invitedBySocialPlatformKey,
        invitedBySocialHandle: rsvp.invitedBySocialHandle,
        redemptionStatus,
        redemptionCode: redemption?.code,
        createdAt: rsvp.createdAt,
        updatedAt: rsvp.updatedAt ?? rsvp.createdAt,
        smsConsent: rsvp.smsConsent ?? undefined,
      };
    });

    // Note: Sorting is already done before pagination above for most fields
    // For name-based sorting, sort after enrichment, then paginate
    if (needsEnrichmentForSort) {
      enrichedPage.sort((a: EnrichedRsvp, b: EnrichedRsvp) => {
        let comparison = 0;
        const directionMultiplier = sortOrder === "asc" ? 1 : -1;

        switch (sortBy) {
          case "name":
            comparison = (a.name || "").localeCompare(b.name || "");
            break;
          case "firstName":
            comparison = (a.firstName || "").localeCompare(b.firstName || "");
            break;
          case "lastName":
            comparison = (a.lastName || "").localeCompare(b.lastName || "");
            break;
          case "invitedByName":
            comparison = (a.invitedByName || "").localeCompare(b.invitedByName || "");
            break;
          default:
            if (sortBy.startsWith("social:")) {
              const platformKey = normalizeSocialPlatformKey(sortBy.slice("social:".length));
              const leftHandle =
                a.socialProfiles.find((profile) => profile.platformKey === platformKey)?.handle ??
                "";
              const rightHandle =
                b.socialProfiles.find((profile) => profile.platformKey === platformKey)?.handle ??
                "";
              comparison = leftHandle.localeCompare(rightHandle);
            } else {
              comparison = a.createdAt - b.createdAt;
            }
            break;
        }

        // If values are equal, use createdAt as tiebreaker
        if (comparison === 0) {
          comparison = a.createdAt - b.createdAt;
        }

        return directionMultiplier * comparison;
      });

      console.log(
        `[RSVP_PAGINATED] Post-enrichment sorted ${enrichedPage.length} RSVPs by ${sortBy} ${sortOrder}`,
      );

      // Now paginate after sorting
      const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
      const startIndex = cursorIndex;
      const endIndex = startIndex + pageSize;
      enrichedPage = enrichedPage.slice(startIndex, endIndex);
      const finalNextCursor = endIndex < allMatchingRsvps.length ? String(endIndex) : null;
      const finalIsDone = endIndex >= allMatchingRsvps.length;

      return {
        page: enrichedPage,
        nextCursor: finalNextCursor,
        isDone: finalIsDone,
      };
    }

    // For non-enrichment sorts, enriched page already maintains sort order from pre-sorted paginatedRsvps
    return {
      page: enrichedPage,
      nextCursor,
      isDone,
    };
  },
});

export const statusForUserEvent = query({
  args: { eventId: v.id("events"), siteKey: v.optional(v.string()) },
  handler: async (ctx, { eventId, siteKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const event = await getEventInSiteScope(ctx, eventId, { siteKey });
    if (!event) return null;
    const clerkUserId = identity.subject;
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (query) => query.eq("eventId", eventId))
      .filter((query) => query.eq(query.field("clerkUserId"), clerkUserId))
      .collect();
    if (rsvps.length === 0) return null;

    const chosen = selectPrimaryRsvp(rsvps);

    const listCredential = await resolveListCredential(ctx, eventId, chosen);
    const socialProfiles = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", chosen._id))
      .collect();

    return {
      rsvpId: chosen._id,
      listKey: chosen.listKey,
      status: sanitizeStatus(chosen.status),
      shareContact: chosen.shareContact,
      customFieldValues: chosen.customFieldValues ?? undefined,
      socialProfiles: socialProfiles.map((profile) => ({
        platformKey: profile.platformKey,
        handle: profile.handle,
      })),
      invitedByName: chosen.invitedByName,
      smsConsent: chosen.smsConsent ?? false,
      smsConsentIpAddress: chosen.smsConsentIpAddress ?? undefined,
      generateQR: listCredential?.generateQR ?? false,
    } as const;
  },
});

export const statusForUserEventServer = query({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, clerkUserId, siteKey }) => {
    const event = await getEventInSiteScope(ctx, eventId, { siteKey });
    if (!event) return null;
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (query) => query.eq("eventId", eventId))
      .filter((query) => query.eq(query.field("clerkUserId"), clerkUserId))
      .collect();
    if (rsvps.length === 0) return null;

    const chosen = selectPrimaryRsvp(rsvps);

    const redemptionInfo = await resolveRedemption(ctx, eventId, clerkUserId, chosen);
    const socialProfiles = await ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", chosen._id))
      .collect();

    return {
      rsvpId: chosen._id,
      listKey: chosen.listKey,
      status: sanitizeStatus(chosen.status),
      shareContact: chosen.shareContact,
      customFieldValues: chosen.customFieldValues ?? undefined,
      socialProfiles: socialProfiles.map((profile) => ({
        platformKey: profile.platformKey,
        handle: profile.handle,
      })),
      invitedByName: chosen.invitedByName,
      smsConsent: chosen.smsConsent ?? false,
      redemption: redemptionInfo,
    } as const;
  },
});

type RawRsvp = Doc<"rsvps">;

const statusPriority: readonly ValidRsvpStatus[] = ["approved", "attending", "pending", "denied"];

function selectPrimaryRsvp(rsvps: RawRsvp[]): RawRsvp {
  const prioritized = [...rsvps].sort((a, b) => {
    const priorityDiff =
      statusPriority.indexOf(sanitizeStatus(b.status)) -
      statusPriority.indexOf(sanitizeStatus(a.status));
    if (priorityDiff !== 0) return priorityDiff;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
  return prioritized[0];
}

function sanitizeStatus(status: string): ValidRsvpStatus {
  const typedStatus = status as ValidRsvpStatus;
  return validRsvpStatuses.includes(typedStatus) ? typedStatus : "pending";
}

async function resolveListCredential(ctx: QueryCtx, eventId: Id<"events">, rsvp: RawRsvp) {
  if (!rsvp.listKey) return null;
  return ctx.db
    .query("listCredentials")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
    .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("listKey"), rsvp.listKey))
    .unique();
}

async function resolveRedemption(
  ctx: QueryCtx,
  eventId: Id<"events">,
  clerkUserId: string,
  rsvp: RawRsvp,
) {
  if (rsvp.status !== "approved" && rsvp.status !== "attending") {
    return null;
  }

  const redemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", eventId).eq("clerkUserId", clerkUserId),
    )
    .unique();

  if (!redemption) return null;

  return {
    code: redemption.code,
    listKey: redemption.listKey,
    redeemedAt: redemption.redeemedAt,
    disabledAt: redemption.disabledAt,
    status: redemption.disabledAt
      ? ("disabled" as const)
      : redemption.redeemedAt
        ? ("redeemed" as const)
        : ("issued" as const),
  };
}

export const acceptRsvp = mutation({
  args: { eventId: v.id("events"), siteKey: v.optional(v.string()) },
  handler: async (ctx, { eventId, siteKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await ensureEventInSiteScope(ctx, eventId, { siteKey });
    const clerkUserId = identity.subject;

    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("clerkUserId"), clerkUserId))
      .unique();
    if (!rsvp) throw new Error("No RSVP found");

    // Get old state before update for aggregate sync
    const oldRsvp = await ctx.db.get(rsvp._id);

    await ctx.db.patch(rsvp._id, {
      status: "attending",
      updatedAt: Date.now(),
    });

    // Sync with aggregate
    const newRsvp = await ctx.db.get(rsvp._id);
    if (oldRsvp && newRsvp) {
      await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
    }
    return { ok: true as const };
  },
});

export const listUserTickets = query({
  handler: async (ctx) => {
    return await collectUserTickets(ctx, null);
  },
});

export const listUserTicketsInWorkspace = query({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceSlug, siteKey }) => {
    if (!workspaceSlug && !siteKey) return [];
    const scope = await resolveTenantWorkspaceScope(ctx, {
      workspaceSlug,
      siteKey,
    });
    if (!scope) return [];
    return await collectUserTickets(ctx, scope);
  },
});

async function collectUserTickets(
  ctx: QueryCtx,
  scope: { workspaceSlug: string; siteKey: string | null } | null,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    if (scope) return [];
    throw new Error("Unauthorized");
  }
  const clerkUserId = identity.subject;

  const userRsvps = await ctx.db
    .query("rsvps")
    .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
    .collect();

  const ticketsWithDetails = await Promise.all(
    userRsvps.map(async (rsvp) => {
      const event = await ctx.db.get(rsvp.eventId);

      let redemptionInfo = null;
      if (rsvp.status === "approved" || rsvp.status === "attending") {
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", clerkUserId),
          )
          .unique();

        if (redemption) {
          redemptionInfo = {
            code: redemption.code,
            listKey: redemption.listKey,
            redeemedAt: redemption.redeemedAt,
          };
        }
      }

      return {
        rsvp,
        event,
        redemption: redemptionInfo,
      };
    }),
  );

  const filtered = scope
    ? ticketsWithDetails.filter((entry) => {
        if (!entry.event) return false;
        return eventMatchesTenantScope(entry.event, scope);
      })
    : ticketsWithDetails;

  return filtered.sort((a, b) => {
    if (!a.event || !b.event) return 0;
    return b.event.eventDate - a.event.eventDate;
  });
}

// Seed helper mutation - creates an RSVP with any status (for testing)
export const createDirect = mutation({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(),
    shareContact: v.boolean(),
    note: v.optional(v.string()),
    attendees: v.optional(v.number()),
    status: v.string(),
    createdAt: v.optional(v.number()),
    ticketStatus: v.optional(
      v.union(
        v.literal("not-issued"),
        v.literal("issued"),
        v.literal("disabled"),
        v.literal("redeemed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const now = args.createdAt || Date.now();
    const rsvpId = await ctx.db.insert("rsvps", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey,
      ticketStatus: args.ticketStatus ?? "not-issued",
      note: args.note,
      shareContact: args.shareContact,
      attendees: args.attendees,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });

    // Sync with aggregate
    const newRsvp = await ctx.db.get(rsvpId);
    if (newRsvp) {
      await insertRsvpIntoAggregate(ctx, newRsvp);
    }

    return rsvpId;
  },
});

// Delete an RSVP (for cleaning up test data)
export const deleteRSVP = mutation({
  args: {
    rsvpId: v.id("rsvps"),
  },
  handler: async (ctx, args) => {
    // Get RSVP before deleting for aggregate sync
    const rsvp = await ctx.db.get(args.rsvpId);

    await ctx.db.delete(args.rsvpId);

    // Sync with aggregate
    if (rsvp) {
      await deleteRsvpFromAggregate(ctx, rsvp);
    }

    return { deleted: true };
  },
});

async function getRedemptionForRsvp(ctx: MutationCtx, rsvp: Doc<"rsvps">) {
  return ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (query) =>
      query.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
    )
    .unique();
}

async function patchRsvpAndSyncAggregate(
  ctx: MutationCtx,
  rsvpId: Id<"rsvps">,
  patch: Partial<Doc<"rsvps">>,
) {
  const oldRsvp = await ctx.db.get(rsvpId);
  if (!oldRsvp) {
    throw new Error("RSVP not found");
  }

  await ctx.db.patch(rsvpId, patch);

  const newRsvp = await ctx.db.get(rsvpId);
  if (newRsvp) {
    await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
  }

  return newRsvp;
}

async function applyApprovalStatusTransition(
  ctx: MutationCtx,
  {
    rsvp,
    nextApprovalStatus,
    decidedBy,
    now,
    siteKey,
    workspaceSlug,
  }: {
    rsvp: Doc<"rsvps">;
    nextApprovalStatus: ApprovalStatus;
    decidedBy: string;
    now: number;
    siteKey?: string;
    workspaceSlug?: string;
  },
) {
  const currentApprovalStatus = deriveApprovalStatus(rsvp.status);
  if (currentApprovalStatus === nextApprovalStatus) {
    return false;
  }

  const existingRedemption = await getRedemptionForRsvp(ctx, rsvp);

  if (nextApprovalStatus === "pending") {
    if (rsvp.status === "attending") {
      throw new Error("Cannot move an attending RSVP back to pending");
    }

    if (existingRedemption?.redeemedAt) {
      throw new Error("Cannot move an RSVP with a redeemed ticket back to pending");
    }

    if (existingRedemption) {
      await ctx.db.delete(existingRedemption._id);
    }

    await patchRsvpAndSyncAggregate(ctx, rsvp._id, {
      status: "pending",
      ticketStatus: "not-issued",
      updatedAt: now,
    });
  } else if (nextApprovalStatus === "approved") {
    await patchRsvpAndSyncAggregate(ctx, rsvp._id, {
      status: "approved",
      updatedAt: now,
    });

    await ctx.runMutation(api.redemptions.updateTicketStatus, {
      rsvpId: rsvp._id,
      status: "issued",
      siteKey,
      workspaceSlug,
    });

    const redemption = await getRedemptionForRsvp(ctx, rsvp);
    if (redemption && rsvp.shareContact && rsvp.listKey) {
      await ctx.scheduler.runAfter(0, api.notifications.sendApprovalSms, {
        eventId: rsvp.eventId,
        clerkUserId: rsvp.clerkUserId,
        listKey: rsvp.listKey,
        code: redemption.code,
        shareContact: rsvp.shareContact,
      });
    }
  } else {
    let nextTicketStatus: Doc<"rsvps">["ticketStatus"] = "not-issued";

    if (existingRedemption) {
      if (!existingRedemption.disabledAt) {
        await ctx.db.patch(existingRedemption._id, { disabledAt: now });
      }
      nextTicketStatus = "disabled";
    }

    await patchRsvpAndSyncAggregate(ctx, rsvp._id, {
      status: "denied",
      ticketStatus: nextTicketStatus,
      updatedAt: now,
    });
  }

  await ctx.db.insert("approvals", {
    eventId: rsvp.eventId,
    rsvpId: rsvp._id,
    clerkUserId: rsvp.clerkUserId,
    listKey: rsvp.listKey,
    decision: nextApprovalStatus,
    decidedBy,
    decidedAt: now,
  });

  return true;
}

// Complete RSVP update with approval and ticket status
export const updateRsvpComplete = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    approvalStatus: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
    ),
    ticketStatus: v.optional(
      v.union(v.literal("issued"), v.literal("not-issued"), v.literal("disabled")),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const now = Date.now();

    if (args.approvalStatus) {
      await applyApprovalStatusTransition(ctx, {
        rsvp,
        nextApprovalStatus: args.approvalStatus,
        decidedBy: identity.subject,
        now,
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
      });
    }

    if (args.ticketStatus) {
      if (args.approvalStatus !== "denied") {
        await ctx.runMutation(api.redemptions.updateTicketStatus, {
          rsvpId: args.rsvpId,
          status: args.ticketStatus,
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });
      }
    }

    return { status: "ok" as const };
  },
});

// Complete RSVP deletion with all associated records
export const deleteRsvpComplete = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    // Delete associated redemption
    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (redemption) {
      await ctx.db.delete(redemption._id);
    }

    // Delete associated approvals
    const approvals = await ctx.db
      .query("approvals")
      .filter((q) => q.eq(q.field("rsvpId"), args.rsvpId))
      .collect();
    for (const approval of approvals) {
      await ctx.db.delete(approval._id);
    }

    // Get RSVP before deleting for aggregate sync (already have it from line 927)

    // Delete the RSVP itself
    await ctx.db.delete(args.rsvpId);

    // Sync with aggregate
    if (rsvp) {
      await deleteRsvpFromAggregate(ctx, rsvp);
    }

    return { deleted: true };
  },
});

// Update RSVP list key only
export const updateRsvpListKey = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    listKey: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    // Get old state before update for aggregate sync
    const oldRsvp = await ctx.db.get(args.rsvpId);

    await ctx.db.patch(args.rsvpId, {
      listKey: args.listKey,
    });

    // Sync with aggregate
    const newRsvp = await ctx.db.get(args.rsvpId);
    if (oldRsvp && newRsvp) {
      await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
    }

    // Update related records with the new list key
    // Update redemption record if it exists
    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (redemption) {
      await ctx.db.patch(redemption._id, {
        listKey: args.listKey,
      });
    }

    // Update approval records if they exist
    const approvals = await ctx.db
      .query("approvals")
      .filter((q) => q.eq(q.field("rsvpId"), args.rsvpId))
      .collect();
    for (const approval of approvals) {
      await ctx.db.patch(approval._id, {
        listKey: args.listKey,
      });
    }

    return { status: "ok" as const };
  },
});

// Bulk update list key for multiple RSVPs
export const bulkUpdateListKey = mutation({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        listKey: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Process all updates in a single transaction
    for (const update of args.updates) {
      try {
        const rsvp = await ctx.db.get(update.rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${update.rsvpId} not found`);
          continue;
        }
        await ensureEventInSiteScope(ctx, rsvp.eventId, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        // Get old state before update for aggregate sync
        const oldRsvp = await ctx.db.get(update.rsvpId);

        // Update RSVP
        await ctx.db.patch(update.rsvpId, { listKey: update.listKey });

        // Sync with aggregate
        const newRsvp = await ctx.db.get(update.rsvpId);
        if (oldRsvp && newRsvp) {
          await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
        }

        // Update related redemption if exists
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();
        if (redemption) {
          await ctx.db.patch(redemption._id, { listKey: update.listKey });
        }

        // Update approvals
        const approvals = await ctx.db
          .query("approvals")
          .filter((q) => q.eq(q.field("rsvpId"), update.rsvpId))
          .collect();
        for (const approval of approvals) {
          await ctx.db.patch(approval._id, { listKey: update.listKey });
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to update ${update.rsvpId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  },
});

// Migrations for aggregate backfilling
import { Migrations } from "@convex-dev/migrations";

export const migrations = new Migrations(components.migrations, {
  internalMutation,
});
export const run = migrations.runner();

export const backfillRsvpAggregate = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvpDoc) => {
    const existingRsvp = await ctx.db.get(rsvpDoc._id);
    if (!existingRsvp) {
      return;
    }

    await insertRsvpIntoAggregate(ctx, existingRsvp);
  },
});

/**
 * Check aggregate health - compares aggregate count with database count
 * Returns the difference if aggregate is out of sync
 */
export const checkAggregateHealth = query({
  args: {
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { eventId }) => {
    try {
      // Get aggregate count
      let aggregateCount: number;
      if (eventId) {
        aggregateCount = await countRsvpsWithAggregate(ctx, eventId, "all", "all");
      } else {
        // Count all RSVPs across all events
        const allRsvps = await ctx.db.query("rsvps").collect();
        aggregateCount = allRsvps.length;
        // This is a rough check - aggregate doesn't have a simple "count all" API
        // So we'll use DB count as baseline
      }

      // Get database count
      let dbCount: number;
      if (eventId) {
        const dbRsvps = await ctx.db
          .query("rsvps")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect();
        dbCount = dbRsvps.length;
      } else {
        const dbRsvps = await ctx.db.query("rsvps").collect();
        dbCount = dbRsvps.length;
      }

      const difference = dbCount - aggregateCount;
      const isHealthy = difference === 0;

      return {
        isHealthy,
        aggregateCount,
        dbCount,
        difference,
        message: isHealthy
          ? "Aggregate is in sync"
          : `Aggregate is out of sync: ${difference} RSVPs missing. Run backfillRsvpAggregate migration.`,
      };
    } catch (error) {
      return {
        isHealthy: false,
        aggregateCount: 0,
        dbCount: 0,
        difference: 0,
        message: `Error checking aggregate health: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const backfillTicketStatus = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvpDoc) => {
    if (rsvpDoc.ticketStatus !== undefined) {
      return;
    }

    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (query) =>
        query.eq("eventId", rsvpDoc.eventId).eq("clerkUserId", rsvpDoc.clerkUserId),
      )
      .unique();

    let ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed" = "not-issued";
    if (redemption) {
      if (redemption.disabledAt) {
        ticketStatus = "disabled";
      } else if (redemption.redeemedAt) {
        ticketStatus = "redeemed";
      } else {
        ticketStatus = "issued";
      }
    }

    await ctx.db.patch(rsvpDoc._id, {
      ticketStatus,
    });
  },
});

// Bulk update approval status for multiple RSVPs
export const bulkUpdateApproval = mutation({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        approvalStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const now = Date.now();

    for (const update of args.updates) {
      try {
        const rsvp = await ctx.db.get(update.rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${update.rsvpId} not found`);
          continue;
        }
        await ensureEventInSiteScope(ctx, rsvp.eventId, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        await applyApprovalStatusTransition(ctx, {
          rsvp,
          nextApprovalStatus: update.approvalStatus,
          decidedBy: identity.subject,
          now,
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to update ${update.rsvpId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  },
});

// Bulk update ticket status for multiple RSVPs
export const bulkUpdateTicketStatus = mutation({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    updates: v.array(
      v.object({
        rsvpId: v.id("rsvps"),
        ticketStatus: v.union(v.literal("issued"), v.literal("not-issued"), v.literal("disabled")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const update of args.updates) {
      try {
        const rsvp = await ctx.db.get(update.rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${update.rsvpId} not found`);
          continue;
        }
        await ensureEventInSiteScope(ctx, rsvp.eventId, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        await ctx.runMutation(api.redemptions.updateTicketStatus, {
          rsvpId: update.rsvpId,
          status: update.ticketStatus,
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to update ${update.rsvpId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  },
});

// Bulk delete multiple RSVPs
export const bulkDeleteRsvps = mutation({
  args: {
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    rsvpIds: v.array(v.id("rsvps")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const rsvpId of args.rsvpIds) {
      try {
        const rsvp = await ctx.db.get(rsvpId);
        if (!rsvp) {
          results.failed++;
          results.errors.push(`RSVP ${rsvpId} not found`);
          continue;
        }
        await ensureEventInSiteScope(ctx, rsvp.eventId, {
          siteKey: args.siteKey,
          workspaceSlug: args.workspaceSlug,
        });

        // Delete redemption
        const redemption = await ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();
        if (redemption) {
          await ctx.db.delete(redemption._id);
        }

        // Delete approvals
        const approvals = await ctx.db
          .query("approvals")
          .filter((q) => q.eq(q.field("rsvpId"), rsvpId))
          .collect();
        for (const approval of approvals) {
          await ctx.db.delete(approval._id);
        }

        // Get RSVP before deleting for aggregate sync (already have it from line 1233)

        // Delete RSVP
        await ctx.db.delete(rsvpId);

        // Sync with aggregate
        if (rsvp) {
          await deleteRsvpFromAggregate(ctx, rsvp);
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to delete ${rsvpId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  },
});
