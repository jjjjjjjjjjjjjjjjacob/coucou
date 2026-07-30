"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CountrySelector, countries } from "@coucou/ui/auth";
import { TenantButton } from "@coucou/ui/tenant-template";
import { useAction, useMutation, useQuery } from "convex/react";
import { CheckCircle2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { type Path, useForm } from "react-hook-form";
import { toast } from "sonner";
import { GuestInfoFields, NoteForHostsField } from "@/components/guest-info-form";
import { SmsProgramDisclosure } from "@/components/sms-program-disclosure";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { validateRequiredPrimaryFields, validateRequiredWithFirstName } from "@/lib/mini-zod";
import { buildPathWithPreservedQuery } from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";
import { danzaOrganicaSmsProgram } from "@/lib/sms-program";
import type {
  ApplicationError,
  ClerkUser,
  CustomField,
  Event,
  RSVP,
  RSVPFormData,
  User,
} from "@/lib/types";

// Buttons in the RSVP / post-RSVP flow render transparent with just a
// border so they never paint a solid block on top of the tenant backdrop
// when the content band overlaps with the marks.
const ghostButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--tt-fg)",
  border: "1px solid var(--tt-fg)",
};

const defaultPhoneCountryCode = "+1";
const rsvpDraftStorageVersion = 1;
const rsvpDraftStorageMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const rsvpDraftStorageDebounceMs = 250;

interface RsvpDraftStorage {
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
  hasAcknowledgedSmsOptOutPrompt: boolean;
}

const countriesByDescendingDialCodeLength = [...countries].sort(
  (leftCountry, rightCountry) =>
    digitsOnly(rightCountry.code).length - digitsOnly(leftCountry.code).length,
);

interface PhoneNumberInputState {
  countryCode: string;
  nationalNumber: string;
}

interface RestoredRsvpDraftFields {
  name: boolean;
  phone: boolean;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhoneNumberForDisplay(value: string, countryCode: string): string {
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

function isPhoneNumberLikelyValid(value: string, countryCode: string): boolean {
  const digits = digitsOnly(value);
  if (countryCode === "+1") {
    return digits.length >= 10;
  }
  return digits.length >= 8;
}

function resolvePhoneNumberInputState(
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

function buildFullPhoneNumber(countryCode: string, nationalNumber: string): string {
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

function phoneNumbersMatch(leftPhoneNumber: string, rightPhoneNumber: string): boolean {
  return digitsOnly(leftPhoneNumber) === digitsOnly(rightPhoneNumber);
}

export type AttendanceStatusOption = "yes" | "no" | "maybe";

function buildRsvpDraftStorageKey(eventRouteId: string, clerkUserId?: string): string {
  const baseStorageKey = `danza-organica:rsvp-draft:v${rsvpDraftStorageVersion}:${eventRouteId}`;
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

function attendeesFromUnknown(value: unknown): number {
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
    draft.smsConsentEnabled ||
    draft.hasAcknowledgedSmsOptOutPrompt
  );
}

function readRsvpDraftStorage(storageKey: string): RsvpDraftStorage | null {
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
      hasAcknowledgedSmsOptOutPrompt: booleanFromUnknown(
        parsedDraft.hasAcknowledgedSmsOptOutPrompt,
      ),
    };
  } catch {
    return null;
  }
}

function writeRsvpDraftStorage(storageKey: string, draft: RsvpDraftStorage): void {
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

interface CurrentUserRsvpFormStatus {
  listKey?: string;
  status?: RSVP["status"];
  customFieldValues?: Record<string, string>;
  socialProfiles?: Array<{ platformKey: string; handle: string }>;
  invitedByName?: string;
  attendanceStatus?: AttendanceStatusOption;
  smsConsent?: boolean;
  smsConsentIpAddress?: string;
}

interface RsvpAcceptedFormProps {
  eventId: Id<"events">;
  eventRouteId?: string;
  event: Event;
  listKey?: string;
  submitMode?: "submit" | "collect";
  onCollect?: (args: RsvpCollectedArgs) => void | Promise<void>;
  submitLabel?: string;
  /**
   * When true, the event has at least one list that does not require a
   * password. The password field becomes optional — guests on a no-password
   * list can submit with it blank. Defaults to false (password required).
   */
  hasNoPasswordList?: boolean;
  /**
   * When true, the event has at least one list that requires a password.
   * The password field is rendered so guests on those lists can provide
   * their access password. Defaults to true so legacy callers keep showing
   * the field.
   */
  hasPasswordList?: boolean;
  /** Optional initial password from the URL query param. */
  initialPassword?: string;
  /** Whether this form is being completed by a Clerk-authenticated user. */
  isSignedIn?: boolean;
}

export function RsvpAcceptedForm({
  eventId,
  eventRouteId,
  event,
  listKey,
  submitMode = "submit",
  onCollect,
  submitLabel = "Submit Request",
  hasNoPasswordList = false,
  hasPasswordList = true,
  initialPassword = "",
  isSignedIn = true,
}: RsvpAcceptedFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const publicEventRouteId = eventRouteId ?? eventId;
  const { user, isLoaded: userIsLoaded } = useUser();
  const rsvpDraftStorageKey = useMemo(
    () => buildRsvpDraftStorageKey(publicEventRouteId, isSignedIn ? user?.id : undefined),
    [isSignedIn, publicEventRouteId, user?.id],
  );

  const status = useQuery(api.rsvps.statusForUserEvent, {
    eventId,
    siteKey: siteConfiguration.siteKey,
  }) as CurrentUserRsvpFormStatus | null | undefined;
  const organizerSmsPreference = useQuery(
    api.rsvps.smsPreferenceForUserEvent,
    isSignedIn
      ? {
          eventId,
          siteKey: siteConfiguration.siteKey,
        }
      : "skip",
  );
  const userDoc = useQuery(
    api.users.getByClerkUser,
    user?.id ? { clerkUserId: user.id } : "skip",
  ) as User | undefined;
  const userSocialProfiles = useQuery(
    api.socialProfiles.listForCurrentUser,
    user?.id ? {} : "skip",
  ) as Array<{ platformKey: string; handle: string }> | undefined;

  const [name, setName] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [phoneCountryCode, setPhoneCountryCode] = useState<string>(defaultPhoneCountryCode);
  const [phoneNationalNumber, setPhoneNationalNumber] = useState<string>("");
  const [hasInitializedPhoneInput, setHasInitializedPhoneInput] = useState<boolean>(false);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [socialProfiles, setSocialProfiles] = useState<Record<string, string>>({});
  const [invitedByName, setInvitedByName] = useState<string>("");
  const [note, setNote] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatusOption>("yes");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accessPassword, setAccessPassword] = useState<string>(initialPassword);
  const debouncedAccessPassword = useDebounce(accessPassword, 300);
  const [resolvedListKey, setResolvedListKey] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "searching" | "matched" | "miss-with-fallback" | "miss-no-fallback"
  >("idle");
  const searchRequestIdRef = useRef(0);
  const [smsConsentEnabled, setSmsConsentEnabled] = useState<boolean>(false);
  const [hasInitializedSmsConsent, setHasInitializedSmsConsent] = useState<boolean>(false);
  const [smsConsentIpAddress, setSmsConsentIpAddress] = useState<string | undefined>(undefined);
  const [hasHydratedRsvpDraft, setHasHydratedRsvpDraft] = useState<boolean>(false);
  const hydratedRsvpDraftStorageKeyRef = useRef<string | null>(null);
  const restoredRsvpDraftFieldsRef = useRef<RestoredRsvpDraftFields>({
    name: false,
    phone: false,
  });
  const shouldPreserveSmsConsentDraftRef = useRef<boolean>(false);

  const upsertContact = useMutation(api.users.upsertContactPhone);
  const submitRsvp = useMutation(api.rsvps.submitRequest);
  const updateProfileMeta = useMutation(api.users.updateProfileMeta);
  const resolveListByPassword = useAction(api.credentialsNode.resolveListByPassword);

  useEffect(() => {
    const trimmed = debouncedAccessPassword.trim();
    const requestId = ++searchRequestIdRef.current;

    if (trimmed.length === 0) {
      // Empty input: resolve quietly to the no-password list if one exists.
      // We deliberately do not surface a spinner here — there's no input to
      // validate, so a loading state would be visual noise.
      setSearchStatus("idle");
      if (hasNoPasswordList) {
        resolveListByPassword({
          eventId,
          password: "",
          siteKey: siteConfiguration.siteKey,
        })
          .then((result) => {
            if (requestId !== searchRequestIdRef.current) return;
            setResolvedListKey(result.ok ? result.listKey : null);
          })
          .catch(() => {
            if (requestId !== searchRequestIdRef.current) return;
            setResolvedListKey(null);
          });
      } else {
        setResolvedListKey(null);
      }
      return;
    }

    setSearchStatus("searching");
    resolveListByPassword({
      eventId,
      password: trimmed,
      siteKey: siteConfiguration.siteKey,
    })
      .then((result) => {
        if (requestId !== searchRequestIdRef.current) return;
        if (!result.ok) {
          setResolvedListKey(null);
          setSearchStatus("miss-no-fallback");
          return;
        }
        if (result.matched === "password") {
          setResolvedListKey(result.listKey);
          setSearchStatus("matched");
        } else {
          setResolvedListKey(result.listKey);
          setSearchStatus("miss-with-fallback");
        }
      })
      .catch(() => {
        if (requestId !== searchRequestIdRef.current) return;
        setResolvedListKey(null);
        setSearchStatus("miss-no-fallback");
      });
  }, [debouncedAccessPassword, eventId, hasNoPasswordList, resolveListByPassword]);

  const form = useForm<RSVPFormData>({
    defaultValues: {
      name: "",
      firstName: "",
      lastName: "",
      custom: {},
      socialProfiles: {},
      invitedByName: "",
      phone: "",
      attendees: 1,
      attendanceStatus: "yes",
    },
  });
  const watchedAttendees = form.watch("attendees");

  useEffect(() => {
    if (isSignedIn && (!userIsLoaded || !user?.id)) {
      return;
    }

    const hydrationKey = `${rsvpDraftStorageKey}:${isSignedIn ? "signed-in" : "guest"}`;
    if (hydratedRsvpDraftStorageKeyRef.current === hydrationKey) {
      return;
    }

    setHasHydratedRsvpDraft(false);
    restoredRsvpDraftFieldsRef.current = {
      name: false,
      phone: false,
    };
    shouldPreserveSmsConsentDraftRef.current = false;
    const storedDraft = readRsvpDraftStorage(rsvpDraftStorageKey);
    if (storedDraft) {
      const restoredFirstName = storedDraft.firstName;
      const restoredLastName = storedDraft.lastName;
      const restoredName = storedDraft.name || `${restoredFirstName} ${restoredLastName}`.trim();
      const restoredDraftHasName =
        restoredFirstName.trim().length > 0 || restoredLastName.trim().length > 0;
      const restoredDraftHasPhone =
        storedDraft.phoneNationalNumber.trim().length > 0 ||
        storedDraft.phoneCountryCode !== defaultPhoneCountryCode;

      setName(restoredName);
      setFirstName(restoredFirstName);
      setLastName(restoredLastName);
      setPhoneCountryCode(storedDraft.phoneCountryCode);
      setPhoneNationalNumber(storedDraft.phoneNationalNumber);
      if (restoredDraftHasPhone) {
        setHasInitializedPhoneInput(true);
      }
      setCustom(storedDraft.custom);
      setSocialProfiles(storedDraft.socialProfiles);
      setInvitedByName(storedDraft.invitedByName);
      setNote(storedDraft.note);
      setAttendanceStatus(storedDraft.attendanceStatus);
      setAccessPassword(storedDraft.accessPassword || initialPassword);
      setSmsConsentEnabled(storedDraft.smsConsentEnabled);
      shouldPreserveSmsConsentDraftRef.current = storedDraft.smsConsentEnabled;
      form.setValue("attendees", storedDraft.attendees, {
        shouldValidate: false,
        shouldDirty: false,
      });
      restoredRsvpDraftFieldsRef.current = {
        name: restoredDraftHasName,
        phone: restoredDraftHasPhone,
      };
    } else if (initialPassword) {
      setAccessPassword(initialPassword);
    }

    hydratedRsvpDraftStorageKeyRef.current = hydrationKey;
    setHasHydratedRsvpDraft(true);
  }, [form, initialPassword, isSignedIn, rsvpDraftStorageKey, user?.id, userIsLoaded]);

  // Prefill from existing RSVP data and Clerk profile
  useEffect(() => {
    if (!event) return;
    const userDocFirstName = userDoc?.firstName?.trim() ?? "";
    const userDocLastName = userDoc?.lastName?.trim() ?? "";
    if (userDocFirstName || userDocLastName) {
      setFirstName(userDocFirstName);
      setLastName(userDocLastName);
      setName(`${userDocFirstName} ${userDocLastName}`.trim());
    } else if (!restoredRsvpDraftFieldsRef.current.name && !firstName && !lastName) {
      const clerkFirstName = user?.firstName?.trim() ?? "";
      const clerkLastName = user?.lastName?.trim() ?? "";
      if (clerkFirstName || clerkLastName) {
        setFirstName(clerkFirstName);
        setLastName(clerkLastName);
        setName(user?.fullName?.trim() || `${clerkFirstName} ${clerkLastName}`.trim());
      }
    }

    if (event?.customFields?.length) {
      setCustom((prev) => {
        const next = { ...prev } as Record<string, string>;
        for (const customField of event.customFields || []) {
          const key = customField.key;
          const existing = next[key];
          const fromStatus = status?.customFieldValues?.[key];
          if (fromStatus?.trim()) {
            next[key] = fromStatus;
          } else if (!existing) {
            delete next[key];
          }
        }
        return next;
      });
    }
    const configuredSocialPlatforms = event.primaryFieldConfig?.socialPlatforms ?? [];
    if (configuredSocialPlatforms.length > 0) {
      setSocialProfiles((previousSocialProfiles) => {
        const nextSocialProfiles = { ...previousSocialProfiles };
        for (const platform of configuredSocialPlatforms) {
          const fromStatus = status?.socialProfiles?.find(
            (profile) => profile.platformKey === platform.platformKey,
          )?.handle;
          const fromProfile = userSocialProfiles?.find(
            (profile) => profile.platformKey === platform.platformKey,
          )?.handle;
          const value = fromStatus?.trim() || fromProfile?.trim() || "";
          if (value) {
            nextSocialProfiles[platform.platformKey] = value;
          }
        }
        return nextSocialProfiles;
      });
    }
    if (status?.invitedByName?.trim()) {
      setInvitedByName(status.invitedByName);
    }
    if (status?.attendanceStatus) {
      setAttendanceStatus(status.attendanceStatus);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    event?.customFields,
    event?.primaryFieldConfig,
    status?.customFieldValues,
    status?.socialProfiles,
    status?.invitedByName,
    status?.attendanceStatus,
    userDoc?._id,
    user?.id,
    userSocialProfiles,
  ]);

  // Sync RHF form values from local state
  useEffect(() => {
    form.setValue("name", name, { shouldValidate: false, shouldDirty: false });
    form.setValue("firstName", firstName, {
      shouldValidate: false,
      shouldDirty: false,
    });
    form.setValue("lastName", lastName, {
      shouldValidate: false,
      shouldDirty: false,
    });
    const current = form.getValues("custom") || {};
    const next: Record<string, string> = { ...current, ...custom };
    form.setValue("custom", next, {
      shouldValidate: false,
      shouldDirty: false,
    });
    form.setValue("socialProfiles", socialProfiles, {
      shouldValidate: false,
      shouldDirty: false,
    });
    form.setValue("invitedByName", invitedByName, {
      shouldValidate: false,
      shouldDirty: false,
    });
    form.setValue("attendanceStatus", attendanceStatus, {
      shouldValidate: false,
      shouldDirty: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name,
    firstName,
    lastName,
    invitedByName,
    attendanceStatus,
    JSON.stringify(custom),
    JSON.stringify(socialProfiles),
  ]);

  const clerkPhone = useMemo(() => {
    const clerkUser = user as ClerkUser | undefined;
    return (
      (clerkUser?.primaryPhoneNumber?.phoneNumber || clerkUser?.phoneNumbers?.[0]?.phoneNumber) ??
      ""
    );
  }, [user]);

  useEffect(() => {
    if (hasInitializedPhoneInput) return;
    if (!hasHydratedRsvpDraft) return;
    if (isSignedIn && !userIsLoaded) return;

    const initialPhoneState = resolvePhoneNumberInputState(isSignedIn ? clerkPhone : undefined);
    setPhoneCountryCode(initialPhoneState.countryCode);
    setPhoneNationalNumber(initialPhoneState.nationalNumber);
    setHasInitializedPhoneInput(true);
  }, [clerkPhone, hasHydratedRsvpDraft, hasInitializedPhoneInput, isSignedIn, userIsLoaded]);

  const effectivePhone = useMemo(
    () => buildFullPhoneNumber(phoneCountryCode, phoneNationalNumber),
    [phoneCountryCode, phoneNationalNumber],
  );
  const phoneMatchesSignedInUser = useMemo(
    () => isSignedIn && !!clerkPhone && phoneNumbersMatch(effectivePhone, clerkPhone),
    [clerkPhone, effectivePhone, isSignedIn],
  );
  const requiresPhoneVerification = !isSignedIn || !phoneMatchesSignedInUser;

  useEffect(() => {
    form.setValue("phone", effectivePhone, {
      shouldValidate: false,
      shouldDirty: false,
    });
  }, [effectivePhone, form]);

  const currentRsvpDraft = useMemo<RsvpDraftStorage>(
    () => ({
      version: rsvpDraftStorageVersion,
      updatedAt: Date.now(),
      name,
      firstName,
      lastName,
      phoneCountryCode,
      phoneNationalNumber,
      custom,
      socialProfiles,
      invitedByName,
      note,
      attendanceStatus,
      attendees: attendeesFromUnknown(watchedAttendees),
      accessPassword,
      smsConsentEnabled,
      hasAcknowledgedSmsOptOutPrompt: false,
    }),
    [
      accessPassword,
      attendanceStatus,
      custom,
      firstName,
      invitedByName,
      lastName,
      name,
      note,
      phoneCountryCode,
      phoneNationalNumber,
      smsConsentEnabled,
      socialProfiles,
      watchedAttendees,
    ],
  );

  useEffect(() => {
    if (!hasHydratedRsvpDraft) return;

    const saveTimer = window.setTimeout(() => {
      writeRsvpDraftStorage(rsvpDraftStorageKey, {
        ...currentRsvpDraft,
        updatedAt: Date.now(),
      });
    }, rsvpDraftStorageDebounceMs);

    return () => window.clearTimeout(saveTimer);
  }, [currentRsvpDraft, hasHydratedRsvpDraft, rsvpDraftStorageKey]);

  useEffect(() => {
    if (!hasHydratedRsvpDraft) return;

    const flushDraftBeforeUnload = () => {
      writeRsvpDraftStorage(rsvpDraftStorageKey, {
        ...currentRsvpDraft,
        updatedAt: Date.now(),
      });
    };

    window.addEventListener("pagehide", flushDraftBeforeUnload);
    return () => window.removeEventListener("pagehide", flushDraftBeforeUnload);
  }, [currentRsvpDraft, hasHydratedRsvpDraft, rsvpDraftStorageKey]);

  const flushRsvpDraft = React.useCallback(() => {
    if (!hasHydratedRsvpDraft) return;
    writeRsvpDraftStorage(rsvpDraftStorageKey, {
      ...currentRsvpDraft,
      updatedAt: Date.now(),
    });
  }, [currentRsvpDraft, hasHydratedRsvpDraft, rsvpDraftStorageKey]);

  const deniedForThisList = useMemo(() => {
    const effectiveListKey = listKey ?? resolvedListKey;
    return status?.status === "denied" && !!effectiveListKey && status.listKey === effectiveListKey;
  }, [status?.status, status?.listKey, listKey, resolvedListKey]);

  const handleSmsConsentChange = React.useCallback(
    async (checked: boolean | "indeterminate") => {
      const isEnabled = checked === true;
      setHasInitializedSmsConsent(true);
      setSmsConsentEnabled(isEnabled);
      if (isEnabled) {
        if (!smsConsentIpAddress) {
          const ipAddress = await fetchSmsConsentIpAddress();
          if (ipAddress) {
            setSmsConsentIpAddress(ipAddress);
          }
        }
      }
    },
    [smsConsentIpAddress],
  );

  const performSubmission = async () => {
    try {
      setMessage("");
      const eventCustomFields: CustomField[] = event?.customFields ?? [];
      const eventSocialPlatforms = event.primaryFieldConfig?.socialPlatforms ?? [];
      const invitedByConfig = event.primaryFieldConfig?.invitedBy;
      const errs = [
        ...validateRequiredWithFirstName(
          firstName,
          lastName,
          custom,
          eventCustomFields.map((customField) => ({
            key: customField.key,
            label: customField.label || customField.key,
            required: customField.required,
          })),
        ),
        ...validateRequiredPrimaryFields(
          socialProfiles,
          eventSocialPlatforms.map((platform) => ({
            key: platform.platformKey,
            label: platform.label,
            required: platform.required,
          })),
          invitedByName,
          invitedByConfig?.enabled === true
            ? {
                key: "invitedByName",
                label: invitedByConfig.label ?? "Invited by",
                required: invitedByConfig.required,
              }
            : undefined,
        ),
      ];
      if (errs.length) {
        for (const e of errs) {
          if (e.toLowerCase().includes("first name")) {
            form.setError("firstName", { type: "required", message: e });
          }
          if (e.toLowerCase().includes("last name")) {
            form.setError("lastName", { type: "required", message: e });
          }
        }
        for (const customField of eventCustomFields) {
          const label = customField.label || customField.key;
          const errorMessage = `${label} is required`;
          if (errs.includes(errorMessage)) {
            const fieldPath = `custom.${customField.key}` as Path<RSVPFormData>;
            form.setError(fieldPath, {
              type: "required",
              message: errorMessage,
            });
          }
        }
        for (const platform of eventSocialPlatforms) {
          const errorMessage = `${platform.label} is required`;
          if (errs.includes(errorMessage)) {
            const fieldPath = `socialProfiles.${platform.platformKey}` as Path<RSVPFormData>;
            form.setError(fieldPath, {
              type: "required",
              message: errorMessage,
            });
          }
        }
        if (invitedByConfig?.enabled === true) {
          const errorMessage = `${invitedByConfig.label ?? "Invited by"} is required`;
          if (errs.includes(errorMessage)) {
            form.setError("invitedByName", {
              type: "required",
              message: errorMessage,
            });
          }
        }
        const summary = errs.join("\n");
        setMessage(summary);
        toast.error("Missing required fields", { description: summary });
        return;
      }
      if (!effectivePhone || !isPhoneNumberLikelyValid(phoneNationalNumber, phoneCountryCode)) {
        const phoneError = "Enter a valid phone number.";
        form.setError("phone", { type: "required", message: phoneError });
        setMessage(phoneError);
        return;
      }
      if (searchStatus === "searching") {
        setMessage("Checking your password — try again in a moment.");
        return;
      }
      if (!resolvedListKey) {
        const passwordError = accessPassword.trim()
          ? "Password not recognized."
          : "Enter the password your host shared with you.";
        setMessage(passwordError);
        toast.error(passwordError);
        return;
      }
      if (deniedForThisList) {
        setMessage("You were denied for this list. Try another password.");
        return;
      }
      setSubmitting(true);
      if (isSignedIn && !requiresPhoneVerification) {
        await updateProfileMeta({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
      }
      const filteredCustomFields = eventCustomFields.reduce<Record<string, string>>(
        (accumulator, customField) => {
          const value = custom[customField.key];
          if (value) {
            accumulator[customField.key] = value;
          }
          return accumulator;
        },
        {},
      );
      if (isSignedIn && !requiresPhoneVerification) {
        await upsertContact({ phone: effectivePhone || undefined });
      }

      const effectiveSmsConsentEnabled = smsConsentEnabled;
      let consentIpAddress = smsConsentIpAddress;
      if (effectiveSmsConsentEnabled && !consentIpAddress) {
        consentIpAddress = await fetchSmsConsentIpAddress();
        if (consentIpAddress) {
          setSmsConsentIpAddress(consentIpAddress);
        }
      }

      const collectedArgs: RsvpCollectedArgs = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: effectivePhone,
        requiresPhoneVerification,
        note: note || undefined,
        shareContact: true,
        attendees: form.getValues("attendees") || 1,
        attendanceStatus: event.attendanceQuestionEnabled ? attendanceStatus : "yes",
        smsConsent: effectiveSmsConsentEnabled,
        smsConsentIpAddress:
          effectiveSmsConsentEnabled && consentIpAddress ? consentIpAddress : undefined,
        customFields: filteredCustomFields,
        socialProfiles: (event.primaryFieldConfig?.socialPlatforms ?? [])
          .map((platform) => ({
            platformKey: platform.platformKey,
            handle: socialProfiles[platform.platformKey]?.trim() ?? "",
          }))
          .filter((profile) => profile.handle.length > 0),
        invitedByName:
          event.primaryFieldConfig?.invitedBy?.enabled === true ? invitedByName.trim() : undefined,
        resolvedListKey,
      };

      if (submitMode === "collect") {
        await onCollect?.(collectedArgs);
        return;
      }

      if (!listKey) {
        setMessage("Missing list assignment. Please re-enter the password.");
        return;
      }

      await submitRsvp({
        eventId,
        siteKey: siteConfiguration.siteKey,
        listKey,
        note: collectedArgs.note,
        shareContact: collectedArgs.shareContact,
        attendees: collectedArgs.attendees,
        attendanceStatus: collectedArgs.attendanceStatus,
        smsConsent: collectedArgs.smsConsent,
        smsConsentIpAddress: collectedArgs.smsConsentIpAddress,
        phone: collectedArgs.phone,
        firstName: collectedArgs.firstName,
        lastName: collectedArgs.lastName,
        customFields: collectedArgs.customFields,
        socialProfiles: collectedArgs.socialProfiles,
        invitedByName: collectedArgs.invitedByName,
      });

      toast.success("RSVP submitted");
      router.replace(
        buildPathWithPreservedQuery(`/events/${publicEventRouteId}/status`, searchParams, ["step"]),
      );
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      const errorMessage = errorDetails?.message || "Failed to submit request";
      setMessage(errorMessage);
      toast.error("Request failed", { description: errorMessage });
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async () => {
    await performSubmission();
  };

  useEffect(() => {
    const statusHasLoaded = status !== undefined;
    const statusSmsConsent = status?.smsConsent;
    const shouldPreserveSmsConsentDraft = shouldPreserveSmsConsentDraftRef.current;
    const organizerSmsPreferenceHasLoaded = !isSignedIn || organizerSmsPreference !== undefined;

    if (!hasInitializedSmsConsent && statusSmsConsent !== undefined) {
      setSmsConsentEnabled(statusSmsConsent);
      setHasInitializedSmsConsent(true);
    } else if (!hasInitializedSmsConsent && statusHasLoaded && shouldPreserveSmsConsentDraft) {
      setHasInitializedSmsConsent(true);
    } else if (!hasInitializedSmsConsent && statusHasLoaded && organizerSmsPreferenceHasLoaded) {
      setSmsConsentEnabled(organizerSmsPreference?.smsConsent ?? false);
      setHasInitializedSmsConsent(true);
    }

    const effectiveSmsConsentIpAddress = status?.smsConsentIpAddress;
    if (
      typeof effectiveSmsConsentIpAddress === "string" &&
      effectiveSmsConsentIpAddress.length > 0
    ) {
      setSmsConsentIpAddress(effectiveSmsConsentIpAddress);
    }
  }, [hasInitializedSmsConsent, isSignedIn, organizerSmsPreference, status]);

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    flushRsvpDraft();
    void form.handleSubmit(onSubmit)(event);
  };

  const phoneNumberField = (
    <FormField
      control={form.control}
      name="phone"
      rules={{ required: "Phone number is required" }}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-primary text-xs font-medium">
            PHONE <span className="text-xs text-primary/70">(required)</span>
          </FormLabel>
          <FormControl>
            <div className="flex h-9 items-stretch border border-primary/20 bg-transparent transition-colors focus-within:border-primary/40">
              <CountrySelector
                value={phoneCountryCode}
                compact
                onChange={(nextCountryCode) => {
                  const nextNationalNumber = formatPhoneNumberForDisplay(
                    phoneNationalNumber,
                    nextCountryCode,
                  );
                  setPhoneCountryCode(nextCountryCode);
                  setPhoneNationalNumber(nextNationalNumber);
                  field.onChange(buildFullPhoneNumber(nextCountryCode, nextNationalNumber));
                }}
              />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="000 000 0000"
                value={phoneNationalNumber}
                aria-label="Phone number"
                onBlur={field.onBlur}
                onChange={(phoneInputChangeEvent) => {
                  const nextPhoneInputValue = phoneInputChangeEvent.target.value;
                  const nextPhoneState = nextPhoneInputValue.trim().startsWith("+")
                    ? resolvePhoneNumberInputState(nextPhoneInputValue)
                    : {
                        countryCode: phoneCountryCode,
                        nationalNumber: formatPhoneNumberForDisplay(
                          nextPhoneInputValue,
                          phoneCountryCode,
                        ),
                      };
                  setPhoneCountryCode(nextPhoneState.countryCode);
                  setPhoneNationalNumber(nextPhoneState.nationalNumber);
                  field.onChange(
                    buildFullPhoneNumber(nextPhoneState.countryCode, nextPhoneState.nationalNumber),
                  );
                }}
                className="flex-1 bg-transparent px-3 py-1 text-primary text-sm outline-none placeholder:text-primary/50"
                style={{
                  fontFamily: "var(--tt-text)",
                }}
              />
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <>
      <Form {...form}>
        <form onSubmit={handleFormSubmit} className="space-y-3">
          <GuestInfoFields
            form={form}
            event={event}
            name={name}
            setName={setName}
            firstName={firstName}
            setFirstName={setFirstName}
            lastName={lastName}
            setLastName={setLastName}
            custom={custom}
            setCustom={setCustom}
            socialProfiles={socialProfiles}
            setSocialProfiles={setSocialProfiles}
            invitedByName={invitedByName}
            setInvitedByName={setInvitedByName}
            afterNameFields={phoneNumberField}
          />

          <NoteForHostsField note={note} setNote={setNote} />

          {hasPasswordList ? (
            <div className="flex flex-col gap-2 pt-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="rsvp-access-password" className="text-xs font-medium text-primary">
                  PASSWORD{" "}
                  <span className="text-primary/70">
                    {hasNoPasswordList ? "(optional)" : "(required)"}
                  </span>
                </label>
                {searchStatus === "miss-no-fallback" ? (
                  <span className="text-[11px] font-medium text-destructive">Not recognized</span>
                ) : null}
              </div>
              <div className="relative">
                <input
                  id="rsvp-access-password"
                  type="password"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={accessPassword}
                  onChange={(event) => setAccessPassword(event.target.value)}
                  placeholder="•••••••"
                  className="w-full border border-primary/20 bg-transparent px-3 py-2 pr-28 text-primary outline-none placeholder:text-primary/50"
                  style={{
                    fontFamily: "var(--tt-text)",
                    letterSpacing: "0.2em",
                  }}
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  {searchStatus === "searching" ? (
                    <Spinner size={16} />
                  ) : searchStatus === "matched" && resolvedListKey ? (
                    <Badge variant="success" className="gap-1" style={{ letterSpacing: "0.05em" }}>
                      <CheckCircle2 className="h-3 w-3" />
                      {resolvedListKey.toUpperCase()}
                    </Badge>
                  ) : searchStatus === "miss-with-fallback" && resolvedListKey ? (
                    <Badge variant="outline" style={{ letterSpacing: "0.05em" }}>
                      {resolvedListKey.toUpperCase()}
                    </Badge>
                  ) : null}
                </div>
              </div>
              {searchStatus === "miss-with-fallback" && resolvedListKey ? (
                <p className="text-[11px] text-amber-500">
                  Password not recognized — RSVP will be submitted to{" "}
                  {resolvedListKey.toUpperCase()}.
                </p>
              ) : searchStatus === "miss-no-fallback" ? (
                <p className="text-[11px] text-destructive">Password not recognized.</p>
              ) : (
                <p className="text-[11px] text-primary/60">
                  {hasNoPasswordList
                    ? "Have an access password from your host? Enter it here. Otherwise leave blank."
                    : "Enter the password your host shared with you. Case insensitive."}
                </p>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl space-y-2">
              <label
                htmlFor="sms-opt-in"
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <input
                  id="sms-opt-in"
                  type="checkbox"
                  checked={smsConsentEnabled}
                  onChange={(event) => handleSmsConsentChange(event.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <span className="font-medium text-foreground">
                  {danzaOrganicaSmsProgram.consentLabel}
                </span>
              </label>
              <p className="text-[10px] leading-tight text-muted-foreground">
                <SmsProgramDisclosure />
              </p>
            </div>
            <TenantButton
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
              style={ghostButtonStyle}
              disabled={
                submitting ||
                !hasInitializedSmsConsent ||
                !effectivePhone ||
                deniedForThisList ||
                searchStatus === "searching" ||
                !resolvedListKey ||
                form.formState.isSubmitting
              }
            >
              {submitting ? (
                <>
                  <Spinner size={14} title="Submitting" />
                  Submitting…
                </>
              ) : (
                submitLabel
              )}
            </TenantButton>
          </div>
        </form>
      </Form>

      {deniedForThisList ? (
        <div className="mt-4 text-sm" style={{ color: "var(--tt-fg)" }}>
          You were denied for this list. Try another password.
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 whitespace-pre-line text-sm" style={{ color: "var(--tt-fg)" }}>
          {message}
        </div>
      ) : null}
    </>
  );
}
