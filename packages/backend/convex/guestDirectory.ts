/**
 * Workspace guest directory API
 *
 * Person-level view over all RSVPs in a workspace: one row per guest across
 * every historical event, with organizer-set annotations (tags, notes,
 * default list) stored in workspaceGuestProfiles. Shares audience-segment
 * semantics with text blasts via lib/recipientFiltering, but intentionally
 * does NOT apply the blast SMS-consent hard gate — the directory shows
 * non-consented people; blast sending continues to exclude them.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { resolveCanonicalRsvpId, resolveCanonicalUserById } from "./lib/canonicalUserIdentity";
import { GUEST_CLERK_USER_ID_PREFIX, isGuestClerkUserId } from "./lib/guestIdentity";
import { normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { obfuscatePhoneNumber } from "./lib/phoneUtils";
import {
  customFieldIsMissing,
  parseRecipientFilter,
  passesRecipientHistoryFilter,
  type RecipientFilterConfig,
  recipientHistoryFilterValidator,
  rsvpHasReceivedQrCode,
  rsvpHasSentApprovalSms,
  statusesForFilter,
} from "./lib/recipientFiltering";
import { type ApprovalStatus, resolveApprovalStatus } from "./lib/rsvpStatus";
import { ensureEventInSiteScope, eventMatchesSiteScope } from "./lib/siteScope";
import { type ResolvedWorkspaceAuthScope, requireWorkspaceHost } from "./lib/workspaceAuth";

// Guardrails for the full-workspace aggregation below. Existing blast
// targeting already scans every RSVP for the events it touches, so this is
// the same order of work; if a workspace ever exceeds these caps, move the
// aggregation to a denormalized per-person index table instead of raising them.
const MAX_WORKSPACE_EVENTS_FOR_DIRECTORY = 200;
const MAX_WORKSPACE_RSVPS_FOR_DIRECTORY = 20_000;

const MAX_TAG_LENGTH = 50;
const MAX_TAGS_PER_GUEST = 50;
const MAX_NOTES_LENGTH = 10_000;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_COMMAND_PALETTE_RESULT_LIMIT = 8;
const MAX_COMMAND_PALETTE_RESULT_LIMIT = 20;
const DIRECTORY_USER_LOOKUP_BATCH_SIZE = 50;

type PersonEventEntry = {
  eventId: Id<"events">;
  eventName: string;
  eventDate: number;
  rsvpId: Id<"rsvps">;
  listKey?: string;
  approvalStatus: ApprovalStatus;
  attendanceStatus?: string;
  invitedByName?: string;
  rsvpCreatedAt: number;
};

export type GuestDirectoryPerson = {
  personKey: string;
  clerkUserIds: string[];
  primaryClerkUserId: string | null;
  detailReference: string | null;
  name: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  phoneObfuscated?: string;
  hasPhone: boolean;
  events: PersonEventEntry[];
  eventCount: number;
  eventsAttendedCount: number;
  firstRsvpAt: number;
  latestRsvpAt: number;
  rsvpedToLatestEvent: boolean;
  smsConsent: boolean;
  hasOptedOut: boolean;
  receivedTextCount: number | null;
  tags: string[];
  notes?: string;
  defaultListKey?: string;
  invitedByNames: string[];
  role: string | null;
  hasOrganizationMembership: boolean;
};

type AggregatedPerson = {
  personKey: string;
  phoneHash: string | null;
  clerkUserIds: Set<string>;
  rsvps: Doc<"rsvps">[];
  users: Doc<"users">[];
};

const guestPersonKeyValidator = v.object({
  clerkUserId: v.optional(v.string()),
  guestPhoneHash: v.optional(v.string()),
});

type GuestPersonKeyArgs = {
  clerkUserId?: string;
  guestPhoneHash?: string;
};

const siteScopeArgValidators = {
  siteKey: v.optional(v.string()),
  workspaceSlug: v.optional(v.string()),
};

function normalizeTags(rawTags: string[]): string[] {
  const normalizedTags: string[] = [];
  for (const rawTag of rawTags) {
    const normalizedTag = rawTag.trim().toLowerCase();
    if (!normalizedTag) continue;
    if (normalizedTag.length > MAX_TAG_LENGTH) {
      throw new Error(`Tags must be ${MAX_TAG_LENGTH} characters or fewer`);
    }
    if (!normalizedTags.includes(normalizedTag)) {
      normalizedTags.push(normalizedTag);
    }
  }
  if (normalizedTags.length > MAX_TAGS_PER_GUEST) {
    throw new Error(`A guest can have at most ${MAX_TAGS_PER_GUEST} tags`);
  }
  return normalizedTags;
}

function resolveInvitedByNames(
  person: AggregatedPerson,
  profile: Doc<"workspaceGuestProfiles"> | null,
): string[] {
  const displayNameByNormalizedName = new Map<string, string>();
  for (const historyEntry of profile?.invitedByHistory ?? []) {
    displayNameByNormalizedName.set(historyEntry.normalizedName, historyEntry.displayName);
  }
  const newestRsvpsFirst = [...person.rsvps].sort(
    (firstRsvp, secondRsvp) => secondRsvp.updatedAt - firstRsvp.updatedAt,
  );
  for (const rsvp of newestRsvpsFirst) {
    const displayName = rsvp.invitedByName?.trim().replace(/\s+/g, " ");
    if (!displayName) continue;
    const normalizedName = displayName.toLocaleLowerCase();
    if (!displayNameByNormalizedName.has(normalizedName)) {
      displayNameByNormalizedName.set(normalizedName, displayName);
    }
  }
  return Array.from(displayNameByNormalizedName.values());
}

async function getScopedWorkspaceEvents(
  ctx: Pick<QueryCtx, "db">,
  scope: { siteKey?: string; workspaceSlug?: string },
): Promise<Doc<"events">[]> {
  const candidateEvents = scope.workspaceSlug
    ? await ctx.db
        .query("events")
        .withIndex("by_workspaceSlug", (queryBuilder) =>
          queryBuilder.eq("workspaceSlug", scope.workspaceSlug),
        )
        .collect()
    : scope.siteKey
      ? await ctx.db
          .query("events")
          .withIndex("by_siteKey", (queryBuilder) => queryBuilder.eq("siteKey", scope.siteKey))
          .collect()
      : await ctx.db.query("events").collect();
  const scopedEvents = candidateEvents.filter((event) => eventMatchesSiteScope(event, scope));
  if (scopedEvents.length > MAX_WORKSPACE_EVENTS_FOR_DIRECTORY) {
    throw new Error(
      `Guest directory supports up to ${MAX_WORKSPACE_EVENTS_FOR_DIRECTORY} events per workspace`,
    );
  }
  return scopedEvents;
}

function resolveLatestEvent(scopedEvents: Doc<"events">[]): Doc<"events"> | null {
  if (scopedEvents.length === 0) {
    return null;
  }
  const now = Date.now();
  const pastOrCurrentEvents = scopedEvents.filter((event) => event.eventDate <= now);
  const candidateEvents = pastOrCurrentEvents.length > 0 ? pastOrCurrentEvents : scopedEvents;
  return candidateEvents.reduce((latestEvent, event) =>
    event.eventDate > latestEvent.eventDate ? event : latestEvent,
  );
}

/**
 * Best-effort stable phone hash for a person: synthetic guest ids embed the
 * hash directly; real users derive it from their stored phone number.
 */
async function resolveGuestPhoneHashForClerkUserId(
  ctx: Pick<QueryCtx, "db">,
  clerkUserId: string,
): Promise<string | null> {
  if (isGuestClerkUserId(clerkUserId)) {
    return clerkUserId.slice(GUEST_CLERK_USER_ID_PREFIX.length) || null;
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
    .unique();
  if (!user?.phone) {
    return null;
  }
  try {
    const phoneResolution = await normalizeAndHashPhoneNumber(user.phone);
    return phoneResolution.phoneHash;
  } catch {
    return null;
  }
}

/**
 * Groups every RSVP in the scoped events into person buckets. The person key
 * mirrors blast-recipient dedupe: phone hash when known (stable across guest
 * account claiming), otherwise the Clerk user id.
 */
async function aggregatePersonsFromRsvps(
  ctx: Pick<QueryCtx, "db">,
  scopedEvents: Doc<"events">[],
): Promise<AggregatedPerson[]> {
  const personsByKey = new Map<string, AggregatedPerson>();
  const userByClerkUserId = new Map<string, Doc<"users"> | null>();
  const phoneHashByClerkUserId = new Map<string, string | null>();
  const rsvpCollections = await Promise.all(
    scopedEvents.map(async (event) => {
      return await ctx.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", event._id))
        .collect();
    }),
  );
  const scopedRsvps = rsvpCollections.flat();
  if (scopedRsvps.length > MAX_WORKSPACE_RSVPS_FOR_DIRECTORY) {
    throw new Error(
      `Guest directory supports up to ${MAX_WORKSPACE_RSVPS_FOR_DIRECTORY} RSVPs per workspace`,
    );
  }

  const uniqueClerkUserIds = Array.from(new Set(scopedRsvps.map((rsvp) => rsvp.clerkUserId)));
  for (
    let batchStartIndex = 0;
    batchStartIndex < uniqueClerkUserIds.length;
    batchStartIndex += DIRECTORY_USER_LOOKUP_BATCH_SIZE
  ) {
    const clerkUserIdBatch = uniqueClerkUserIds.slice(
      batchStartIndex,
      batchStartIndex + DIRECTORY_USER_LOOKUP_BATCH_SIZE,
    );
    const identityRecords = await Promise.all(
      clerkUserIdBatch.map(async (clerkUserId) => {
        if (isGuestClerkUserId(clerkUserId)) {
          return {
            clerkUserId,
            phoneHash: clerkUserId.slice(GUEST_CLERK_USER_ID_PREFIX.length) || null,
            user: null,
          };
        }

        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (queryBuilder) =>
            queryBuilder.eq("clerkUserId", clerkUserId),
          )
          .unique();

        let phoneHash: string | null = null;
        if (user?.phone) {
          try {
            phoneHash = (await normalizeAndHashPhoneNumber(user.phone)).phoneHash;
          } catch {
            phoneHash = null;
          }
        }

        return { clerkUserId, phoneHash, user };
      }),
    );

    for (const identityRecord of identityRecords) {
      userByClerkUserId.set(identityRecord.clerkUserId, identityRecord.user);
      phoneHashByClerkUserId.set(identityRecord.clerkUserId, identityRecord.phoneHash);
    }
  }

  for (const rsvp of scopedRsvps) {
    const phoneHash = rsvp.guestPhoneHash ?? phoneHashByClerkUserId.get(rsvp.clerkUserId) ?? null;
    const personKey = phoneHash ? `phone:${phoneHash}` : `user:${rsvp.clerkUserId}`;

    let person = personsByKey.get(personKey);
    if (!person) {
      person = {
        personKey,
        phoneHash,
        clerkUserIds: new Set(),
        rsvps: [],
        users: [],
      };
      personsByKey.set(personKey, person);
    }

    person.rsvps.push(rsvp);
    if (!person.clerkUserIds.has(rsvp.clerkUserId)) {
      person.clerkUserIds.add(rsvp.clerkUserId);
      const user = userByClerkUserId.get(rsvp.clerkUserId) ?? null;
      if (user) {
        person.users.push(user);
      }
    }
  }

  return Array.from(personsByKey.values());
}

function findGuestProfileForPerson(
  person: AggregatedPerson,
  profilesByPhoneHash: Map<string, Doc<"workspaceGuestProfiles">>,
  profilesByClerkUserId: Map<string, Doc<"workspaceGuestProfiles">>,
): Doc<"workspaceGuestProfiles"> | null {
  if (person.phoneHash) {
    const profileByPhone = profilesByPhoneHash.get(person.phoneHash);
    if (profileByPhone) {
      return profileByPhone;
    }
  }
  for (const clerkUserId of person.clerkUserIds) {
    const profileByClerkUserId = profilesByClerkUserId.get(clerkUserId);
    if (profileByClerkUserId) {
      return profileByClerkUserId;
    }
  }
  return null;
}

async function loadWorkspaceGuestProfiles(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
): Promise<{
  profilesByPhoneHash: Map<string, Doc<"workspaceGuestProfiles">>;
  profilesByClerkUserId: Map<string, Doc<"workspaceGuestProfiles">>;
  allProfiles: Doc<"workspaceGuestProfiles">[];
}> {
  const allProfiles = await ctx.db
    .query("workspaceGuestProfiles")
    .withIndex("by_workspace", (queryBuilder) => queryBuilder.eq("workspaceId", workspaceId))
    .collect();

  const profilesByPhoneHash = new Map<string, Doc<"workspaceGuestProfiles">>();
  const profilesByClerkUserId = new Map<string, Doc<"workspaceGuestProfiles">>();
  for (const profile of allProfiles) {
    if (profile.guestPhoneHash) {
      profilesByPhoneHash.set(profile.guestPhoneHash, profile);
    }
    if (profile.clerkUserId) {
      profilesByClerkUserId.set(profile.clerkUserId, profile);
    }
  }

  return { profilesByPhoneHash, profilesByClerkUserId, allProfiles };
}

/**
 * Latest explicit SMS preference for the workspace organizer, mirroring the
 * organizerKey scheme in rsvps.ts (workspace id, then legacy slug/site keys).
 */
async function loadOrganizerSmsPreferences(
  ctx: Pick<QueryCtx, "db">,
  resolvedScope: ResolvedWorkspaceAuthScope,
): Promise<Map<string, Doc<"userSmsOrganizerPreferences">>> {
  const organizerKeys = [
    `workspace:${resolvedScope.workspaceId}`,
    `workspaceSlug:${resolvedScope.workspaceSlug}`,
    ...(resolvedScope.siteKey ? [`site:${resolvedScope.siteKey}`] : []),
  ];

  const latestPreferenceByClerkUserId = new Map<string, Doc<"userSmsOrganizerPreferences">>();
  for (const organizerKey of organizerKeys) {
    const preferences = await ctx.db
      .query("userSmsOrganizerPreferences")
      .withIndex("by_organizer", (queryBuilder) => queryBuilder.eq("organizerKey", organizerKey))
      .collect();
    for (const preference of preferences) {
      const existingPreference = latestPreferenceByClerkUserId.get(preference.clerkUserId);
      if (!existingPreference || preference.updatedAt > existingPreference.updatedAt) {
        latestPreferenceByClerkUserId.set(preference.clerkUserId, preference);
      }
    }
  }

  return latestPreferenceByClerkUserId;
}

function resolveBaseSmsConsent(
  person: AggregatedPerson,
  organizerPreferences: Map<string, Doc<"userSmsOrganizerPreferences">>,
): boolean {
  let latestPreference: { smsConsent: boolean; updatedAt: number } | null = null;

  for (const clerkUserId of person.clerkUserIds) {
    const organizerPreference = organizerPreferences.get(clerkUserId);
    if (
      organizerPreference &&
      (!latestPreference || organizerPreference.updatedAt > latestPreference.updatedAt)
    ) {
      latestPreference = {
        smsConsent: organizerPreference.smsConsent,
        updatedAt: organizerPreference.updatedAt,
      };
    }
  }

  for (const rsvp of person.rsvps) {
    if (rsvp.smsConsent === undefined) continue;
    const rsvpUpdatedAt = rsvp.smsConsentTimestamp ?? rsvp.updatedAt ?? rsvp.createdAt;
    if (!latestPreference || rsvpUpdatedAt > latestPreference.updatedAt) {
      latestPreference = { smsConsent: rsvp.smsConsent, updatedAt: rsvpUpdatedAt };
    }
  }

  return latestPreference?.smsConsent === true;
}

async function hasActiveSmsOptOut(
  ctx: Pick<QueryCtx, "db">,
  phoneHash: string | null,
): Promise<boolean> {
  if (!phoneHash) {
    return false;
  }
  const optOut = await ctx.db
    .query("smsOptOuts")
    .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneNumber", phoneHash))
    .first();
  return optOut !== null && optOut.reOptInAt === undefined;
}

function countDistinctEventIds(personEventEntries: PersonEventEntry[]): number {
  return new Set(personEventEntries.map((eventEntry) => eventEntry.eventId)).size;
}

/**
 * Number of distinct events where the person actually checked in at the door
 * (a redemption with redeemedAt set and not disabled) — as opposed to
 * eventCount, which counts RSVPs, and attendanceStatus, which is guest intent.
 */
async function countEventsAttendedForPerson(
  ctx: Pick<QueryCtx, "db">,
  person: AggregatedPerson,
): Promise<number> {
  const attendedEventIds = new Set<Id<"events">>();
  for (const rsvp of person.rsvps) {
    if (attendedEventIds.has(rsvp.eventId)) continue;
    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (queryBuilder) =>
        queryBuilder.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();
    if (redemption?.redeemedAt !== undefined && redemption.disabledAt === undefined) {
      attendedEventIds.add(rsvp.eventId);
    }
  }
  return attendedEventIds.size;
}

function getBlastTargetEventIdsForDelivery(blast: Doc<"textBlasts">): Id<"events">[] {
  if (blast.targetEventIds && blast.targetEventIds.length > 0) {
    return blast.targetEventIds;
  }
  return [blast.eventId];
}

async function countWorkspaceSentTexts(
  ctx: Pick<QueryCtx, "db">,
  phoneHash: string | null,
  scopedEventIds: Set<Id<"events">>,
  blastInWorkspaceCache: Map<Id<"textBlasts">, boolean>,
): Promise<number> {
  if (!phoneHash) {
    return 0;
  }

  const deliveries = await ctx.db
    .query("textBlastRecipients")
    .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
    .collect();

  let sentCount = 0;
  for (const delivery of deliveries) {
    if (delivery.status !== "sent") continue;

    let blastIsInWorkspace = blastInWorkspaceCache.get(delivery.textBlastId);
    if (blastIsInWorkspace === undefined) {
      const blast = await ctx.db.get(delivery.textBlastId);
      blastIsInWorkspace =
        blast !== null &&
        getBlastTargetEventIdsForDelivery(blast).some((eventId) => scopedEventIds.has(eventId));
      blastInWorkspaceCache.set(delivery.textBlastId, blastIsInWorkspace);
    }

    if (blastIsInWorkspace) {
      sentCount += 1;
    }
  }

  return sentCount;
}

/**
 * Person-level segment matching. Shares filter parsing/status semantics with
 * blast targeting but evaluates "does this person have at least one RSVP
 * matching the segment" instead of filtering RSVP rows.
 */
async function personMatchesSegmentFilter(
  ctx: Pick<QueryCtx, "db">,
  person: AggregatedPerson,
  filterConfig: RecipientFilterConfig,
  eventsById: Map<Id<"events">, Doc<"events">>,
  firstRsvpAt: number,
): Promise<boolean> {
  const statusesToMatch = statusesForFilter(filterConfig);
  const candidateRsvps = person.rsvps.filter((rsvp) =>
    statusesToMatch.includes(resolveApprovalStatus(rsvp)),
  );

  switch (filterConfig.type) {
    case "all":
    case "status":
      return candidateRsvps.length > 0;
    case "approved_no_approval_sms": {
      for (const rsvp of candidateRsvps) {
        if (!(await rsvpHasSentApprovalSms(ctx, rsvp))) {
          return true;
        }
      }
      return false;
    }
    case "approved_with_approval_sms": {
      for (const rsvp of candidateRsvps) {
        if (await rsvpHasSentApprovalSms(ctx, rsvp)) {
          return true;
        }
      }
      return false;
    }
    case "qr_code_received": {
      for (const rsvp of candidateRsvps) {
        if (await rsvpHasReceivedQrCode(ctx, rsvp)) {
          return true;
        }
      }
      return false;
    }
    case "qr_code_not_received": {
      for (const rsvp of candidateRsvps) {
        if (!(await rsvpHasReceivedQrCode(ctx, rsvp))) {
          return true;
        }
      }
      return false;
    }
    case "custom_field_missing": {
      const applicableRsvps = candidateRsvps.filter((rsvp) => {
        const event = eventsById.get(rsvp.eventId);
        return event?.customFields?.some(
          (customField) => customField.key === filterConfig.fieldKey,
        );
      });
      if (applicableRsvps.length === 0) {
        return false;
      }
      return applicableRsvps.every((rsvp) => customFieldIsMissing(rsvp, filterConfig.fieldKey));
    }
    case "rsvp_before":
      return candidateRsvps.length > 0 && firstRsvpAt < filterConfig.timestamp;
    case "previous_approved_not_rsvped": {
      if (candidateRsvps.length === 0) {
        return false;
      }
      return !person.rsvps.some((rsvp) => rsvp.eventId === filterConfig.excludedEventId);
    }
    default:
      return true;
  }
}

function resolvePersonIdentity(person: AggregatedPerson): {
  name: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  phoneObfuscated?: string;
  primaryClerkUserId: string | null;
  detailReference: string | null;
} {
  const realUser =
    person.users.find(
      (user) => user.clerkUserId !== undefined && !isGuestClerkUserId(user.clerkUserId),
    ) ?? null;
  const anyUser = realUser ?? person.users[0] ?? null;

  const sortedRsvps = [...person.rsvps].sort(
    (firstRsvp, secondRsvp) => secondRsvp.createdAt - firstRsvp.createdAt,
  );
  const latestRsvp = sortedRsvps[0];
  const latestRsvpWithName = sortedRsvps.find(
    (rsvp) => rsvp.userName && rsvp.userName.trim().length > 0,
  );

  const nameFromUser = anyUser
    ? [anyUser.firstName, anyUser.lastName].filter(Boolean).join(" ").trim()
    : "";
  const name = nameFromUser || latestRsvpWithName?.userName?.trim() || "Guest";

  const phoneObfuscated = anyUser?.phone
    ? obfuscatePhoneNumber(anyUser.phone)
    : (latestRsvp?.guestPhoneObfuscated ?? undefined);

  const primaryClerkUserId =
    realUser?.clerkUserId ??
    Array.from(person.clerkUserIds).find((clerkUserId) => !isGuestClerkUserId(clerkUserId)) ??
    null;

  const detailReference = anyUser ? anyUser._id : latestRsvp ? `rsvp~${latestRsvp._id}` : null;

  return {
    name,
    firstName: anyUser?.firstName ?? undefined,
    lastName: anyUser?.lastName ?? undefined,
    imageUrl: anyUser?.imageUrl ?? undefined,
    phoneObfuscated,
    primaryClerkUserId,
    detailReference,
  };
}

export const searchGuestDirectory = query({
  args: {
    ...siteScopeArgValidators,
    searchText: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const normalizedSearchText = args.searchText.trim().toLowerCase();
    if (!normalizedSearchText) {
      return [];
    }

    const scopedEvents = await getScopedWorkspaceEvents(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const eventsById = new Map(scopedEvents.map((event) => [event._id, event]));
    const persons = await aggregatePersonsFromRsvps(ctx, scopedEvents);
    const { profilesByPhoneHash, profilesByClerkUserId } = await loadWorkspaceGuestProfiles(
      ctx,
      resolvedScope.workspaceId,
    );

    const matchingPeople = persons.flatMap((person) => {
      const identity = resolvePersonIdentity(person);
      const profile = findGuestProfileForPerson(person, profilesByPhoneHash, profilesByClerkUserId);
      const searchableText = [
        identity.name,
        identity.firstName ?? "",
        identity.lastName ?? "",
        identity.phoneObfuscated ?? "",
        ...(profile?.tags ?? []),
        profile?.notes ?? "",
        profile?.defaultListKey ?? "",
        ...person.rsvps.map((rsvp) => rsvp.listKey ?? ""),
      ]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(normalizedSearchText)) {
        return [];
      }

      const normalizedName = identity.name.toLowerCase();
      const nameMatchRank =
        normalizedName === normalizedSearchText
          ? 0
          : normalizedName.startsWith(normalizedSearchText)
            ? 1
            : normalizedName
                  .split(/\s+/)
                  .some((namePart) => namePart.startsWith(normalizedSearchText))
              ? 2
              : 3;
      const latestRsvpAt = Math.max(...person.rsvps.map((rsvp) => rsvp.createdAt));
      const eventIds = new Set(person.rsvps.map((rsvp) => rsvp.eventId));
      const latestEvent = person.rsvps.reduce<Doc<"events"> | null>((latest, rsvp) => {
        const event = eventsById.get(rsvp.eventId) ?? null;
        if (!event) return latest;
        if (!latest || event.eventDate > latest.eventDate) return event;
        return latest;
      }, null);

      return [
        {
          detailReference: identity.detailReference,
          name: identity.name,
          phoneObfuscated: identity.phoneObfuscated,
          tags: profile?.tags ?? [],
          eventCount: eventIds.size,
          latestEventName: latestEvent?.name,
          latestRsvpAt,
          nameMatchRank,
        },
      ];
    });

    matchingPeople.sort((firstPerson, secondPerson) => {
      if (firstPerson.nameMatchRank !== secondPerson.nameMatchRank) {
        return firstPerson.nameMatchRank - secondPerson.nameMatchRank;
      }
      return secondPerson.latestRsvpAt - firstPerson.latestRsvpAt;
    });

    const requestedLimit = Number.isFinite(args.limit)
      ? Math.floor(args.limit ?? DEFAULT_COMMAND_PALETTE_RESULT_LIMIT)
      : DEFAULT_COMMAND_PALETTE_RESULT_LIMIT;
    const resultLimit = Math.min(Math.max(requestedLimit, 1), MAX_COMMAND_PALETTE_RESULT_LIMIT);

    return matchingPeople
      .slice(0, resultLimit)
      .map(({ nameMatchRank, latestRsvpAt, ...person }) => person);
  },
});

export const listGuestDirectoryPaginated = query({
  args: {
    ...siteScopeArgValidators,
    searchText: v.optional(v.string()),
    eventIds: v.optional(v.array(v.id("events"))),
    smsConsentFilter: v.optional(
      v.union(v.literal("any"), v.literal("consented"), v.literal("not_consented")),
    ),
    recipientHistoryFilter: recipientHistoryFilterValidator,
    recipientFilter: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    defaultListKeys: v.optional(v.array(v.string())),
    rsvpedToLatestEvent: v.optional(v.union(v.literal("any"), v.literal("yes"), v.literal("no"))),
    sortBy: v.optional(
      v.union(
        v.literal("name"),
        v.literal("latestRsvpAt"),
        v.literal("firstRsvpAt"),
        v.literal("eventCount"),
      ),
    ),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const siteScope = { siteKey: args.siteKey, workspaceSlug: args.workspaceSlug };

    const scopedEvents = await getScopedWorkspaceEvents(ctx, siteScope);
    const requestedEventIds =
      args.eventIds && args.eventIds.length > 0 ? new Set(args.eventIds) : null;
    const directoryEvents = requestedEventIds
      ? scopedEvents.filter((event) => requestedEventIds.has(event._id))
      : scopedEvents;
    const eventsById = new Map(directoryEvents.map((event) => [event._id, event]));
    const scopedEventIds = new Set(scopedEvents.map((event) => event._id));
    const latestEvent = resolveLatestEvent(directoryEvents);

    const [persons, guestProfiles, organizerPreferences, memberships] = await Promise.all([
      aggregatePersonsFromRsvps(ctx, directoryEvents),
      loadWorkspaceGuestProfiles(ctx, resolvedScope.workspaceId),
      loadOrganizerSmsPreferences(ctx, resolvedScope),
      resolvedScope.clerkOrganizationId
        ? ctx.db
            .query("orgMemberships")
            .withIndex("by_org", (queryBuilder) =>
              queryBuilder.eq("organizationId", resolvedScope.clerkOrganizationId),
            )
            .collect()
        : Promise.resolve([]),
    ]);
    const { profilesByPhoneHash, profilesByClerkUserId } = guestProfiles;
    const membershipRoleByClerkUserId = new Map<string, string>();
    for (const membership of memberships) {
      membershipRoleByClerkUserId.set(membership.clerkUserId, membership.role);
    }

    const filterConfig = args.recipientFilter ? parseRecipientFilter(args.recipientFilter) : null;
    const requestedTags =
      args.tags && args.tags.length > 0
        ? new Set(args.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
        : null;
    const requestedDefaultListKeys =
      args.defaultListKeys && args.defaultListKeys.length > 0
        ? new Set(args.defaultListKeys.map((listKey) => listKey.toLowerCase()))
        : null;
    const normalizedSearchText = args.searchText?.trim().toLowerCase() ?? "";

    const optOutCache = new Map<string, boolean>();
    const checkOptOut = async (phoneHash: string | null): Promise<boolean> => {
      if (!phoneHash) return false;
      const cachedOptOut = optOutCache.get(phoneHash);
      if (cachedOptOut !== undefined) return cachedOptOut;
      const optedOut = await hasActiveSmsOptOut(ctx, phoneHash);
      optOutCache.set(phoneHash, optedOut);
      return optedOut;
    };

    type FilteredPerson = {
      person: AggregatedPerson;
      identity: ReturnType<typeof resolvePersonIdentity>;
      events: PersonEventEntry[];
      firstRsvpAt: number;
      latestRsvpAt: number;
      rsvpedToLatestEvent: boolean;
      smsConsent: boolean;
      hasOptedOut: boolean;
      tags: string[];
      notes?: string;
      defaultListKey?: string;
      invitedByNames: string[];
      role: string | null;
    };

    const filteredPersons: FilteredPerson[] = [];
    for (const person of persons) {
      const profile = findGuestProfileForPerson(person, profilesByPhoneHash, profilesByClerkUserId);
      const personTags = profile?.tags ?? [];
      if (requestedTags && !personTags.some((tag) => requestedTags.has(tag))) {
        continue;
      }
      if (
        requestedDefaultListKeys &&
        (!profile?.defaultListKey ||
          !requestedDefaultListKeys.has(profile.defaultListKey.toLowerCase()))
      ) {
        continue;
      }

      const firstRsvpAt = Math.min(...person.rsvps.map((rsvp) => rsvp.createdAt));
      const latestRsvpAt = Math.max(...person.rsvps.map((rsvp) => rsvp.createdAt));
      const rsvpedToLatestEvent =
        latestEvent !== null && person.rsvps.some((rsvp) => rsvp.eventId === latestEvent._id);

      if (args.rsvpedToLatestEvent === "yes" && !rsvpedToLatestEvent) continue;
      if (args.rsvpedToLatestEvent === "no" && rsvpedToLatestEvent) continue;

      const baseSmsConsent = resolveBaseSmsConsent(person, organizerPreferences);
      let hasOptedOut = false;
      let smsConsent = baseSmsConsent;
      const needsConsentForFilter = args.smsConsentFilter && args.smsConsentFilter !== "any";
      if (needsConsentForFilter) {
        hasOptedOut = await checkOptOut(person.phoneHash);
        smsConsent = baseSmsConsent && !hasOptedOut;
      }

      if (args.smsConsentFilter === "consented" && !smsConsent) continue;
      if (args.smsConsentFilter === "not_consented" && smsConsent) continue;

      if (args.recipientHistoryFilter) {
        if (!person.phoneHash) {
          if (args.recipientHistoryFilter.type === "received_any") continue;
        } else if (
          !(await passesRecipientHistoryFilter(ctx, person.phoneHash, args.recipientHistoryFilter))
        ) {
          continue;
        }
      }

      if (
        filterConfig &&
        !(await personMatchesSegmentFilter(ctx, person, filterConfig, eventsById, firstRsvpAt))
      ) {
        continue;
      }

      const identity = resolvePersonIdentity(person);

      if (normalizedSearchText) {
        const searchableText = [
          identity.name,
          identity.firstName ?? "",
          identity.lastName ?? "",
          identity.phoneObfuscated ?? "",
          ...personTags,
        ]
          .join(" ")
          .toLowerCase();
        if (!searchableText.includes(normalizedSearchText)) {
          continue;
        }
      }

      const personEvents: PersonEventEntry[] = person.rsvps
        .map((rsvp) => {
          const event = eventsById.get(rsvp.eventId);
          return {
            eventId: rsvp.eventId,
            eventName: event?.name ?? "Unknown event",
            eventDate: event?.eventDate ?? rsvp.createdAt,
            rsvpId: rsvp._id,
            listKey: rsvp.listKey ?? undefined,
            approvalStatus: resolveApprovalStatus(rsvp),
            attendanceStatus: rsvp.attendanceStatus ?? undefined,
            invitedByName: rsvp.invitedByName,
            rsvpCreatedAt: rsvp.createdAt,
          };
        })
        .sort((firstEntry, secondEntry) => secondEntry.eventDate - firstEntry.eventDate);

      const role = identity.primaryClerkUserId
        ? (membershipRoleByClerkUserId.get(identity.primaryClerkUserId) ?? null)
        : null;

      filteredPersons.push({
        person,
        identity,
        events: personEvents,
        firstRsvpAt,
        latestRsvpAt,
        rsvpedToLatestEvent,
        smsConsent,
        hasOptedOut,
        tags: personTags,
        notes: profile?.notes,
        defaultListKey: profile?.defaultListKey,
        invitedByNames: resolveInvitedByNames(person, profile),
        role,
      });
    }

    const sortBy = args.sortBy ?? "latestRsvpAt";
    const sortDirection = args.sortDirection ?? "desc";
    const sortMultiplier = sortDirection === "asc" ? 1 : -1;
    filteredPersons.sort((firstPerson, secondPerson) => {
      switch (sortBy) {
        case "name":
          return (
            firstPerson.identity.name.localeCompare(secondPerson.identity.name) * sortMultiplier
          );
        case "firstRsvpAt":
          return (firstPerson.firstRsvpAt - secondPerson.firstRsvpAt) * sortMultiplier;
        case "eventCount":
          return (
            (countDistinctEventIds(firstPerson.events) -
              countDistinctEventIds(secondPerson.events)) *
            sortMultiplier
          );
        case "latestRsvpAt":
          return (firstPerson.latestRsvpAt - secondPerson.latestRsvpAt) * sortMultiplier;
        default:
          return 0;
      }
    });

    const pageSize = Math.min(Math.max(args.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const totalCount = filteredPersons.length;
    const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
    const pageIndex = Math.min(Math.max(args.page ?? 0, 0), totalPages - 1);
    const pagedPersons = filteredPersons.slice(
      pageIndex * pageSize,
      pageIndex * pageSize + pageSize,
    );

    const blastInWorkspaceCache = new Map<Id<"textBlasts">, boolean>();
    const people = await Promise.all(
      pagedPersons.map(async (filteredPerson): Promise<GuestDirectoryPerson> => {
        const [receivedTextCount, currentOptOutStatus, eventsAttendedCount] = await Promise.all([
          countWorkspaceSentTexts(
            ctx,
            filteredPerson.person.phoneHash,
            scopedEventIds,
            blastInWorkspaceCache,
          ),
          filteredPerson.hasOptedOut
            ? Promise.resolve(true)
            : checkOptOut(filteredPerson.person.phoneHash),
          countEventsAttendedForPerson(ctx, filteredPerson.person),
        ]);

        return {
          personKey: filteredPerson.person.personKey,
          clerkUserIds: Array.from(filteredPerson.person.clerkUserIds),
          primaryClerkUserId: filteredPerson.identity.primaryClerkUserId,
          detailReference: filteredPerson.identity.detailReference,
          name: filteredPerson.identity.name,
          firstName: filteredPerson.identity.firstName,
          lastName: filteredPerson.identity.lastName,
          imageUrl: filteredPerson.identity.imageUrl,
          phoneObfuscated: filteredPerson.identity.phoneObfuscated,
          hasPhone: filteredPerson.person.phoneHash !== null,
          events: filteredPerson.events,
          eventCount: countDistinctEventIds(filteredPerson.events),
          eventsAttendedCount,
          firstRsvpAt: filteredPerson.firstRsvpAt,
          latestRsvpAt: filteredPerson.latestRsvpAt,
          rsvpedToLatestEvent: filteredPerson.rsvpedToLatestEvent,
          smsConsent: filteredPerson.smsConsent && !currentOptOutStatus,
          hasOptedOut: currentOptOutStatus,
          receivedTextCount,
          tags: filteredPerson.tags,
          notes: filteredPerson.notes,
          defaultListKey: filteredPerson.defaultListKey,
          invitedByNames: filteredPerson.invitedByNames,
          role: filteredPerson.role,
          hasOrganizationMembership: filteredPerson.role !== null,
        };
      }),
    );

    return {
      people,
      pagination: {
        pageIndex,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: pageIndex < totalPages - 1,
        hasPreviousPage: pageIndex > 0,
      },
      latestEvent: latestEvent
        ? {
            eventId: latestEvent._id,
            eventName: latestEvent.name,
            eventDate: latestEvent.eventDate,
          }
        : null,
      workspaceEventCount: scopedEvents.length,
    };
  },
});

export const getGuestDirectoryFacets = query({
  args: {
    ...siteScopeArgValidators,
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const scopedEvents = await getScopedWorkspaceEvents(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const { allProfiles } = await loadWorkspaceGuestProfiles(ctx, resolvedScope.workspaceId);
    const distinctTags = new Set<string>();
    const distinctDefaultListKeys = new Set<string>();
    for (const profile of allProfiles) {
      for (const tag of profile.tags ?? []) {
        distinctTags.add(tag);
      }
      if (profile.defaultListKey) {
        distinctDefaultListKeys.add(profile.defaultListKey);
      }
    }

    const workspaceListKeys = new Set<string>();
    for (const event of scopedEvents) {
      const listCredentials = await ctx.db
        .query("listCredentials")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", event._id))
        .collect();
      for (const listCredential of listCredentials) {
        workspaceListKeys.add(listCredential.listKey.toLowerCase());
      }
    }

    const customFieldOptionsByKey = new Map<string, string>();
    for (const event of scopedEvents) {
      for (const customField of event.customFields ?? []) {
        if (!customFieldOptionsByKey.has(customField.key)) {
          customFieldOptionsByKey.set(customField.key, customField.label);
        }
      }
    }

    return {
      tags: Array.from(distinctTags).sort(),
      defaultListKeys: Array.from(distinctDefaultListKeys).sort(),
      workspaceListKeys: Array.from(workspaceListKeys).sort(),
      events: scopedEvents
        .map((event) => ({
          eventId: event._id,
          eventName: event.name,
          eventDate: event.eventDate,
        }))
        .sort((firstEvent, secondEvent) => secondEvent.eventDate - firstEvent.eventDate),
      customFieldOptions: Array.from(customFieldOptionsByKey.entries()).map(([key, label]) => ({
        key,
        label,
      })),
    };
  },
});

async function findProfileForPersonKey(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
  personKey: GuestPersonKeyArgs,
): Promise<Doc<"workspaceGuestProfiles"> | null> {
  if (personKey.guestPhoneHash) {
    const profileByPhone = await ctx.db
      .query("workspaceGuestProfiles")
      .withIndex("by_workspace_phoneHash", (queryBuilder) =>
        queryBuilder.eq("workspaceId", workspaceId).eq("guestPhoneHash", personKey.guestPhoneHash),
      )
      .first();
    if (profileByPhone) {
      return profileByPhone;
    }
  }
  if (personKey.clerkUserId) {
    const profileByClerkUserId = await ctx.db
      .query("workspaceGuestProfiles")
      .withIndex("by_workspace_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("workspaceId", workspaceId).eq("clerkUserId", personKey.clerkUserId),
      )
      .first();
    if (profileByClerkUserId) {
      return profileByClerkUserId;
    }
  }
  return null;
}

function assertValidPersonKey(personKey: GuestPersonKeyArgs): void {
  if (!personKey.clerkUserId && !personKey.guestPhoneHash) {
    throw new Error("A guest profile requires a clerkUserId or guestPhoneHash");
  }
}

type GuestProfilePatch = {
  tags?: string[];
  notes?: string;
  defaultListKey?: string;
};

async function upsertGuestProfileRecord(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  personKey: GuestPersonKeyArgs,
  patch: GuestProfilePatch,
  updatedByClerkUserId: string | undefined,
): Promise<Id<"workspaceGuestProfiles">> {
  assertValidPersonKey(personKey);

  // Heal onto the stable phone-hash key even when the caller (e.g. the user
  // detail page) only knows a clerkUserId.
  if (!personKey.guestPhoneHash && personKey.clerkUserId) {
    const derivedPhoneHash = await resolveGuestPhoneHashForClerkUserId(ctx, personKey.clerkUserId);
    if (derivedPhoneHash) {
      personKey = { ...personKey, guestPhoneHash: derivedPhoneHash };
    }
  }

  if (patch.notes !== undefined && patch.notes.length > MAX_NOTES_LENGTH) {
    throw new Error(`Notes must be ${MAX_NOTES_LENGTH} characters or fewer`);
  }

  const normalizedPatch: Partial<Doc<"workspaceGuestProfiles">> = {};
  if (patch.tags !== undefined) {
    normalizedPatch.tags = normalizeTags(patch.tags);
  }
  if (patch.notes !== undefined) {
    normalizedPatch.notes = patch.notes.trim() ? patch.notes.trim() : undefined;
  }
  if (patch.defaultListKey !== undefined) {
    normalizedPatch.defaultListKey = patch.defaultListKey.trim()
      ? patch.defaultListKey.trim().toLowerCase()
      : undefined;
  }

  const now = Date.now();
  const existingProfile = await findProfileForPersonKey(ctx, workspaceId, personKey);
  if (existingProfile) {
    await ctx.db.patch(existingProfile._id, {
      ...normalizedPatch,
      // Heal identifiers: keep both keys populated as they become known.
      clerkUserId: personKey.clerkUserId ?? existingProfile.clerkUserId,
      guestPhoneHash: personKey.guestPhoneHash ?? existingProfile.guestPhoneHash,
      updatedByClerkUserId,
      updatedAt: now,
    });
    return existingProfile._id;
  }

  return await ctx.db.insert("workspaceGuestProfiles", {
    workspaceId,
    clerkUserId: personKey.clerkUserId,
    guestPhoneHash: personKey.guestPhoneHash,
    tags: normalizedPatch.tags ?? [],
    notes: normalizedPatch.notes,
    defaultListKey: normalizedPatch.defaultListKey,
    updatedByClerkUserId,
    createdAt: now,
    updatedAt: now,
  });
}

export const upsertGuestProfile = mutation({
  args: {
    ...siteScopeArgValidators,
    personKey: guestPersonKeyValidator,
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    defaultListKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identity = await ctx.auth.getUserIdentity();

    const profileId = await upsertGuestProfileRecord(
      ctx,
      resolvedScope.workspaceId,
      args.personKey,
      { tags: args.tags, notes: args.notes, defaultListKey: args.defaultListKey },
      identity?.subject,
    );

    return { profileId };
  },
});

/**
 * Resolves a user-detail reference (a users document id, or "rsvp~<rsvpId>"
 * for guests without a user row) to the person's guest profile. The person
 * key is resolved server-side — including the phone hash, which the client
 * can never derive (detail queries only expose raw/obfuscated phones) — and
 * returned so the client can echo it into upsertGuestProfile.
 */
export const getGuestProfileByUserReference = query({
  args: {
    ...siteScopeArgValidators,
    userReference: v.string(),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const rsvpReferencePrefix = "rsvp~";
    let clerkUserId: string | undefined;
    let guestPhoneHash: string | undefined;

    if (args.userReference.startsWith(rsvpReferencePrefix)) {
      const rsvpId = ctx.db.normalizeId(
        "rsvps",
        args.userReference.slice(rsvpReferencePrefix.length),
      );
      const rsvp = rsvpId ? await ctx.db.get(await resolveCanonicalRsvpId(ctx, rsvpId)) : null;
      if (!rsvp) {
        throw new Error("Guest not found");
      }
      await ensureEventInSiteScope(ctx, rsvp.eventId, {
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
      });
      clerkUserId = rsvp.clerkUserId;
      guestPhoneHash =
        rsvp.guestPhoneHash ??
        (await resolveGuestPhoneHashForClerkUserId(ctx, rsvp.clerkUserId)) ??
        undefined;
    } else {
      const userId = ctx.db.normalizeId("users", args.userReference);
      const user = userId ? await resolveCanonicalUserById(ctx, userId) : null;
      if (!user) {
        throw new Error("User not found");
      }
      clerkUserId = user.clerkUserId;
      if (user.clerkUserId) {
        guestPhoneHash =
          (await resolveGuestPhoneHashForClerkUserId(ctx, user.clerkUserId)) ?? undefined;
      } else if (user.phone) {
        try {
          guestPhoneHash = (await normalizeAndHashPhoneNumber(user.phone)).phoneHash;
        } catch {
          guestPhoneHash = undefined;
        }
      }
    }

    const personKey: GuestPersonKeyArgs = {
      ...(clerkUserId ? { clerkUserId } : {}),
      ...(guestPhoneHash ? { guestPhoneHash } : {}),
    };

    if (!personKey.clerkUserId && !personKey.guestPhoneHash) {
      return { personKey, profile: null };
    }

    const profile = await findProfileForPersonKey(ctx, resolvedScope.workspaceId, personKey);
    return {
      personKey,
      profile: profile
        ? {
            tags: profile.tags ?? [],
            notes: profile.notes,
            defaultListKey: profile.defaultListKey,
          }
        : null,
    };
  },
});

export const bulkUpdateGuestProfiles = mutation({
  args: {
    ...siteScopeArgValidators,
    personKeys: v.array(guestPersonKeyValidator),
    addTags: v.optional(v.array(v.string())),
    removeTags: v.optional(v.array(v.string())),
    defaultListKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const identity = await ctx.auth.getUserIdentity();

    const tagsToAdd = normalizeTags(args.addTags ?? []);
    const tagsToRemove = new Set(normalizeTags(args.removeTags ?? []));

    let updatedCount = 0;
    for (const personKey of args.personKeys) {
      assertValidPersonKey(personKey);
      const existingProfile = await findProfileForPersonKey(
        ctx,
        resolvedScope.workspaceId,
        personKey,
      );
      const existingTags = existingProfile?.tags ?? [];
      const updatedTags = normalizeTags([
        ...existingTags.filter((tag) => !tagsToRemove.has(tag)),
        ...tagsToAdd,
      ]);

      await upsertGuestProfileRecord(
        ctx,
        resolvedScope.workspaceId,
        personKey,
        {
          tags: updatedTags,
          ...(args.defaultListKey !== undefined ? { defaultListKey: args.defaultListKey } : {}),
        },
        identity?.subject,
      );
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

export const getDefaultListSuggestion = query({
  args: {
    ...siteScopeArgValidators,
    eventId: v.id("events"),
    personKey: guestPersonKeyValidator,
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    assertValidPersonKey(args.personKey);

    const profile = await findProfileForPersonKey(ctx, resolvedScope.workspaceId, args.personKey);
    if (!profile?.defaultListKey) {
      return null;
    }

    const listCredentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", args.eventId))
      .collect();
    const matchingListCredential = listCredentials.find(
      (listCredential) => listCredential.listKey.toLowerCase() === profile.defaultListKey,
    );

    if (!matchingListCredential) {
      return null;
    }

    return { suggestedListKey: matchingListCredential.listKey };
  },
});
