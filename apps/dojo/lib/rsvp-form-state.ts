import { countries } from "@coucou/ui/auth/countries";
import type { RSVP } from "@/lib/types";

export const defaultPhoneCountryCode = "+1";
export const rsvpDraftStorageVersion = 1;
const rsvpDraftStorageMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
export const rsvpDraftStorageDebounceMs = 250;

export interface RsvpDraftStorage {
  version: typeof rsvpDraftStorageVersion;
  updatedAt: number;
  name: string;
  firstName: string;
  lastName: string;
  phoneCountryCode: string;
  phoneNationalNumber: string;
  custom: Record<string, string>;
  socialProfiles: Record<string, string>;
  invitedByName: string;
  note: string;
  attendanceStatus: AttendanceStatusOption;
  attendees: number;
  accessPassword: string;
  smsConsentEnabled: boolean;
}

const countriesByDescendingDialCodeLength = [...countries].sort(
  (leftCountry, rightCountry) =>
    digitsOnly(rightCountry.code).length - digitsOnly(leftCountry.code).length,
);

interface PhoneNumberInputState {
  countryCode: string;
  nationalNumber: string;
}

export interface RestoredRsvpDraftFields {
  name: boolean;
  phone: boolean;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatPhoneNumberForDisplay(value: string, countryCode: string): string {
  const digits = digitsOnly(value);
  if (countryCode === "+1") {
    let formattedPhoneNumber = "";
    if (digits.length > 0) {
      formattedPhoneNumber = digits.substring(0, 3);
    }
    if (digits.length > 3) {
      formattedPhoneNumber += ` ${digits.substring(3, 6)}`;
    }
    if (digits.length > 6) {
      formattedPhoneNumber += ` ${digits.substring(6, 10)}`;
    }
    return formattedPhoneNumber;
  }
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

export function isPhoneNumberLikelyValid(value: string, countryCode: string): boolean {
  const digits = digitsOnly(value);
  if (countryCode === "+1") {
    return digits.length >= 10;
  }
  return digits.length >= 8;
}

export function resolvePhoneNumberInputState(
  phoneNumber: string | null | undefined,
): PhoneNumberInputState {
  const phoneNumberDigits = digitsOnly(phoneNumber ?? "");
  if (!phoneNumberDigits) {
    return {
      countryCode: defaultPhoneCountryCode,
      nationalNumber: "",
    };
  }

  const matchedCountry = countriesByDescendingDialCodeLength.find((country) =>
    phoneNumberDigits.startsWith(digitsOnly(country.code)),
  );
  const countryCode =
    matchedCountry?.code ?? (phoneNumberDigits.length === 10 ? defaultPhoneCountryCode : "");
  const effectiveCountryCode = countryCode || defaultPhoneCountryCode;
  const countryCodeDigits = digitsOnly(effectiveCountryCode);
  const nationalNumberDigits =
    phoneNumberDigits.startsWith(countryCodeDigits) &&
    phoneNumberDigits.length > countryCodeDigits.length
      ? phoneNumberDigits.slice(countryCodeDigits.length)
      : phoneNumberDigits;

  return {
    countryCode: effectiveCountryCode,
    nationalNumber: formatPhoneNumberForDisplay(nationalNumberDigits, effectiveCountryCode),
  };
}

export function buildFullPhoneNumber(countryCode: string, nationalNumber: string): string {
  const nationalNumberDigits = digitsOnly(nationalNumber);
  if (!nationalNumberDigits) {
    return "";
  }

  const countryCodeDigits = digitsOnly(countryCode);
  const correctedNationalNumberDigits =
    nationalNumber.trim().startsWith("+") &&
    nationalNumberDigits.startsWith(countryCodeDigits) &&
    nationalNumberDigits.length > countryCodeDigits.length
      ? nationalNumberDigits.slice(countryCodeDigits.length)
      : countryCode === "+1" &&
          nationalNumberDigits.length === 11 &&
          nationalNumberDigits.startsWith("1")
        ? nationalNumberDigits.slice(1)
        : nationalNumberDigits;

  return `${countryCode}${correctedNationalNumberDigits}`;
}

export function phoneNumbersMatch(leftPhoneNumber: string, rightPhoneNumber: string): boolean {
  return digitsOnly(leftPhoneNumber) === digitsOnly(rightPhoneNumber);
}

export type AttendanceStatusOption = "yes" | "no" | "maybe";

export function buildRsvpDraftStorageKey(eventRouteId: string, clerkUserId?: string): string {
  const baseStorageKey = `dojo:rsvp-draft:v${rsvpDraftStorageVersion}:${eventRouteId}`;
  return clerkUserId ? `${baseStorageKey}:user:${clerkUserId}` : baseStorageKey;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function booleanFromUnknown(value: unknown): boolean {
  return value === true;
}

function stringRecordFromUnknown(value: unknown): Record<string, string> {
  if (!isObjectRecord(value)) return {};

  const result: Record<string, string> = {};
  for (const [key, recordValue] of Object.entries(value)) {
    if (typeof recordValue === "string") {
      result[key] = recordValue;
    }
  }
  return result;
}

function attendanceStatusFromUnknown(value: unknown): AttendanceStatusOption {
  return value === "no" || value === "maybe" || value === "yes" ? value : "yes";
}

export function attendeesFromUnknown(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function phoneCountryCodeFromUnknown(value: unknown): string {
  const candidateCountryCode = stringFromUnknown(value);
  return countries.some((country) => country.code === candidateCountryCode)
    ? candidateCountryCode
    : defaultPhoneCountryCode;
}

function hasStoredStringValue(values: Record<string, string>): boolean {
  return Object.values(values).some((value) => value.trim().length > 0);
}

function hasMeaningfulRsvpDraft(draft: RsvpDraftStorage): boolean {
  return (
    draft.firstName.trim().length > 0 ||
    draft.lastName.trim().length > 0 ||
    draft.phoneNationalNumber.trim().length > 0 ||
    hasStoredStringValue(draft.custom) ||
    hasStoredStringValue(draft.socialProfiles) ||
    draft.invitedByName.trim().length > 0 ||
    draft.note.trim().length > 0 ||
    draft.attendanceStatus !== "yes" ||
    draft.attendees !== 1 ||
    draft.accessPassword.trim().length > 0 ||
    draft.smsConsentEnabled
  );
}

export function readRsvpDraftStorage(storageKey: string): RsvpDraftStorage | null {
  if (typeof window === "undefined") return null;

  try {
    const rawDraft = window.localStorage.getItem(storageKey);
    if (!rawDraft) return null;

    const parsedDraft: unknown = JSON.parse(rawDraft);
    if (!isObjectRecord(parsedDraft) || parsedDraft.version !== rsvpDraftStorageVersion) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    const updatedAt =
      typeof parsedDraft.updatedAt === "number" && Number.isFinite(parsedDraft.updatedAt)
        ? parsedDraft.updatedAt
        : 0;
    if (Date.now() - updatedAt > rsvpDraftStorageMaxAgeMs) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return {
      version: rsvpDraftStorageVersion,
      updatedAt,
      name: stringFromUnknown(parsedDraft.name),
      firstName: stringFromUnknown(parsedDraft.firstName),
      lastName: stringFromUnknown(parsedDraft.lastName),
      phoneCountryCode: phoneCountryCodeFromUnknown(parsedDraft.phoneCountryCode),
      phoneNationalNumber: stringFromUnknown(parsedDraft.phoneNationalNumber),
      custom: stringRecordFromUnknown(parsedDraft.custom),
      socialProfiles: stringRecordFromUnknown(parsedDraft.socialProfiles),
      invitedByName: stringFromUnknown(parsedDraft.invitedByName),
      note: stringFromUnknown(parsedDraft.note),
      attendanceStatus: attendanceStatusFromUnknown(parsedDraft.attendanceStatus),
      attendees: attendeesFromUnknown(parsedDraft.attendees),
      accessPassword: stringFromUnknown(parsedDraft.accessPassword),
      smsConsentEnabled: booleanFromUnknown(parsedDraft.smsConsentEnabled),
    };
  } catch {
    return null;
  }
}

export function writeRsvpDraftStorage(storageKey: string, draft: RsvpDraftStorage): void {
  if (typeof window === "undefined") return;

  try {
    if (hasMeaningfulRsvpDraft(draft)) {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // localStorage can be unavailable or full; RSVP submission still works.
  }
}

export function clearRsvpDraftStorage(eventRouteId: string, clerkUserId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildRsvpDraftStorageKey(eventRouteId));
    if (clerkUserId)
      window.localStorage.removeItem(buildRsvpDraftStorageKey(eventRouteId, clerkUserId));
  } catch {
    // Storage may be unavailable; this must not undo a verified RSVP.
  }
}

export type RsvpCollectedArgs = {
  firstName: string;
  lastName: string;
  phone: string;
  requiresPhoneVerification: boolean;
  note?: string;
  shareContact: true;
  attendees: number;
  attendanceStatus: AttendanceStatusOption;
  smsConsent: boolean;
  smsConsentIpAddress?: string;
  customFields: Record<string, string>;
  socialProfiles: Array<{ platformKey: string; handle: string }>;
  invitedByName?: string;
  /**
   * The list the form already resolved this submission to. The form
   * performs the lookup as the user types so that the parent does not
   * need to re-resolve at submit time.
   */
  resolvedListKey: string;
};

export interface CurrentUserRsvpFormStatus {
  listKey?: string;
  status?: RSVP["status"];
  customFieldValues?: Record<string, string>;
  socialProfiles?: Array<{ platformKey: string; handle: string }>;
  invitedByName?: string;
  attendanceStatus?: AttendanceStatusOption;
  smsConsent?: boolean;
  smsConsentIpAddress?: string;
}
