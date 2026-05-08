import type { UserIdentity } from "convex/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./functions";
import { generateApprovalCode } from "./lib/codeGenerators";
import { resolvePublicBaseUrlForEvent } from "./lib/publicBaseUrl";
import { updateRsvpInAggregate } from "./lib/rsvpAggregate";
import { ensureEventInSiteScope } from "./lib/siteScope";

function _isEmailHost(evHosts: string[], email?: string | null) {
  if (!email) return false;
  const target = email.toLowerCase();
  return evHosts.some((h) => h.toLowerCase() === target);
}

type UserIdentityWithRole = UserIdentity & {
  role?: string;
};

export const applyApproval = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    code: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, code, siteKey, workspaceSlug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const approverId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    const ev = await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey,
      workspaceSlug,
    });

    // Authorization: rely on roles embedded in JWT
    const role = (identity as UserIdentityWithRole).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) throw new Error("Forbidden: host role required");

    const now = Date.now();
    const oldRsvp = await ctx.db.get(rsvpId);

    // Upsert redemption
    const existingRedemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();

    let outCode: string;
    let ticketStatus: "issued" | "disabled" | "redeemed" = "issued";
    if (!existingRedemption) {
      // Generate code (use provided or fallback) and store in uppercase
      const rawCode = code || generateApprovalCode();
      outCode = rawCode.toUpperCase();
      await ctx.db.insert("redemptions", {
        eventId: rsvp.eventId,
        clerkUserId: rsvp.clerkUserId,
        listKey: rsvp.listKey,
        code: outCode,
        createdAt: now,
        disabledAt: undefined,
        redeemedAt: undefined,
        redeemedByClerkUserId: undefined,
        unredeemHistory: [],
      });
    } else {
      outCode = existingRedemption.code;
      await ctx.db.patch(existingRedemption._id, {
        listKey: rsvp.listKey,
        disabledAt: undefined,
      });
      ticketStatus = existingRedemption.redeemedAt ? "redeemed" : "issued";
    }

    await ctx.db.patch(rsvpId, {
      status: "approved",
      ticketStatus,
      updatedAt: now,
    });

    // Sync with aggregate
    const newRsvp = await ctx.db.get(rsvpId);
    if (oldRsvp && newRsvp) {
      await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
    }

    // Record approval audit
    await ctx.db.insert("approvals", {
      eventId: rsvp.eventId,
      rsvpId,
      clerkUserId: rsvp.clerkUserId,
      listKey: rsvp.listKey,
      decision: "approved",
      decidedBy: approverId,
      decidedAt: now,
    });

    const base = resolvePublicBaseUrlForEvent(ev);
    const redeemUrl = base ? `${base}/redeem/${outCode}` : undefined;

    // Schedule SMS notification if contact sharing is allowed and listKey exists
    if (rsvp.listKey) {
      await ctx.scheduler.runAfter(0, api.notifications.sendApprovalSms, {
        eventId: rsvp.eventId,
        clerkUserId: rsvp.clerkUserId,
        listKey: rsvp.listKey,
        code: outCode,
        shareContact: rsvp.shareContact,
      });
    }
    return { ok: true as const, code: outCode, redeemUrl, user: identity };
  },
});

export const approve = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    reason: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, reason, siteKey, workspaceSlug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const approverId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey,
      workspaceSlug,
    });

    // Authorization: rely on roles in JWT
    const role = (identity as UserIdentityWithRole).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) throw new Error("Forbidden: admin role required");

    const now = Date.now();

    // Get old state before update for aggregate sync
    const oldRsvp = await ctx.db.get(rsvpId);

    // Create a redemption if one doesn't exist, or re-enable if disabled
    const existingRedemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();

    let redemptionCode: string;
    let ticketStatus: "issued" | "redeemed" = "issued";
    if (!existingRedemption) {
      // Create new redemption
      redemptionCode = generateApprovalCode().toUpperCase();
      await ctx.db.insert("redemptions", {
        eventId: rsvp.eventId,
        clerkUserId: rsvp.clerkUserId,
        listKey: rsvp.listKey,
        code: redemptionCode,
        createdAt: now,
        disabledAt: undefined,
        redeemedAt: undefined,
        redeemedByClerkUserId: undefined,
        unredeemHistory: [],
      });
    } else {
      // Re-enable existing redemption if it was disabled
      redemptionCode = existingRedemption.code;
      // If redemption already redeemed keep status as redeemed
      if (existingRedemption.redeemedAt) {
        ticketStatus = "redeemed";
      }
      if (existingRedemption.disabledAt) {
        await ctx.db.patch(existingRedemption._id, {
          disabledAt: undefined,
          listKey: rsvp.listKey, // Update list key in case it changed
        });
        if (!existingRedemption.redeemedAt) {
          ticketStatus = "issued";
        }
      }
    }

    await ctx.db.patch(rsvpId, {
      status: "approved",
      ticketStatus,
      updatedAt: now,
    });

    // Sync with aggregate
    const newRsvp = await ctx.db.get(rsvpId);
    if (oldRsvp && newRsvp) {
      await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
    }

    await ctx.db.insert("approvals", {
      eventId: rsvp.eventId,
      rsvpId,
      clerkUserId: rsvp.clerkUserId,
      listKey: rsvp.listKey,
      decision: "approved",
      decidedBy: approverId,
      decidedAt: now,
      denialReason: reason,
    });

    return { ok: true as const, code: redemptionCode };
  },
});

export const deny = mutation({
  args: {
    rsvpId: v.id("rsvps"),
    reason: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { rsvpId, reason, siteKey, workspaceSlug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const approverId = identity.subject;

    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp) throw new Error("RSVP not found");
    await ensureEventInSiteScope(ctx, rsvp.eventId, {
      siteKey,
      workspaceSlug,
    });

    // Authorization: rely on roles in JWT
    const role = (identity as UserIdentityWithRole).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) throw new Error("Forbidden: host role required");

    const now = Date.now();

    // Get old state before update for aggregate sync
    const oldRsvp = await ctx.db.get(rsvpId);

    // Disable redemption if exists
    const existingRedemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    let ticketStatus: "disabled" | "not-issued" = "not-issued";
    if (existingRedemption && !existingRedemption.disabledAt) {
      await ctx.db.patch(existingRedemption._id, { disabledAt: now });
      ticketStatus = "disabled";
    }

    await ctx.db.patch(rsvpId, {
      status: "denied",
      ticketStatus,
      updatedAt: now,
    });

    // Sync with aggregate
    const newRsvp = await ctx.db.get(rsvpId);
    if (oldRsvp && newRsvp) {
      await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
    }

    await ctx.db.insert("approvals", {
      eventId: rsvp.eventId,
      rsvpId,
      clerkUserId: rsvp.clerkUserId,
      listKey: rsvp.listKey,
      decision: "denied",
      decidedBy: approverId,
      decidedAt: now,
      denialReason: reason,
    });

    return { ok: true as const };
  },
});
