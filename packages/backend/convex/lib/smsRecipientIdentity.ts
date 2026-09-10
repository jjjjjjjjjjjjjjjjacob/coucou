import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveCanonicalUserIdentity } from "./canonicalUserIdentity";
import {
  buildGuestClerkUserId,
  GUEST_CLERK_USER_ID_PREFIX,
  isGuestClerkUserId,
} from "./guestIdentity";
import { normalizeAndHashPhoneNumber } from "./phoneHash";

/** SMS subscriptions belong to the recipient, across guest and account signups. */
export async function resolveSmsRecipientClerkUserIds(
  context: QueryCtx | MutationCtx,
  clerkUserId: string,
): Promise<string[]> {
  const identity = await resolveCanonicalUserIdentity(context, clerkUserId);
  const clerkUserIds = new Set([clerkUserId, identity.clerkUserId]);
  let phoneHash = isGuestClerkUserId(clerkUserId)
    ? clerkUserId.slice(GUEST_CLERK_USER_ID_PREFIX.length)
    : identity.user?.phoneHash;
  let phoneNumber: string | undefined;
  if (identity.user?.phone) {
    try {
      const normalizedPhone = await normalizeAndHashPhoneNumber(identity.user.phone);
      phoneHash = normalizedPhone.phoneHash;
      phoneNumber = normalizedPhone.normalizedPhoneNumber;
    } catch {
      // Legacy invalid phone values must not prevent consent lookup by identity.
    }
  }

  if (phoneHash) {
    clerkUserIds.add(buildGuestClerkUserId(phoneHash));
    if (!phoneNumber) {
      const guestContact = await context.db
        .query("guestContacts")
        .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
        .unique();
      phoneNumber = guestContact?.phoneNumber;
    }
    const matchingUsers = await context.db
      .query("users")
      .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
      .collect();
    for (const user of matchingUsers) {
      if (user.clerkUserId) clerkUserIds.add(user.clerkUserId);
    }
    const matchingAliases = await context.db
      .query("userIdentityAliases")
      .withIndex("by_phoneHash", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
      .collect();
    for (const alias of matchingAliases) {
      clerkUserIds.add(alias.aliasClerkUserId);
      clerkUserIds.add(alias.canonicalClerkUserId);
    }
  }
  if (phoneNumber) {
    // Accounts created before phone hashes were stored still have an E.164 phone.
    const matchingUsers = await context.db
      .query("users")
      .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phone", phoneNumber))
      .collect();
    for (const user of matchingUsers) {
      if (user.clerkUserId) clerkUserIds.add(user.clerkUserId);
    }
  }
  const identityAliases = await context.db
    .query("userIdentityAliases")
    .withIndex("by_canonical", (queryBuilder) =>
      queryBuilder.eq("canonicalClerkUserId", identity.clerkUserId),
    )
    .collect();
  for (const alias of identityAliases) clerkUserIds.add(alias.aliasClerkUserId);
  return [...clerkUserIds];
}
