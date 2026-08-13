import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { generateRedemptionCode } from "./codeGenerators";
import { updateRsvpInAggregate } from "./rsvpAggregate";
import { type ApprovalStatus, resolveApprovalStatus } from "./rsvpStatus";

export const AUTOMATIC_APPROVAL_ACTOR = "system:auto-approve";

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
  const previousRsvp = await ctx.db.get(rsvpId);
  if (!previousRsvp) {
    throw new Error("RSVP not found");
  }

  await ctx.db.patch(rsvpId, patch);

  const updatedRsvp = await ctx.db.get(rsvpId);
  if (updatedRsvp) {
    await updateRsvpInAggregate(ctx, previousRsvp, updatedRsvp);
  }

  return updatedRsvp;
}

export async function applyApprovalStatusTransition(
  ctx: MutationCtx,
  {
    rsvp,
    nextApprovalStatus,
    decidedBy,
    now,
  }: {
    rsvp: Doc<"rsvps">;
    nextApprovalStatus: ApprovalStatus;
    decidedBy: string;
    now: number;
  },
) {
  const currentApprovalStatus = resolveApprovalStatus(rsvp);
  if (currentApprovalStatus === nextApprovalStatus) {
    return false;
  }

  const existingRedemption = await getRedemptionForRsvp(ctx, rsvp);

  if (nextApprovalStatus === "pending") {
    if (existingRedemption?.redeemedAt) {
      throw new Error("Cannot move an RSVP with a redeemed ticket back to pending");
    }

    if (existingRedemption) {
      await ctx.db.delete(existingRedemption._id);
    }

    await patchRsvpAndSyncAggregate(ctx, rsvp._id, {
      status: "pending",
      approvalStatus: "pending",
      ticketStatus: "not-issued",
      updatedAt: now,
    });
  } else if (nextApprovalStatus === "approved") {
    let redemption = existingRedemption;
    let nextTicketStatus: "issued" | "redeemed" = "issued";
    if (!redemption) {
      let code = "";
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidateCode = generateRedemptionCode();
        const duplicateRedemption = await ctx.db
          .query("redemptions")
          .withIndex("by_code", (queryBuilder) => queryBuilder.eq("code", candidateCode))
          .unique();
        if (!duplicateRedemption) {
          code = candidateCode;
          break;
        }
      }
      if (!code) {
        throw new Error("Could not generate unique redemption code");
      }
      const redemptionId = await ctx.db.insert("redemptions", {
        eventId: rsvp.eventId,
        clerkUserId: rsvp.clerkUserId,
        listKey: rsvp.listKey,
        code,
        createdAt: now,
        unredeemHistory: [],
      });
      redemption = await ctx.db.get(redemptionId);
    } else {
      nextTicketStatus = redemption.redeemedAt ? "redeemed" : "issued";
      if (redemption.disabledAt || redemption.listKey !== rsvp.listKey) {
        await ctx.db.patch(redemption._id, {
          disabledAt: undefined,
          listKey: rsvp.listKey,
        });
        redemption = await ctx.db.get(redemption._id);
      }
    }

    await patchRsvpAndSyncAggregate(ctx, rsvp._id, {
      status: "approved",
      approvalStatus: "approved",
      ticketStatus: nextTicketStatus,
      updatedAt: now,
    });
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
      approvalStatus: "denied",
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

export async function tryAutoApproveRsvp(ctx: MutationCtx, rsvp: Doc<"rsvps">): Promise<boolean> {
  if (resolveApprovalStatus(rsvp) !== "pending") {
    return false;
  }

  const listCredential = await ctx.db
    .query("listCredentials")
    .withIndex("by_event_key", (queryBuilder) =>
      queryBuilder.eq("eventId", rsvp.eventId).eq("listKey", rsvp.listKey),
    )
    .unique();
  const autoApproveLimit = listCredential?.autoApproveLimit;
  if (
    !listCredential ||
    typeof autoApproveLimit !== "number" ||
    !Number.isSafeInteger(autoApproveLimit) ||
    autoApproveLimit <= 0
  ) {
    return false;
  }

  const autoApprovedCount =
    listCredential.autoApprovedCount !== undefined &&
    Number.isSafeInteger(listCredential.autoApprovedCount) &&
    listCredential.autoApprovedCount >= 0
      ? listCredential.autoApprovedCount
      : 0;
  if (autoApprovedCount >= autoApproveLimit) {
    return false;
  }

  const now = Date.now();
  const autoApproveDelayMinutes = listCredential.autoApproveDelayMinutes;
  if (
    typeof autoApproveDelayMinutes === "number" &&
    Number.isSafeInteger(autoApproveDelayMinutes) &&
    autoApproveDelayMinutes > 0
  ) {
    const event = await ctx.db.get(rsvp.eventId);
    if (!event) {
      return false;
    }

    const delayMilliseconds = autoApproveDelayMinutes * 60 * 1000;
    const scheduledApprovalTimestamp = Math.min(now + delayMilliseconds, event.eventDate);
    if (scheduledApprovalTimestamp > now) {
      await ctx.db.patch(listCredential._id, {
        autoApprovedCount: autoApprovedCount + 1,
      });
      await ctx.scheduler.runAt(
        scheduledApprovalTimestamp,
        internal.rsvps.runScheduledAutoApproval,
        {
          rsvpId: rsvp._id,
          listCredentialId: listCredential._id,
        },
      );
      return false;
    }
  }

  await ctx.db.patch(listCredential._id, {
    autoApprovedCount: autoApprovedCount + 1,
  });

  return await applyApprovalStatusTransition(ctx, {
    rsvp,
    nextApprovalStatus: "approved",
    decidedBy: AUTOMATIC_APPROVAL_ACTOR,
    now,
  });
}
