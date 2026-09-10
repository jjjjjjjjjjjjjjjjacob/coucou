import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Resolve current handles across linked identities, including RSVP-only guests. */
export async function contactSocialProfiles(
  ctx: Pick<QueryCtx, "db">,
  contact: Doc<"workspaceContacts">,
) {
  const profileGroups = await Promise.all(
    contact.clerkUserIds.map(async (clerkUserId) => {
      const [accountProfiles, rsvpProfiles] = await Promise.all([
        ctx.db
          .query("userSocialProfiles")
          .withIndex("by_user", (builder) => builder.eq("clerkUserId", clerkUserId))
          .collect(),
        ctx.db
          .query("rsvpSocialProfiles")
          .withIndex("by_user", (builder) => builder.eq("clerkUserId", clerkUserId))
          .collect(),
      ]);
      return { accountProfiles, rsvpProfiles };
    }),
  );
  const candidates = profileGroups.flatMap(({ accountProfiles, rsvpProfiles }) => [
    ...accountProfiles,
    ...rsvpProfiles,
  ]);
  candidates.sort((first, second) => second.updatedAt - first.updatedAt);
  const profiles = new Map<
    string,
    { platformKey: string; handle: string; normalizedHandle: string }
  >();
  for (const candidate of candidates) {
    if (!candidate.handle.trim() || profiles.has(candidate.platformKey)) continue;
    if ("rsvpId" in candidate) {
      const relationship = await ctx.db
        .query("contactEvents")
        .withIndex("by_rsvp", (builder) => builder.eq("rsvpId", candidate.rsvpId))
        .first();
      // An RSVP handle belongs to the workspace where it was submitted.
      if (relationship?.workspaceId !== contact.workspaceId) continue;
    }
    profiles.set(candidate.platformKey, {
      platformKey: candidate.platformKey,
      handle: candidate.handle,
      normalizedHandle: candidate.normalizedHandle,
    });
  }
  return [...profiles.values()].sort((first, second) =>
    first.platformKey.localeCompare(second.platformKey),
  );
}
