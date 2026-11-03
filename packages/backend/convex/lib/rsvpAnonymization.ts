import { internal } from "../_generated/api";
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

// A phone has one SMS recipient row per text blast it received, so the rows
// are checked this many per transaction and the rest continue in a batch.
const SMS_RECIPIENT_ROWS_PER_TRANSACTION = 500;

export interface RsvpAnonymizationPerson {
  // The account, its aliases and its guest identities: an audit actor that is
  // any of them is the person.
  clerkUserIds: string[];
  // The phones whose SMS recipient rows may list the person's RSVPs.
  phoneHashes: string[];
}

export interface SmsRecipientCursor {
  phoneHash: string;
  afterCreationTime: number;
}

// What is left of one person's anonymization. A rsvpAnonymizationBatches row
// stores it between transactions.
export interface RsvpAnonymizationWork {
  rsvpIds: Id<"rsvps">[];
  person: RsvpAnonymizationPerson;
  // Anonymized RSVP ids, retired ids included, that recipient rows may still list.
  smsLogRsvpIds: Id<"rsvps">[];
  // The last recipient row checked against every id in smsLogRsvpIds.
  smsLogCursor?: SmsRecipientCursor;
}

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
    .withIndex("by_source_rsvp", (queryBuilder) => queryBuilder.eq("sourceRsvpId", rsvp._id))
    .collect();
  await deleteDocuments(ctx, grants);

  const values = await ctx.db
    .query("profileFieldValues")
    .withIndex("by_source_rsvp", (queryBuilder) => queryBuilder.eq("sourceRsvpId", rsvp._id))
    .collect();
  for (const value of values) {
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
async function redactAuditEntries(
  ctx: MutationCtx,
  rsvpIds: Id<"rsvps">[],
  personClerkUserIds: Set<string>,
) {
  for (const rsvpId of rsvpIds) {
    const auditEntries = await ctx.db
      .query("auditLog")
      .withIndex("by_target", (queryBuilder) => queryBuilder.eq("targetId", rsvpId))
      .collect();
    for (const auditEntry of auditEntries) {
      if (auditEntry.targetKind !== "rsvp") continue;
      const actor = auditEntry.actorClerkUserId;
      const actorIsPerson = actor !== undefined && personClerkUserIds.has(actor);
      await ctx.db.patch(auditEntry._id, {
        metadata: { redacted: "rsvp_anonymized" },
        ...(actorIsPerson ? { actorClerkUserId: undefined, actorEmail: undefined } : {}),
      });
    }
  }
}

// SMS logs stay, keyed by phone hash, but must not say which RSVP that phone
// belonged to. Reply attempts and inbound receipts name one RSVP each, through
// an index.
async function removeRsvpIdsFromSmsReplies(ctx: MutationCtx, rsvpIds: Id<"rsvps">[]) {
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

// Recipient rows hold an array of RSVP ids, which no index reaches, so they are
// found through the person's phones. One pass checks each row once against
// every anonymized id, at most SMS_RECIPIENT_ROWS_PER_TRANSACTION rows from the
// cursor on. Returns where the next pass starts, or null when every row is checked.
async function removeRsvpIdsFromSmsRecipients(
  ctx: MutationCtx,
  rsvpIds: Set<Id<"rsvps">>,
  phoneHashes: Set<string>,
  cursor: SmsRecipientCursor | undefined,
): Promise<SmsRecipientCursor | null> {
  const sortedPhoneHashes = [...phoneHashes].sort();
  let remainingRows = SMS_RECIPIENT_ROWS_PER_TRANSACTION;
  const startIndex = cursor ? Math.max(sortedPhoneHashes.indexOf(cursor.phoneHash), 0) : 0;
  for (const phoneHash of sortedPhoneHashes.slice(startIndex)) {
    const afterCreationTime =
      cursor?.phoneHash === phoneHash ? cursor.afterCreationTime : undefined;
    const recipients = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_phone", (queryBuilder) => {
        const samePhone = queryBuilder.eq("phoneHash", phoneHash);
        return afterCreationTime === undefined
          ? samePhone
          : samePhone.gt("_creationTime", afterCreationTime);
      })
      .take(remainingRows);
    for (const recipient of recipients) {
      if (!recipient.sourceRsvpIds.some((rsvpId) => rsvpIds.has(rsvpId))) continue;
      await ctx.db.patch(recipient._id, {
        sourceRsvpIds: recipient.sourceRsvpIds.filter((rsvpId) => !rsvpIds.has(rsvpId)),
      });
    }
    remainingRows -= recipients.length;
    const lastRecipient = recipients.at(-1);
    if (remainingRows === 0 && lastRecipient) {
      return { phoneHash, afterCreationTime: lastRecipient._creationTime };
    }
  }
  return null;
}

function collectRsvpPhoneHashes(rsvp: Doc<"rsvps">) {
  const phoneHashes = new Set<string>();
  if (rsvp.guestPhoneHash) phoneHashes.add(rsvp.guestPhoneHash);
  if (rsvp.smsPhoneHash) phoneHashes.add(rsvp.smsPhoneHash);
  if (isGuestClerkUserId(rsvp.clerkUserId)) {
    phoneHashes.add(rsvp.clerkUserId.slice(GUEST_CLERK_USER_ID_PREFIX.length));
  }
  return phoneHashes;
}

// Strips the person from one RSVP and the records hung off it, and keeps the
// RSVP for the host. Webhook deliveries stored for the RSVP are deleted first,
// so the caller's erasure notice is the only one left: a triggered caller gets
// it from the rsvps trigger, an untriggered caller passes the change to
// enqueueRsvpWebhookDeliveries itself. Every read here is keyed by this RSVP,
// so its cost does not grow with the person's other RSVPs. SMS recipient rows
// are keyed by phone and are left to the caller (anonymizeRsvps).
async function anonymizeRsvp(
  ctx: MutationCtx,
  rsvp: Doc<"rsvps">,
  personClerkUserIds: Set<string>,
  erasingApiClientId: Id<"apiClients"> | undefined,
): Promise<{ anonymizedRsvp: Doc<"rsvps">; rsvpIds: Id<"rsvps">[]; phoneHashes: Set<string> }> {
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
  await redactAuditEntries(ctx, rsvpIds, new Set([...personClerkUserIds, rsvp.clerkUserId]));
  await removeRsvpIdsFromSmsReplies(ctx, rsvpIds);
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
    ...(erasingApiClientId
      ? {
          webhookOriginApiClientId: erasingApiClientId,
          webhookOriginMutationId: crypto.randomUUID(),
        }
      : {}),
  });
  return {
    anonymizedRsvp: (await ctx.db.get(rsvp._id)) as Doc<"rsvps">,
    rsvpIds,
    phoneHashes: collectRsvpPhoneHashes(rsvp),
  };
}

/**
 * One transaction of a person's anonymization: anonymizes work.rsvpIds (at most
 * MAX_RSVPS_ANONYMIZED_PER_TRANSACTION) and removes every anonymized id from
 * one page of the person's SMS recipient rows. An id that is gone (an identity
 * merge retired it after the work was planned) or already anonymized is
 * skipped. Returns each RSVP it anonymized, before and after, and the work
 * left for a batch, or null when none is left.
 */
export async function anonymizeRsvps(
  ctx: MutationCtx,
  work: RsvpAnonymizationWork,
  options: { erasingApiClientId?: Id<"apiClients"> } = {},
): Promise<{
  anonymizations: Array<{ oldDoc: Doc<"rsvps">; newDoc: Doc<"rsvps"> }>;
  remainingWork: RsvpAnonymizationWork | null;
}> {
  const personClerkUserIds = new Set(work.person.clerkUserIds);
  const phoneHashes = new Set(work.person.phoneHashes);
  const smsLogRsvpIds = new Set(work.smsLogRsvpIds);
  let smsLogCursor = work.smsLogCursor;
  const anonymizations: Array<{ oldDoc: Doc<"rsvps">; newDoc: Doc<"rsvps"> }> = [];
  for (const rsvpId of work.rsvpIds) {
    const rsvp = await ctx.db.get(rsvpId);
    if (!rsvp || rsvp.anonymizedAt !== undefined) continue;
    const anonymization = await anonymizeRsvp(
      ctx,
      rsvp,
      personClerkUserIds,
      options.erasingApiClientId,
    );
    for (const anonymizedId of anonymization.rsvpIds) smsLogRsvpIds.add(anonymizedId);
    for (const phoneHash of anonymization.phoneHashes) phoneHashes.add(phoneHash);
    // Rows already checked were not checked against the new ids.
    smsLogCursor = undefined;
    anonymizations.push({ oldDoc: rsvp, newDoc: anonymization.anonymizedRsvp });
  }
  const nextSmsLogCursor =
    smsLogRsvpIds.size === 0
      ? null
      : await removeRsvpIdsFromSmsRecipients(ctx, smsLogRsvpIds, phoneHashes, smsLogCursor);
  return {
    anonymizations,
    remainingWork:
      nextSmsLogCursor === null
        ? null
        : {
            rsvpIds: [],
            person: { clerkUserIds: work.person.clerkUserIds, phoneHashes: [...phoneHashes] },
            smsLogRsvpIds: [...smsLogRsvpIds],
            smsLogCursor: nextSmsLogCursor,
          },
  };
}

/**
 * Stores work for later transactions and schedules its first run. Each RSVP the
 * work names is marked pending, so a write that would reuse the row before the
 * batch runs finishes its anonymization first (finishPendingAnonymization) and
 * a guest claim leaves it alone (isPendingAnonymization).
 */
export async function scheduleRsvpAnonymization(ctx: MutationCtx, work: RsvpAnonymizationWork) {
  const now = Date.now();
  const batchId = await ctx.db.insert("rsvpAnonymizationBatches", {
    ...work,
    attempts: 1,
    scheduledAt: now,
    createdAt: now,
  });
  for (const rsvpId of work.rsvpIds) {
    await ctx.db.insert("pendingRsvpAnonymizations", { rsvpId, batchId });
  }
  await ctx.scheduler.runAfter(0, internal.rsvpAnonymizationBatches.run, { batchId });
}

export async function isPendingAnonymization(
  ctx: MutationCtx,
  rsvpId: Id<"rsvps">,
): Promise<boolean> {
  const pending = await ctx.db
    .query("pendingRsvpAnonymizations")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpId))
    .first();
  return pending !== null;
}

/**
 * A deleted account's RSVP that waits in a batch still carries its phone, so
 * the guest form, a text or a partner write can find it. Before such a write
 * reuses the row, this anonymizes it and hands the rest of the work (its SMS
 * logs) to the batch. Returns the row unchanged when it is not pending, and
 * null when it was, so the write creates a new RSVP.
 */
export async function finishPendingAnonymization(
  ctx: MutationCtx,
  rsvp: Doc<"rsvps"> | null,
): Promise<Doc<"rsvps"> | null> {
  if (!rsvp) return null;
  const pending = await ctx.db
    .query("pendingRsvpAnonymizations")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
    .first();
  if (!pending) return rsvp;
  const batch = await ctx.db.get(pending.batchId);
  await ctx.db.delete(pending._id);
  if (!batch) return rsvp;
  const anonymization = await anonymizeRsvp(
    ctx,
    rsvp,
    new Set(batch.person.clerkUserIds),
    undefined,
  );
  await ctx.db.patch(batch._id, {
    rsvpIds: batch.rsvpIds.filter((rsvpId) => rsvpId !== rsvp._id),
    person: {
      clerkUserIds: batch.person.clerkUserIds,
      phoneHashes: [...new Set([...batch.person.phoneHashes, ...anonymization.phoneHashes])],
    },
    smsLogRsvpIds: [...new Set([...batch.smsLogRsvpIds, ...anonymization.rsvpIds])],
    smsLogCursor: undefined,
  });
  return null;
}
