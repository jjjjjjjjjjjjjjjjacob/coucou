export interface RsvpUserNameSource {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isPhoneNumberLikeDisplayName(
  value: string,
  phoneNumber: string | null | undefined,
): boolean {
  const displayNameDigits = digitsOnly(value);
  if (displayNameDigits.length < 7) return false;

  const phoneNumberDigits = digitsOnly(phoneNumber ?? "");
  if (phoneNumberDigits && displayNameDigits === phoneNumberDigits) return true;

  return value.replace(/[+\d\s().-]/g, "").length === 0;
}

export function resolveStoredUserDisplayName(
  user: RsvpUserNameSource | null | undefined,
): string | undefined {
  if (!user) return undefined;

  const firstName = user.firstName?.trim();
  const lastName = user.lastName?.trim();
  const usableFirstName =
    firstName && !isPhoneNumberLikeDisplayName(firstName, user.phone) ? firstName : undefined;
  const usableLastName =
    lastName && !isPhoneNumberLikeDisplayName(lastName, user.phone) ? lastName : undefined;
  const nameFromUser = [usableFirstName, usableLastName].filter(Boolean).join(" ").trim();
  if (!nameFromUser) return undefined;
  return isPhoneNumberLikeDisplayName(nameFromUser, user.phone) ? undefined : nameFromUser;
}
