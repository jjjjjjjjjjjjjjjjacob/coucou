import { internal } from "../_generated/api";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { DatabaseWriter, MutationCtx } from "../_generated/server";
import { generateApprovalCode } from "./codeGenerators";
import { removeContactEvent } from "./contactRecords";
import {
  buildGuestClerkUserId,
  GUEST_CLERK_USER_ID_PREFIX,
  isGuestClerkUserId,
} from "./guestIdentity";
import { enqueueErasureNotices } from "./webhookEmission";

// Partner erasure anonymizes at most this many RSVPs per request and answers
// status "partial" for the rest; the partner repeats the request.
export const MAX_RSVPS_ANONYMIZED_PER_TRANSACTION = 50;

// Convex allows 1,000 scheduled functions per mutation. Blanking an RSVP
// schedules one, the rsvps trigger's contact sync, so a page schedules 100
// whatever the endpoints or the person's history: the erasure notices wait in
// webhookDispatchQueue for the one dispatcher a transaction schedules, and the
// cleanup writes go through untriggeredDb. The page size bounds the reads and
// writes; the scheduled functions stay far under the limit.
const RSVPS_BLANKED_PER_TRANSACTION = 100;

// Cleaning up one RSVP's attached records reads about twenty index ranges.
const RSVP_CLEANUPS_PER_TRANSACTION = 50;

// A phone has one SMS recipient row per text blast it received, so the rows
// are checked this many per transaction and the rest continue in a batch.
const SMS_RECIPIENT_ROWS_PER_TRANSACTION = 500;

// A mutation context that also writes around the triggers. The triggered
// mutations in functions.ts carry untriggeredDb; an untriggered mutation passes
// its own db. Writes whose triggers would only re-sync the anonymized rows'
// contact records go through it: syncUser for a re-keyed ticket finds only the
// anonymized row, syncDelivery reads none of the fields the cleanup removes,
// and syncRsvp for an anonymized row removes the contact event the cleanup
// removes itself.
export type AnonymizationCtx = MutationCtx & { untriggeredDb: DatabaseWriter };

export interface RsvpAnonymizationPerson {
  // The account, its aliases, its guest identities and the identity each
  // blanked RSVP had: an audit actor that is any of them is the person.
  clerkUserIds: string[];
  // The phones whose SMS recipient rows may list the person's RSVPs.
  phoneHashes: string[];
}

export interface SmsRecipientCursor {
  phoneHash: string;
  afterCreationTime: number;
}

// What is left of one person's anonymization after the RSVP rows are blanked.
// A rsvpAnonymizationBatches row stores it between transactions and is deleted
// when it is done, so the identities and phone hashes outlive the work by no more.
export interface RsvpAnonymizationWork {
  // Account deletion only: the person held more RSVPs than one transaction
  // blanks, so each run blanks the next page held by person.clerkUserIds.
  blankHeldRsvps: boolean;
  // Blanked RSVPs whose attached records are still there.
  cleanupRsvpIds: Id<"rsvps">[];
  person: RsvpAnonymizationPerson;
  // Cleaned-up RSVP ids, retired ids included, that recipient rows may still list.
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

async function deleteDocuments(ctx: MutationCtx, documents: Array<{ _id: Id<TableNames> }>) {
  for (const documentId of new Set(documents.map((document) => document._id))) {
    await ctx.db.delete(documentId);
  }
}

async function deleteProfileValuesSourcedFromRsvp(ctx: MutationCtx, rsvpId: Id<"rsvps">) {
  const grants = await ctx.db
    .query("workspaceProfileValueGrants")
    .withIndex("by_source_rsvp", (queryBuilder) => queryBuilder.eq("sourceRsvpId", rsvpId))
    .collect();
  await deleteDocuments(ctx, grants);

  const values = await ctx.db
    .query("profileFieldValues")
    .withIndex("by_source_rsvp", (queryBuilder) => queryBuilder.eq("sourceRsvpId", rsvpId))
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
  ctx: AnonymizationCtx,
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
      await ctx.untriggeredDb.patch(recipient._id, {
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

function emptyWork(person: RsvpAnonymizationPerson): RsvpAnonymizationWork {
  return { blankHeldRsvps: false, cleanupRsvpIds: [], person, smsLogRsvpIds: [] };
}

async function findRetiredRsvpIds(ctx: MutationCtx, rsvpId: Id<"rsvps">) {
  const identityAliases = await ctx.db
    .query("rsvpIdentityAliases")
    .withIndex("by_canonical", (queryBuilder) => queryBuilder.eq("canonicalRsvpId", rsvpId))
    .collect();
  return { identityAliases, retiredRsvpIds: identityAliases.map((alias) => alias.retiredRsvpId) };
}

// Removes the person from the RSVP row itself, in the transaction that decides
// to anonymize it, so nothing that reads the row afterwards can find or copy
// the person. Three things change with it. Stored webhook payloads go, also
// under ids a merge retired, so a retry cannot send the person after the
// erasure notice; the notice is the only delivery left. The ticket gets a code
// nobody holds and the anonymized key, so neither the delivered QR code nor a
// new RSVP under the person's old identity reaches it; its status, check-in and
// disabled time stay, so the host's counts do not change.
async function blankRsvp(
  ctx: AnonymizationCtx,
  rsvp: Doc<"rsvps">,
  erasingApiClientId: Id<"apiClients"> | undefined,
): Promise<Doc<"rsvps">> {
  const now = Date.now();
  const anonymizedClerkUserId = buildAnonymizedClerkUserId(rsvp);
  const { retiredRsvpIds } = await findRetiredRsvpIds(ctx, rsvp._id);
  const [webhookDeliveries, redemptions] = await Promise.all([
    Promise.all(
      [rsvp._id, ...retiredRsvpIds].map((rsvpId) =>
        ctx.db
          .query("webhookDeliveries")
          .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpId))
          .collect(),
      ),
    ),
    ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (queryBuilder) =>
        queryBuilder.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .collect(),
  ]);
  await deleteDocuments(ctx, webhookDeliveries.flat());
  for (const redemption of redemptions) {
    await ctx.untriggeredDb.patch(redemption._id, {
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
  return (await ctx.db.get(rsvp._id)) as Doc<"rsvps">;
}

/**
 * Blanks each RSVP, enqueues its erasure notice, and adds it to the work as an
 * RSVP whose attached records still need cleanup. The identity and phones it
 * had join the person, so the cleanup finds its audit actors and SMS logs after
 * the row no longer names them.
 */
async function blankRsvps(
  ctx: AnonymizationCtx,
  rsvps: Doc<"rsvps">[],
  work: RsvpAnonymizationWork,
  options: { erasingApiClientId?: Id<"apiClients"> } = {},
): Promise<RsvpAnonymizationWork> {
  const clerkUserIds = new Set(work.person.clerkUserIds);
  const phoneHashes = new Set(work.person.phoneHashes);
  const cleanupRsvpIds = [...work.cleanupRsvpIds];
  const anonymizations: Array<{ oldDoc: Doc<"rsvps">; newDoc: Doc<"rsvps"> }> = [];
  for (const rsvp of rsvps) {
    const newDoc = await blankRsvp(ctx, rsvp, options.erasingApiClientId);
    clerkUserIds.add(rsvp.clerkUserId);
    for (const phoneHash of collectRsvpPhoneHashes(rsvp)) phoneHashes.add(phoneHash);
    cleanupRsvpIds.push(rsvp._id);
    anonymizations.push({ oldDoc: rsvp, newDoc });
  }
  await enqueueErasureNotices(ctx, anonymizations);
  return {
    ...work,
    cleanupRsvpIds,
    person: { clerkUserIds: [...clerkUserIds], phoneHashes: [...phoneHashes] },
  };
}

/**
 * Account deletion: blanks the next page of RSVPs that person.clerkUserIds
 * still hold, and clears blankHeldRsvps once none is left. A blanked row's
 * clerkUserId is its anonymized key, so the lookup never returns it again.
 */
export async function blankNextHeldRsvps(
  ctx: AnonymizationCtx,
  work: RsvpAnonymizationWork,
): Promise<RsvpAnonymizationWork> {
  const heldRsvps: Doc<"rsvps">[] = [];
  for (const clerkUserId of work.person.clerkUserIds) {
    const remainingRows = RSVPS_BLANKED_PER_TRANSACTION + 1 - heldRsvps.length;
    if (remainingRows === 0) break;
    heldRsvps.push(
      ...(await ctx.db
        .query("rsvps")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
        .take(remainingRows)),
    );
  }
  const blankedWork = await blankRsvps(
    ctx,
    heldRsvps.slice(0, RSVPS_BLANKED_PER_TRANSACTION),
    work,
  );
  return { ...blankedWork, blankHeldRsvps: heldRsvps.length > RSVPS_BLANKED_PER_TRANSACTION };
}

// Deletes or rewrites the records hung off one blanked RSVP. Every read is
// keyed by the RSVP, so its cost does not grow with the person's other RSVPs.
// Returns the RSVP's id and its retired ids, which SMS recipient rows may list.
async function cleanUpRsvp(
  ctx: AnonymizationCtx,
  rsvpId: Id<"rsvps">,
  personClerkUserIds: Set<string>,
): Promise<Id<"rsvps">[]> {
  const rsvp = await ctx.db.get(rsvpId);
  const { identityAliases, retiredRsvpIds } = await findRetiredRsvpIds(ctx, rsvpId);
  // Audit entries and SMS logs keep the id the RSVP had when they were written,
  // so a merged row's retired ids lead to copies of the person too.
  const rsvpIds = [rsvpId, ...retiredRsvpIds];
  const [approvals, guestHandoffs, socialProfileSnapshots, smsRsvpSessions, contactEvents] =
    await Promise.all([
      ctx.db
        .query("approvals")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpId))
        .collect(),
      ctx.db
        .query("rsvpGuestHandoffs")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpId))
        .collect(),
      ctx.db
        .query("rsvpSocialProfiles")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpId))
        .collect(),
      ctx.db
        .query("smsRsvpSessions")
        .withIndex("by_destination_rsvp", (queryBuilder) =>
          queryBuilder.eq("destinationRsvpId", rsvpId),
        )
        .collect(),
      ctx.db
        .query("contactEvents")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpId))
        .collect(),
    ]);

  await deleteDocuments(ctx, [...guestHandoffs, ...identityAliases, ...smsRsvpSessions]);
  for (const snapshot of socialProfileSnapshots) await ctx.untriggeredDb.delete(snapshot._id);
  for (const contactEvent of contactEvents) await removeContactEvent(ctx, contactEvent);
  await deleteProfileValuesSourcedFromRsvp(ctx, rsvpId);
  await redactAuditEntries(ctx, rsvpIds, personClerkUserIds);
  await removeRsvpIdsFromSmsReplies(ctx, rsvpIds);
  if (rsvp) {
    for (const approval of approvals) {
      await ctx.db.patch(approval._id, { clerkUserId: rsvp.clerkUserId, denialReason: undefined });
    }
  }
  return rsvpIds;
}

/**
 * One transaction of cleanup: the attached records of up to
 * RSVP_CLEANUPS_PER_TRANSACTION blanked RSVPs, then one page of the person's
 * SMS recipient rows against every id cleaned up so far. Returns the work left
 * for a batch, or null when none is left.
 */
export async function cleanUpAnonymizedRsvps(
  ctx: AnonymizationCtx,
  work: RsvpAnonymizationWork,
): Promise<RsvpAnonymizationWork | null> {
  const personClerkUserIds = new Set(work.person.clerkUserIds);
  const smsLogRsvpIds = new Set(work.smsLogRsvpIds);
  let smsLogCursor = work.smsLogCursor;
  for (const rsvpId of work.cleanupRsvpIds.slice(0, RSVP_CLEANUPS_PER_TRANSACTION)) {
    for (const cleanedRsvpId of await cleanUpRsvp(ctx, rsvpId, personClerkUserIds)) {
      smsLogRsvpIds.add(cleanedRsvpId);
    }
    // Rows already checked were not checked against the new ids.
    smsLogCursor = undefined;
  }
  const cleanupRsvpIds = work.cleanupRsvpIds.slice(RSVP_CLEANUPS_PER_TRANSACTION);
  const nextSmsLogCursor =
    smsLogRsvpIds.size === 0
      ? null
      : await removeRsvpIdsFromSmsRecipients(
          ctx,
          smsLogRsvpIds,
          new Set(work.person.phoneHashes),
          smsLogCursor,
        );
  if (!work.blankHeldRsvps && cleanupRsvpIds.length === 0 && nextSmsLogCursor === null) {
    return null;
  }
  return {
    ...work,
    cleanupRsvpIds,
    // Once every recipient row is checked against these ids, they are done.
    smsLogRsvpIds: nextSmsLogCursor === null ? [] : [...smsLogRsvpIds],
    smsLogCursor: nextSmsLogCursor ?? undefined,
  };
}

/**
 * Anonymizes RSVPs a partner erasure selected: blanks every row now and cleans
 * up the records hung off them, leaving what one transaction cannot finish to
 * a batch.
 */
export async function anonymizeSelectedRsvps(
  ctx: AnonymizationCtx,
  rsvps: Doc<"rsvps">[],
  person: RsvpAnonymizationPerson,
  options: { erasingApiClientId?: Id<"apiClients"> } = {},
) {
  const work = await blankRsvps(ctx, rsvps, emptyWork(person), options);
  const remainingWork = await cleanUpAnonymizedRsvps(ctx, work);
  if (remainingWork) await scheduleRsvpAnonymization(ctx, remainingWork);
}

/**
 * Anonymizes every RSVP an account deletion's identities hold: blanks up to
 * RSVPS_BLANKED_PER_TRANSACTION rows and cleans up the first ones now; a batch
 * blanks and cleans up the rest.
 */
export async function anonymizeHeldRsvps(ctx: AnonymizationCtx, person: RsvpAnonymizationPerson) {
  const work = await blankNextHeldRsvps(ctx, { ...emptyWork(person), blankHeldRsvps: true });
  const remainingWork = await cleanUpAnonymizedRsvps(ctx, work);
  if (remainingWork) await scheduleRsvpAnonymization(ctx, remainingWork);
}

// Stores work for later transactions and schedules its first run.
async function scheduleRsvpAnonymization(ctx: MutationCtx, work: RsvpAnonymizationWork) {
  const now = Date.now();
  const batchId = await ctx.db.insert("rsvpAnonymizationBatches", {
    ...work,
    attempts: 1,
    scheduledAt: now,
    createdAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.rsvpAnonymizationBatches.run, { batchId });
}
