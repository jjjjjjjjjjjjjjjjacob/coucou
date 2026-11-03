import { v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
// Untriggered on purpose: the contact-sync triggers would rebuild the directory
// rows this erasure removes. The rsvp.deleted notices are enqueued explicitly.
import { internalMutation } from "./_generated/server";
import { writeAuditEntry } from "./audit";
import { resolveCanonicalRsvpId } from "./lib/canonicalUserIdentity";
import { refreshContactProfile, removeContactEvent } from "./lib/contactRecords";
import {
  buildGuestClerkUserId,
  GUEST_CLERK_USER_ID_PREFIX,
  isGuestClerkUserId,
} from "./lib/guestIdentity";
import { normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { deleteRsvpFromAggregate } from "./lib/rsvpAggregate";
import { enqueueRsvpErasureWebhookDeliveries } from "./lib/webhookEmission";

export const MAX_ERASURE_RSVP_IDS = 100;

const ERASED_CONTACT_NAME = "Erased contact";

// Notifications that carry a phone number or identity in their arguments. They
// are scheduled with runAfter(0), so only the most recent entries can be pending.
const PERSON_NOTIFICATION_FUNCTION_NAMES = new Set([
  "notifications:sendSmsConsentStatusMessage",
  "notifications:sendRsvpConfirmationSms",
  "notifications:sendApprovalSms",
]);
const RECENT_SCHEDULED_FUNCTION_SCAN_LIMIT = 500;

interface ErasureSubject {
  clerkUserIds: Set<string>;
  phoneHashes: Set<string>;
}

interface WorkspaceScope {
  workspace: Doc<"workspaces">;
  organizerKeys: Set<string>;
}

async function deleteDocuments(ctx: MutationCtx, documents: Array<{ _id: Id<TableNames> }>) {
  for (const documentId of new Set(documents.map((document) => document._id))) {
    await ctx.db.delete(documentId);
  }
}

async function loadWorkspaceScope(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<WorkspaceScope | null> {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) {
    return null;
  }
  const sites = await ctx.db
    .query("workspaceSites")
    .withIndex("by_workspace", (queryBuilder) => queryBuilder.eq("workspaceId", workspace._id))
    .collect();
  return {
    workspace,
    organizerKeys: new Set([
      `workspace:${workspace._id}`,
      `workspaceSlug:${workspace.slug}`,
      ...sites.map((site) => `site:${site.siteKey}`),
    ]),
  };
}

async function findCandidateRsvps(
  ctx: MutationCtx,
  selectors: { phone?: string; rsvpIds: string[] },
): Promise<Doc<"rsvps">[]> {
  const candidates = new Map<Id<"rsvps">, Doc<"rsvps">>();
  const addCandidates = (rsvps: Doc<"rsvps">[]) => {
    for (const rsvp of rsvps) candidates.set(rsvp._id, rsvp);
  };

  if (selectors.phone) {
    const { normalizedPhoneNumber, phoneHash } = await normalizeAndHashPhoneNumber(selectors.phone);
    const [usersByPhone, usersByPhoneHash, rsvpsByGuestPhoneHash] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phone", normalizedPhoneNumber))
        .collect(),
      ctx.db
        .query("users")
        .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
        .collect(),
      ctx.db
        .query("rsvps")
        .withIndex("by_guestPhoneHash", (queryBuilder) =>
          queryBuilder.eq("guestPhoneHash", phoneHash),
        )
        .collect(),
    ]);
    addCandidates(rsvpsByGuestPhoneHash);
    const clerkUserIds = new Set([buildGuestClerkUserId(phoneHash)]);
    for (const user of [...usersByPhone, ...usersByPhoneHash]) {
      if (user.clerkUserId) clerkUserIds.add(user.clerkUserId);
    }
    for (const clerkUserId of clerkUserIds) {
      addCandidates(
        await ctx.db
          .query("rsvps")
          .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
          .collect(),
      );
    }
  }

  for (const rsvpId of selectors.rsvpIds) {
    const normalizedRsvpId = ctx.db.normalizeId("rsvps", rsvpId);
    // An identity merge retires RSVP ids; the person's data lives on the canonical row.
    const rsvp = normalizedRsvpId
      ? await ctx.db.get(await resolveCanonicalRsvpId(ctx, normalizedRsvpId))
      : null;
    if (rsvp) addCandidates([rsvp]);
  }

  return [...candidates.values()];
}

async function rsvpBelongsToWorkspace(
  ctx: MutationCtx,
  rsvp: Doc<"rsvps">,
  workspace: Doc<"workspaces">,
): Promise<boolean> {
  const event = await ctx.db.get(rsvp.eventId);
  return event?.workspaceSlug === workspace.slug;
}

type RsvpErasureDecision = "erase" | "retain" | "unrelated";

// Rows inserted before createdByApiClientId existed name their inserting key
// only in the rsvp.created notice, and only when an endpoint was subscribed.
async function webhookLogShowsInsertBy(
  ctx: MutationCtx,
  rsvpId: Id<"rsvps">,
  apiClientId: Id<"apiClients">,
): Promise<boolean> {
  const deliveries = await ctx.db
    .query("webhookDeliveries")
    .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", rsvpId))
    .collect();
  return deliveries.some((delivery) => {
    if (delivery.eventType !== "rsvp.created") return false;
    const payload = JSON.parse(delivery.payloadJson) as {
      data?: { origin?: { type?: string; apiClientId?: string } };
    };
    return payload.data?.origin?.type === "api" && payload.data.origin.apiClientId === apiClientId;
  });
}

// A key erases only RSVPs it inserted. Every write overwrites apiClientId, so
// it shows who touched a row last, not who sent it. A row this key wrote, or
// that absorbed a row this key wrote, but that the key cannot be shown to have
// inserted is retained and reported.
async function decideRsvpErasure(
  ctx: MutationCtx,
  rsvp: Doc<"rsvps">,
  apiClientId: Id<"apiClients">,
): Promise<RsvpErasureDecision> {
  const absorbedRsvpAliases = await ctx.db
    .query("rsvpIdentityAliases")
    .withIndex("by_canonical", (queryBuilder) => queryBuilder.eq("canonicalRsvpId", rsvp._id))
    .collect();
  const hasRecordedCreator = rsvp.createdByApiClientId !== undefined;
  const insertedByCaller = hasRecordedCreator
    ? rsvp.createdByApiClientId === apiClientId
    : await webhookLogShowsInsertBy(ctx, rsvp._id, apiClientId);
  const absorbedCallerRsvp = absorbedRsvpAliases.some((alias) =>
    alias.retiredApiClientIds?.includes(apiClientId),
  );
  if (!insertedByCaller && rsvp.apiClientId !== apiClientId && !absorbedCallerRsvp) {
    return "unrelated";
  }

  const givenToCoucouDirectly =
    rsvp.source === "form" || rsvp.source === "text" || rsvp.personSubmittedAt !== undefined;
  // Without a recorded creator, a merged row may hold an RSVP of unknown origin.
  const mergedWithoutRecordedCreator = !hasRecordedCreator && absorbedRsvpAliases.length > 0;
  if (!insertedByCaller || givenToCoucouDirectly || mergedWithoutRecordedCreator) {
    return "retain";
  }
  return "erase";
}

async function buildErasureSubject(
  ctx: MutationCtx,
  erasedRsvps: Doc<"rsvps">[],
): Promise<ErasureSubject> {
  const subject: ErasureSubject = { clerkUserIds: new Set(), phoneHashes: new Set() };
  for (const rsvp of erasedRsvps) {
    subject.clerkUserIds.add(rsvp.clerkUserId);
    if (rsvp.guestPhoneHash) subject.phoneHashes.add(rsvp.guestPhoneHash);
    if (isGuestClerkUserId(rsvp.clerkUserId)) {
      subject.phoneHashes.add(rsvp.clerkUserId.slice(GUEST_CLERK_USER_ID_PREFIX.length));
      continue;
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", rsvp.clerkUserId),
      )
      .first();
    if (user?.phoneHash) subject.phoneHashes.add(user.phoneHash);
    if (user?.phone) {
      try {
        subject.phoneHashes.add((await normalizeAndHashPhoneNumber(user.phone)).phoneHash);
      } catch {
        // An invalid stored number cannot key any phone-hash record.
      }
    }
  }
  for (const phoneHash of subject.phoneHashes) {
    subject.clerkUserIds.add(buildGuestClerkUserId(phoneHash));
  }
  return subject;
}

async function cancelPendingPersonNotifications(ctx: MutationCtx, subject: ErasureSubject) {
  const recentScheduledFunctions = await ctx.db.system
    .query("_scheduled_functions")
    .order("desc")
    .take(RECENT_SCHEDULED_FUNCTION_SCAN_LIMIT);
  for (const scheduledFunction of recentScheduledFunctions) {
    if (
      scheduledFunction.state.kind !== "pending" ||
      !PERSON_NOTIFICATION_FUNCTION_NAMES.has(scheduledFunction.name)
    ) {
      continue;
    }
    const notification = scheduledFunction.args[0] as
      | { clerkUserId?: string; phoneNumber?: string }
      | undefined;
    let phoneHash: string | undefined;
    if (notification?.phoneNumber) {
      try {
        phoneHash = (await normalizeAndHashPhoneNumber(notification.phoneNumber)).phoneHash;
      } catch {
        phoneHash = undefined;
      }
    }
    const belongsToSubject =
      (notification?.clerkUserId !== undefined &&
        subject.clerkUserIds.has(notification.clerkUserId)) ||
      (phoneHash !== undefined && subject.phoneHashes.has(phoneHash));
    if (belongsToSubject) {
      await ctx.scheduler.cancel(scheduledFunction._id);
    }
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

async function eraseRsvp(
  ctx: MutationCtx,
  rsvp: Doc<"rsvps">,
  apiClientId: Id<"apiClients">,
): Promise<void> {
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

  for (const contactEvent of contactEvents) await removeContactEvent(ctx, contactEvent);
  await deleteDocuments(ctx, [
    ...approvals,
    ...redemptions,
    ...guestHandoffs,
    ...identityAliases,
    ...socialProfileSnapshots,
    ...smsRsvpSessions,
    ...webhookDeliveries,
  ]);
  await deleteProfileValuesSourcedFromRsvp(ctx, rsvp);
  await deleteRsvpFromAggregate(ctx, rsvp);
  await enqueueRsvpErasureWebhookDeliveries(ctx, rsvp, apiClientId);
  await ctx.db.delete(rsvp._id);
}

async function subjectHasRsvpInWorkspace(
  ctx: MutationCtx,
  subject: ErasureSubject,
  workspace: Doc<"workspaces">,
): Promise<boolean> {
  const remainingRsvps: Doc<"rsvps">[] = [];
  for (const clerkUserId of subject.clerkUserIds) {
    remainingRsvps.push(
      ...(await ctx.db
        .query("rsvps")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
        .collect()),
    );
  }
  for (const phoneHash of subject.phoneHashes) {
    remainingRsvps.push(
      ...(await ctx.db
        .query("rsvps")
        .withIndex("by_guestPhoneHash", (queryBuilder) =>
          queryBuilder.eq("guestPhoneHash", phoneHash),
        )
        .collect()),
    );
  }
  for (const rsvp of remainingRsvps) {
    if (await rsvpBelongsToWorkspace(ctx, rsvp, workspace)) return true;
  }
  return false;
}

async function eraseWorkspaceContact(
  ctx: MutationCtx,
  contact: Doc<"workspaceContacts">,
  subject: ErasureSubject,
) {
  const remainingContactEvent = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_event", (queryBuilder) => queryBuilder.eq("contactId", contact._id))
    .first();
  if (remainingContactEvent) return;

  // Recomputes tags and default-list facets now that the guest profiles are gone.
  await refreshContactProfile(ctx, contact._id);
  const [contactIdentities, textDelivery] = await Promise.all([
    ctx.db
      .query("workspaceContactIdentities")
      .withIndex("by_contact", (queryBuilder) => queryBuilder.eq("contactId", contact._id))
      .collect(),
    ctx.db
      .query("contactDeliveries")
      .withIndex("by_contact", (queryBuilder) => queryBuilder.eq("contactId", contact._id))
      .first(),
  ]);

  if (!textDelivery) {
    await deleteDocuments(ctx, [...contactIdentities, contact]);
    return;
  }

  // Text-blast delivery history points at this row, so it stays without a name or number.
  await deleteDocuments(
    ctx,
    contactIdentities.filter((identity) => subject.clerkUserIds.has(identity.clerkUserId)),
  );
  await ctx.db.patch(contact._id, {
    clerkUserIds: contact.clerkUserIds.filter(
      (clerkUserId) => !subject.clerkUserIds.has(clerkUserId),
    ),
    primaryClerkUserId: undefined,
    detailReference: undefined,
    phoneNumber: undefined,
    name: ERASED_CONTACT_NAME,
    normalizedName: ERASED_CONTACT_NAME.toLocaleLowerCase(),
    firstName: undefined,
    lastName: undefined,
    imageUrl: undefined,
    notes: undefined,
    searchText: ERASED_CONTACT_NAME.toLocaleLowerCase(),
    searchAliases: [],
    invitedByNames: [],
    smsConsent: false,
    consentUpdatedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function eraseWorkspacePersonRecords(
  ctx: MutationCtx,
  scope: WorkspaceScope,
  subject: ErasureSubject,
) {
  const { workspace, organizerKeys } = scope;
  const contacts = new Map<Id<"workspaceContacts">, Doc<"workspaceContacts">>();

  for (const clerkUserId of subject.clerkUserIds) {
    const [preferences, profileValueGrants, guestProfiles, contactIdentities] = await Promise.all([
      ctx.db
        .query("userSmsOrganizerPreferences")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
        .collect(),
      ctx.db
        .query("workspaceProfileValueGrants")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
        .collect(),
      ctx.db
        .query("workspaceGuestProfiles")
        .withIndex("by_workspace_clerkUserId", (queryBuilder) =>
          queryBuilder.eq("workspaceId", workspace._id).eq("clerkUserId", clerkUserId),
        )
        .collect(),
      ctx.db
        .query("workspaceContactIdentities")
        .withIndex("by_workspace_user", (queryBuilder) =>
          queryBuilder.eq("workspaceId", workspace._id).eq("clerkUserId", clerkUserId),
        )
        .collect(),
    ]);
    await deleteDocuments(ctx, [
      ...preferences.filter(
        (preference) =>
          organizerKeys.has(preference.organizerKey) ||
          preference.workspaceId === workspace._id ||
          preference.workspaceSlug === workspace.slug,
      ),
      ...profileValueGrants.filter(
        (grant) =>
          grant.workspaceId === workspace._id ||
          grant.workspaceSlug === workspace.slug ||
          (grant.siteKey !== undefined && organizerKeys.has(`site:${grant.siteKey}`)),
      ),
      ...guestProfiles,
    ]);
    for (const contactIdentity of contactIdentities) {
      const contact = await ctx.db.get(contactIdentity.contactId);
      if (contact) contacts.set(contact._id, contact);
    }
  }

  for (const phoneHash of subject.phoneHashes) {
    const [guestProfiles, phoneContacts] = await Promise.all([
      ctx.db
        .query("workspaceGuestProfiles")
        .withIndex("by_workspace_phoneHash", (queryBuilder) =>
          queryBuilder.eq("workspaceId", workspace._id).eq("guestPhoneHash", phoneHash),
        )
        .collect(),
      ctx.db
        .query("workspaceContacts")
        .withIndex("by_workspace_phone", (queryBuilder) =>
          queryBuilder.eq("workspaceId", workspace._id).eq("phoneHash", phoneHash),
        )
        .collect(),
    ]);
    await deleteDocuments(ctx, guestProfiles);
    for (const contact of phoneContacts) contacts.set(contact._id, contact);
  }

  for (const contact of contacts.values()) {
    await eraseWorkspaceContact(ctx, contact, subject);
  }
}

// Guest identities are keyed by phone hash and exist only through RSVPs, so
// their global records go once no RSVP in any workspace still needs them.
// Records scoped to another workspace stay with that workspace.
async function eraseUnusedGuestRecords(ctx: MutationCtx, subject: ErasureSubject) {
  for (const phoneHash of subject.phoneHashes) {
    const guestClerkUserId = buildGuestClerkUserId(phoneHash);
    const [guestRsvp, phoneHashRsvp] = await Promise.all([
      ctx.db
        .query("rsvps")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", guestClerkUserId))
        .first(),
      ctx.db
        .query("rsvps")
        .withIndex("by_guestPhoneHash", (queryBuilder) =>
          queryBuilder.eq("guestPhoneHash", phoneHash),
        )
        .first(),
    ]);
    if (guestRsvp || phoneHashRsvp) continue;

    const [guestContacts, guestHandoffs, socialProfiles, profileFieldValues, profiles] =
      await Promise.all([
        ctx.db
          .query("guestContacts")
          .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
          .collect(),
        ctx.db
          .query("rsvpGuestHandoffs")
          .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
          .collect(),
        ctx.db
          .query("userSocialProfiles")
          .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", guestClerkUserId))
          .collect(),
        ctx.db
          .query("profileFieldValues")
          .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", guestClerkUserId))
          .collect(),
        ctx.db
          .query("profiles")
          .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", guestClerkUserId))
          .collect(),
      ]);
    const ungrantedProfileFieldValues: Doc<"profileFieldValues">[] = [];
    for (const value of profileFieldValues) {
      const remainingGrant = await ctx.db
        .query("workspaceProfileValueGrants")
        .withIndex("by_profile_value", (queryBuilder) =>
          queryBuilder.eq("profileFieldValueId", value._id),
        )
        .first();
      if (!remainingGrant) ungrantedProfileFieldValues.push(value);
    }
    await deleteDocuments(ctx, [
      ...guestContacts,
      ...guestHandoffs,
      ...socialProfiles,
      ...ungrantedProfileFieldValues,
      ...profiles,
    ]);
  }
}

export const eraseSubjectForApiClient = internalMutation({
  args: {
    apiClientId: v.id("apiClients"),
    workspaceId: v.id("workspaces"),
    phone: v.optional(v.string()),
    rsvpIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const [apiClient, scope] = await Promise.all([
      ctx.db.get(args.apiClientId),
      loadWorkspaceScope(ctx, args.workspaceId),
    ]);
    if (!apiClient || !scope || apiClient.workspaceId !== scope.workspace._id) {
      throw new Error("API client does not belong to the workspace");
    }

    const erasedRsvps: Doc<"rsvps">[] = [];
    const retainedRsvps: Doc<"rsvps">[] = [];
    for (const rsvp of await findCandidateRsvps(ctx, args)) {
      if (!(await rsvpBelongsToWorkspace(ctx, rsvp, scope.workspace))) continue;
      const decision = await decideRsvpErasure(ctx, rsvp, apiClient._id);
      if (decision === "erase") erasedRsvps.push(rsvp);
      if (decision === "retain") retainedRsvps.push(rsvp);
    }

    if (erasedRsvps.length > 0) {
      const subject = await buildErasureSubject(ctx, erasedRsvps);
      await cancelPendingPersonNotifications(ctx, subject);
      for (const rsvp of erasedRsvps) await eraseRsvp(ctx, rsvp, apiClient._id);
      if (!(await subjectHasRsvpInWorkspace(ctx, subject, scope.workspace))) {
        await eraseWorkspacePersonRecords(ctx, scope, subject);
      }
      await eraseUnusedGuestRecords(ctx, subject);
    }

    const erasedRsvpIds = erasedRsvps.map((rsvp) => rsvp._id).sort();
    const retainedRsvpIds = retainedRsvps.map((rsvp) => rsvp._id).sort();
    await writeAuditEntry(ctx, {
      action: "partnerApi.erasure",
      targetKind: "apiClient",
      targetId: apiClient._id,
      workspaceId: scope.workspace._id,
      summary: `Partner erasure removed ${erasedRsvpIds.length} RSVP(s)`,
      metadata: {
        erasedRsvpIds: erasedRsvpIds.join(","),
        retainedRsvpIds: retainedRsvpIds.join(","),
      },
    });

    return {
      status: "completed" as const,
      erasedRsvpIds,
      retainedRsvpIds,
      completedAt: Date.now(),
    };
  },
});
