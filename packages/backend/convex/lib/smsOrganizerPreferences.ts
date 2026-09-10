import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveSmsRecipientClerkUserIds } from "./smsRecipientIdentity";
import { resolveTenantWorkspaceScope } from "./workspaceScope";

type SmsOrganizerPreferenceSource = "organizer" | "none";

type ResolvedSmsOrganizerScope = {
  organizerKey: string;
  organizerName: string;
  workspaceId?: Id<"workspaces">;
  workspaceSlug?: string;
  siteKey?: string;
};

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function formatOrganizerFallbackName(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

async function resolveSmsOrganizerScope(
  ctx: QueryCtx | MutationCtx,
  event: Pick<Doc<"events">, "workspaceSlug" | "siteKey">,
  fallbackSiteKey?: string,
): Promise<ResolvedSmsOrganizerScope | null> {
  const workspaceSlug = normalizeOptionalText(event.workspaceSlug);
  // Unscoped events predate multiple organizers and belong to Dojo (as in siteScope).
  const siteKey =
    normalizeOptionalText(event.siteKey) ??
    normalizeOptionalText(fallbackSiteKey) ??
    (workspaceSlug ? undefined : "dojo");
  const workspaceScope = await resolveTenantWorkspaceScope(ctx, {
    workspaceSlug,
    siteKey,
  });

  if (workspaceScope) {
    return {
      organizerKey: `workspace:${workspaceScope.workspaceId}`,
      organizerName: workspaceScope.workspaceName,
      workspaceId: workspaceScope.workspaceId,
      workspaceSlug: workspaceScope.workspaceSlug,
      siteKey: workspaceScope.siteKey ?? siteKey,
    };
  }

  if (workspaceSlug) {
    return {
      organizerKey: `workspaceSlug:${workspaceSlug}`,
      organizerName: formatOrganizerFallbackName(workspaceSlug),
      workspaceSlug,
      siteKey,
    };
  }

  if (siteKey) {
    return {
      organizerKey: `site:${siteKey}`,
      organizerName: formatOrganizerFallbackName(siteKey),
      siteKey,
    };
  }

  return null;
}

async function resolveSmsOrganizerPreferenceRecord(
  ctx: QueryCtx | MutationCtx,
  {
    clerkUserId,
    event,
    siteKey,
  }: {
    clerkUserId: string;
    event: Doc<"events">;
    siteKey?: string;
  },
) {
  const organizerScope = await resolveSmsOrganizerScope(ctx, event, siteKey);
  if (!organizerScope) return null;

  const clerkUserIds = await resolveSmsRecipientClerkUserIds(ctx, clerkUserId);
  const matchingPreferences: Doc<"userSmsOrganizerPreferences">[] = [];
  for (const recipientClerkUserId of clerkUserIds) {
    const preferences = await ctx.db
      .query("userSmsOrganizerPreferences")
      .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", recipientClerkUserId))
      .collect();
    for (const preference of preferences) {
      if (preference.organizerKey === organizerScope.organizerKey) {
        matchingPreferences.push(preference);
      } else if (preference.siteKey || preference.workspaceSlug) {
        // Resolve pre-workspace keys through the current organizer mapping.
        const preferenceScope = await resolveSmsOrganizerScope(ctx, preference);
        if (preferenceScope?.organizerKey === organizerScope.organizerKey) {
          matchingPreferences.push(preference);
        }
      }
    }
  }
  matchingPreferences.sort(
    (left, right) =>
      (right.smsConsentTimestamp ?? right.updatedAt) -
        (left.smsConsentTimestamp ?? left.updatedAt) || right._creationTime - left._creationTime,
  );

  return {
    organizerScope,
    clerkUserIds,
    preference: matchingPreferences[0],
    firstSmsOptInAt: earliestTimestamp(
      matchingPreferences.map(
        (preference) =>
          preference.firstSmsOptInAt ??
          (preference.smsConsent
            ? (preference.smsConsentTimestamp ?? preference.createdAt)
            : undefined),
      ),
    ),
  };
}

function earliestTimestamp(timestamps: (number | undefined)[]): number | undefined {
  const definedTimestamps = timestamps.filter((timestamp) => timestamp !== undefined);
  return definedTimestamps.length > 0 ? Math.min(...definedTimestamps) : undefined;
}

async function findLatestSmsConsentFromOrganizerRsvp(
  ctx: QueryCtx | MutationCtx,
  {
    clerkUserIds,
    organizerScope,
  }: {
    clerkUserIds: string[];
    organizerScope: ResolvedSmsOrganizerScope;
  },
) {
  const rsvps = (
    await Promise.all(
      clerkUserIds.map((clerkUserId) =>
        ctx.db
          .query("rsvps")
          .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
          .collect(),
      ),
    )
  ).flat();
  let firstSmsOptInAt: number | undefined;

  let latestPreference: {
    smsConsent: boolean;
    smsConsentTimestamp?: number;
    smsConsentIpAddress?: string;
    updatedAt: number;
  } | null = null;

  for (const rsvp of rsvps) {
    if (rsvp.smsConsent === undefined) continue;

    const event = await ctx.db.get(rsvp.eventId);
    if (!event) continue;

    const rsvpOrganizerScope = await resolveSmsOrganizerScope(ctx, event, event.siteKey);
    if (rsvpOrganizerScope?.organizerKey !== organizerScope.organizerKey) continue;

    const rsvpUpdatedAt = rsvp.smsConsentTimestamp ?? rsvp.updatedAt ?? rsvp.createdAt;
    if (rsvp.smsConsent) {
      firstSmsOptInAt = earliestTimestamp([firstSmsOptInAt, rsvpUpdatedAt]);
    }
    if (latestPreference && latestPreference.updatedAt >= rsvpUpdatedAt) continue;

    latestPreference = {
      smsConsent: rsvp.smsConsent,
      smsConsentTimestamp: rsvp.smsConsentTimestamp,
      smsConsentIpAddress: rsvp.smsConsentIpAddress,
      updatedAt: rsvpUpdatedAt,
    };
  }

  return { latestPreference, firstSmsOptInAt };
}

export async function resolveSmsOrganizerPreference(
  ctx: QueryCtx | MutationCtx,
  {
    clerkUserId,
    event,
    siteKey,
  }: {
    clerkUserId: string;
    event: Doc<"events">;
    siteKey?: string;
  },
): Promise<{
  smsConsent: boolean;
  smsConsentTimestamp?: number;
  smsConsentIpAddress?: string;
  source: SmsOrganizerPreferenceSource;
  organizerKey?: string;
  organizerName?: string;
  firstSmsOptInAt?: number;
}> {
  const resolvedPreference = await resolveSmsOrganizerPreferenceRecord(ctx, {
    clerkUserId,
    event,
    siteKey,
  });
  if (!resolvedPreference) {
    return { smsConsent: false, source: "none" };
  }

  const { organizerScope, preference, clerkUserIds } = resolvedPreference;
  const history =
    !preference || resolvedPreference.firstSmsOptInAt === undefined
      ? await findLatestSmsConsentFromOrganizerRsvp(ctx, { clerkUserIds, organizerScope })
      : undefined;
  const firstSmsOptInAt = earliestTimestamp([
    resolvedPreference.firstSmsOptInAt,
    history?.firstSmsOptInAt,
  ]);
  if (preference) {
    return {
      smsConsent: preference.smsConsent,
      smsConsentTimestamp: preference.smsConsentTimestamp,
      smsConsentIpAddress: preference.smsConsentIpAddress,
      source: "organizer",
      organizerKey: organizerScope.organizerKey,
      organizerName: organizerScope.organizerName,
      firstSmsOptInAt,
    };
  }

  const historicalPreference = history?.latestPreference;
  if (!historicalPreference) {
    return {
      smsConsent: false,
      source: "none",
      organizerKey: organizerScope.organizerKey,
      organizerName: organizerScope.organizerName,
    };
  }

  return {
    smsConsent: historicalPreference.smsConsent,
    smsConsentTimestamp: historicalPreference.smsConsentTimestamp,
    smsConsentIpAddress: historicalPreference.smsConsentIpAddress,
    source: "organizer",
    organizerKey: organizerScope.organizerKey,
    organizerName: organizerScope.organizerName,
    firstSmsOptInAt,
  };
}

export async function upsertSmsOrganizerPreference(
  ctx: MutationCtx,
  {
    clerkUserId,
    event,
    siteKey,
    smsConsent,
    smsConsentIpAddress,
    sourceEventId,
    sourceRsvpId,
    now,
  }: {
    clerkUserId: string;
    event: Doc<"events">;
    siteKey?: string;
    smsConsent: boolean;
    smsConsentIpAddress?: string;
    sourceEventId: Id<"events">;
    sourceRsvpId?: Id<"rsvps">;
    now: number;
  },
) {
  const resolvedPreference = await resolveSmsOrganizerPreferenceRecord(ctx, {
    clerkUserId,
    event,
    siteKey,
  });
  if (!resolvedPreference) return;

  const { organizerScope, preference } = resolvedPreference;
  const previousPreference = await resolveSmsOrganizerPreference(ctx, {
    clerkUserId,
    event,
    siteKey,
  });
  const firstSmsOptInAt = previousPreference.firstSmsOptInAt ?? (smsConsent ? now : undefined);
  const nextSmsConsentIpAddress = smsConsent
    ? (smsConsentIpAddress ?? preference?.smsConsentIpAddress)
    : preference?.smsConsentIpAddress;

  if (preference) {
    await ctx.db.patch(preference._id, {
      workspaceId: organizerScope.workspaceId,
      workspaceSlug: organizerScope.workspaceSlug,
      siteKey: organizerScope.siteKey,
      smsConsent,
      firstSmsOptInAt,
      smsConsentTimestamp: now,
      smsConsentIpAddress: nextSmsConsentIpAddress,
      sourceEventId,
      sourceRsvpId,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("userSmsOrganizerPreferences", {
    clerkUserId,
    organizerKey: organizerScope.organizerKey,
    workspaceId: organizerScope.workspaceId,
    workspaceSlug: organizerScope.workspaceSlug,
    siteKey: organizerScope.siteKey,
    smsConsent,
    firstSmsOptInAt,
    smsConsentTimestamp: now,
    smsConsentIpAddress: nextSmsConsentIpAddress,
    sourceEventId,
    sourceRsvpId,
    createdAt: now,
    updatedAt: now,
  });
}
