import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type ReconciliationRecordsInput = {
  sourceRsvp: Doc<"rsvps">;
  targetRsvpId: Id<"rsvps">;
  targetClerkUserId: string;
  targetUserId?: Id<"users">;
};

/** Copy only the sharing decisions attached to this RSVP, retaining their timestamps. */
export async function reconcileRsvpProfileGrants(
  ctx: MutationCtx,
  input: ReconciliationRecordsInput,
): Promise<Set<string>> {
  const sourceGrants = await ctx.db
    .query("workspaceProfileValueGrants")
    .withIndex("by_user", (queryBuilder) =>
      queryBuilder.eq("clerkUserId", input.sourceRsvp.clerkUserId),
    )
    .filter((queryBuilder) =>
      queryBuilder.eq(queryBuilder.field("sourceRsvpId"), input.sourceRsvp._id),
    )
    .collect();
  const targetGrants = await ctx.db
    .query("workspaceProfileValueGrants")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", input.targetClerkUserId))
    .collect();
  const copiedFields = new Set<string>();
  for (const sourceGrant of sourceGrants) {
    const sourceValue = await ctx.db.get(sourceGrant.profileFieldValueId);
    if (!sourceValue) continue;
    copiedFields.add(sourceGrant.fieldKey);
    const targetValue = await ctx.db
      .query("profileFieldValues")
      .withIndex("by_user_field_value", (queryBuilder) =>
        queryBuilder
          .eq("clerkUserId", input.targetClerkUserId)
          .eq("fieldKey", sourceValue.fieldKey)
          .eq("normalizedValue", sourceValue.normalizedValue),
      )
      .unique();
    const profileFieldValueId =
      targetValue?._id ??
      (await ctx.db.insert("profileFieldValues", {
        clerkUserId: input.targetClerkUserId,
        userId: input.targetUserId,
        fieldKey: sourceValue.fieldKey,
        value: sourceValue.value,
        normalizedValue: sourceValue.normalizedValue,
        label: sourceValue.label,
        source: sourceValue.source,
        sourceEventId: input.sourceRsvp.eventId,
        sourceRsvpId: input.targetRsvpId,
        createdAt: sourceValue.createdAt,
        updatedAt: sourceValue.updatedAt,
      }));
    const targetGrant = targetGrants.find(
      (grant) =>
        grant.profileFieldValueId === profileFieldValueId &&
        grant.workspaceId === sourceGrant.workspaceId &&
        grant.workspaceSlug === sourceGrant.workspaceSlug &&
        grant.siteKey === sourceGrant.siteKey,
    );
    if (targetGrant) {
      if (sourceGrant.updatedAt > targetGrant.updatedAt) {
        await ctx.db.patch(targetGrant._id, {
          revokedAt: sourceGrant.revokedAt,
          sourceRsvpId: input.targetRsvpId,
          sourceEventId: input.sourceRsvp.eventId,
          updatedAt: sourceGrant.updatedAt,
        });
      }
    } else {
      await ctx.db.insert("workspaceProfileValueGrants", {
        workspaceId: sourceGrant.workspaceId,
        workspaceSlug: sourceGrant.workspaceSlug,
        siteKey: sourceGrant.siteKey,
        clerkUserId: input.targetClerkUserId,
        fieldKey: sourceGrant.fieldKey,
        profileFieldValueId,
        sourceEventId: input.sourceRsvp.eventId,
        sourceRsvpId: input.targetRsvpId,
        revokedAt: sourceGrant.revokedAt,
        createdAt: sourceGrant.createdAt,
        updatedAt: sourceGrant.updatedAt,
      });
    }
  }
  return copiedFields;
}

export async function reconcileRsvpOrganizerPreferences(
  ctx: MutationCtx,
  input: ReconciliationRecordsInput,
): Promise<void> {
  const sourcePreferences = await ctx.db
    .query("userSmsOrganizerPreferences")
    .withIndex("by_user", (queryBuilder) =>
      queryBuilder.eq("clerkUserId", input.sourceRsvp.clerkUserId),
    )
    .filter((queryBuilder) =>
      queryBuilder.eq(queryBuilder.field("sourceRsvpId"), input.sourceRsvp._id),
    )
    .collect();
  for (const sourcePreference of sourcePreferences) {
    const targetPreference = await ctx.db
      .query("userSmsOrganizerPreferences")
      .withIndex("by_user_organizer", (queryBuilder) =>
        queryBuilder
          .eq("clerkUserId", input.targetClerkUserId)
          .eq("organizerKey", sourcePreference.organizerKey),
      )
      .unique();
    const newestPreference =
      targetPreference &&
      (targetPreference.smsConsentTimestamp ?? targetPreference.updatedAt) >=
        (sourcePreference.smsConsentTimestamp ?? sourcePreference.updatedAt)
        ? targetPreference
        : sourcePreference;
    const optInTimestamps = [sourcePreference, targetPreference].flatMap((preference) => {
      const timestamp =
        preference?.firstSmsOptInAt ??
        (preference?.smsConsent
          ? (preference.smsConsentTimestamp ?? preference.createdAt)
          : undefined);
      return timestamp === undefined ? [] : [timestamp];
    });
    const preference = {
      clerkUserId: input.targetClerkUserId,
      organizerKey: sourcePreference.organizerKey,
      workspaceId: sourcePreference.workspaceId,
      workspaceSlug: sourcePreference.workspaceSlug,
      siteKey: sourcePreference.siteKey,
      smsConsent: newestPreference.smsConsent,
      smsConsentTimestamp: newestPreference.smsConsentTimestamp,
      smsConsentIpAddress: newestPreference.smsConsentIpAddress,
      firstSmsOptInAt: optInTimestamps.length ? Math.min(...optInTimestamps) : undefined,
      sourceEventId: newestPreference.sourceEventId,
      sourceRsvpId:
        newestPreference === sourcePreference ? input.targetRsvpId : newestPreference.sourceRsvpId,
      createdAt: targetPreference?.createdAt ?? sourcePreference.createdAt,
      updatedAt: newestPreference.updatedAt,
    };
    if (targetPreference) await ctx.db.patch(targetPreference._id, preference);
    else await ctx.db.insert("userSmsOrganizerPreferences", preference);
  }
}
