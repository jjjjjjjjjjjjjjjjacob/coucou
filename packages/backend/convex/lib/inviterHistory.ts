import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type InviterHistoryEntry = NonNullable<
  Doc<"workspaceGuestProfiles">["invitedByHistory"]
>[number];

export function normalizeInviterName(invitedByName: string): string {
  return invitedByName.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function mergeInviterHistoryEntries(
  currentHistory: readonly InviterHistoryEntry[],
  additions: readonly { displayName: string; seenAt: number; firstSeenAt?: number }[],
): InviterHistoryEntry[] {
  const historyByNormalizedName = new Map<string, InviterHistoryEntry>();
  for (const historyEntry of currentHistory) {
    historyByNormalizedName.set(historyEntry.normalizedName, historyEntry);
  }

  for (const addition of additions) {
    const displayName = addition.displayName.trim().replace(/\s+/g, " ");
    if (!displayName) continue;
    const normalizedName = normalizeInviterName(displayName);
    const currentEntry = historyByNormalizedName.get(normalizedName);
    if (!currentEntry) {
      historyByNormalizedName.set(normalizedName, {
        displayName,
        normalizedName,
        firstSeenAt: addition.firstSeenAt ?? addition.seenAt,
        lastSeenAt: addition.seenAt,
      });
      continue;
    }

    historyByNormalizedName.set(normalizedName, {
      displayName:
        addition.seenAt >= currentEntry.lastSeenAt ? displayName : currentEntry.displayName,
      normalizedName,
      firstSeenAt: Math.min(
        currentEntry.firstSeenAt,
        addition.firstSeenAt ?? addition.seenAt,
      ),
      lastSeenAt: Math.max(currentEntry.lastSeenAt, addition.seenAt),
    });
  }

  return Array.from(historyByNormalizedName.values()).sort(
    (firstEntry, secondEntry) =>
      secondEntry.lastSeenAt - firstEntry.lastSeenAt ||
      firstEntry.normalizedName.localeCompare(secondEntry.normalizedName),
  );
}

async function resolveEventWorkspaceId(
  ctx: MutationCtx,
  event: Doc<"events">,
): Promise<Id<"workspaces"> | null> {
  if (event.workspaceSlug) {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) =>
        queryBuilder.eq("slug", event.workspaceSlug as string),
      )
      .unique();
    if (workspace) return workspace._id;
  }

  if (event.siteKey) {
    const workspaceSite = await ctx.db
      .query("workspaceSites")
      .withIndex("by_siteKey", (queryBuilder) => queryBuilder.eq("siteKey", event.siteKey as string))
      .unique();
    if (workspaceSite) return workspaceSite.workspaceId;

    const legacyWorkspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (queryBuilder) => queryBuilder.eq("slug", event.siteKey as string))
      .unique();
    if (legacyWorkspace) return legacyWorkspace._id;
  }

  return null;
}

export async function appendInviterHistoryForContact(
  ctx: MutationCtx,
  input: {
    event: Doc<"events">;
    clerkUserId: string;
    guestPhoneHash?: string;
    invitedByName?: string;
    seenAt: number;
  },
): Promise<void> {
  const displayName = input.invitedByName?.trim();
  if (!displayName) return;
  const workspaceId = await resolveEventWorkspaceId(ctx, input.event);
  if (!workspaceId) return;

  const profileByPhone = input.guestPhoneHash
    ? await ctx.db
        .query("workspaceGuestProfiles")
        .withIndex("by_workspace_phoneHash", (queryBuilder) =>
          queryBuilder.eq("workspaceId", workspaceId).eq("guestPhoneHash", input.guestPhoneHash),
        )
        .first()
    : null;
  const existingProfile =
    profileByPhone ??
    (await ctx.db
      .query("workspaceGuestProfiles")
      .withIndex("by_workspace_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("workspaceId", workspaceId).eq("clerkUserId", input.clerkUserId),
      )
      .first());

  const invitedByHistory = mergeInviterHistoryEntries(existingProfile?.invitedByHistory ?? [], [
    { displayName, seenAt: input.seenAt },
  ]);
  if (existingProfile) {
    await ctx.db.patch(existingProfile._id, {
      clerkUserId: existingProfile.clerkUserId ?? input.clerkUserId,
      guestPhoneHash: existingProfile.guestPhoneHash ?? input.guestPhoneHash,
      invitedByHistory,
      updatedAt: Math.max(existingProfile.updatedAt, input.seenAt),
    });
    return;
  }

  await ctx.db.insert("workspaceGuestProfiles", {
    workspaceId,
    clerkUserId: input.clerkUserId,
    guestPhoneHash: input.guestPhoneHash,
    tags: [],
    invitedByHistory,
    createdAt: input.seenAt,
    updatedAt: input.seenAt,
  });
}
