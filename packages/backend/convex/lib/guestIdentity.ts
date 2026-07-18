export const GUEST_CLERK_USER_ID_PREFIX = "guest:";

export function buildGuestClerkUserId(phoneHash: string): string {
  return `${GUEST_CLERK_USER_ID_PREFIX}${phoneHash}`;
}

export function isGuestClerkUserId(clerkUserId: string): boolean {
  return clerkUserId.startsWith(GUEST_CLERK_USER_ID_PREFIX);
}
