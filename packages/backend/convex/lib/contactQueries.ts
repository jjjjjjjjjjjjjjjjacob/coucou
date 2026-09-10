import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { contactConsent } from "./contactRecords";
import { contactSocialProfiles } from "./contactSocialProfiles";
import { CONTACT_BATCH_SIZE, type ContactAudience, type ContactFilters } from "./contactValidators";
import { obfuscatePhoneNumber } from "./phoneUtils";
import { parseRecipientFilter, statusesForFilter } from "./recipientFiltering";
import { ensureEventInSiteScope } from "./siteScope";
import type { ResolvedWorkspaceAuthScope } from "./workspaceAuth";

export async function validateContactFilters(
  ctx: Pick<QueryCtx, "db">,
  scope: ResolvedWorkspaceAuthScope,
  filters: ContactFilters,
) {
  const eventIds = [...(filters.eventIds ?? [])];
  const segment = filters.recipientFilter ? parseRecipientFilter(filters.recipientFilter) : null;
  if (segment?.type === "previous_approved_not_rsvped") eventIds.push(segment.excludedEventId);
  if (
    (filters.eventIds?.length ?? 0) > 200 ||
    (filters.recipientHistoryFilter?.textBlastIds.length ?? 0) > 100
  )
    throw new Error("Too many audience filters");
  for (const eventId of new Set(eventIds))
    await ensureEventInSiteScope(ctx, eventId, { workspaceSlug: scope.workspaceSlug });
  for (const blastId of filters.recipientHistoryFilter?.textBlastIds ?? []) {
    const blast = await ctx.db.get(blastId);
    if (!blast) throw new Error("Text blast not found");
    if (blast.workspaceId) {
      if (blast.workspaceId !== scope.workspaceId) throw new Error("Text blast not found");
    } else {
      if (!blast.eventId) throw new Error("Text blast not found");
      await ensureEventInSiteScope(ctx, blast.eventId, { workspaceSlug: scope.workspaceSlug });
    }
  }
}

export async function latestWorkspaceEvent(ctx: Pick<QueryCtx, "db">, workspaceSlug: string) {
  const past = await ctx.db
    .query("events")
    .withIndex("by_workspace_date", (builder) =>
      builder.eq("workspaceSlug", workspaceSlug).lte("eventDate", Date.now()),
    )
    .order("desc")
    .first();
  return (
    past ??
    (await ctx.db
      .query("events")
      .withIndex("by_workspace_date", (builder) => builder.eq("workspaceSlug", workspaceSlug))
      .order("desc")
      .first())
  );
}

export async function contactMatchesFilters(
  ctx: Pick<QueryCtx, "db">,
  contact: Doc<"workspaceContacts">,
  filters: ContactFilters,
  latestEventId?: Id<"events">,
  afterRsvpId?: Id<"rsvps">,
  legacyAudience?: Extract<ContactAudience, { type: "legacy_events" }>,
  legacySelectionPreviewId?: Id<"contactAudiencePreviews">,
): Promise<boolean | Id<"rsvps">> {
  if (contact.mergedInto) return false;
  const rawSearch = filters.searchText?.trim().toLocaleLowerCase() ?? "";
  const search =
    /\d/.test(rawSearch) && /^[+\d\s().-]+$/.test(rawSearch)
      ? rawSearch.replace(/\D/g, "")
      : rawSearch;
  if (search && !search.split(/\s+/).every((term) => contact.searchText.includes(term)))
    return false;
  if (
    filters.tags?.length &&
    !filters.tags.some((tag) => contact.tags.includes(tag.toLocaleLowerCase()))
  )
    return false;
  if (
    filters.defaultListKeys?.length &&
    !filters.defaultListKeys.some((key) => key.toLocaleLowerCase() === contact.defaultListKey)
  )
    return false;
  if (filters.smsConsentFilter && filters.smsConsentFilter !== "any") {
    const { smsConsent } = await contactConsent(ctx, contact);
    if (smsConsent !== (filters.smsConsentFilter === "consented")) return false;
  }
  if (filters.recipientHistoryFilter) {
    let received = false;
    for (const textBlastId of filters.recipientHistoryFilter.textBlastIds) {
      if (
        await ctx.db
          .query("contactDeliveries")
          .withIndex("by_contact_blast", (builder) =>
            builder.eq("contactId", contact._id).eq("textBlastId", textBlastId),
          )
          .first()
      ) {
        received = true;
        break;
      }
    }
    if (received !== (filters.recipientHistoryFilter.type === "received_any")) return false;
  }
  if (filters.rsvpedToLatestEvent && filters.rsvpedToLatestEvent !== "any") {
    const latestRsvp = latestEventId
      ? await ctx.db
          .query("contactEvents")
          .withIndex("by_contact_event", (builder) =>
            builder.eq("contactId", contact._id).eq("eventId", latestEventId),
          )
          .first()
      : null;
    if (Boolean(latestRsvp) !== (filters.rsvpedToLatestEvent === "yes")) return false;
  }
  const segment = filters.recipientFilter ? parseRecipientFilter(filters.recipientFilter) : null;
  if (segment?.type === "previous_approved_not_rsvped") {
    const excluded = await ctx.db
      .query("contactEvents")
      .withIndex("by_contact_event", (builder) =>
        builder.eq("contactId", contact._id).eq("eventId", segment.excludedEventId),
      )
      .first();
    if (excluded) return false;
  }
  if (!filters.eventIds?.length && !filters.listKeys?.length && !segment) return true;
  const relationships = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_rsvp", (builder) => {
      const scoped = builder.eq("contactId", contact._id);
      return afterRsvpId ? scoped.gt("rsvpId", afterRsvpId) : scoped;
    })
    .take(CONTACT_BATCH_SIZE + 1);
  const candidates = relationships.slice(0, CONTACT_BATCH_SIZE).filter((entry) => {
    if (filters.eventIds?.length && !filters.eventIds.includes(entry.eventId)) return false;
    if (
      filters.listKeys?.length &&
      !filters.listKeys.some((key) => key.toLocaleLowerCase() === entry.listKey)
    )
      return false;
    if (
      legacyAudience &&
      (!legacyAudience.eventIds.length || !legacyAudience.targetLists.length || !entry.smsConsent)
    )
      return false;
    if (!segment) return true;
    if (!statusesForFilter(segment).some((status) => status === entry.approvalStatus)) return false;
    if (
      segment.type === "approved_with_approval_sms" ||
      segment.type === "approved_no_approval_sms"
    )
      return entry.hasApprovalSms === (segment.type === "approved_with_approval_sms");
    if (segment.type === "qr_code_received" || segment.type === "qr_code_not_received")
      return entry.hasQrCode === (segment.type === "qr_code_received");
    if (segment.type === "rsvp_before") return entry.rsvpCreatedAt < segment.timestamp;
    if (segment.type === "custom_field_missing")
      return (
        !entry.customFieldKeys.includes(segment.fieldKey) ||
        entry.missingCustomFieldKeys.includes(segment.fieldKey)
      );
    return true;
  });
  for (const entry of candidates) {
    if (legacyAudience?.selectedRsvpIds?.length) {
      const selected = legacySelectionPreviewId
        ? await ctx.db
            .query("contactAudienceSelections")
            .withIndex("by_preview_rsvp", (builder) =>
              builder.eq("previewId", legacySelectionPreviewId).eq("rsvpId", entry.rsvpId),
            )
            .first()
        : legacyAudience.selectedRsvpIds.includes(entry.rsvpId);
      if (!selected) continue;
    }
    return true;
  }
  return relationships.length > CONTACT_BATCH_SIZE
    ? relationships[CONTACT_BATCH_SIZE - 1].rsvpId
    : false;
}

type ContactContinuation = {
  contactCursor: string | null;
  done: boolean;
  pending: Array<{ contactId: Id<"workspaceContacts">; afterRsvpId?: Id<"rsvps"> }>;
};

export async function readContactPage(
  ctx: Pick<QueryCtx, "db">,
  args: {
    workspaceId: Id<"workspaces">;
    workspaceSlug: string;
    filters: ContactFilters;
    cursor?: string;
    pageSize?: number;
    sortBy?: "name" | "latestRsvpAt" | "firstRsvpAt" | "eventCount";
    sortDirection?: "asc" | "desc";
    legacyAudience?: Extract<ContactAudience, { type: "legacy_events" }>;
    legacySelectionPreviewId?: Id<"contactAudiencePreviews">;
  },
) {
  const index = {
    name: "by_workspace_name",
    latestRsvpAt: "by_workspace_latest",
    firstRsvpAt: "by_workspace_first",
    eventCount: "by_workspace_count",
  } as const;
  const continuation: ContactContinuation = args.cursor
    ? JSON.parse(args.cursor)
    : { contactCursor: null, done: false, pending: [] };
  if (!Array.isArray(continuation.pending) || continuation.pending.length > CONTACT_BATCH_SIZE)
    throw new Error("Invalid contact cursor");
  const contacts: Doc<"workspaceContacts">[] = [];
  const latestEvent = await latestWorkspaceEvent(ctx, args.workspaceSlug);
  // History filters perform one indexed existence check per blast. Budget candidate counts accordingly.
  const pageSize = Math.min(
    Math.max(args.pageSize ?? 20, 1),
    CONTACT_BATCH_SIZE,
    Math.max(
      1,
      Math.floor(1200 / (30 + (args.filters.recipientHistoryFilter?.textBlastIds.length ?? 0))),
    ),
  );
  if (!continuation.pending.length && !continuation.done) {
    const batch = await ctx.db
      .query("workspaceContacts")
      .withIndex(index[args.sortBy ?? "name"], (builder) =>
        builder.eq("workspaceId", args.workspaceId).eq("mergedInto", undefined),
      )
      .order(args.sortDirection ?? "asc")
      .paginate({ cursor: continuation.contactCursor, numItems: pageSize });
    continuation.contactCursor = batch.continueCursor;
    continuation.done = batch.isDone;
    continuation.pending = batch.page.map((contact) => ({ contactId: contact._id }));
  }
  while (continuation.pending.length) {
    const candidate = continuation.pending[0];
    const contact = await ctx.db.get(candidate.contactId);
    if (!contact || contact.workspaceId !== args.workspaceId)
      throw new Error("Invalid contact cursor");
    const match = await contactMatchesFilters(
      ctx,
      contact,
      args.filters,
      latestEvent?._id,
      candidate.afterRsvpId,
      args.legacyAudience,
      args.legacySelectionPreviewId,
    );
    if (typeof match === "string") {
      candidate.afterRsvpId = match;
      break;
    }
    continuation.pending.shift();
    if (match) contacts.push(contact);
  }
  const isDone = continuation.done && continuation.pending.length === 0;
  return {
    contacts,
    nextCursor: isDone ? null : JSON.stringify(continuation),
    isDone,
    latestEvent,
  };
}

export async function contactToPerson(
  ctx: Pick<QueryCtx, "db">,
  contact: Doc<"workspaceContacts">,
  scope: ResolvedWorkspaceAuthScope,
  latestEventId?: Id<"events">,
) {
  const events = await ctx.db
    .query("contactEvents")
    .withIndex("by_contact_date", (builder) => builder.eq("contactId", contact._id))
    .order("desc")
    .take(3);
  const consent = await contactConsent(ctx, contact);
  const membership = contact.primaryClerkUserId
    ? await ctx.db
        .query("orgMemberships")
        .withIndex("by_user", (builder) =>
          builder.eq("clerkUserId", contact.primaryClerkUserId as string),
        )
        .filter((builder) => builder.eq(builder.field("organizationId"), scope.clerkOrganizationId))
        .first()
    : null;
  const latestEntry = latestEventId
    ? await ctx.db
        .query("contactEvents")
        .withIndex("by_contact_event", (builder) =>
          builder.eq("contactId", contact._id).eq("eventId", latestEventId),
        )
        .first()
    : null;
  return {
    contactId: contact._id,
    personKey: contact.personKey,
    clerkUserIds: contact.clerkUserIds,
    primaryClerkUserId: contact.primaryClerkUserId ?? null,
    detailReference: contact.detailReference ?? null,
    name: contact.name,
    firstName: contact.firstName,
    lastName: contact.lastName,
    imageUrl: contact.imageUrl,
    phoneObfuscated: contact.phoneNumber ? obfuscatePhoneNumber(contact.phoneNumber) : undefined,
    hasPhone: Boolean(contact.phoneNumber && /^\+[1-9]\d{6,14}$/.test(contact.phoneNumber)),
    socialProfiles: await contactSocialProfiles(ctx, contact),
    events: events.map((entry) => ({
      eventId: entry.eventId,
      eventName: entry.eventName,
      eventDate: entry.eventDate,
      rsvpId: entry.rsvpId,
      listKey: entry.listKey,
      approvalStatus: entry.approvalStatus as "approved" | "pending" | "denied",
      attendanceStatus: entry.attendanceStatus,
      invitedByName: entry.invitedByName,
      rsvpCreatedAt: entry.rsvpCreatedAt,
    })),
    eventCount: contact.eventCount,
    eventsAttendedCount: contact.eventsAttendedCount,
    firstRsvpAt: contact.firstRsvpAt,
    latestRsvpAt: contact.latestRsvpAt,
    rsvpedToLatestEvent: Boolean(latestEntry),
    smsConsent: consent.smsConsent,
    hasOptedOut: consent.hasOptedOut,
    receivedTextCount: contact.receivedTextCount,
    tags: contact.tags,
    notes: contact.notes,
    defaultListKey: contact.defaultListKey,
    invitedByNames: contact.invitedByNames,
    role: membership?.role ?? null,
    hasOrganizationMembership: Boolean(membership),
  };
}
