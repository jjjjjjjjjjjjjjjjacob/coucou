"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useUser, useClerk, UserProfile } from "@clerk/nextjs";
import { useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Form } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
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
import { GuestInfoFields, NoteForHostsField } from "@/components/guest-info-form";
import { validateRequiredWithFirstName } from "@/lib/mini-zod";
import {
  Event,
  User,
  ClerkUser,
  RSVPFormData,
  CustomField,
  ApplicationError,
} from "@/lib/types";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";
import { resolveEventMessagingBrandName } from "@/lib/event-display";
import { siteConfiguration } from "@/lib/site";
import { TenantButton } from "@coucou/ui/tenant-template";

interface RsvpAcceptedFormProps {
  eventId: Id<"events">;
  event: Event;
  listKey: string;
}

export function RsvpAcceptedForm({
  eventId,
  event,
  listKey,
}: RsvpAcceptedFormProps) {
  const router = useRouter();
  const { user } = useUser();
  const { openUserProfile } = useClerk();

  const status = useQuery(api.rsvps.statusForUserEvent, {
    eventId,
    siteKey: siteConfiguration.siteKey,
  });
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
  const [socialProfiles, setSocialProfiles] = useState<Record<string, string>>(
    {},
  );
  const [invitedByName, setInvitedByName] = useState<string>("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [smsConsentEnabled, setSmsConsentEnabled] = useState<boolean>(false);
  const [hasInitializedSmsConsent, setHasInitializedSmsConsent] =
    useState<boolean>(false);
  const [smsConsentIpAddress, setSmsConsentIpAddress] = useState<
    string | undefined
  >(undefined);
  const [hasConfirmedSmsOptIn, setHasConfirmedSmsOptIn] =
    useState<boolean>(false);
  const [hasAcknowledgedSmsOptOutPrompt, setHasAcknowledgedSmsOptOutPrompt] =
    useState<boolean>(false);
  const [smsConsentDialogMode, setSmsConsentDialogMode] = useState<
    "confirm" | "encourage" | null
  >(null);

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

  const form = useForm<RSVPFormData>({
    defaultValues: {
      name: "",
      firstName: "",
      lastName: "",
      custom: {},
      socialProfiles: {},
      invitedByName: "",
      attendees: 1,
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
    const configuredSocialPlatforms =
      event.primaryFieldConfig?.socialPlatforms ?? [];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    event?.customFields,
    event?.primaryFieldConfig,
    status?.customFieldValues,
    status?.socialProfiles,
    status?.invitedByName,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name,
    firstName,
    lastName,
    invitedByName,
    JSON.stringify(custom),
    JSON.stringify(socialProfiles),
  ]);

  const phone = useMemo(() => {
    const clerkUser = user as ClerkUser | undefined;
    return (
      (clerkUser?.primaryPhoneNumber?.phoneNumber ||
        clerkUser?.phoneNumbers?.[0]?.phoneNumber) ??
      ""
    );
  }, [user]);

  const deniedForThisList = useMemo(() => {
    return (
      status?.status === "denied" && !!listKey && status.listKey === listKey
    );
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

  const performSubmission = async () => {
    try {
      setMessage("");
      const eventCustomFields: CustomField[] = event?.customFields ?? [];
      const errs = validateRequiredWithFirstName(
        firstName,
        custom,
        eventCustomFields.map((customField) => ({
          key: customField.key,
          label: customField.label || customField.key,
          required: customField.required,
        })),
      );
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
        const summary = errs.join("\n");
        setMessage(summary);
        toast.error("Missing required fields", { description: summary });
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
      const filteredCustomFields = eventCustomFields.reduce<
        Record<string, string>
      >((accumulator, customField) => {
        const value = custom[customField.key];
        if (value) {
          accumulator[customField.key] = value;
        }
        return accumulator;
      }, {});
      await upsertContact({ phone: phone || undefined });

      let consentIpAddress = smsConsentIpAddress;
      if (smsConsentEnabled && !consentIpAddress) {
        consentIpAddress = await fetchSmsConsentIpAddress();
        if (consentIpAddress) {
          setSmsConsentIpAddress(consentIpAddress);
        }
      }

      await submitRsvp({
        eventId,
        siteKey: siteConfiguration.siteKey,
        listKey,
        note: note || undefined,
        shareContact: true,
        attendees: form.getValues("attendees") || 1,
        smsConsent: smsConsentEnabled,
        smsConsentIpAddress:
          smsConsentEnabled && consentIpAddress ? consentIpAddress : undefined,
        customFields: filteredCustomFields,
        socialProfiles: (event.primaryFieldConfig?.socialPlatforms ?? [])
          .map((platform) => ({
            platformKey: platform.platformKey,
            handle: socialProfiles[platform.platformKey]?.trim() ?? "",
          }))
          .filter((profile) => profile.handle.length > 0),
        invitedByName:
          event.primaryFieldConfig?.invitedBy?.enabled === true
            ? invitedByName.trim()
            : undefined,
      });

      toast.success("RSVP submitted");
      router.replace(`/events/${eventId}/status`);
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      const errorMessage =
        errorDetails?.message || "Failed to submit request";
      setMessage(errorMessage);
      toast.error("Request failed", { description: errorMessage });
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
    if (
      typeof status.smsConsentIpAddress === "string" &&
      status.smsConsentIpAddress.length > 0
    ) {
      setSmsConsentIpAddress(status.smsConsentIpAddress);
    }
  }, [status, hasInitializedSmsConsent]);

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
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
          />

          <NoteForHostsField note={note} setNote={setNote} />

          <div className="flex flex-col items-start gap-3 pt-2">
            <label
              htmlFor="sms-opt-in"
              className="flex max-w-xl items-start gap-2 text-sm text-foreground"
            >
              <Checkbox
                id="sms-opt-in"
                checked={smsConsentEnabled}
                onCheckedChange={handleSmsConsentChange}
                className="mt-0.5"
              />
              <span className="flex flex-col gap-0.5 text-left">
                <span className="text-sm font-medium text-foreground">
                  I consent to receive SMS messages from {smsSenderDisplayName}.
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  RSVP updates, reminders, and offers via SMS. Sent by Coucou on
                  behalf of {smsSenderDisplayName} using Club Chlorine. Msg
                  &amp; data rates may apply. Reply STOP to cancel. Consent not
                  required for purchase.{" "}
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

            <div className="flex items-center gap-4 pt-2">
              <TenantButton
                type="submit"
                disabled={
                  submitting ||
                  !phone ||
                  deniedForThisList ||
                  form.formState.isSubmitting
                }
              >
                {submitting ? "Submitting…" : "Submit Request"}
              </TenantButton>
              <span
                className="text-[12px]"
                style={{ color: "var(--tt-fg-dim)" }}
              >
                You&apos;ll get a text the morning of.
              </span>
            </div>
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
        open={smsConsentDialogMode === "confirm"}
        onOpenChange={(open) => {
          if (!open) setSmsConsentDialogMode(null);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">
              Confirm SMS Updates
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] leading-tight break-words">
              RSVP updates, reminders, and offers via SMS. Sent by Coucou on
              behalf of {smsSenderDisplayName} using Club Chlorine. Msg &amp;
              data rates may apply. Reply STOP to cancel. Consent not required
              for purchase.{" "}
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
              Turn on SMS updates and we will text you the moment your RSVP
              status changes, so you never have to refresh this page to see if
              you are approved.
            </p>
            <AlertDialogDescription className="text-[10px] leading-tight text-muted-foreground break-words">
              RSVP updates, reminders, and offers via SMS. Sent by Coucou on
              behalf of {smsSenderDisplayName} using Club Chlorine. Msg &amp;
              data rates may apply. Reply STOP to cancel. Consent not required
              for purchase.{" "}
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
          <UserProfile />
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
