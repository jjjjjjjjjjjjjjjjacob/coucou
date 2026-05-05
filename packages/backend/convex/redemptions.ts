import { mutation, query } from "./functions";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { generateRedemptionCode } from "./lib/codeGenerators";
import { canManuallyEditTicket } from "./lib/rsvpStatus";
import { ensureEventInSiteScope, getEventInSiteScope } from "./lib/siteScope";
import { requireWorkspaceDoor, requireWorkspaceHost } from "./lib/workspaceAuth";

async function getScopedRedemptionByCode(
  ctx: QueryCtx | MutationCtx,
  args: {
    code: string;
    siteKey?: string;
    workspaceSlug?: string;
  },
) {
  const normalizedCode = args.code.toUpperCase();
  const redemptionRecord = await ctx.db
    .query("redemptions")
    .withIndex("by_code", (queryBuilder) =>
      queryBuilder.eq("code", normalizedCode),
    )
    .unique();

  if (!redemptionRecord) {
    return null;
  }

  const event = await getEventInSiteScope(ctx, redemptionRecord.eventId, {
    siteKey: args.siteKey,
    workspaceSlug: args.workspaceSlug,
  });
  if (!event) {
    return null;
  }

  return redemptionRecord;
}

export const byCode = query({
  args: {
    code: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { code, siteKey, workspaceSlug }) => {
    const rec = await getScopedRedemptionByCode(ctx, {
      code,
      siteKey,
      workspaceSlug,
    });
    if (!rec) return { status: "invalid" as const };

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", rec.clerkUserId))
      .unique();
    const name = user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`.trim()
      : user?.firstName || user?.lastName || undefined;

    if (rec.disabledAt) return { status: "invalid" as const };
    if (rec.redeemedAt)
      return { status: "redeemed" as const, name, listKey: rec.listKey };
    return { status: "valid" as const, name, listKey: rec.listKey };
  },
});

export const validate = query({
  args: {
    code: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { code, siteKey, workspaceSlug }) => {
    const rec = await getScopedRedemptionByCode(ctx, {
      code,
      siteKey,
      workspaceSlug,
    });
    if (!rec) return { status: "invalid" as const };

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", rec.clerkUserId))
      .unique();
    const name = user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`.trim()
      : user?.firstName || user?.lastName || undefined;

    if (rec.disabledAt) return { status: "invalid" as const, eventId: rec.eventId };
    if (rec.redeemedAt)
      return { status: "redeemed" as const, name, listKey: rec.listKey, eventId: rec.eventId };
    return { status: "valid" as const, name, listKey: rec.listKey, eventId: rec.eventId };
  },
});

export const redeem = mutation({
  args: {
    code: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { code, siteKey, workspaceSlug }) => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const redeemerId = identity.subject;

    const rec = await getScopedRedemptionByCode(ctx, {
      code,
      siteKey,
      workspaceSlug,
    });
    if (!rec) throw new Error("Invalid code");
    if (rec.disabledAt) throw new Error("Invalid code");
    if (rec.redeemedAt) return { status: "already" as const };

    const now = Date.now();
    await ctx.db.patch(rec._id, {
      redeemedAt: now,
      redeemedByClerkUserId: redeemerId,
    });

    const relatedRsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rec.eventId).eq("clerkUserId", rec.clerkUserId),
      )
      .unique();
    if (relatedRsvp) {
      await ctx.db.patch(relatedRsvp._id, {
        ticketStatus: "redeemed",
        updatedAt: now,
      });
    }
    return { status: "ok" as const };
  },
});

export const unredeem = mutation({
  args: {
    code: v.string(),
    reason: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { code, reason, siteKey, workspaceSlug }) => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const redeemerId = identity.subject;

    const rec = await getScopedRedemptionByCode(ctx, {
      code,
      siteKey,
      workspaceSlug,
    });
    if (!rec) throw new Error("Invalid code");

    const hist = rec.unredeemHistory ?? [];
    const now = Date.now();
    hist.push({ at: now, byClerkUserId: redeemerId, reason });
    await ctx.db.patch(rec._id, {
      redeemedAt: undefined,
      redeemedByClerkUserId: undefined,
      unredeemHistory: hist,
    });

    const relatedRsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rec.eventId).eq("clerkUserId", rec.clerkUserId),
      )
      .unique();
    if (relatedRsvp) {
      await ctx.db.patch(relatedRsvp._id, {
        ticketStatus: rec.disabledAt ? "disabled" : "issued",
        updatedAt: now,
      });
    }
    return { status: "ok" as const };
  },
});

export const listForEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    await requireWorkspaceDoor(ctx, { siteKey, workspaceSlug });
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const rows = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .collect();
    return rows.map((r) => ({
      clerkUserId: r.clerkUserId,
      listKey: r.listKey,
      code: r.code,
      redeemedAt: r.redeemedAt,
      disabledAt: r.disabledAt,
    }));
  },
});

export const forCurrentUserEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const event = await getEventInSiteScope(ctx, eventId, {
      siteKey,
      workspaceSlug,
    });
    if (!event) return null;

    // Query user document first to establish reactive dependency
    // This ensures the query re-runs when user document becomes available
    const userDocument = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    const redemptionRecord = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => {
        return q.eq("eventId", eventId).eq("clerkUserId", identity.subject);
      })
      .unique();
    if (!redemptionRecord) return null;
    return { code: redemptionRecord.code, listKey: redemptionRecord.listKey };
  },
});

export const getRedemptionByRsvpId = query({
  args: {
    rsvpId: v.id("rsvps"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, siteKey, workspaceSlug }) => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const rsvpRecord = await ctx.db.get(rsvpId);
    if (!rsvpRecord) return null;
    await ensureEventInSiteScope(ctx, rsvpRecord.eventId, {
      siteKey,
      workspaceSlug,
    });

    const redemptionRecord = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q
          .eq("eventId", rsvpRecord.eventId)
          .eq("clerkUserId", rsvpRecord.clerkUserId),
      )
      .unique();

    if (!redemptionRecord) return null;

    return {
      code: redemptionRecord.code,
      listKey: redemptionRecord.listKey,
      redeemedAt: redemptionRecord.redeemedAt,
      disabledAt: redemptionRecord.disabledAt,
      status: redemptionRecord.disabledAt
        ? ("disabled" as const)
        : redemptionRecord.redeemedAt
          ? ("redeemed" as const)
          : ("issued" as const),
    };
  },
});

export const toggleRedemptionStatus = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, siteKey, workspaceSlug }) => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const rsvpRecord = await ctx.db.get(rsvpId);
    if (!rsvpRecord) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvpRecord.eventId, {
      siteKey,
      workspaceSlug,
    });

    if (!canManuallyEditTicket(rsvpRecord.status)) {
      throw new Error("Cannot modify ticket for this RSVP status");
    }

    const redemptionRecord = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q
          .eq("eventId", rsvpRecord.eventId)
          .eq("clerkUserId", rsvpRecord.clerkUserId),
      )
      .unique();

    if (!redemptionRecord) throw new Error("Redemption not found");

    if (redemptionRecord.redeemedAt) {
      throw new Error("Cannot toggle status for already redeemed code");
    }

    const currentlyDisabled = !!redemptionRecord.disabledAt;

    const now = Date.now();
    await ctx.db.patch(redemptionRecord._id, {
      disabledAt: currentlyDisabled ? undefined : now,
    });

    await ctx.db.patch(rsvpRecord._id, {
      ticketStatus: currentlyDisabled ? "issued" : "disabled",
      updatedAt: now,
    });

    return {
      status: currentlyDisabled ? ("enabled" as const) : ("disabled" as const),
    };
  },
});

export const updateTicketStatus = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    status: v.union(v.literal("issued"), v.literal("not-issued"), v.literal("disabled")),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, status, siteKey, workspaceSlug }) => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const rsvpRecord = await ctx.db.get(rsvpId);
    if (!rsvpRecord) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvpRecord.eventId, {
      siteKey,
      workspaceSlug,
    });

    if (rsvpRecord.status === "denied") {
      throw new Error("Cannot modify ticket for denied RSVP");
    }

    if (!canManuallyEditTicket(rsvpRecord.status) && status !== "not-issued") {
      throw new Error("Cannot issue or disable a ticket for a pending RSVP");
    }

    const existingRedemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q
          .eq("eventId", rsvpRecord.eventId)
          .eq("clerkUserId", rsvpRecord.clerkUserId),
      )
      .unique();

    const now = Date.now();
    let nextTicketStatus: "not-issued" | "issued" | "disabled" | "redeemed" =
      (rsvpRecord.ticketStatus as
        | "not-issued"
        | "issued"
        | "disabled"
        | "redeemed") ?? "not-issued";

    if (
      !canManuallyEditTicket(rsvpRecord.status) &&
      existingRedemption?.redeemedAt
    ) {
      throw new Error("Cannot remove a redeemed ticket from a pending RSVP");
    }

    if (status === "issued") {
      if (!existingRedemption) {
        // Create new redemption
        let code: string;
        let attempts = 0;
        do {
          code = generateRedemptionCode();
          const existing = await ctx.db
            .query("redemptions")
            .withIndex("by_code", (q) => q.eq("code", code))
            .unique();
          if (!existing) break;
          attempts++;
        } while (attempts < 10);

        if (attempts >= 10) {
          throw new Error("Could not generate unique redemption code");
        }

        await ctx.db.insert("redemptions", {
          eventId: rsvpRecord.eventId,
          clerkUserId: rsvpRecord.clerkUserId,
          listKey: rsvpRecord.listKey,
          code,
          createdAt: now,
          unredeemHistory: [],
        });
        nextTicketStatus = "issued";
      } else if (existingRedemption.disabledAt) {
        // Re-enable existing redemption
        await ctx.db.patch(existingRedemption._id, {
          disabledAt: undefined,
        });
        nextTicketStatus = existingRedemption.redeemedAt
          ? "redeemed"
          : "issued";
      } else if (existingRedemption.redeemedAt) {
        nextTicketStatus = "redeemed";
      } else {
        nextTicketStatus = "issued";
      }
    } else if (status === "disabled" && existingRedemption && !existingRedemption.disabledAt) {
      // Disable existing redemption
      await ctx.db.patch(existingRedemption._id, {
        disabledAt: now,
      });
      nextTicketStatus = "disabled";
    } else if (status === "not-issued" && existingRedemption) {
      // Delete redemption entirely
      await ctx.db.delete(existingRedemption._id);
      nextTicketStatus = "not-issued";
    } else if (status === "not-issued" && !existingRedemption) {
      nextTicketStatus = "not-issued";
    }

    if (nextTicketStatus !== rsvpRecord.ticketStatus) {
      await ctx.db.patch(rsvpRecord._id, {
        ticketStatus: nextTicketStatus,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(rsvpRecord._id, {
        updatedAt: now,
      });
    }

    return { status: "ok" as const };
  },
});

// Seed helper mutation - creates a redemption code for an RSVP
export const createForRSVP = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if redemption already exists
    const existing = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", args.eventId).eq("clerkUserId", args.clerkUserId)
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = generateRedemptionCode();
      const existing = await ctx.db
        .query("redemptions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new Error("Could not generate unique redemption code");
    }

    const redemptionId = await ctx.db.insert("redemptions", {
      eventId: args.eventId,
      clerkUserId: args.clerkUserId,
      listKey: args.listKey,
      code,
      createdAt: Date.now(),
      unredeemHistory: [],
    });

    const rsvpRecord = await ctx.db.get(args.rsvpId);
    if (rsvpRecord) {
      await ctx.db.patch(args.rsvpId, {
        ticketStatus: "issued",
        updatedAt: Date.now(),
      });
    }

    return redemptionId;
  },
});

// Delete a redemption (for cleaning up test data)
export const deleteForRSVP = mutation({
  args: {
    rsvpId: v.id("rsvps"),
  },
  handler: async (ctx, args) => {
    const rsvp = await ctx.db.get(args.rsvpId);
    if (!rsvp) return { deleted: false };

    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId)
      )
      .unique();

    if (redemption) {
      await ctx.db.delete(redemption._id);
      await ctx.db.patch(args.rsvpId, {
        ticketStatus: "not-issued",
        updatedAt: Date.now(),
      });
      return { deleted: true };
    }
    return { deleted: false };
  },
});
