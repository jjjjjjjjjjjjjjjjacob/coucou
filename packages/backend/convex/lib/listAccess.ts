import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveCanonicalClerkUserId } from "./canonicalUserIdentity";
import { listDisplayName } from "./listIdentity";
import { hashOpaqueValue } from "./phoneHash";

export const LIST_ACCESS_DURATION = 24 * 60 * 60 * 1000;
export type ListAccessResult =
  | { ok: false }
  | {
      ok: true;
      listKey: string;
      displayName: string;
      matched: "password" | "no-password";
      accessToken: string;
      expiresAt: number;
    };

export async function issueListAccess(
  ctx: MutationCtx,
  list: Doc<"listCredentials">,
  matched: "password" | "no-password",
): Promise<ListAccessResult> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const accessToken = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const createdAt = Date.now();
  const expiresAt = createdAt + LIST_ACCESS_DURATION;
  const identity = await ctx.auth.getUserIdentity();
  const clerkUserId = identity
    ? await resolveCanonicalClerkUserId(ctx, identity.subject)
    : undefined;
  await ctx.db.insert("rsvpListAccessGrants", {
    tokenHash: await hashOpaqueValue(accessToken),
    claimedClerkUserId: clerkUserId,
    eventId: list.eventId,
    listCredentialId: list._id,
    createdAt,
    expiresAt,
  });
  return {
    ok: true,
    listKey: list.listKey,
    displayName: listDisplayName(list),
    matched,
    accessToken,
    expiresAt,
  };
}

export async function readListAccess(
  ctx: Pick<QueryCtx, "db">,
  eventId: Id<"events">,
  tokenHash: string,
) {
  const grant = await ctx.db
    .query("rsvpListAccessGrants")
    .withIndex("by_token_hash", (builder) => builder.eq("tokenHash", tokenHash))
    .unique();
  const event = await ctx.db.get(eventId);
  const list = grant ? await ctx.db.get(grant.listCredentialId) : null;
  if (
    !grant ||
    grant.eventId !== eventId ||
    grant.expiresAt <= Date.now() ||
    !event ||
    !isEventOpenForRsvp(event) ||
    !list ||
    list.eventId !== eventId
  )
    return null;
  return { grant, list };
}

export async function requireListAccess(
  ctx: MutationCtx,
  args: { eventId: Id<"events">; listKey: string; accessToken?: string },
  identity: { phoneHash?: string; clerkUserId?: string },
  trustedGrant?: Doc<"rsvpListAccessGrants">,
) {
  const currentIdentity = await ctx.auth.getUserIdentity();
  const clerkUserId =
    identity.clerkUserId ??
    (currentIdentity ? await resolveCanonicalClerkUserId(ctx, currentIdentity.subject) : undefined);
  const access = trustedGrant
    ? await readListAccess(ctx, args.eventId, trustedGrant.tokenHash)
    : args.accessToken
      ? await readListAccess(ctx, args.eventId, await hashOpaqueValue(args.accessToken))
      : null;
  if (
    !access ||
    access.list.listKey !== args.listKey ||
    (access.grant.claimedPhoneHash && identity.phoneHash !== access.grant.claimedPhoneHash) ||
    (access.grant.claimedClerkUserId && clerkUserId !== access.grant.claimedClerkUserId)
  ) {
    throw new ConvexError({
      code: "LIST_ACCESS_REQUIRED",
      message:
        "Your RSVP access expired or belongs to another guest. Return to the event and enter its current password.",
    });
  }
  await ctx.db.patch(access.grant._id, {
    ...(identity.phoneHash ? { claimedPhoneHash: identity.phoneHash } : {}),
    ...(clerkUserId ? { claimedClerkUserId: clerkUserId } : {}),
  });
  return access.grant;
}
