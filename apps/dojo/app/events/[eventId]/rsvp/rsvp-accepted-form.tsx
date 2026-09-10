"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CountrySelector } from "@coucou/ui/auth";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2 } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { type Path, useForm } from "react-hook-form";
import { toast } from "sonner";
import { GuestInfoFields, NoteForHostsField } from "@/components/guest-info-form";
import { SmsProgramDisclosure } from "@/components/sms-program-disclosure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { useRsvpListResolution } from "@/lib/hooks/use-rsvp-list-resolution";
import { validateRequiredPrimaryFields, validateRequiredWithFirstName } from "@/lib/mini-zod";
import {
  type AttendanceStatusOption,
  attendeesFromUnknown,
  buildFullPhoneNumber,
  buildRsvpDraftStorageKey,
  type CurrentUserRsvpFormStatus,
  defaultPhoneCountryCode,
  formatPhoneNumberForDisplay,
  isPhoneNumberLikelyValid,
  phoneNumbersMatch,
  type RestoredRsvpDraftFields,
  type RsvpCollectedArgs,
  type RsvpDraftStorage,
  readRsvpDraftStorage,
  resolvePhoneNumberInputState,
  rsvpDraftStorageDebounceMs,
  rsvpDraftStorageVersion,
  writeRsvpDraftStorage,
} from "@/lib/rsvp-form-state";
import { siteConfiguration } from "@/lib/site";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";
import { dojoSmsProgram } from "@/lib/sms-program";
import type {
  ApplicationError,
  ClerkUser,
  CustomField,
  Event,
  RSVPFormData,
  User,
} from "@/lib/types";

export type { RsvpCollectedArgs } from "@/lib/rsvp-form-state";

interface RsvpAcceptedFormProps {
  eventId: Id<"events">;
  eventRouteId?: string;
  event: Event;
  onCollect: (args: RsvpCollectedArgs) => void | Promise<void>;
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
  onCollect,
  submitLabel = "Submit Request",
  hasNoPasswordList = false,
  hasPasswordList = true,
  initialPassword = "",
  isSignedIn = true,
}: RsvpAcceptedFormProps) {
  const publicEventRouteId = eventRouteId ?? eventId;
  const { user, isLoaded: userIsLoaded } = useUser();
  const rsvpDraftStorageKey = useMemo(
    () => buildRsvpDraftStorageKey(publicEventRouteId, isSignedIn ? user?.id : undefined),
    [isSignedIn, publicEventRouteId, user?.id],
  );

  const status = useQuery(
    api.rsvps.statusForUserEvent,
    isSignedIn
      ? {
          eventId,
          siteKey: siteConfiguration.siteKey,
        }
      : "skip",
  ) as CurrentUserRsvpFormStatus | null | undefined;
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
  const {
    resolvedListKey,
    searchStatus,
    isResolving: isResolvingPassword,
  } = useRsvpListResolution(eventId, accessPassword);
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
  const updateProfileMeta = useMutation(api.users.updateProfileMeta);
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
      setAccessPassword(initialPassword || storedDraft.accessPassword);
      // Anonymous drafts preserve the form fields, but cannot stand in for a fresh opt-in.
      setSmsConsentEnabled(isSignedIn && storedDraft.smsConsentEnabled);
      shouldPreserveSmsConsentDraftRef.current = isSignedIn && storedDraft.smsConsentEnabled;
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
    if (
      !restoredRsvpDraftFieldsRef.current.name &&
      !firstName &&
      !lastName &&
      (userDocFirstName || userDocLastName)
    ) {
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
      setCustom((previousValues) => {
        const nextValues = { ...previousValues } as Record<string, string>;
        for (const customField of event.customFields || []) {
          const key = customField.key;
          const existing = nextValues[key];
          const fromStatus = status?.customFieldValues?.[key];
          if (!existing && fromStatus?.trim()) {
            nextValues[key] = fromStatus;
          } else if (!existing) {
            delete nextValues[key];
          }
        }
        return nextValues;
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
          if (value && !nextSocialProfiles[platform.platformKey]) {
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
    // eslint-disable-nextValues-line react-hooks/exhaustive-deps
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
    const nextValues: Record<string, string> = { ...current, ...custom };
    form.setValue("custom", nextValues, {
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
    // eslint-disable-nextValues-line react-hooks/exhaustive-deps
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
    const effectiveListKey = resolvedListKey;
    return status?.status === "denied" && !!effectiveListKey && status.listKey === effectiveListKey;
  }, [status?.status, status?.listKey, resolvedListKey]);

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
      const validationErrors = [
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
      if (validationErrors.length) {
        for (const validationMessage of validationErrors) {
          if (validationMessage.toLowerCase().includes("first name")) {
            form.setError("firstName", { type: "required", message: validationMessage });
          }
          if (validationMessage.toLowerCase().includes("last name")) {
            form.setError("lastName", { type: "required", message: validationMessage });
          }
        }
        for (const customField of eventCustomFields) {
          const label = customField.label || customField.key;
          const errorMessage = `${label} is required`;
          if (validationErrors.includes(errorMessage)) {
            const fieldPath = `custom.${customField.key}` as Path<RSVPFormData>;
            form.setError(fieldPath, {
              type: "required",
              message: errorMessage,
            });
          }
        }
        for (const platform of eventSocialPlatforms) {
          const errorMessage = `${platform.label} is required`;
          if (validationErrors.includes(errorMessage)) {
            const fieldPath = `socialProfiles.${platform.platformKey}` as Path<RSVPFormData>;
            form.setError(fieldPath, {
              type: "required",
              message: errorMessage,
            });
          }
        }
        if (invitedByConfig?.enabled === true) {
          const errorMessage = `${invitedByConfig.label ?? "Invited by"} is required`;
          if (validationErrors.includes(errorMessage)) {
            form.setError("invitedByName", {
              type: "required",
              message: errorMessage,
            });
          }
        }
        const summary = validationErrors.join("\n");
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
      if (isResolvingPassword) {
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
        attendees: Math.min(event.maxAttendees ?? 1, form.getValues("attendees") || 1),
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

      await onCollect(collectedArgs);
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
    const statusHasLoaded = !isSignedIn || status !== undefined;
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
            <div className="flex h-9 items-stretch rounded-md border border-primary/20 bg-transparent transition-colors focus-within:border-primary/40">
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
                  fontFamily: "inherit",
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

          {event.attendanceQuestionEnabled && (
            <fieldset className="space-y-2 rounded border border-primary/20 p-3">
              <legend className="px-1 text-sm font-medium text-primary">Attending?</legend>
              <div className="grid grid-cols-3 gap-2">
                {(["yes", "maybe", "no"] as const).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    aria-pressed={attendanceStatus === option}
                    variant={attendanceStatus === option ? "default" : "outline"}
                    onClick={() => setAttendanceStatus(option)}
                  >
                    {option === "yes" ? "Yes" : option === "maybe" ? "Maybe" : "No"}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}

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
                  className="w-full rounded-md border border-primary/20 bg-transparent px-3 py-2 pr-28 text-primary outline-none placeholder:text-primary/50"
                  style={{
                    fontFamily: "inherit",
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
                <span className="font-medium text-foreground">{dojoSmsProgram.consentLabel}</span>
              </label>
              <p className="text-[10px] leading-tight text-muted-foreground">
                <SmsProgramDisclosure />
              </p>
            </div>
            <Button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
              disabled={
                submitting ||
                !hasInitializedSmsConsent ||
                !effectivePhone ||
                deniedForThisList ||
                isResolvingPassword ||
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
            </Button>
          </div>
        </form>
      </Form>

      {deniedForThisList ? (
        <div className="mt-4 text-sm" style={{ color: "var(--primary)" }}>
          You were denied for this list. Try another password.
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 whitespace-pre-line text-sm" style={{ color: "var(--primary)" }}>
          {message}
        </div>
      ) : null}
    </>
  );
}
