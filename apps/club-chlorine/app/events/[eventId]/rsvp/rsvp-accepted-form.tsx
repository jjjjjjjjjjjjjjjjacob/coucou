"use client";

import { UserProfile, useClerk, useUser } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { TenantButton } from "@coucou/ui/tenant-template";
import { useAction, useMutation, useQuery } from "convex/react";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Path, useForm } from "react-hook-form";
import { toast } from "sonner";
import { GuestInfoFields, NoteForHostsField } from "@/components/guest-info-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Form } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { resolveEventMessagingBrandName } from "@/lib/event-display";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { validateRequiredPrimaryFields, validateRequiredWithFirstName } from "@/lib/mini-zod";
import {
  buildEventDetailPathWithPreservedQuery,
  buildPathWithPreservedQuery,
  buildPathWithQueryString,
  buildQueryStringWithRsvpStep,
  getRsvpStepQueryValue,
  parseRsvpStepQueryValue,
  type RsvpStepNumber,
} from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";
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
// border so they never paint a solid block on top of the chlorine wordmark
// when the content band overlaps with the marks.
const ghostButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--tt-fg)",
  border: "1px solid var(--tt-fg)",
};

export type AttendanceStatusOption = "yes" | "no" | "maybe";

const ATTENDANCE_STATUS_OPTIONS: AttendanceStatusOption[] = ["yes", "maybe", "no"];

function getAttendanceStatusLabel(status: AttendanceStatusOption): string {
  switch (status) {
    case "yes":
      return "Yes";
    case "maybe":
      return "Maybe";
    case "no":
      return "No";
  }
}

export type RsvpCollectedArgs = {
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
  formVariant?: "stepped" | "full";
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
   * The password field is rendered on step 3 so guests on those lists can
   * provide their access password. Defaults to true so legacy callers keep
   * showing the field.
   */
  hasPasswordList?: boolean;
  /** Optional initial password from the URL query param. */
  initialPassword?: string;
}

export function RsvpAcceptedForm({
  eventId,
  eventRouteId,
  event,
  listKey,
  submitMode = "submit",
  formVariant = "stepped",
  onCollect,
  submitLabel = "Submit Request",
  hasNoPasswordList = false,
  hasPasswordList = true,
  initialPassword = "",
}: RsvpAcceptedFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const publicEventRouteId = eventRouteId ?? eventId;
  const isFullForm = formVariant === "full";
  const { user } = useUser();
  const { openUserProfile } = useClerk();

  const status = useQuery(api.rsvps.statusForUserEvent, {
    eventId,
    siteKey: siteConfiguration.siteKey,
  }) as CurrentUserRsvpFormStatus | null | undefined;
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
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [socialProfiles, setSocialProfiles] = useState<Record<string, string>>({});
  const [invitedByName, setInvitedByName] = useState<string>("");
  const [note, setNote] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatusOption>("yes");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<RsvpStepNumber>(() =>
    isFullForm ? 3 : parseRsvpStepQueryValue(searchParams?.get("step")),
  );
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
  const [hasAcknowledgedSmsOptOutPrompt, setHasAcknowledgedSmsOptOutPrompt] =
    useState<boolean>(false);
  const [smsConsentDialogMode, setSmsConsentDialogMode] = useState<"encourage" | null>(null);

  const smsSenderDisplayName = useMemo(
    () =>
      resolveEventMessagingBrandName(
        {
          name: event?.name,
          secondaryTitle: event?.secondaryTitle,
          hosts: event?.hosts,
          productionCompany: event?.productionCompany,
        },
        { fallback: event?.name?.trim() ?? "Event Host" },
      ),
    [event?.hosts, event?.name, event?.secondaryTitle, event?.productionCompany],
  );

  const upsertContact = useMutation(api.users.upsertContactPhone);
  const submitRsvp = useMutation(api.rsvps.submitRequest);
  const updateProfileMeta = useMutation(api.users.updateProfileMeta);
  const resolveListByPassword = useAction(api.credentialsNode.resolveListByPassword);

  const replaceStepInUrl = useCallback(
    (nextStep: RsvpStepNumber) => {
      if (isFullForm) return;
      const queryString = buildQueryStringWithRsvpStep(searchParams, nextStep);
      const rsvpPathname = pathname ?? `/events/${publicEventRouteId}/rsvp`;
      router.replace(buildPathWithQueryString(rsvpPathname, queryString), { scroll: false });
    },
    [isFullForm, pathname, publicEventRouteId, router, searchParams],
  );

  const stepQueryValue = searchParams?.get("step");

  useEffect(() => {
    if (isFullForm) {
      setStep(3);
      return;
    }
    const parsedStep = parseRsvpStepQueryValue(stepQueryValue);
    setStep((currentStep) => (currentStep === parsedStep ? currentStep : parsedStep));

    if (stepQueryValue !== getRsvpStepQueryValue(parsedStep)) {
      replaceStepInUrl(parsedStep);
    }
  }, [isFullForm, replaceStepInUrl, stepQueryValue]);

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
      attendees: 1,
      attendanceStatus: "yes",
    },
  });

  // Prefill from existing RSVP data and Clerk profile
  useEffect(() => {
    if (!event) return;
    if (!firstName && !lastName) {
      let first = "";
      let last = "";
      let fullName = "";

      if (userDoc?.firstName || userDoc?.lastName) {
        first = userDoc.firstName || "";
        last = userDoc.lastName || "";
        fullName = `${first} ${last}`.trim();
      } else if (user?.firstName || user?.lastName) {
        first = user.firstName || "";
        last = user.lastName || "";
        fullName = user.fullName || `${first} ${last}`.trim();
      }

      if (first || last) {
        setFirstName(first);
        setLastName(last);
        setName(fullName);
      }
    }

    if (event?.customFields?.length) {
      setCustom((prev) => {
        const next = { ...prev } as Record<string, string>;
        for (const customField of event.customFields || []) {
          const key = customField.key;
          const existing = next[key];
          if (existing) continue;
          const fromStatus = status?.customFieldValues?.[key];
          if (fromStatus) {
            next[key] = fromStatus;
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
          if (nextSocialProfiles[platform.platformKey]) continue;
          const fromStatus = status?.socialProfiles?.find(
            (profile) => profile.platformKey === platform.platformKey,
          )?.handle;
          const fromProfile = userSocialProfiles?.find(
            (profile) => profile.platformKey === platform.platformKey,
          )?.handle;
          const value = fromStatus ?? fromProfile;
          if (value) {
            nextSocialProfiles[platform.platformKey] = value;
          }
        }
        return nextSocialProfiles;
      });
    }
    if (!invitedByName && status?.invitedByName) {
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

  const phone = useMemo(() => {
    const clerkUser = user as ClerkUser | undefined;
    return (
      (clerkUser?.primaryPhoneNumber?.phoneNumber || clerkUser?.phoneNumbers?.[0]?.phoneNumber) ??
      ""
    );
  }, [user]);

  const deniedForThisList = useMemo(() => {
    const effectiveListKey = listKey ?? resolvedListKey;
    return status?.status === "denied" && !!effectiveListKey && status.listKey === effectiveListKey;
  }, [status?.status, status?.listKey, listKey, resolvedListKey]);

  const handleSmsConsentChange = React.useCallback(
    async (checked: boolean | "indeterminate") => {
      const isEnabled = checked === true;
      setSmsConsentEnabled(isEnabled);
      if (isEnabled) {
        setHasAcknowledgedSmsOptOutPrompt(false);
        if (!smsConsentIpAddress) {
          const ipAddress = await fetchSmsConsentIpAddress();
          if (ipAddress) {
            setSmsConsentIpAddress(ipAddress);
          }
        }
      } else {
        setHasAcknowledgedSmsOptOutPrompt(false);
      }
    },
    [smsConsentIpAddress],
  );

  const performSubmission = async (
    options: { smsConsentOverride?: boolean; smsConsentIpAddressOverride?: string } = {},
  ) => {
    try {
      setMessage("");
      const eventCustomFields: CustomField[] = event?.customFields ?? [];
      const eventSocialPlatforms = event.primaryFieldConfig?.socialPlatforms ?? [];
      const invitedByConfig = event.primaryFieldConfig?.invitedBy;
      const errs = [
        ...validateRequiredWithFirstName(
          firstName,
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
      if (!phone) {
        setMessage("Add a phone in your profile.");
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
      await updateProfileMeta({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
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
      await upsertContact({ phone: phone || undefined });

      const effectiveSmsConsentEnabled = options.smsConsentOverride ?? smsConsentEnabled;
      let consentIpAddress = options.smsConsentIpAddressOverride ?? smsConsentIpAddress;
      if (effectiveSmsConsentEnabled && !consentIpAddress) {
        consentIpAddress = await fetchSmsConsentIpAddress();
        if (consentIpAddress) {
          setSmsConsentIpAddress(consentIpAddress);
        }
      }

      const collectedArgs: RsvpCollectedArgs = {
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
        ...collectedArgs,
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
    if (!smsConsentEnabled && !hasAcknowledgedSmsOptOutPrompt) {
      setSmsConsentDialogMode("encourage");
      return;
    }
    await performSubmission();
  };

  const goBack = () => {
    setMessage("");
    if (step <= 1) return;
    const previousStep = (step - 1) as RsvpStepNumber;
    setStep(previousStep);
    replaceStepInUrl(previousStep);
  };

  const goNext = async () => {
    setMessage("");
    if (step === 1) {
      const valid = await form.trigger(["firstName", "lastName"]);
      if (!valid) return;
      if (!firstName.trim()) {
        form.setError("firstName", {
          type: "required",
          message: "First name is required",
        });
        return;
      }
      if (!phone) {
        const phoneError = "Add a phone number to your profile to continue.";
        setMessage(phoneError);
        toast.error(phoneError);
        return;
      }
      setStep(2);
      replaceStepInUrl(2);
      return;
    }
    if (step === 2) {
      const eventCustomFields: CustomField[] = event?.customFields ?? [];
      const eventSocialPlatforms = event.primaryFieldConfig?.socialPlatforms ?? [];
      const invitedByConfig = event.primaryFieldConfig?.invitedBy;
      const errs = [
        ...validateRequiredWithFirstName(
          firstName,
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
      // Drop the first-name error from step 2 — it was caught on step 1.
      const stepErrs = errs.filter(
        (errorMessage) => !errorMessage.toLowerCase().includes("first name"),
      );
      if (stepErrs.length) {
        for (const customField of eventCustomFields) {
          const label = customField.label || customField.key;
          const errorMessage = `${label} is required`;
          if (stepErrs.includes(errorMessage)) {
            const fieldPath = `custom.${customField.key}` as Path<RSVPFormData>;
            form.setError(fieldPath, {
              type: "required",
              message: errorMessage,
            });
          }
        }
        for (const platform of eventSocialPlatforms) {
          const errorMessage = `${platform.label} is required`;
          if (stepErrs.includes(errorMessage)) {
            const fieldPath = `socialProfiles.${platform.platformKey}` as Path<RSVPFormData>;
            form.setError(fieldPath, {
              type: "required",
              message: errorMessage,
            });
          }
        }
        if (invitedByConfig?.enabled === true) {
          const errorMessage = `${invitedByConfig.label ?? "Invited by"} is required`;
          if (stepErrs.includes(errorMessage)) {
            form.setError("invitedByName", {
              type: "required",
              message: errorMessage,
            });
          }
        }
        const summary = stepErrs.join("\n");
        setMessage(summary);
        toast.error("Missing required fields", { description: summary });
        return;
      }
      setStep(3);
      replaceStepInUrl(3);
    }
  };

  const handleEncourageEnable = async () => {
    setSmsConsentEnabled(true);
    setHasAcknowledgedSmsOptOutPrompt(false);
    let consentIpAddress = smsConsentIpAddress;
    if (!consentIpAddress) {
      consentIpAddress = await fetchSmsConsentIpAddress();
      if (consentIpAddress) {
        setSmsConsentIpAddress(consentIpAddress);
      }
    }
    setSmsConsentDialogMode(null);
    await performSubmission({
      smsConsentOverride: true,
      smsConsentIpAddressOverride: consentIpAddress,
    });
  };

  const handleEncourageContinue = async () => {
    setHasAcknowledgedSmsOptOutPrompt(true);
    setSmsConsentDialogMode(null);
    await performSubmission();
  };

  useEffect(() => {
    if (!status) return;
    if (!hasInitializedSmsConsent && status.smsConsent !== undefined) {
      setSmsConsentEnabled(status.smsConsent);
      setHasInitializedSmsConsent(true);
    }
    if (status.smsConsent === true) {
      setHasAcknowledgedSmsOptOutPrompt(false);
    }
    if (status.smsConsent === false) {
      setHasAcknowledgedSmsOptOutPrompt(true);
    }
    if (typeof status.smsConsentIpAddress === "string" && status.smsConsentIpAddress.length > 0) {
      setSmsConsentIpAddress(status.smsConsentIpAddress);
    }
  }, [status, hasInitializedSmsConsent]);

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFullForm && step < 3) {
      void goNext();
      return;
    }
    void form.handleSubmit(onSubmit)(event);
  };

  const isFinalStep = isFullForm || step === 3;
  const showGuestInfoFields = isFullForm || step !== 3;
  const guestInfoStep = isFullForm ? undefined : step === 1 || step === 2 ? step : undefined;
  const showSubmitButton = isFullForm || step === 3;

  return (
    <>
      <Form {...form}>
        <form onSubmit={handleFormSubmit} className="space-y-3">
          {showGuestInfoFields ? (
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
              phone={phone}
              openUserProfile={openUserProfile}
              isSignedIn={!!user}
              step={guestInfoStep}
            />
          ) : null}

          {isFinalStep ? (
            <>
              {event.attendanceQuestionEnabled ? (
                <fieldset className="space-y-2 border border-primary/20 p-3">
                  <legend className="px-1 text-sm font-medium text-primary">Attending?</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {ATTENDANCE_STATUS_OPTIONS.map((attendanceStatusOption) => {
                      const selected = attendanceStatus === attendanceStatusOption;
                      return (
                        <button
                          key={attendanceStatusOption}
                          type="button"
                          onClick={() => setAttendanceStatus(attendanceStatusOption)}
                          className="px-3 py-2 text-sm uppercase"
                          style={{
                            ...ghostButtonStyle,
                            background: selected ? "var(--tt-fg)" : "transparent",
                            color: selected ? "var(--tt-bg)" : "var(--tt-fg)",
                          }}
                        >
                          {getAttendanceStatusLabel(attendanceStatusOption)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              <NoteForHostsField note={note} setNote={setNote} />

              {hasPasswordList ? (
                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="rsvp-access-password"
                      className="text-xs font-medium text-primary"
                    >
                      PASSWORD{" "}
                      <span className="text-primary/70">
                        {hasNoPasswordList ? "(optional)" : "(required)"}
                      </span>
                    </label>
                    {searchStatus === "miss-no-fallback" ? (
                      <span className="text-[11px] font-medium text-destructive">
                        Not recognized
                      </span>
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
                        <Badge
                          variant="success"
                          className="gap-1"
                          style={{ letterSpacing: "0.05em" }}
                        >
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

              <div className="flex flex-col items-start gap-3 pt-2">
                <label
                  htmlFor="sms-opt-in"
                  className="flex max-w-xl items-start gap-2 text-sm text-foreground"
                >
                  <input
                    id="sms-opt-in"
                    type="checkbox"
                    checked={smsConsentEnabled}
                    onChange={(e) => handleSmsConsentChange(e.target.checked)}
                    className="mt-1"
                  />
                  {/*
                  <Checkbox
                    id="sms-opt-in"
                    checked={smsConsentEnabled}
                    onCheckedChange={handleSmsConsentChange}
                    className="mt-0.5"
                  />
                  */}
                  <span className="flex flex-col gap-0.5 text-left">
                    <span className="text-sm font-medium text-foreground">
                      I consent to receive SMS messages from {smsSenderDisplayName}.
                    </span>
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      RSVP updates, reminders, and offers via SMS. Sent by Coucou on behalf of{" "}
                      {smsSenderDisplayName} using Club Chlorine. Msg &amp; data rates may apply.
                      Reply STOP to cancel. Consent not required for purchase.{" "}
                      <a href="/terms" className="underline">
                        Terms
                      </a>{" "}
                      &amp;{" "}
                      <a href="/privacy" className="underline">
                        Privacy
                      </a>
                      .
                    </span>
                  </span>
                </label>
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-3">
            {!isFullForm && step > 1 ? (
              <button
                type="button"
                onClick={goBack}
                className="text-[12px] underline underline-offset-4"
                style={{ color: "var(--tt-fg-dim)" }}
              >
                Back
              </button>
            ) : (
              <Link
                href={buildEventDetailPathWithPreservedQuery(publicEventRouteId, searchParams)}
                className="text-[12px] underline underline-offset-4"
                style={{ color: "var(--tt-fg-dim)" }}
              >
                Back
              </Link>
            )}

            {!showSubmitButton ? (
              <TenantButton type="submit" style={ghostButtonStyle}>
                Continue
              </TenantButton>
            ) : (
              <TenantButton
                type="submit"
                style={ghostButtonStyle}
                disabled={
                  submitting ||
                  !phone ||
                  deniedForThisList ||
                  searchStatus === "searching" ||
                  !resolvedListKey ||
                  form.formState.isSubmitting
                }
              >
                {submitting ? "Submitting…" : submitLabel}
              </TenantButton>
            )}
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

      <AlertDialog
        open={smsConsentDialogMode === "encourage"}
        onOpenChange={(open) => {
          if (!open) setSmsConsentDialogMode(null);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader className="space-y-3 text-left">
            <AlertDialogTitle className="text-lg font-semibold text-foreground break-words">
              Get Event Updates by SMS
            </AlertDialogTitle>
            <p className="text-sm text-foreground break-words">
              Turn on SMS updates and we will text you the moment your RSVP status changes, so you
              never have to refresh this page to see if you are approved.
            </p>
            <AlertDialogDescription className="text-[10px] leading-tight text-muted-foreground break-words">
              RSVP updates, reminders, and offers via SMS. Sent by Coucou on behalf of{" "}
              {smsSenderDisplayName} using Club Chlorine. Msg &amp; data rates may apply. Reply STOP
              to cancel. Consent not required for purchase.{" "}
              <a href="/terms" className="break-words underline">
                Terms
              </a>{" "}
              &amp;{" "}
              <a href="/privacy" className="break-words underline">
                Privacy
              </a>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <AlertDialogCancel
              type="button"
              onClick={() => setSmsConsentDialogMode(null)}
              className="w-full order-2 sm:order-1 sm:w-auto"
            >
              Back
            </AlertDialogCancel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AlertDialogAction
                type="button"
                onClick={handleEncourageContinue}
                className="order-2 w-full border border-input bg-background text-primary hover:bg-accent hover:text-accent-foreground sm:w-auto"
              >
                No SMS
              </AlertDialogAction>
              <AlertDialogAction
                type="button"
                onClick={handleEncourageEnable}
                className="order-1 w-full sm:w-auto"
              >
                Enable SMS
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {user ? (
        <div style={{ display: "none" }}>
          <UserProfile routing="hash" />
        </div>
      ) : null}

      {submitting ? (
        <div className="pt-4">
          <Spinner />
        </div>
      ) : null}
    </>
  );
}
