import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { generateApprovalCode } from "./codeGenerators";
import { removeContactEvent } from "./contactRecords";
import {
  buildGuestClerkUserId,
  GUEST_CLERK_USER_ID_PREFIX,
  isGuestClerkUserId,
} from "./guestIdentity";

// One RSVP's anonymization reads about twenty index ranges and rewrites the
// records hung off it, so this many stay well inside one Convex transaction's
// limits. Larger sets are split: account deletion schedules batches, and a
// partner erasure returns status "partial" for the partner to repeat.
export const MAX_RSVPS_ANONYMIZED_PER_TRANSACTION = 50;

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

// Audit entries about an RSVP can hold a JSON copy of the row, the evidence
// record that ties it to a phone, and the person as actor. The entry stays as a
// record that the action happened; everything that names the person goes.
async function redactAuditEntries(ctx: MutationCtx, rsvp: Doc<"rsvps">, rsvpIds: Id<"rsvps">[]) {
  for (const rsvpId of rsvpIds) {
    const auditEntries = await ctx.db
      .query("auditLog")
      .withIndex("by_target", (queryBuilder) => queryBuilder.eq("targetId", rsvpId))
      .collect();
    for (const auditEntry of auditEntries) {
      if (auditEntry.targetKind !== "rsvp") continue;
      const actor = auditEntry.actorClerkUserId;
      const actorIsPerson =
        actor !== undefined &&
        (actor === rsvp.clerkUserId || actor === auditEntry.metadata?.canonicalClerkUserId);
      await ctx.db.patch(auditEntry._id, {
        metadata: { redacted: "rsvp_anonymized" },
        ...(actorIsPerson ? { actorClerkUserId: undefined, actorEmail: undefined } : {}),
      });
    }
  }
}

// SMS logs stay, keyed by phone hash, but must not say which RSVP that phone
// belonged to. Recipient rows hold an array, which no index reaches, so they are
// found through the person's phone hashes.
async function removeRsvpIdsFromSmsLogs(
  ctx: MutationCtx,
  rsvpIds: Id<"rsvps">[],
  phoneHashes: Set<string>,
) {
  const anonymizedRsvpIds = new Set<Id<"rsvps">>(rsvpIds);
  for (const phoneHash of phoneHashes) {
    const recipients = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
      .collect();
    for (const recipient of recipients) {
      if (!recipient.sourceRsvpIds.some((rsvpId) => anonymizedRsvpIds.has(rsvpId))) continue;
      await ctx.db.patch(recipient._id, {
        sourceRsvpIds: recipient.sourceRsvpIds.filter((rsvpId) => !anonymizedRsvpIds.has(rsvpId)),
      });
    }
  }
  for (const rsvpId of rsvpIds) {
    const [sourceReplyAttempts, destinationReplyAttempts, inboundReceipts] = await Promise.all([
      ctx.db
        .query("textBlastReplyAttempts")
        .withIndex("by_source_rsvp", (queryBuilder) => queryBuilder.eq("sourceRsvpId", rsvpId))
        .collect(),
      ctx.db
        .query("textBlastReplyAttempts")
        .withIndex("by_destination_rsvp", (queryBuilder) =>
          queryBuilder.eq("destinationRsvpId", rsvpId),
        )
        .collect(),
      ctx.db
        .query("smsInboundReceipts")
        .withIndex("by_destination_rsvp", (queryBuilder) =>
          queryBuilder.eq("destinationRsvpId", rsvpId),
        )
        .collect(),
    ]);
    for (const replyAttempt of sourceReplyAttempts) {
      await ctx.db.patch(replyAttempt._id, { sourceRsvpId: undefined });
    }
    for (const replyAttempt of destinationReplyAttempts) {
      await ctx.db.patch(replyAttempt._id, { destinationRsvpId: undefined });
    }
    for (const inboundReceipt of inboundReceipts) {
      await ctx.db.patch(inboundReceipt._id, { destinationRsvpId: undefined });
    }
  }
}

function collectRsvpPhoneHashes(rsvp: Doc<"rsvps">, personPhoneHashes: Iterable<string>) {
  const phoneHashes = new Set(personPhoneHashes);
  if (rsvp.guestPhoneHash) phoneHashes.add(rsvp.guestPhoneHash);
  if (rsvp.smsPhoneHash) phoneHashes.add(rsvp.smsPhoneHash);
  if (isGuestClerkUserId(rsvp.clerkUserId)) {
    phoneHashes.add(rsvp.clerkUserId.slice(GUEST_CLERK_USER_ID_PREFIX.length));
  }
  return phoneHashes;
}

/**
 * Strips the person from one RSVP and the records hung off it, and keeps the
 * RSVP for the host. Returns the anonymized row; an RSVP that is already
 * anonymized comes back unchanged. Webhook deliveries stored for the RSVP are
 * deleted first, so the caller's erasure notice is the only one left: a
 * triggered caller gets it from the rsvps trigger, an untriggered caller passes
 * the change to enqueueRsvpWebhookDeliveries itself. personPhoneHashes are the
 * person's phones the row itself may not name (a member's account phone), used
 * to find the SMS logs that list the RSVP.
 */
export async function anonymizeRsvp(
  ctx: MutationCtx,
  rsvp: Doc<"rsvps">,
  options: {
    erasingApiClientId?: Id<"apiClients">;
    personPhoneHashes?: Iterable<string>;
  } = {},
): Promise<Doc<"rsvps">> {
  if (rsvp.anonymizedAt !== undefined) return rsvp;
  const now = Date.now();
  const anonymizedClerkUserId = buildAnonymizedClerkUserId(rsvp);
  const identityAliases = await ctx.db
    .query("rsvpIdentityAliases")
    .withIndex("by_canonical", (queryBuilder) => queryBuilder.eq("canonicalRsvpId", rsvp._id))
    .collect();
  // Deliveries, audit entries and SMS logs keep the id the RSVP had when they
  // were written, so a merged row's retired ids lead to copies of the person too.
  const rsvpIds = [rsvp._id, ...identityAliases.map((alias) => alias.retiredRsvpId)];
  const webhookDeliveries = (
    await Promise.all(
      rsvpIds.map((rsvpId) =>
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
  await redactAuditEntries(ctx, rsvp, rsvpIds);
  await removeRsvpIdsFromSmsLogs(
    ctx,
    rsvpIds,
    collectRsvpPhoneHashes(rsvp, options.personPhoneHashes ?? []),
  );
  for (const approval of approvals) {
    await ctx.db.patch(approval._id, {
      clerkUserId: anonymizedClerkUserId,
      denialReason: undefined,
    });
  }
  // The delivered QR code reached the person's phone, so the ticket gets a code
  // nobody holds. Its status, check-in and disabled time stay, so the host's
  // ticket counts do not change.
  for (const redemption of redemptions) {
    await ctx.db.patch(redemption._id, {
      clerkUserId: anonymizedClerkUserId,
      code: generateApprovalCode().toUpperCase(),
    });
  }

  await ctx.db.patch(rsvp._id, {
    ...REMOVED_IDENTITY_FIELDS,
    clerkUserId: anonymizedClerkUserId,
    shareContact: false,
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
