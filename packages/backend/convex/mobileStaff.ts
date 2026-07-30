import { normalizeRedemptionCode } from "@coucou/sdk/shared/redemption-code";
import type { UserIdentity } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import {
  getIdentityOrganizationId,
  getIdentityOrganizationRole,
  requireCoucouPlatformMember,
} from "./lib/platformAuth";
import {
  type ApprovalStatus,
  type AttendanceStatus,
  resolveApprovalStatus,
  sanitizeAttendanceStatus,
} from "./lib/rsvpStatus";
import { ensureEventInSiteScope, eventMatchesSiteScope } from "./lib/siteScope";
import {
  requireWorkspaceDoor,
  requireWorkspaceHost,
  roleHasWorkspaceDoorAccess,
  roleHasWorkspaceWriteAccess,
} from "./lib/workspaceAuth";

export interface StaffCapabilities {
  canScan: boolean;
  canViewGuests: boolean;
  canEditGuests: boolean;
  canExportGuests: boolean;
}

export interface StaffWorkspace {
  workspaceId: Id<"workspaces">;
  workspaceSlug: string;
  siteKey: string;
  name: string;
  clerkOrganizationId: string;
  clerkOrganizationSlug?: string;
  membershipRole: string;
  capabilities: StaffCapabilities;
}

export interface StaffEventSummary {
  eventId: Id<"events">;
  name: string;
  secondaryTitle?: string;
  location: string;
  eventDate: number;
  eventEndDate?: number;
  eventTimezone?: string;
  status?: string;
  lifecycle?: string;
  listKeys: string[];
}

export type StaffTicketStatus = "not-issued" | "issued" | "disabled" | "redeemed";

export interface StaffGuestSummary {
  rsvpId: Id<"rsvps">;
  name: string;
  contact?: string;
  listKey: string;
  approvalStatus: ApprovalStatus;
  attendanceStatus: AttendanceStatus;
  attendees: number;
  ticketStatus: StaffTicketStatus;
  entryStatus: "checked_in" | "not_checked_in";
  createdAt: number;
  updatedAt: number;
}

export interface StaffGuestPage {
  page: StaffGuestSummary[];
  nextCursor: string | null;
  isDone: boolean;
  totalCount: number;
}

export type StaffScanOutcome =
  | {
      outcome: "redeemed";
      guest: StaffGuestSummary;
      redeemedAt: number;
    }
  | {
      outcome: "already_redeemed";
      guest: StaffGuestSummary;
      redeemedAt: number;
    }
  | {
      outcome: "undone";
      guest: StaffGuestSummary;
      message: string;
    }
  | {
      outcome: "wrong_event";
      eventId: Id<"events">;
      eventName: string;
    }
  | {
      outcome: "disabled" | "not_eligible";
      guest?: StaffGuestSummary;
      message: string;
    }
  | {
      outcome: "invalid";
      message: string;
    }
  | {
      outcome: "network_error";
      message: string;
    };

type StaffDatabaseContext = Pick<QueryCtx | MutationCtx, "db">;
const IMMEDIATE_SCAN_UNDO_WINDOW_MILLISECONDS = 10_000;

const approvalFilterValidator = v.union(
  v.literal("all"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("denied"),
);

const attendanceFilterValidator = v.union(
  v.literal("all"),
  v.literal("yes"),
  v.literal("no"),
  v.literal("maybe"),
);

const ticketFilterValidator = v.union(
  v.literal("all"),
  v.literal("not-issued"),
  v.literal("issued"),
  v.literal("disabled"),
  v.literal("redeemed"),
);

function normalizeTicketStatus(value: string | undefined): StaffTicketStatus {
  if (value === "issued" || value === "disabled" || value === "redeemed") {
    return value;
  }
  return "not-issued";
}

function resolveUserDisplayName(user: Doc<"users"> | null, rsvp: Doc<"rsvps">): string {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return fullName || user?.metadata?.name || rsvp.userName || "Unknown guest";
}

function buildStaffGuestSummaryFromRsvp(rsvp: Doc<"rsvps">): StaffGuestSummary {
  const ticketStatus = normalizeTicketStatus(rsvp.ticketStatus);
  return {
    rsvpId: rsvp._id,
    name: rsvp.userName?.trim() || "Unknown guest",
    contact: rsvp.shareContact ? rsvp.guestPhoneObfuscated : undefined,
    listKey: rsvp.listKey,
    approvalStatus: resolveApprovalStatus(rsvp),
    attendanceStatus: sanitizeAttendanceStatus(rsvp.attendanceStatus),
    attendees: rsvp.attendees ?? 1,
    ticketStatus,
    entryStatus: ticketStatus === "redeemed" ? "checked_in" : "not_checked_in",
    createdAt: rsvp.createdAt,
    updatedAt: rsvp.updatedAt,
  };
}

async function buildStaffGuestSummary(
  ctx: StaffDatabaseContext,
  rsvp: Doc<"rsvps">,
  knownRedemption?: Doc<"redemptions"> | null,
): Promise<StaffGuestSummary> {
  const [user, redemption] = await Promise.all([
    ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique(),
    knownRedemption === undefined
      ? ctx.db
          .query("redemptions")
          .withIndex("by_event_user", (queryBuilder) =>
            queryBuilder.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique()
      : Promise.resolve(knownRedemption),
  ]);

  const ticketStatus = redemption?.disabledAt
    ? "disabled"
    : redemption?.redeemedAt
      ? "redeemed"
      : redemption
        ? "issued"
        : normalizeTicketStatus(rsvp.ticketStatus);

  return {
    rsvpId: rsvp._id,
    name: resolveUserDisplayName(user, rsvp),
    contact: rsvp.shareContact ? rsvp.guestPhoneObfuscated : undefined,
    listKey: rsvp.listKey,
    approvalStatus: resolveApprovalStatus(rsvp),
    attendanceStatus: sanitizeAttendanceStatus(rsvp.attendanceStatus),
    attendees: rsvp.attendees ?? 1,
    ticketStatus,
    entryStatus: redemption?.redeemedAt ? "checked_in" : "not_checked_in",
    createdAt: rsvp.createdAt,
    updatedAt: rsvp.updatedAt,
  };
}

async function getRedemptionByCode(
  ctx: StaffDatabaseContext,
  code: string,
): Promise<Doc<"redemptions"> | null> {
  return await ctx.db
    .query("redemptions")
    .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", normalizeRedemptionCode(code)))
    .unique();
}

async function getRsvpForRedemption(
  ctx: StaffDatabaseContext,
  redemption: Doc<"redemptions">,
): Promise<Doc<"rsvps"> | null> {
  return await ctx.db
    .query("rsvps")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", redemption.eventId).eq("clerkUserId", redemption.clerkUserId),
    )
    .unique();
}

async function hasPlatformAccess(ctx: QueryCtx, identity: UserIdentity): Promise<boolean> {
  try {
    const platformIdentity = await requireCoucouPlatformMember(ctx);
    return platformIdentity.subject === identity.subject;
  } catch {
    return false;
  }
}

export const getBootstrap = query({
  args: {},
  handler: async (ctx): Promise<{ workspaces: StaffWorkspace[]; platformOverride: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { workspaces: [], platformOverride: false };
    }

    const [workspaces, storedMemberships, platformAccess] = await Promise.all([
      ctx.db.query("workspaces").collect(),
      ctx.db
        .query("orgMemberships")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identity.subject))
        .collect(),
      hasPlatformAccess(ctx, identity),
    ]);

    const roleByOrganizationId = new Map(
      storedMemberships.map((membership) => [membership.organizationId, membership.role]),
    );
    const activeOrganizationId = getIdentityOrganizationId(identity);
    const activeOrganizationRole = getIdentityOrganizationRole(identity);
    if (activeOrganizationId && activeOrganizationRole) {
      roleByOrganizationId.set(activeOrganizationId, activeOrganizationRole);
    }

    const accessibleWorkspaces: StaffWorkspace[] = [];
    for (const workspace of workspaces) {
      if (workspace.kind === "admin" || !workspace.clerkOrganizationId) {
        continue;
      }

      const membershipRole = platformAccess
        ? "org:admin"
        : roleByOrganizationId.get(workspace.clerkOrganizationId);
      if (!roleHasWorkspaceDoorAccess(membershipRole)) {
        continue;
      }

      const workspaceSites = await ctx.db
        .query("workspaceSites")
        .withIndex("by_workspace", (queryBuilder) => queryBuilder.eq("workspaceId", workspace._id))
        .collect();
      const canWrite = roleHasWorkspaceWriteAccess(membershipRole);
      accessibleWorkspaces.push({
        workspaceId: workspace._id,
        workspaceSlug: workspace.slug,
        siteKey: workspaceSites[0]?.siteKey ?? workspace.slug,
        name: workspace.name,
        clerkOrganizationId: workspace.clerkOrganizationId,
        clerkOrganizationSlug: workspace.clerkOrganizationSlug,
        membershipRole: membershipRole ?? "org:door",
        capabilities: {
          canScan: true,
          canViewGuests: true,
          canEditGuests: canWrite,
          canExportGuests: canWrite,
        },
      });
    }

    accessibleWorkspaces.sort((firstWorkspace, secondWorkspace) =>
      firstWorkspace.name.localeCompare(secondWorkspace.name),
    );
    return {
      workspaces: accessibleWorkspaces,
      platformOverride: platformAccess,
    };
  },
});

export const listEvents = query({
  args: {
    siteKey: v.string(),
    workspaceSlug: v.string(),
  },
  handler: async (ctx, { siteKey, workspaceSlug }): Promise<StaffEventSummary[]> => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    const events = await ctx.db.query("events").collect();
    const scopedEvents = events.filter((event) =>
      eventMatchesSiteScope(event, { siteKey, workspaceSlug }),
    );

    const summaries = await Promise.all(
      scopedEvents.map(async (event): Promise<StaffEventSummary> => {
        const credentials = await ctx.db
          .query("listCredentials")
          .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", event._id))
          .collect();
        return {
          eventId: event._id,
          name: event.name,
          secondaryTitle: event.secondaryTitle,
          location: event.location,
          eventDate: event.eventDate,
          eventEndDate: event.eventEndDate,
          eventTimezone: event.eventTimezone,
          status: event.status,
          lifecycle: event.lifecycle,
          listKeys: credentials
            .map((credential) => credential.listKey)
            .sort((firstListKey, secondListKey) => firstListKey.localeCompare(secondListKey)),
        };
      }),
    );

    return summaries.sort(
      (firstEvent, secondEvent) => secondEvent.eventDate - firstEvent.eventDate,
    );
  },
});

export const listGuests = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.string(),
    workspaceSlug: v.string(),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    search: v.optional(v.string()),
    approvalFilter: v.optional(approvalFilterValidator),
    attendanceFilter: v.optional(attendanceFilterValidator),
    listFilter: v.optional(v.string()),
    ticketFilter: v.optional(ticketFilterValidator),
  },
  handler: async (
    ctx,
    {
      eventId,
      siteKey,
      workspaceSlug,
      cursor,
      pageSize = 50,
      search = "",
      approvalFilter = "all",
      attendanceFilter = "all",
      listFilter,
      ticketFilter = "all",
    },
  ): Promise<StaffGuestPage> => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
      .collect();

    const roleSafeSummaries = rsvps
      .filter((rsvp) => {
        if (approvalFilter !== "all" && resolveApprovalStatus(rsvp) !== approvalFilter) {
          return false;
        }
        if (
          attendanceFilter !== "all" &&
          sanitizeAttendanceStatus(rsvp.attendanceStatus) !== attendanceFilter
        ) {
          return false;
        }
        if (listFilter && listFilter !== "all" && rsvp.listKey !== listFilter) {
          return false;
        }
        return true;
      })
      .map(buildStaffGuestSummaryFromRsvp);
    const normalizedSearch = search.trim().toLowerCase();
    const filteredGuests = roleSafeSummaries
      .filter((guest) => {
        if (
          normalizedSearch &&
          !`${guest.name} ${guest.contact ?? ""}`.toLowerCase().includes(normalizedSearch)
        ) {
          return false;
        }
        return ticketFilter === "all" || guest.ticketStatus === ticketFilter;
      })
      .sort((firstGuest, secondGuest) => {
        const nameComparison = firstGuest.name.localeCompare(secondGuest.name, undefined, {
          sensitivity: "base",
        });
        return nameComparison !== 0
          ? nameComparison
          : firstGuest.rsvpId.localeCompare(secondGuest.rsvpId);
      });

    const normalizedPageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
    const parsedCursor = cursor ? Number.parseInt(cursor, 10) : 0;
    const startIndex = Number.isFinite(parsedCursor) && parsedCursor >= 0 ? parsedCursor : 0;
    const endIndex = Math.min(startIndex + normalizedPageSize, filteredGuests.length);
    const page = filteredGuests.slice(startIndex, endIndex);

    return {
      page,
      nextCursor: endIndex < filteredGuests.length ? String(endIndex) : null,
      isDone: endIndex >= filteredGuests.length,
      totalCount: filteredGuests.length,
    };
  },
});

export const getGuest = query({
  args: {
    rsvpId: v.id("rsvps"),
    siteKey: v.string(),
    workspaceSlug: v.string(),
  },
  handler: async (ctx, { rsvpId, siteKey, workspaceSlug }): Promise<StaffGuestSummary | null> => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) {
      return null;
    }
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey,
      workspaceSlug,
    });
    return await buildStaffGuestSummary(ctx, rsvp);
  },
});

export const scanTicket = mutation({
  args: {
    eventId: v.id("events"),
    code: v.string(),
    siteKey: v.string(),
    workspaceSlug: v.string(),
  },
  handler: async (ctx, { eventId, code, siteKey, workspaceSlug }): Promise<StaffScanOutcome> => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { outcome: "invalid", message: "Sign in again to scan tickets." };
    }

    const redemption = await getRedemptionByCode(ctx, code);
    if (!redemption) {
      return { outcome: "invalid", message: "Ticket not recognized." };
    }

    const redemptionEvent = await ctx.db.get(redemption.eventId);
    if (!eventMatchesSiteScope(redemptionEvent, { siteKey, workspaceSlug })) {
      return { outcome: "invalid", message: "Ticket not recognized." };
    }
    if (redemption.eventId !== eventId && redemptionEvent) {
      return {
        outcome: "wrong_event",
        eventId: redemption.eventId,
        eventName: redemptionEvent.name,
      };
    }

    const rsvp = await getRsvpForRedemption(ctx, redemption);
    if (!rsvp) {
      return {
        outcome: "not_eligible",
        message: "This ticket is not linked to an RSVP.",
      };
    }
    if (resolveApprovalStatus(rsvp) !== "approved") {
      return {
        outcome: "not_eligible",
        guest: await buildStaffGuestSummary(ctx, rsvp, redemption),
        message: "This RSVP is not approved for entry.",
      };
    }
    if (redemption.disabledAt) {
      return {
        outcome: "disabled",
        guest: await buildStaffGuestSummary(ctx, rsvp, redemption),
        message: "This ticket has been disabled.",
      };
    }
    if (redemption.redeemedAt) {
      return {
        outcome: "already_redeemed",
        guest: await buildStaffGuestSummary(ctx, rsvp, redemption),
        redeemedAt: redemption.redeemedAt,
      };
    }

    const redeemedAt = Date.now();
    await ctx.db.patch(redemption._id, {
      redeemedAt,
      redeemedByClerkUserId: identity.subject,
    });
    await ctx.db.patch(rsvp._id, {
      ticketStatus: "redeemed",
      updatedAt: redeemedAt,
    });
    const updatedRedemption = {
      ...redemption,
      redeemedAt,
      redeemedByClerkUserId: identity.subject,
    };

    return {
      outcome: "redeemed",
      guest: await buildStaffGuestSummary(
        ctx,
        {
          ...rsvp,
          ticketStatus: "redeemed",
          updatedAt: redeemedAt,
        },
        updatedRedemption,
      ),
      redeemedAt,
    };
  },
});

export const undoScan = mutation({
  args: {
    eventId: v.id("events"),
    code: v.string(),
    reason: v.optional(v.string()),
    siteKey: v.string(),
    workspaceSlug: v.string(),
  },
  handler: async (
    ctx,
    { eventId, code, reason, siteKey, workspaceSlug },
  ): Promise<StaffScanOutcome> => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { outcome: "invalid", message: "Sign in again to undo entry." };
    }

    const redemption = await getRedemptionByCode(ctx, code);
    if (!redemption || redemption.eventId !== eventId || !redemption.redeemedAt) {
      return { outcome: "invalid", message: "Checked-in ticket not found." };
    }
    const rsvp = await getRsvpForRedemption(ctx, redemption);
    if (!rsvp) {
      return { outcome: "invalid", message: "RSVP not found." };
    }

    const updatedAt = Date.now();
    if (
      redemption.redeemedByClerkUserId !== identity.subject ||
      updatedAt - redemption.redeemedAt > IMMEDIATE_SCAN_UNDO_WINDOW_MILLISECONDS
    ) {
      return {
        outcome: "invalid",
        message: "The immediate undo window has ended.",
      };
    }
    await ctx.db.patch(redemption._id, {
      redeemedAt: undefined,
      redeemedByClerkUserId: undefined,
      unredeemHistory: [
        ...(redemption.unredeemHistory ?? []),
        {
          at: updatedAt,
          byClerkUserId: identity.subject,
          reason: reason?.trim() || "Immediate mobile scan undo",
        },
      ],
    });
    const ticketStatus: StaffTicketStatus = redemption.disabledAt ? "disabled" : "issued";
    await ctx.db.patch(rsvp._id, {
      ticketStatus,
      updatedAt,
    });

    return {
      outcome: "undone",
      guest: await buildStaffGuestSummary(
        ctx,
        { ...rsvp, ticketStatus, updatedAt },
        { ...redemption, redeemedAt: undefined, redeemedByClerkUserId: undefined },
      ),
      message: "Entry undone.",
    };
  },
});

export const setEntryStatus = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    checkedIn: v.boolean(),
    reason: v.optional(v.string()),
    siteKey: v.string(),
    workspaceSlug: v.string(),
  },
  handler: async (
    ctx,
    { rsvpId, checkedIn, reason, siteKey, workspaceSlug },
  ): Promise<StaffScanOutcome> => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { outcome: "invalid", message: "Sign in again to change entry." };
    }
    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) {
      return { outcome: "invalid", message: "RSVP not found." };
    }
    await ensureEventInSiteScope(ctx, rsvp.eventId, { siteKey, workspaceSlug });

    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (queryBuilder) =>
        queryBuilder.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (!redemption) {
      return {
        outcome: "not_eligible",
        guest: await buildStaffGuestSummary(ctx, rsvp, null),
        message: "This guest does not have a ticket.",
      };
    }
    if (redemption.disabledAt) {
      return {
        outcome: "disabled",
        guest: await buildStaffGuestSummary(ctx, rsvp, redemption),
        message: "This ticket has been disabled.",
      };
    }
    if (checkedIn && resolveApprovalStatus(rsvp) !== "approved") {
      return {
        outcome: "not_eligible",
        guest: await buildStaffGuestSummary(ctx, rsvp, redemption),
        message: "Approve this RSVP before checking the guest in.",
      };
    }

    const updatedAt = Date.now();
    if (checkedIn) {
      if (redemption.redeemedAt) {
        return {
          outcome: "already_redeemed",
          guest: await buildStaffGuestSummary(ctx, rsvp, redemption),
          redeemedAt: redemption.redeemedAt,
        };
      }
      await ctx.db.patch(redemption._id, {
        redeemedAt: updatedAt,
        redeemedByClerkUserId: identity.subject,
      });
      await ctx.db.patch(rsvp._id, {
        ticketStatus: "redeemed",
        updatedAt,
      });
      return {
        outcome: "redeemed",
        guest: await buildStaffGuestSummary(
          ctx,
          { ...rsvp, ticketStatus: "redeemed", updatedAt },
          { ...redemption, redeemedAt: updatedAt, redeemedByClerkUserId: identity.subject },
        ),
        redeemedAt: updatedAt,
      };
    }

    if (!redemption.redeemedAt) {
      return {
        outcome: "not_eligible",
        guest: await buildStaffGuestSummary(ctx, rsvp, redemption),
        message: "This guest is not checked in.",
      };
    }
    await ctx.db.patch(redemption._id, {
      redeemedAt: undefined,
      redeemedByClerkUserId: undefined,
      unredeemHistory: [
        ...(redemption.unredeemHistory ?? []),
        {
          at: updatedAt,
          byClerkUserId: identity.subject,
          reason: reason?.trim() || "Manual mobile entry update",
        },
      ],
    });
    await ctx.db.patch(rsvp._id, {
      ticketStatus: "issued",
      updatedAt,
    });
    return {
      outcome: "undone",
      guest: await buildStaffGuestSummary(
        ctx,
        { ...rsvp, ticketStatus: "issued", updatedAt },
        { ...redemption, redeemedAt: undefined, redeemedByClerkUserId: undefined },
      ),
      message: "Entry undone.",
    };
  },
});
