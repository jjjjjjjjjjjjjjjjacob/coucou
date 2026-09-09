import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveCanonicalUserIdentity } from "./canonicalUserIdentity";
import { GUEST_CLERK_USER_ID_PREFIX } from "./guestIdentity";
import { normalizeAndHashPhoneNumber } from "./phoneHash";
import { resolveApprovalStatus } from "./rsvpStatus";
import { resolveTenantWorkspaceScope } from "./workspaceScope";

type Reader = Pick<QueryCtx, "db">;
export async function resolveContact(
  ctx: Reader,
  contactId: Id<"workspaceContacts">,
): Promise<Doc<"workspaceContacts"> | null> {
  let contact = await ctx.db.get(contactId);
  const visited = new Set<string>();
  while (contact?.mergedInto) {
    if (visited.has(contact._id) || visited.size >= 20)
      throw new Error("Invalid contact identity alias");
    visited.add(contact._id);
    contact = await ctx.db.get(contact.mergedInto);
  }
  return contact;
}

export async function resolveContactPhone(
  ctx: Reader,
  clerkUserId?: string,
  guestPhoneHash?: string,
) {
  let identity = clerkUserId ? await resolveCanonicalUserIdentity(ctx, clerkUserId) : null;
  let phoneHash =
    guestPhoneHash ??
    (clerkUserId?.startsWith(GUEST_CLERK_USER_ID_PREFIX)
      ? clerkUserId.slice(GUEST_CLERK_USER_ID_PREFIX.length)
      : undefined);
  let phoneNumber: string | undefined;
  if (identity?.user?.phone) {
    try {
      const normalized = await normalizeAndHashPhoneNumber(identity.user.phone);
      phoneHash = normalized.phoneHash;
      phoneNumber = normalized.normalizedPhoneNumber;
    } catch {
      /* Invalid stored numbers are visible but cannot receive messages. */
    }
  }
  if (!phoneNumber && phoneHash) {
    const guestContact = await ctx.db
      .query("guestContacts")
      .withIndex("by_phoneHash", (builder) => builder.eq("phoneHash", phoneHash))
      .first();
    phoneNumber = guestContact?.phoneNumber;
  }
  if (!identity?.user && phoneHash) {
    const account =
      (await ctx.db
        .query("users")
        .withIndex("by_phoneHash", (builder) => builder.eq("phoneHash", phoneHash))
        .first()) ??
      (phoneNumber
        ? await ctx.db
            .query("users")
            .withIndex("by_phone", (builder) => builder.eq("phone", phoneNumber))
            .first()
        : null);
    if (account?.clerkUserId)
      identity = await resolveCanonicalUserIdentity(ctx, account.clerkUserId);
  }
  return {
    user: identity?.user ?? null,
    clerkUserId: identity?.clerkUserId ?? clerkUserId,
    phoneHash,
    phoneNumber,
  };
}

export function contactSearchText(
  contact: Pick<
    Doc<"workspaceContacts">,
    "name" | "phoneNumber" | "tags" | "notes" | "invitedByNames" | "defaultListKey"
  >,
): string {
  return [
    contact.name,
    contact.phoneNumber,
    contact.phoneNumber?.replace(/\D/g, ""),
    ...contact.tags,
    contact.notes,
    ...contact.invitedByNames,
    contact.defaultListKey,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export async function ensureContact(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  args: { clerkUserId?: string; guestPhoneHash?: string; name?: string; rsvpId?: Id<"rsvps"> },
) {
  const identity = await resolveContactPhone(ctx, args.clerkUserId, args.guestPhoneHash);
  const personKey = identity.phoneHash
    ? `phone:${identity.phoneHash}`
    : `user:${identity.clerkUserId}`;
  const identityRecord = identity.clerkUserId
    ? await ctx.db
        .query("workspaceContactIdentities")
        .withIndex("by_workspace_user", (builder) =>
          builder.eq("workspaceId", workspaceId).eq("clerkUserId", identity.clerkUserId as string),
        )
        .first()
    : null;
  const originalRecord =
    args.clerkUserId && args.clerkUserId !== identity.clerkUserId
      ? await ctx.db
          .query("workspaceContactIdentities")
          .withIndex("by_workspace_user", (builder) =>
            builder.eq("workspaceId", workspaceId).eq("clerkUserId", args.clerkUserId as string),
          )
          .first()
      : null;
  const identityContact = originalRecord
    ? await resolveContact(ctx, originalRecord.contactId)
    : identityRecord
      ? await resolveContact(ctx, identityRecord.contactId)
      : null;
  const phoneContact = identity.phoneHash
    ? await ctx.db
        .query("workspaceContacts")
        .withIndex("by_workspace_phone", (builder) =>
          builder.eq("workspaceId", workspaceId).eq("phoneHash", identity.phoneHash),
        )
        .filter((builder) => builder.eq(builder.field("mergedInto"), undefined))
        .first()
    : null;
  let contact = phoneContact ?? identityContact;
  const name =
    [identity.user?.firstName, identity.user?.lastName].filter(Boolean).join(" ").trim() ||
    args.name?.trim() ||
    contact?.name ||
    "Guest";
  const now = Date.now();
  if (!contact) {
    const contactId = await ctx.db.insert("workspaceContacts", {
      workspaceId,
      personKey,
      phoneHash: identity.phoneHash,
      phoneNumber: identity.phoneNumber,
      clerkUserIds: [],
      name,
      normalizedName: name.toLocaleLowerCase(),
      searchText: name.toLocaleLowerCase(),
      tags: [],
      invitedByNames: [],
      smsConsent: false,
      consentUpdatedAt: 0,
      hasOptedOut: false,
      eventCount: 0,
      eventsAttendedCount: 0,
      receivedTextCount: 0,
      firstRsvpAt: 0,
      latestRsvpAt: 0,
      createdAt: now,
      updatedAt: now,
    });
    contact = await ctx.db.get(contactId);
  }
  if (!contact) throw new Error("Contact could not be created");
  if (identityContact && identityContact._id !== contact._id) {
    for (const tag of identityContact.tags)
      await adjustContactFacet(ctx, workspaceId, "tag", tag, -1);
    if (identityContact.defaultListKey)
      await adjustContactFacet(ctx, workspaceId, "defaultList", identityContact.defaultListKey, -1);
    // Keep the retired ID resolvable by saved selections. Relationship migration is batched.
    await ctx.db.patch(identityContact._id, { mergedInto: contact._id, updatedAt: now });
    const { internal } = await import("../_generated/api");
    await ctx.scheduler.runAfter(0, internal.contactSync.mergeRelationships, {
      sourceId: identityContact._id,
      targetId: contact._id,
    });
  }
  const clerkUserIds = Array.from(
    new Set([
      ...contact.clerkUserIds,
      ...(identityContact?.clerkUserIds ?? []),
      ...[args.clerkUserId, identity.clerkUserId].filter((value): value is string =>
        Boolean(value),
      ),
    ]),
  );
  for (const clerkUserId of [args.clerkUserId, identity.clerkUserId].filter(
    (value): value is string => Boolean(value),
  )) {
    const record = await ctx.db
      .query("workspaceContactIdentities")
      .withIndex("by_workspace_user", (builder) =>
        builder.eq("workspaceId", workspaceId).eq("clerkUserId", clerkUserId),
      )
      .first();
    if (record) {
      if (record.contactId !== contact._id)
        await ctx.db.patch(record._id, { contactId: contact._id });
    } else
      await ctx.db.insert("workspaceContactIdentities", {
        workspaceId,
        clerkUserId,
        contactId: contact._id,
      });
  }
  const patch = {
    personKey,
    clerkUserIds,
    name,
    normalizedName: name.toLocaleLowerCase(),
    phoneHash: identity.phoneHash ?? contact.phoneHash,
    phoneNumber: identity.phoneNumber ?? contact.phoneNumber,
    primaryClerkUserId: identity.user?.clerkUserId ?? contact.primaryClerkUserId,
    detailReference:
      identity.user?._id ??
      contact.detailReference ??
      (args.rsvpId ? `rsvp~${args.rsvpId}` : undefined),
    firstName: identity.user?.firstName ?? contact.firstName,
    lastName: identity.user?.lastName ?? contact.lastName,
    imageUrl: identity.user?.imageUrl ?? contact.imageUrl,
    updatedAt: now,
  };
  await ctx.db.patch(contact._id, {
    ...patch,
    searchText: contactSearchText({ ...contact, ...patch }),
  });
  return (await ctx.db.get(contact._id)) as Doc<"workspaceContacts">;
}

export async function contactConsent(ctx: Reader, contact: Doc<"workspaceContacts">) {
  const workspace = await ctx.db.get(contact.workspaceId);
  let smsConsent = contact.smsConsent;
  let consentUpdatedAt = contact.consentUpdatedAt;
  const sites = await ctx.db
    .query("workspaceSites")
    .withIndex("by_workspace", (builder) => builder.eq("workspaceId", contact.workspaceId))
    .take(20);
  for (const clerkUserId of contact.clerkUserIds) {
    const organizerKeys = [`workspace:${contact.workspaceId}`, `workspaceSlug:${workspace?.slug}`];
    for (const site of sites) organizerKeys.push(`site:${site.siteKey}`);
    for (const organizerKey of organizerKeys) {
      const preference = await ctx.db
        .query("userSmsOrganizerPreferences")
        .withIndex("by_user_organizer", (builder) =>
          builder.eq("clerkUserId", clerkUserId).eq("organizerKey", organizerKey),
        )
        .first();
      if (preference && preference.updatedAt >= consentUpdatedAt) {
        smsConsent = preference.smsConsent;
        consentUpdatedAt = preference.updatedAt;
      }
    }
  }
  const optOut = contact.phoneHash
    ? await ctx.db
        .query("smsOptOuts")
        .withIndex("by_phone", (builder) => builder.eq("phoneNumber", contact.phoneHash as string))
        .first()
    : null;
  const hasOptedOut = Boolean(optOut && optOut.reOptInAt === undefined);
  return { smsConsent: smsConsent && !hasOptedOut, hasOptedOut, consentUpdatedAt };
}

async function adjustContactFacet(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  kind: "tag" | "defaultList" | "eventList",
  value: string,
  difference: number,
) {
  const facet = await ctx.db
    .query("contactFacets")
    .withIndex("by_value", (builder) =>
      builder.eq("workspaceId", workspaceId).eq("kind", kind).eq("value", value),
    )
    .first();
  const count = Math.max(0, (facet?.count ?? 0) + difference);
  if (facet) {
    if (count) await ctx.db.patch(facet._id, { count });
    else await ctx.db.delete(facet._id);
  } else if (count) await ctx.db.insert("contactFacets", { workspaceId, kind, value, count });
}

export async function refreshContactProfile(ctx: MutationCtx, contactId: Id<"workspaceContacts">) {
  const contact = await resolveContact(ctx, contactId);
  if (!contact) return;
  const profiles: Doc<"workspaceGuestProfiles">[] = [];
  if (contact.phoneHash) {
    const profile = await ctx.db
      .query("workspaceGuestProfiles")
      .withIndex("by_workspace_phoneHash", (builder) =>
        builder.eq("workspaceId", contact.workspaceId).eq("guestPhoneHash", contact.phoneHash),
      )
      .first();
    if (profile) profiles.push(profile);
  }
  for (const clerkUserId of contact.clerkUserIds) {
    const profile = await ctx.db
      .query("workspaceGuestProfiles")
      .withIndex("by_workspace_clerkUserId", (builder) =>
        builder.eq("workspaceId", contact.workspaceId).eq("clerkUserId", clerkUserId),
      )
      .first();
    if (profile && !profiles.some((existing) => existing._id === profile._id))
      profiles.push(profile);
  }
  profiles.sort((first, second) => second.updatedAt - first.updatedAt);
  const tags = Array.from(new Set(profiles.flatMap((profile) => profile.tags ?? [])));
  const invitedByNames = Array.from(
    new Set([
      ...contact.invitedByNames,
      ...profiles.flatMap(
        (profile) => profile.invitedByHistory?.map((entry) => entry.displayName) ?? [],
      ),
    ]),
  );
  const notes =
    Array.from(new Set(profiles.map((profile) => profile.notes).filter(Boolean))).join("\n") ||
    undefined;
  const patch = {
    tags,
    invitedByNames,
    notes,
    defaultListKey: profiles[0]?.defaultListKey,
    updatedAt: Date.now(),
  };
  for (const tag of contact.tags)
    if (!tags.includes(tag)) await adjustContactFacet(ctx, contact.workspaceId, "tag", tag, -1);
  for (const tag of tags)
    if (!contact.tags.includes(tag))
      await adjustContactFacet(ctx, contact.workspaceId, "tag", tag, 1);
  if (contact.defaultListKey !== patch.defaultListKey) {
    if (contact.defaultListKey)
      await adjustContactFacet(ctx, contact.workspaceId, "defaultList", contact.defaultListKey, -1);
    if (patch.defaultListKey)
      await adjustContactFacet(ctx, contact.workspaceId, "defaultList", patch.defaultListKey, 1);
  }
  const consent = await contactConsent(ctx, contact);
  await ctx.db.patch(contact._id, {
    ...patch,
    hasOptedOut: consent.hasOptedOut,
    searchText: contactSearchText({ ...contact, ...patch }),
  });
}

export async function removeContactEvent(ctx: MutationCtx, relationship: Doc<"contactEvents">) {
  await ctx.db.delete(relationship._id);
  if (relationship.listKey)
    await adjustContactFacet(ctx, relationship.workspaceId, "eventList", relationship.listKey, -1);
  const contact = await ctx.db.get(relationship.contactId);
  if (!contact) return;
  const remaining = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_event", (builder) =>
      builder.eq("contactId", contact._id).eq("eventId", relationship.eventId),
    )
    .take(2);
  const remainingAttended = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_attendance", (builder) =>
      builder
        .eq("contactId", contact._id)
        .eq("eventId", relationship.eventId)
        .eq("hasAttended", true),
    )
    .first();
  const first = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_created", (builder) => builder.eq("contactId", contact._id))
    .order("asc")
    .first();
  const latest = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_created", (builder) => builder.eq("contactId", contact._id))
    .order("desc")
    .first();
  const latestGranted = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_consent", (builder) =>
      builder.eq("contactId", contact._id).eq("smsConsent", true),
    )
    .order("desc")
    .first();
  const latestDenied = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_consent", (builder) =>
      builder.eq("contactId", contact._id).eq("smsConsent", false),
    )
    .order("desc")
    .first();
  const latestConsent =
    !latestDenied ||
    (latestGranted && latestGranted.consentUpdatedAt > latestDenied.consentUpdatedAt)
      ? latestGranted
      : latestDenied;
  await ctx.db.patch(contact._id, {
    smsConsent: latestConsent?.smsConsent ?? false,
    consentUpdatedAt: latestConsent?.consentUpdatedAt ?? 0,
    eventCount: Math.max(0, contact.eventCount - (remaining.length ? 0 : 1)),
    eventsAttendedCount: Math.max(
      0,
      contact.eventsAttendedCount - (relationship.hasAttended && !remainingAttended ? 1 : 0),
    ),
    firstRsvpAt: first?.rsvpCreatedAt ?? 0,
    latestRsvpAt: latest?.rsvpCreatedAt ?? 0,
    updatedAt: Date.now(),
  });
}

export async function syncContactRsvp(ctx: MutationCtx, rsvpId: Id<"rsvps">) {
  const previous = await ctx.db
    .query("contactEvents")
    .withIndex("by_rsvp", (builder) => builder.eq("rsvpId", rsvpId))
    .first();
  const rsvp = await ctx.db.get(rsvpId);
  const event = rsvp ? await ctx.db.get(rsvp.eventId) : null;
  if (!rsvp || !event) {
    if (previous) await removeContactEvent(ctx, previous);
    return;
  }
  const scope = await resolveTenantWorkspaceScope(ctx, {
    workspaceSlug: event.workspaceSlug,
    siteKey: event.siteKey ?? "dojo",
  });
  if (!scope) return;
  let contact = await ensureContact(ctx, scope.workspaceId, {
    clerkUserId: rsvp.clerkUserId,
    guestPhoneHash: rsvp.guestPhoneHash,
    name: rsvp.userName,
    rsvpId,
  });
  if (previous) await removeContactEvent(ctx, previous);
  contact = (await ctx.db.get(contact._id)) as Doc<"workspaceContacts">;
  const siblings = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_event", (builder) =>
      builder.eq("contactId", contact._id).eq("eventId", event._id),
    )
    .take(2);
  const attendedSibling = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_attendance", (builder) =>
      builder.eq("contactId", contact._id).eq("eventId", event._id).eq("hasAttended", true),
    )
    .first();
  const redemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (builder) =>
      builder.eq("eventId", event._id).eq("clerkUserId", rsvp.clerkUserId),
    )
    .first();
  const approvalSms = await ctx.db
    .query("smsNotifications")
    .withIndex("by_event_recipient_type_status", (builder) =>
      builder
        .eq("eventId", event._id)
        .eq("recipientClerkUserId", rsvp.clerkUserId)
        .eq("type", "approval")
        .eq("status", "sent"),
    )
    .first();
  const hasAttended = Boolean(
    redemption?.redeemedAt !== undefined && redemption.disabledAt === undefined,
  );
  const consentUpdatedAt = rsvp.smsConsentTimestamp ?? rsvp.updatedAt ?? rsvp.createdAt;
  const customFieldKeys = (event.customFields ?? []).map((field) => field.key);
  await ctx.db.insert("contactEvents", {
    workspaceId: scope.workspaceId,
    contactId: contact._id,
    eventId: event._id,
    rsvpId,
    clerkUserId: rsvp.clerkUserId,
    eventName: event.name,
    eventDate: event.eventDate,
    listKey: rsvp.listKey?.toLocaleLowerCase(),
    approvalStatus: resolveApprovalStatus(rsvp),
    attendanceStatus: rsvp.attendanceStatus,
    invitedByName: rsvp.invitedByName,
    rsvpCreatedAt: rsvp.createdAt,
    smsConsent: rsvp.smsConsent,
    consentUpdatedAt,
    hasAttended,
    hasApprovalSms: approvalSms !== null,
    hasQrCode: redemption?.qrDeliveredAt !== undefined,
    customFieldKeys,
    missingCustomFieldKeys: customFieldKeys.filter((key) => !rsvp.customFieldValues?.[key]?.trim()),
  });
  if (rsvp.listKey)
    await adjustContactFacet(
      ctx,
      scope.workspaceId,
      "eventList",
      rsvp.listKey.toLocaleLowerCase(),
      1,
    );
  const invitedByNames = Array.from(
    new Set([...contact.invitedByNames, ...(rsvp.invitedByName ? [rsvp.invitedByName] : [])]),
  );
  const patch = {
    eventCount: contact.eventCount + (siblings.length ? 0 : 1),
    eventsAttendedCount: contact.eventsAttendedCount + (hasAttended && !attendedSibling ? 1 : 0),
    firstRsvpAt: contact.firstRsvpAt
      ? Math.min(contact.firstRsvpAt, rsvp.createdAt)
      : rsvp.createdAt,
    latestRsvpAt: Math.max(contact.latestRsvpAt, rsvp.createdAt),
    invitedByNames,
    ...(rsvp.smsConsent !== undefined && consentUpdatedAt >= contact.consentUpdatedAt
      ? { smsConsent: rsvp.smsConsent, consentUpdatedAt }
      : {}),
    updatedAt: Date.now(),
  };
  await ctx.db.patch(contact._id, {
    ...patch,
    searchText: contactSearchText({ ...contact, ...patch }),
  });
  await refreshContactProfile(ctx, contact._id);
}

export async function syncContactDelivery(ctx: MutationCtx, deliveryId: Id<"textBlastRecipients">) {
  const projection = await ctx.db
    .query("contactDeliveries")
    .withIndex("by_delivery", (builder) => builder.eq("deliveryId", deliveryId))
    .first();
  const delivery = await ctx.db.get(deliveryId);
  const blast = delivery ? await ctx.db.get(delivery.textBlastId) : null;
  const event = blast?.eventId ? await ctx.db.get(blast.eventId) : null;
  const scope = event
    ? await resolveTenantWorkspaceScope(ctx, {
        workspaceSlug: event.workspaceSlug,
        siteKey: event.siteKey,
      })
    : null;
  const workspaceId = delivery?.workspaceId ?? blast?.workspaceId ?? scope?.workspaceId;
  const phoneContact =
    delivery && workspaceId
      ? await ctx.db
          .query("workspaceContacts")
          .withIndex("by_workspace_phone", (builder) =>
            builder.eq("workspaceId", workspaceId).eq("phoneHash", delivery.phoneHash),
          )
          .filter((builder) => builder.eq(builder.field("mergedInto"), undefined))
          .first()
      : null;
  const knownContact = delivery?.contactId ? await resolveContact(ctx, delivery.contactId) : null;
  const contact = knownContact?.workspaceId === workspaceId ? knownContact : phoneContact;
  if (projection && (delivery?.status !== "sent" || projection.contactId !== contact?._id)) {
    const previous = await ctx.db.get(projection.contactId);
    if (previous)
      await ctx.db.patch(previous._id, {
        receivedTextCount: Math.max(0, previous.receivedTextCount - 1),
      });
    await ctx.db.delete(projection._id);
  }
  if (contact && delivery?.status === "sent" && projection?.contactId !== contact._id) {
    await ctx.db.insert("contactDeliveries", {
      workspaceId: contact.workspaceId,
      contactId: contact._id,
      deliveryId,
      textBlastId: delivery.textBlastId,
    });
    await ctx.db.patch(contact._id, { receivedTextCount: contact.receivedTextCount + 1 });
  }
  if (
    delivery &&
    workspaceId &&
    (delivery.workspaceId !== workspaceId || delivery.contactId !== contact?._id)
  )
    await ctx.db.patch(deliveryId, { workspaceId, contactId: contact?._id });
}
