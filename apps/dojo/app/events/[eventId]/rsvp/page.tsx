"use client";
import { UserProfile, useClerk, useUser } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { REFERRAL_QUERY_PARAM } from "@coucou/sdk/shared/event-routes";
import { resolveQrCodeColors } from "@coucou/sdk/shared/qr-code-colors";
import { useAction, useMutation, useQuery } from "convex/react";
import { QrCode, ToggleLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { use, useEffect, useMemo, useState } from "react";
import { type Path, useForm } from "react-hook-form";
import QRCode from "react-qr-code";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Form } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { resolveEventMessagingBrandName } from "@/lib/event-display";
import { validateRequiredPrimaryFields, validateRequiredWithFirstName } from "@/lib/mini-zod";
import { siteConfiguration } from "@/lib/site";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";
import {
  type ApplicationError,
  type ClerkUser,
  type CustomField,
  type Event,
  type RSVPFormData,
  type User,
} from "@/lib/types";

type AttendanceStatusOption = "yes" | "no" | "maybe";

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

export default function RsvpPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventRouteId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { openUserProfile } = useClerk();

  const status = useQuery(api.rsvps.statusForUserEventByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  });
  const event = useQuery(api.events.getByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  });
  const canonicalEventId = event?._id;
  const userDoc = useQuery(
    api.users.getByClerkUser,
    user?.id ? { clerkUserId: user.id } : "skip",
  ) as User | undefined;
  const userSocialProfiles = useQuery(
    api.socialProfiles.listForCurrentUser,
    user?.id ? {} : "skip",
  ) as Array<{ platformKey: string; handle: string }> | undefined;
  const myRedemption = useQuery(
    api.redemptions.forCurrentUserEvent,
    canonicalEventId && status?.status === "approved"
      ? {
          eventId: canonicalEventId as Id<"events">,
          siteKey: siteConfiguration.siteKey,
        }
      : "skip",
  );

  const password = (searchParams?.get("password") || "").trim();
  const [listKey, setListKey] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [socialProfiles, setSocialProfiles] = useState<Record<string, string>>({});
  const [invitedByName, setInvitedByName] = useState<string>("");
  const [note, setNote] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatusOption>("yes");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [smsConsentEnabled, setSmsConsentEnabled] = useState<boolean>(false);
  const [hasInitializedSmsConsent, setHasInitializedSmsConsent] = useState<boolean>(false);
  const [smsConsentIpAddress, setSmsConsentIpAddress] = useState<string | undefined>(undefined);
  const [hasConfirmedSmsOptIn, setHasConfirmedSmsOptIn] = useState<boolean>(false);
  const [hasAcknowledgedSmsOptOutPrompt, setHasAcknowledgedSmsOptOutPrompt] =
    useState<boolean>(false);
  const [smsConsentDialogMode, setSmsConsentDialogMode] = useState<"confirm" | "encourage" | null>(
    null,
  );
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
  const { foregroundColor: qrForegroundColor, backgroundColor: qrBackgroundColor } =
    resolveQrCodeColors({
      foregroundColor: event?.themeTextColor,
      backgroundColor: event?.themeBackgroundColor,
    });

  const resolve = useAction(api.credentialsNode.resolveListByPassword);
  const upsertContact = useMutation(api.users.upsertContactPhone);
  const submitRsvp = useMutation(api.rsvps.submitRequest);
  const [_fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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

  // Resolve list by password (empty password falls through to a no-password
  // list when the event has one, otherwise surfaces an error message).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!canonicalEventId) return;
        setChecking(true);
        const res = await resolve({
          eventId: canonicalEventId as Id<"events">,
          password: password ?? "",
          siteKey: siteConfiguration.siteKey,
        });
        if (!cancelled) {
          if (res?.ok) {
            setListKey(res.listKey);
          } else if (password) {
            setMessage("Invalid password for this event.");
          } else {
            router.replace(`/events/${eventRouteId}`);
          }
        }
      } catch (error: unknown) {
        const errorDetails = error as ApplicationError | Error;
        if (!cancelled) setMessage(errorDetails?.message || "Error validating password");
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [password, canonicalEventId, eventRouteId, resolve, router]);

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

  // Sync RHF form values from local state for name/custom
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

  // Prefill from Clerk profile
  const phone = useMemo(() => {
    const clerkUser = user as ClerkUser | undefined;
    return (
      (clerkUser?.primaryPhoneNumber?.phoneNumber || clerkUser?.phoneNumbers?.[0]?.phoneNumber) ??
      ""
    );
  }, [user]);

  const deniedForThisList = useMemo(() => {
    return status?.status === "denied" && !!listKey && status.listKey === listKey;
  }, [status?.status, status?.listKey, listKey]);

  const handleSmsConsentChange = React.useCallback(
    async (checked: boolean | "indeterminate") => {
      const isEnabled = checked === true;
      setSmsConsentEnabled(isEnabled);
      if (isEnabled) {
        setHasConfirmedSmsOptIn(false);
        setHasAcknowledgedSmsOptOutPrompt(false);
        if (!smsConsentIpAddress) {
          const ipAddress = await fetchSmsConsentIpAddress();
          if (ipAddress) {
            setSmsConsentIpAddress(ipAddress);
          }
        }
      } else {
        setHasConfirmedSmsOptIn(false);
        setHasAcknowledgedSmsOptOutPrompt(false);
      }
    },
    [smsConsentIpAddress],
  );

  const updateProfileMeta = useMutation(api.users.updateProfileMeta);
  const performSubmission = async () => {
    try {
      setMessage("");
      if (!listKey) {
        setMessage("Missing list access. Please re-enter your password.");
        return;
      }
      const eventCustomFields: CustomField[] = event?.customFields ?? [];
      const eventSocialPlatforms = event?.primaryFieldConfig?.socialPlatforms ?? [];
      const invitedByConfig = event?.primaryFieldConfig?.invitedBy;
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
        const perField: Record<string, string> = {};
        for (const e of errs) {
          if (e.toLowerCase().includes("first name")) {
            perField.firstName = e;
            form.setError("firstName", { type: "required", message: e });
          }
          if (e.toLowerCase().includes("last name")) {
            perField.lastName = e;
            form.setError("lastName", { type: "required", message: e });
          }
        }
        for (const customField of eventCustomFields) {
          const label = customField.label || customField.key;
          const message = `${label} is required`;
          if (errs.includes(message)) {
            const fieldPath = `custom.${customField.key}` as Path<RSVPFormData>;
            form.setError(fieldPath, {
              type: "required",
              message,
            });
          }
        }
        for (const platform of eventSocialPlatforms) {
          const message = `${platform.label} is required`;
          if (errs.includes(message)) {
            const fieldPath = `socialProfiles.${platform.platformKey}` as Path<RSVPFormData>;
            form.setError(fieldPath, {
              type: "required",
              message,
            });
          }
        }
        if (invitedByConfig?.enabled === true) {
          const message = `${invitedByConfig.label ?? "Invited by"} is required`;
          if (errs.includes(message)) {
            form.setError("invitedByName", {
              type: "required",
              message,
            });
          }
        }
        setFieldErrors(perField);
        const message = errs.join("\n");
        setMessage(message);
        toast.error("Missing required fields", { description: message });
        return;
      }
      if (!phone) {
        setMessage("Add a phone in your profile.");
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
      await upsertContact({
        phone: phone || undefined,
      });

      let consentIpAddress = smsConsentIpAddress;
      if (smsConsentEnabled && !consentIpAddress) {
        consentIpAddress = await fetchSmsConsentIpAddress();
        if (consentIpAddress) {
          setSmsConsentIpAddress(consentIpAddress);
        }
      }

      if (!canonicalEventId) {
        setMessage("Event not found.");
        return;
      }
      await submitRsvp({
        eventId: canonicalEventId as Id<"events">,
        siteKey: siteConfiguration.siteKey,
        listKey,
        note: note || undefined,
        shareContact: true,
        attendees: form.getValues("attendees") || 1,
        attendanceStatus: event?.attendanceQuestionEnabled ? attendanceStatus : "yes",
        smsConsent: smsConsentEnabled,
        smsConsentIpAddress: smsConsentEnabled && consentIpAddress ? consentIpAddress : undefined,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        customFields: filteredCustomFields,
        socialProfiles: (event?.primaryFieldConfig?.socialPlatforms ?? [])
          .map((platform) => ({
            platformKey: platform.platformKey,
            handle: socialProfiles[platform.platformKey]?.trim() ?? "",
          }))
          .filter((profile) => profile.handle.length > 0),
        invitedByName:
          event?.primaryFieldConfig?.invitedBy?.enabled === true ? invitedByName.trim() : undefined,
        referralCode: searchParams?.get(REFERRAL_QUERY_PARAM) ?? undefined,
      });

      toast.success("RSVP submitted");
      const statusSearchParams = new URLSearchParams(searchParams?.toString());
      statusSearchParams.delete("password");
      const statusQueryString = statusSearchParams.toString();
      router.replace(
        `/events/${eventRouteId}/status${statusQueryString ? `?${statusQueryString}` : ""}`,
      );
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      const message = errorDetails?.message || "Failed to submit request";
      setMessage(message);

      toast.error("Request failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async () => {
    if (smsConsentEnabled) {
      if (!hasConfirmedSmsOptIn) {
        setSmsConsentDialogMode("confirm");
        return;
      }
    } else if (!hasAcknowledgedSmsOptOutPrompt) {
      setSmsConsentDialogMode("encourage");
      return;
    }
    await performSubmission();
  };

  const handleConfirmSmsOptIn = async () => {
    setHasConfirmedSmsOptIn(true);
    setSmsConsentDialogMode(null);
    await performSubmission();
  };

  const handleEncourageEnable = async () => {
    await handleSmsConsentChange(true);
    setSmsConsentDialogMode("confirm");
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
      setHasConfirmedSmsOptIn(true);
      setHasAcknowledgedSmsOptOutPrompt(false);
    }
    if (status.smsConsent === false) {
      setHasAcknowledgedSmsOptOutPrompt(true);
      setHasConfirmedSmsOptIn(false);
    }
    if (typeof status.smsConsentIpAddress === "string" && status.smsConsentIpAddress.length > 0) {
      setSmsConsentIpAddress(status.smsConsentIpAddress);
    }
  }, [status, hasInitializedSmsConsent]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      {!event ? (
        <div className="flex items-center justify-center py-10 text-primary">
          <Spinner />
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-6 text-center animate-in fade-in">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold text-primary">RSVP</h1>
            <p className="text-sm text-primary/70">{event?.name ?? ""}</p>
            {listKey && (
              <div className="text-xs text-primary/70">
                Guest list: <span className="font-medium">{listKey}</span>
              </div>
            )}
          </header>

          {checking ? (
            <div className="flex justify-center m-auto text-sm text-primary">
              <Spinner />
            </div>
          ) : listKey ? (
            <section className="space-y-3 text-left mx-auto max-w-xl">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <GuestInfoFields
                    form={form}
                    event={event as Event}
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
                  />

                  {event.attendanceQuestionEnabled ? (
                    <fieldset className="space-y-2 rounded border border-primary/20 p-3">
                      <legend className="px-1 text-sm font-medium text-primary">Attending?</legend>
                      <div className="grid grid-cols-3 gap-2">
                        {ATTENDANCE_STATUS_OPTIONS.map((attendanceStatusOption) => (
                          <Button
                            key={attendanceStatusOption}
                            type="button"
                            variant={
                              attendanceStatus === attendanceStatusOption ? "default" : "outline"
                            }
                            className="h-9"
                            onClick={() => setAttendanceStatus(attendanceStatusOption)}
                          >
                            {getAttendanceStatusLabel(attendanceStatusOption)}
                          </Button>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  <NoteForHostsField note={note} setNote={setNote} />
                  <div className="flex flex-col items-center gap-2">
                    <label
                      htmlFor="sms-opt-in"
                      className="flex items-start gap-2 text-sm text-primary max-w-xl"
                    >
                      <Checkbox
                        id="sms-opt-in"
                        checked={smsConsentEnabled}
                        onCheckedChange={handleSmsConsentChange}
                        className="mt-0.5"
                      />
                      <span className="flex flex-col text-left gap-0.5">
                        <span className="font-medium text-primary text-sm">
                          I consent to receive SMS messages from {smsSenderDisplayName}.
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          RSVP updates, reminders, and offers via SMS. Sent by Coucou on behalf of{" "}
                          {smsSenderDisplayName} using Dojo Pomodoro. Msg & data rates may apply.
                          Reply STOP to cancel. Consent not required for purchase.{" "}
                          <a href="/terms" className="underline">
                            Terms
                          </a>{" "}
                          &{" "}
                          <a href="/privacy" className="underline">
                            Privacy
                          </a>
                          .
                        </span>
                      </span>
                    </label>
                    <Button
                      type="submit"
                      disabled={
                        submitting || !phone || deniedForThisList || form.formState.isSubmitting
                      }
                    >
                      {submitting ? "Submitting…" : "Submit Request"}
                    </Button>
                  </div>
                </form>
              </Form>
              <AlertDialog
                open={smsConsentDialogMode === "confirm"}
                onOpenChange={(open) => {
                  if (!open) setSmsConsentDialogMode(null);
                }}
              >
                <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-lg">Confirm SMS Updates</AlertDialogTitle>
                    <AlertDialogDescription className="text-[11px] leading-tight break-words">
                      RSVP updates, reminders, and offers via SMS. Sent by Coucou on behalf of{" "}
                      {smsSenderDisplayName} using Dojo Pomodoro. Msg & data rates may apply. Reply
                      STOP to cancel. Consent not required for purchase.{" "}
                      <a href="/terms" className="underline break-words">
                        Terms
                      </a>{" "}
                      &{" "}
                      <a href="/privacy" className="underline break-words">
                        Privacy
                      </a>
                      .
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex flex-col sm:items-center sm:justify-center">
                    <AlertDialogAction
                      type="button"
                      onClick={handleConfirmSmsOptIn}
                      className="w-full sm:w-auto sm:order-2"
                    >
                      I Consent to SMS
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

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
                      Turn on SMS updates and we will text you the moment your RSVP status changes,
                      so you never have to refresh this page to see if you are approved.
                    </p>
                    <AlertDialogDescription className="text-[10px] leading-tight text-muted-foreground break-words">
                      RSVP updates, reminders, and offers via SMS. Sent by Coucou on behalf of{" "}
                      {smsSenderDisplayName} using Dojo Pomodoro. Msg & data rates may apply. Reply
                      STOP to cancel. Consent not required for purchase.{" "}
                      <a href="/terms" className="underline break-words">
                        Terms
                      </a>{" "}
                      &{" "}
                      <a href="/privacy" className="underline break-words">
                        Privacy
                      </a>
                      .
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                    <AlertDialogCancel
                      type="button"
                      onClick={() => setSmsConsentDialogMode(null)}
                      className="w-full sm:w-auto order-2 sm:order-1"
                    >
                      Back
                    </AlertDialogCancel>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <AlertDialogAction
                        type="button"
                        onClick={handleEncourageContinue}
                        className="w-full sm:w-auto border border-input bg-background text-primary hover:bg-accent hover:text-accent-foreground order-2"
                      >
                        No SMS
                      </AlertDialogAction>
                      <AlertDialogAction
                        type="button"
                        onClick={handleEncourageEnable}
                        className="w-full sm:w-auto order-1"
                      >
                        Enable SMS
                      </AlertDialogAction>
                    </div>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {deniedForThisList && (
                <div className="text-sm text-red-500">
                  You were denied for this list. Try another password.
                </div>
              )}
              {message && <div className="text-sm text-red-500">{message}</div>}

              {/* QR Code and Redemption Status Context Menu - only show if approved */}
              {status?.status === "approved" && myRedemption && (
                <div className="rounded border border-primary/20 p-3 space-y-2 mt-4">
                  <div className="font-medium text-sm text-primary">Ticket Management</div>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <QrCode className="w-4 h-4 mr-2" />
                        Right-click for options
                      </Button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      <ContextMenuItem onClick={() => setShowQRCode(!showQRCode)}>
                        <QrCode className="w-4 h-4 mr-2" />
                        {showQRCode ? "Hide" : "Show"} QR Code
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <ToggleLeft className="w-4 h-4 mr-2" />
                          Redemption Status
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          <ContextMenuItem disabled>
                            <span className="text-sm font-medium">Current: Issued</span>
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem disabled>
                            <span className="text-xs text-muted-foreground">
                              Status managed by hosts
                            </span>
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    </ContextMenuContent>
                  </ContextMenu>

                  {/* QR Code Display */}
                  {showQRCode && myRedemption && (
                    <div className="flex flex-col items-center gap-2 pt-2">
                      <QRCode
                        value={`${window.location.origin}/redeem/${myRedemption.code}`}
                        size={240}
                        fgColor={qrForegroundColor}
                        bgColor={qrBackgroundColor}
                      />
                      <div className="text-xs text-primary/80 text-center">
                        Show this QR code at the door
                      </div>
                      <div className="text-xs text-primary/60 text-center">
                        List: {myRedemption.listKey?.toUpperCase() || "N/A"}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            <div className="text-sm text-red-500">{message || "Access denied"}</div>
          )}
        </div>
      )}
      {/* Hidden UserProfile component for Clerk modal functionality - only render when signed in */}
      {user && (
        <div style={{ display: "none" }}>
          <UserProfile />
        </div>
      )}
    </main>
  );
}
