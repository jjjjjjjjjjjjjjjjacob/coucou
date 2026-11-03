import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { generateApprovalCode } from "./codeGenerators";
import { removeContactEvent } from "./contactRecords";
import { buildGuestClerkUserId, isGuestClerkUserId } from "./guestIdentity";

// Every RSVP field that names, reaches or describes the person. Anonymization
// removes all of them; the event, list, statuses, party size, ticket state,
// timestamps and the source and API-client fields stay.
const REMOVED_IDENTITY_FIELDS = {
  userName: undefined,
  guestPhoneHash: undefined,
  guestPhoneObfuscated: undefined,
  smsPhoneHash: undefined,
  note: undefined,
  customFieldValues: undefined,
  invitedByName: undefined,
  invitedByNormalizedName: undefined,
  invitedBySocialPlatformKey: undefined,
  invitedBySocialHandle: undefined,
  invitedByUserId: undefined,
  referralCode: undefined,
  referrerUserId: undefined,
  referrerClerkUserId: undefined,
  referredByName: undefined,
  smsConsent: undefined,
  smsConsentTimestamp: undefined,
  smsConsentIpAddress: undefined,
} satisfies { [FieldName in keyof Doc<"rsvps">]?: undefined };

// The anonymized row keeps a per-row identity key, so no account, phone or
// merge lookup can match it and no two anonymized rows collide on one event.
// A guest row keeps the guest prefix so readers still report isGuest.
function buildAnonymizedClerkUserId(rsvp: Doc<"rsvps">): string {
  const anonymousKey = `anonymized-${rsvp._id}`;
  return isGuestClerkUserId(rsvp.clerkUserId) ? buildGuestClerkUserId(anonymousKey) : anonymousKey;
}

export function isRsvpAnonymization(change: {
  operation: "insert" | "update" | "delete";
  oldDoc: Doc<"rsvps"> | null;
  newDoc: Doc<"rsvps"> | null;
}): boolean {
  return (
    change.operation === "update" &&
    change.oldDoc?.anonymizedAt === undefined &&
    change.newDoc?.anonymizedAt !== undefined
  );
}

async function deleteDocuments(ctx: MutationCtx, documents: Array<{ _id: Id<TableNames> }>) {
  for (const documentId of new Set(documents.map((document) => document._id))) {
    await ctx.db.delete(documentId);
  }
}

async function deleteProfileValuesSourcedFromRsvp(ctx: MutationCtx, rsvp: Doc<"rsvps">) {
  const grants = await ctx.db
    .query("workspaceProfileValueGrants")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", rsvp.clerkUserId))
    .collect();
  await deleteDocuments(
    ctx,
    grants.filter((grant) => grant.sourceRsvpId === rsvp._id),
  );

  const values = await ctx.db
    .query("profileFieldValues")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", rsvp.clerkUserId))
    .collect();
  for (const value of values) {
    if (value.sourceRsvpId !== rsvp._id) continue;
    const remainingGrant = await ctx.db
      .query("workspaceProfileValueGrants")
      .withIndex("by_profile_value", (queryBuilder) =>
        queryBuilder.eq("profileFieldValueId", value._id),
      )
      .first();
    if (!remainingGrant) await ctx.db.delete(value._id);
  }
}

/**
 * Strips the person from one RSVP and the records hung off it, and keeps the
 * RSVP for the host. Returns the anonymized row. Webhook deliveries stored for
 * the RSVP are deleted first, so the caller's erasure notice is the only one
 * left: a triggered caller gets it from the rsvps trigger, an untriggered
 * caller passes the change to enqueueRsvpWebhookDeliveries itself.
 */
export async function anonymizeRsvp(
  ctx: MutationCtx,
  rsvp: Doc<"rsvps">,
  options: { erasingApiClientId?: Id<"apiClients"> } = {},
): Promise<Doc<"rsvps">> {
  const now = Date.now();
  const anonymizedClerkUserId = buildAnonymizedClerkUserId(rsvp);
  const identityAliases = await ctx.db
    .query("rsvpIdentityAliases")
    .withIndex("by_canonical", (queryBuilder) => queryBuilder.eq("canonicalRsvpId", rsvp._id))
    .collect();
  // Deliveries keep the id the RSVP had when they were sent, so a merged row's
  // retired ids hold copies of its phone and name too.
  const webhookDeliveries = (
    await Promise.all(
      [rsvp._id, ...identityAliases.map((alias) => alias.retiredRsvpId)].map((rsvpId) =>
        ctx.db
          .query("webhookDeliveries")
          .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpId))
          .collect(),
      ),
    )
  ).flat();
  const [
    approvals,
    redemptions,
    guestHandoffs,
    socialProfileSnapshots,
    smsRsvpSessions,
    contactEvents,
  ] = await Promise.all([
    ctx.db
      .query("approvals")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
      .collect(),
    ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (queryBuilder) =>
        queryBuilder.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .collect(),
    ctx.db
      .query("rsvpGuestHandoffs")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
      .collect(),
    ctx.db
      .query("rsvpSocialProfiles")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
      .collect(),
    ctx.db
      .query("smsRsvpSessions")
      .withIndex("by_destination_rsvp", (queryBuilder) =>
        queryBuilder.eq("destinationRsvpId", rsvp._id),
      )
      .collect(),
    ctx.db
      .query("contactEvents")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
      .collect(),
  ]);

  await deleteDocuments(ctx, [
    ...webhookDeliveries,
    ...guestHandoffs,
    ...identityAliases,
    ...socialProfileSnapshots,
    ...smsRsvpSessions,
  ]);
  for (const contactEvent of contactEvents) await removeContactEvent(ctx, contactEvent);
  await deleteProfileValuesSourcedFromRsvp(ctx, rsvp);
  for (const approval of approvals) {
    await ctx.db.patch(approval._id, {
      clerkUserId: anonymizedClerkUserId,
      denialReason: undefined,
    });
  }
  // The delivered QR code reached the person's phone, so the ticket gets a code
  // nobody holds. A redeemed ticket keeps its check-in; any other is disabled.
  for (const redemption of redemptions) {
    await ctx.db.patch(redemption._id, {
      clerkUserId: anonymizedClerkUserId,
      code: generateApprovalCode().toUpperCase(),
      disabledAt:
        redemption.redeemedAt === undefined
          ? (redemption.disabledAt ?? now)
          : redemption.disabledAt,
    });
  }

  await ctx.db.patch(rsvp._id, {
    ...REMOVED_IDENTITY_FIELDS,
    clerkUserId: anonymizedClerkUserId,
    shareContact: false,
    ticketStatus: rsvp.ticketStatus === "issued" ? "disabled" : rsvp.ticketStatus,
    anonymizedAt: now,
    updatedAt: now,
    ...(options.erasingApiClientId
      ? {
          webhookOriginApiClientId: options.erasingApiClientId,
          webhookOriginMutationId: crypto.randomUUID(),
        }
      : {}),
  });
  return (await ctx.db.get(rsvp._id)) as Doc<"rsvps">;
}
