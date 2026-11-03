import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eraseContact, removeContactEvent } from "./contactRecords";
import { buildGuestClerkUserId } from "./guestIdentity";
import { normalizeAndHashPhoneNumber } from "./phoneHash";
import { type AnonymizationCtx, anonymizeHeldRsvps } from "./rsvpAnonymization";

const DELETED_ACCOUNT_CONTACT_NAME = "Deleted account";

async function deleteDocuments(context: MutationCtx, documents: Array<{ _id: Id<TableNames> }>) {
  for (const documentId of new Set(documents.map((document) => document._id)))
    await context.db.delete(documentId);
}

/**
 * Remove the account's preference and profile state, including its former guest
 * identity, and anonymize every RSVP it holds: Coucou-direct and partner-created
 * alike. Each anonymized RSVP sends granted endpoints an rsvp.updated erasure
 * notice, so partners mirroring it purge their copy.
 *
 * Up to 100 RSVP rows are blanked in this transaction, so nothing can find the
 * person through them once it commits. The records hung off the RSVPs, and SMS
 * recipient rows beyond one page, are cleaned up by rsvpAnonymizationBatches; a
 * person with more RSVPs has the rest blanked by that batch, seconds later.
 */
export async function deleteUserData(context: AnonymizationCtx, clerkUserId: string) {
  const user = await context.db
    .query("users")
    .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
    .unique();
  const aliases = await context.db
    .query("userIdentityAliases")
    .withIndex("by_canonical", (queryBuilder) =>
      queryBuilder.eq("canonicalClerkUserId", clerkUserId),
    )
    .collect();
  const ownAlias = await context.db
    .query("userIdentityAliases")
    .withIndex("by_alias", (queryBuilder) => queryBuilder.eq("aliasClerkUserId", clerkUserId))
    .unique();
  const identityIds = new Set([clerkUserId, ...aliases.map((alias) => alias.aliasClerkUserId)]);
  const phoneHashes = new Set<string>();
  if (user?.phoneHash) phoneHashes.add(user.phoneHash);
  if (user?.phone) phoneHashes.add((await normalizeAndHashPhoneNumber(user.phone)).phoneHash);
  for (const alias of aliases) if (alias.phoneHash) phoneHashes.add(alias.phoneHash);
  // Deleting a retired Clerk account must not erase a different, still-live canonical account.
  if (ownAlias && !(await context.db.get(ownAlias.canonicalUserId)) && ownAlias.phoneHash)
    phoneHashes.add(ownAlias.phoneHash);
  // A dashboard deletion of the users row may happen before the Clerk webhook arrives.
  // Recover the phone from remaining account-owned records before removing them.
  for (const identityId of identityIds) {
    const [rsvps, contactIdentities, completedHandoffs] = await Promise.all([
      context.db
        .query("rsvps")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("workspaceContactIdentities")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("rsvpGuestHandoffs")
        .filter((queryBuilder) =>
          queryBuilder.eq(queryBuilder.field("submittedByClerkUserId"), identityId),
        )
        .collect(),
    ]);
    for (const handoff of completedHandoffs) phoneHashes.add(handoff.phoneHash);
    for (const rsvp of rsvps) if (rsvp.guestPhoneHash) phoneHashes.add(rsvp.guestPhoneHash);
    for (const contactIdentity of contactIdentities) {
      const contact = await context.db.get(contactIdentity.contactId);
      if (contact?.phoneHash) phoneHashes.add(contact.phoneHash);
    }
  }
  const removablePhoneHashes = new Set<string>();
  for (const phoneHash of phoneHashes) {
    const matchingUsers = await context.db
      .query("users")
      .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
      .collect();
    if (
      matchingUsers.some(
        (matchingUser) => matchingUser.clerkUserId && !identityIds.has(matchingUser.clerkUserId),
      )
    )
      continue;
    removablePhoneHashes.add(phoneHash);
    identityIds.add(buildGuestClerkUserId(phoneHash));
  }

  // A queued guest notification can contain the phone directly, so deleting its
  // profile alone would not prevent it from being sent after account deletion.
  const notificationFunctions = new Set([
    "notifications:sendSmsConsentStatusMessage",
    "notifications:sendRsvpConfirmationSms",
    "notifications:sendApprovalSms",
  ]);
  const scheduledFunctions = await context.db.system.query("_scheduled_functions").collect();
  for (const scheduledFunction of scheduledFunctions) {
    if (
      scheduledFunction.state.kind !== "pending" ||
      !notificationFunctions.has(scheduledFunction.name)
    )
      continue;
    const notification = scheduledFunction.args[0] as
      | { clerkUserId?: string; phoneNumber?: string }
      | undefined;
    if (!notification) continue;
    const belongsToDeletedIdentity =
      notification.clerkUserId && identityIds.has(notification.clerkUserId);
    const belongsToDeletedPhone =
      notification.phoneNumber &&
      removablePhoneHashes.has(
        (await normalizeAndHashPhoneNumber(notification.phoneNumber)).phoneHash,
      );
    if (belongsToDeletedIdentity || belongsToDeletedPhone)
      await context.scheduler.cancel(scheduledFunction._id);
  }

  // identityIds holds the account, its aliases and the guest identity of each of
  // its phones, so this reaches partner-created and Coucou-direct RSVPs alike.
  await anonymizeHeldRsvps(context, {
    clerkUserIds: [...identityIds],
    phoneHashes: [...phoneHashes],
  });

  const contactIds = new Set<Id<"workspaceContacts">>();
  for (const identityId of identityIds) {
    const [
      consent,
      profiles,
      socialProfiles,
      values,
      grants,
      memberships,
      snapshots,
      contactEvents,
      contactIdentities,
    ] = await Promise.all([
      context.db
        .query("userSmsOrganizerPreferences")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("profiles")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("userSocialProfiles")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("profileFieldValues")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("workspaceProfileValueGrants")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("orgMemberships")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("rsvpSocialProfiles")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("contactEvents")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
      context.db
        .query("workspaceContactIdentities")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
    ]);
    for (const contactEvent of contactEvents) await removeContactEvent(context, contactEvent);
    for (const contactIdentity of contactIdentities) contactIds.add(contactIdentity.contactId);
    await deleteDocuments(context, [
      ...consent,
      ...profiles,
      ...socialProfiles,
      ...values,
      ...grants,
      ...memberships,
      ...contactIdentities,
    ]);
    // One snapshot per RSVP and platform. Its trigger's contact sync would only
    // rebuild a contact event for an RSVP this deletion anonymizes.
    for (const snapshot of snapshots) await context.untriggeredDb.delete(snapshot._id);
    // A guest profile's trigger syncs its contact through ensureContact, which
    // would give the contact back the identity this deletion erases.
    const guestProfiles = await context.db
      .query("workspaceGuestProfiles")
      .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("clerkUserId"), identityId))
      .collect();
    for (const guestProfile of guestProfiles) await context.untriggeredDb.delete(guestProfile._id);
  }
  for (const phoneHash of removablePhoneHashes) {
    const [handoffs, guestContacts, sessions, guestProfiles, contacts] = await Promise.all([
      context.db
        .query("rsvpGuestHandoffs")
        .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
        .collect(),
      context.db
        .query("guestContacts")
        .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
        .collect(),
      context.db
        .query("smsRsvpSessions")
        .withIndex("by_phone_status", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
        .collect(),
      context.db
        .query("workspaceGuestProfiles")
        .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("guestPhoneHash"), phoneHash))
        .collect(),
      context.db
        .query("workspaceContacts")
        .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
        .collect(),
    ]);
    await deleteDocuments(context, [...handoffs, ...guestContacts, ...sessions]);
    for (const guestProfile of guestProfiles) await context.untriggeredDb.delete(guestProfile._id);
    for (const contact of contacts) contactIds.add(contact._id);
  }
  for (const contactId of contactIds) {
    const contact = await context.db.get(contactId);
    // Another account holds this phone now, so the row is that person's.
    if (contact?.phoneHash && !removablePhoneHashes.has(contact.phoneHash)) continue;
    await eraseContact(context, contactId, identityIds, DELETED_ACCOUNT_CONTACT_NAME);
  }
  // Their triggers' contact sync rebuilds contacts from the RSVPs still under
  // these ids: the ones beyond the first 100, which the batch is about to blank.
  for (const alias of new Set([...aliases, ...(ownAlias ? [ownAlias] : [])].map(({ _id }) => _id)))
    await context.untriggeredDb.delete(alias);
  if (user) await context.untriggeredDb.delete(user._id);
  return { deleted: Boolean(user) };
}
