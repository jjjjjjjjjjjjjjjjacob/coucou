import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolvePublicBaseUrlForEvent } from "./publicBaseUrl";
import { resolveApprovalStatus } from "./rsvpStatus";

export interface RsvpTicketSnapshot {
  status: "issued" | "disabled" | "redeemed";
  qrEnabled: boolean;
  redemptionCode: string;
  redeemUrl: string | null;
}

export async function buildRsvpTicketSnapshot(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  rsvp: Doc<"rsvps">,
): Promise<RsvpTicketSnapshot | null> {
  if (resolveApprovalStatus(rsvp) !== "approved") {
    return null;
  }

  const redemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", event._id).eq("clerkUserId", rsvp.clerkUserId),
    )
    .unique();
  if (!redemption) {
    return null;
  }

  const listCredential = await ctx.db
    .query("listCredentials")
    .withIndex("by_event_key", (queryBuilder) =>
      queryBuilder.eq("eventId", event._id).eq("listKey", rsvp.listKey),
    )
    .first();
  const qrEnabled = listCredential?.generateQR === true;
  const publicBaseUrl = resolvePublicBaseUrlForEvent(event);

  return {
    status: redemption.disabledAt ? "disabled" : redemption.redeemedAt ? "redeemed" : "issued",
    qrEnabled,
    redemptionCode: redemption.code,
    redeemUrl: qrEnabled && publicBaseUrl ? `${publicBaseUrl}/redeem/${redemption.code}` : null,
  };
}
