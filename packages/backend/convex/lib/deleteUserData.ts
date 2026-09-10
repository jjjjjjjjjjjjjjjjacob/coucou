import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { refreshContactProfile, removeContactEvent } from "./contactRecords";
import { buildGuestClerkUserId } from "./guestIdentity";
import { normalizeAndHashPhoneNumber } from "./phoneHash";
import { deleteRsvpFromAggregate } from "./rsvpAggregate";

async function deleteDocuments(context: MutationCtx, documents: Array<{ _id: Id<TableNames> }>) {
  for (const documentId of new Set(documents.map((document) => document._id)))
    await context.db.delete(documentId);
}

async function deleteUserRsvp(context: MutationCtx, rsvp: Doc<"rsvps">) {
  const [approvals, redemptions, handoffs, aliases] = await Promise.all([
    context.db
      .query("approvals")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", rsvp.eventId))
      .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("rsvpId"), rsvp._id))
      .collect(),
    context.db
      .query("redemptions")
      .withIndex("by_event_user", (queryBuilder) =>
        queryBuilder.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .collect(),
    context.db
      .query("rsvpGuestHandoffs")
      .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvp._id))
      .collect(),
    context.db
      .query("rsvpIdentityAliases")
      .withIndex("by_canonical", (queryBuilder) => queryBuilder.eq("canonicalRsvpId", rsvp._id))
      .collect(),
  ]);
  await deleteDocuments(context, [...approvals, ...redemptions, ...handoffs, ...aliases]);
  await deleteRsvpFromAggregate(context, rsvp);
  await context.db.delete(rsvp._id);
}

/** Remove the account's RSVP and preference state, including its former guest identity. */
export async function deleteUserData(context: MutationCtx, clerkUserId: string) {
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

  for (const identityId of identityIds) {
    const [
      rsvps,
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
        .query("rsvps")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identityId))
        .collect(),
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
    for (const rsvp of rsvps) await deleteUserRsvp(context, rsvp);
    for (const contactEvent of contactEvents) await removeContactEvent(context, contactEvent);
    await deleteDocuments(context, [
      ...consent,
      ...profiles,
      ...socialProfiles,
      ...values,
      ...grants,
      ...memberships,
      ...snapshots,
      ...contactIdentities,
    ]);
    const guestProfiles = await context.db
      .query("workspaceGuestProfiles")
      .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("clerkUserId"), identityId))
      .collect();
    await deleteDocuments(context, guestProfiles);
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
    await deleteDocuments(context, [...handoffs, ...guestContacts, ...sessions, ...guestProfiles]);
    // Historical delivery records remain, but must not act as a subscription or profile prefill.
    for (const contact of contacts) {
      await context.db.patch(contact._id, {
        clerkUserIds: contact.clerkUserIds.filter((identityId) => !identityIds.has(identityId)),
        primaryClerkUserId: undefined,
        smsConsent: false,
        consentUpdatedAt: Date.now(),
        name: "Deleted account",
        normalizedName: "deleted account",
        detailReference: undefined,
        searchAliases: [],
        firstName: undefined,
        lastName: undefined,
        imageUrl: undefined,
        notes: undefined,
        invitedByNames: [],
      });
      await refreshContactProfile(context, contact._id);
    }
  }
  await deleteDocuments(context, [...aliases, ...(ownAlias ? [ownAlias] : [])]);
  if (user) await context.db.delete(user._id);
  return { deleted: Boolean(user) };
}
