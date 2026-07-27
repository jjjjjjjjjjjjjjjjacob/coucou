import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveTenantWorkspaceScope } from "./workspaceScope";

type SmsOrganizerPreferenceSource = "organizer" | "none";

type ResolvedSmsOrganizerScope = {
  organizerKey: string;
  workspaceId?: Id<"workspaces">;
  workspaceSlug?: string;
  siteKey?: string;
};

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

async function resolveSmsOrganizerScope(
  ctx: QueryCtx | MutationCtx,
  event: Pick<Doc<"events">, "workspaceSlug" | "siteKey">,
  fallbackSiteKey?: string,
): Promise<ResolvedSmsOrganizerScope | null> {
  const workspaceSlug = normalizeOptionalText(event.workspaceSlug);
  const siteKey = normalizeOptionalText(event.siteKey) ?? normalizeOptionalText(fallbackSiteKey);
  const workspaceScope = await resolveTenantWorkspaceScope(ctx, {
    workspaceSlug,
    siteKey,
  });

  if (workspaceScope) {
    return {
      organizerKey: `workspace:${workspaceScope.workspaceId}`,
      workspaceId: workspaceScope.workspaceId,
      workspaceSlug: workspaceScope.workspaceSlug,
      siteKey: workspaceScope.siteKey ?? siteKey,
    };
  }

  if (workspaceSlug) {
    return {
      organizerKey: `workspaceSlug:${workspaceSlug}`,
      workspaceSlug,
      siteKey,
    };
  }

  if (siteKey) {
    return {
      organizerKey: `site:${siteKey}`,
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

  const preference = await ctx.db
    .query("userSmsOrganizerPreferences")
    .withIndex("by_user_organizer", (queryBuilder) =>
      queryBuilder.eq("clerkUserId", clerkUserId).eq("organizerKey", organizerScope.organizerKey),
    )
    .unique();

  return {
    organizerScope,
    preference,
  };
}

async function findLatestSmsConsentFromOrganizerRsvp(
  ctx: QueryCtx | MutationCtx,
  {
    clerkUserId,
    organizerScope,
  }: {
    clerkUserId: string;
    organizerScope: ResolvedSmsOrganizerScope;
  },
) {
  const rsvps = await ctx.db
    .query("rsvps")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
    .collect();

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
    if (latestPreference && latestPreference.updatedAt >= rsvpUpdatedAt) continue;

    latestPreference = {
      smsConsent: rsvp.smsConsent,
      smsConsentTimestamp: rsvp.smsConsentTimestamp,
      smsConsentIpAddress: rsvp.smsConsentIpAddress,
      updatedAt: rsvpUpdatedAt,
    };
  }

  return latestPreference;
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
}> {
  const resolvedPreference = await resolveSmsOrganizerPreferenceRecord(ctx, {
    clerkUserId,
    event,
    siteKey,
  });
  if (!resolvedPreference) {
    return { smsConsent: false, source: "none" };
  }

  const { organizerScope, preference } = resolvedPreference;
  if (preference) {
    return {
      smsConsent: preference.smsConsent,
      smsConsentTimestamp: preference.smsConsentTimestamp,
      smsConsentIpAddress: preference.smsConsentIpAddress,
      source: "organizer",
    };
  }

  const historicalPreference = await findLatestSmsConsentFromOrganizerRsvp(ctx, {
    clerkUserId,
    organizerScope,
  });
  if (!historicalPreference) {
    return { smsConsent: false, source: "none" };
  }

  return {
    smsConsent: historicalPreference.smsConsent,
    smsConsentTimestamp: historicalPreference.smsConsentTimestamp,
    smsConsentIpAddress: historicalPreference.smsConsentIpAddress,
    source: "organizer",
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
  const nextSmsConsentIpAddress = smsConsent
    ? (smsConsentIpAddress ?? preference?.smsConsentIpAddress)
    : preference?.smsConsentIpAddress;

  if (preference) {
    await ctx.db.patch(preference._id, {
      workspaceId: organizerScope.workspaceId,
      workspaceSlug: organizerScope.workspaceSlug,
      siteKey: organizerScope.siteKey,
      smsConsent,
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
    smsConsentTimestamp: now,
    smsConsentIpAddress: nextSmsConsentIpAddress,
    sourceEventId,
    sourceRsvpId,
    createdAt: now,
    updatedAt: now,
  });
}
