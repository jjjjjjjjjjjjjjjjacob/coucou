import type { GuestDirectoryPerson, GuestDirectoryPersonKey } from "@/lib/types";

const PHONE_PERSON_KEY_PREFIX = "phone:";
const USER_PERSON_KEY_PREFIX = "user:";

/**
 * Converts a directory row into the person-key shape the guestDirectory
 * mutations expect, sending both identifiers when known so the backend can
 * keep profile rows keyed by phone hash and clerk id in sync.
 */
export function buildGuestDirectoryPersonKey(
  person: Pick<GuestDirectoryPerson, "personKey" | "primaryClerkUserId" | "clerkUserIds">,
): GuestDirectoryPersonKey {
  const personKey: GuestDirectoryPersonKey = {};

  if (person.personKey.startsWith(PHONE_PERSON_KEY_PREFIX)) {
    personKey.guestPhoneHash = person.personKey.slice(PHONE_PERSON_KEY_PREFIX.length);
  } else if (person.personKey.startsWith(USER_PERSON_KEY_PREFIX)) {
    personKey.clerkUserId = person.personKey.slice(USER_PERSON_KEY_PREFIX.length);
  }

  if (!personKey.clerkUserId) {
    const clerkUserId = person.primaryClerkUserId ?? person.clerkUserIds[0];
    if (clerkUserId) {
      personKey.clerkUserId = clerkUserId;
    }
  }

  return personKey;
}
