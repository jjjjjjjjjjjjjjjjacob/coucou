"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { resolveEventMessagingBrandName } from "@/lib/event-display";
import { siteConfiguration } from "@/lib/site";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";
import { EyebrowPill, RsvpPending } from "@coucou/ui/tenant-template";

export default function StatusPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const updateSmsPreference = useMutation(api.rsvps.updateSmsPreference);
  const [isUpdatingSmsPreference, setIsUpdatingSmsPreference] = useState(false);
  const [smsConsentIpAddress, setSmsConsentIpAddress] = useState<
    string | undefined
  >(undefined);

  const statusQuery = useQuery(
    convexQuery(
      api.rsvps.statusForUserEvent,
      isLoaded && isSignedIn
        ? {
            eventId: eventId as Id<"events">,
            siteKey: siteConfiguration.siteKey,
          }
        : "skip",
    ),
  );
  const eventQuery = useQuery(
    convexQuery(api.events.get, {
      eventId: eventId as Id<"events">,
      siteKey: siteConfiguration.siteKey,
    }),
  );

  const status = statusQuery.data;
  const event = eventQuery.data;

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
    [
      event?.hosts,
      event?.name,
      event?.secondaryTitle,
      event?.productionCompany,
    ],
  );

  const guestPortalImageResponse = useConvexQuery(
    api.files.getUrl,
    event?.guestPortalImageStorageId
      ? { storageId: event.guestPortalImageStorageId as Id<"_storage"> }
      : "skip",
  );
  const guestPortalLinkLabel = event?.guestPortalLinkLabel?.trim() ?? "";
  const guestPortalLinkUrl = event?.guestPortalLinkUrl?.trim() ?? "";
  const shouldShowGuestLink =
    guestPortalLinkLabel.length > 0 && guestPortalLinkUrl.length > 0;
  const guestPortalImageUrl = guestPortalImageResponse?.url ?? null;

  useEffect(() => {
    if (
      typeof status?.smsConsentIpAddress === "string" &&
      status.smsConsentIpAddress.length > 0
    ) {
      setSmsConsentIpAddress(status.smsConsentIpAddress);
    }
  }, [status?.smsConsentIpAddress]);

  // Auto-redirect on terminal RSVP states.
  useEffect(() => {
    if (!status) return;
    if (status.status === "approved" || status.status === "attending") {
      router.replace(`/events/${eventId}/ticket`);
    }
    if (status.status === "denied") {
      router.replace(`/events/${eventId}/denied`);
    }
  }, [status, eventId, router]);

  const handleSmsPreferenceChange = async (desiredSmsConsent: boolean) => {
    if (!status?.rsvpId) return;
    try {
      setIsUpdatingSmsPreference(true);
      let consentIpAddress = smsConsentIpAddress;
      if (desiredSmsConsent && !consentIpAddress) {
        consentIpAddress = await fetchSmsConsentIpAddress();
        if (consentIpAddress) {
          setSmsConsentIpAddress(consentIpAddress);
        }
      }
      await updateSmsPreference({
        rsvpId: status.rsvpId as Id<"rsvps">,
        smsConsent: desiredSmsConsent,
        smsConsentIpAddress:
          desiredSmsConsent && consentIpAddress ? consentIpAddress : undefined,
      });
      await statusQuery.refetch();
      toast.success(
        desiredSmsConsent
          ? `SMS updates from ${smsSenderDisplayName} enabled.`
          : `SMS from ${smsSenderDisplayName} disabled.`,
      );
    } catch (error) {
      const errorDetails = error as Error;
      toast.error(
        errorDetails.message ||
          (desiredSmsConsent
            ? "Failed to enable SMS notifications."
            : "Failed to disable SMS notifications."),
      );
    } finally {
      setIsUpdatingSmsPreference(false);
    }
  };

  if (!isLoaded || eventQuery.isLoading || statusQuery.isLoading || !event) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Spinner />
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center text-red-500">
          <p>Please sign in to view your RSVP status.</p>
        </div>
      </main>
    );
  }

  // No request on file — direct user back to RSVP entry.
  if (!status?.status) {
    return (
      <div className="mx-auto w-full max-w-[384px]">
        <RsvpPending
          eyebrow="Status"
          eyebrowTrailing={
            <EyebrowPill
              href={`/events/${eventId}`}
              linkComponent={Link}
            >
              ← Back to event
            </EyebrowPill>
          }
          heading="No request on file."
          description="It looks like you haven't sent in a request yet. Head back and enter your password."
          statusLabel="Awaiting"
          noShell
        />
      </div>
    );
  }

  // We're here only when status.status === "pending" — terminal states have
  // already redirected above.
  return (
    <div className="mx-auto w-full max-w-[384px]">
      <RsvpPending
        noShell
        eyebrowTrailing={
          <EyebrowPill href={`/events/${eventId}`} linkComponent={Link}>
            ← Back to event
          </EyebrowPill>
        }
      description={
            <>
              {status.listKey ? (
                <div className="mb-3">
                  <Badge
                    variant="outline"
                    style={{ letterSpacing: "0.05em" }}
                  >
                    {status.listKey.toUpperCase()}
                  </Badge>
                </div>
              ) : null}
              Your request is{" "}
              <strong>pending host approval</strong>. You will receive
              instructions once approved. Approval is necessary to access the
              event.
            </>
          }
          extras={
          <div className="flex flex-col items-start gap-6 text-sm">
            {(guestPortalImageUrl || shouldShowGuestLink) && (
              <section
                className="w-full space-y-3"
                style={{
                  background: "transparent",
                }}
              >
                {guestPortalImageUrl && (
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={guestPortalImageUrl}
                      alt={
                        event?.name
                          ? `${event.name} guest info`
                          : "Event guest information"
                      }
                      className="max-h-64 w-full rounded-md object-cover"
                    />
                  </div>
                )}
                {shouldShowGuestLink && (
                  <div className="flex justify-center">
                    <Button asChild variant="outline">
                      <a
                        href={guestPortalLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium"
                      >
                        {guestPortalLinkLabel}
                      </a>
                    </Button>
                  </div>
                )}
              </section>
            )}

            <div className="flex flex-col gap-3">
              {status.smsConsent ? (
                <div className="flex flex-col gap-3">
                  <div
                    className="flex items-center gap-2 text-sm font-medium"
                    style={{ color: "var(--tt-fg)" }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>SMS from {smsSenderDisplayName} enabled</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-w-[7rem]"
                    onClick={() => handleSmsPreferenceChange(false)}
                    disabled={
                      statusQuery.isLoading ||
                      statusQuery.isFetching ||
                      isUpdatingSmsPreference
                    }
                  >
                    {isUpdatingSmsPreference && (
                      <Spinner className="h-3.5 w-3.5" />
                    )}
                    SMS On
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div
                    className="flex items-center gap-2 text-sm font-medium"
                    style={{ color: "var(--tt-fg)" }}
                  >
                    <CircleDashed className="h-4 w-4" />
                    <span>SMS from {smsSenderDisplayName} disabled</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSmsPreferenceChange(true)}
                    disabled={
                      statusQuery.isLoading ||
                      statusQuery.isFetching ||
                      isUpdatingSmsPreference
                    }
                  >
                    {isUpdatingSmsPreference && (
                      <Spinner className="h-3.5 w-3.5" />
                    )}
                    Enable SMS Updates
                  </Button>
                </div>
              )}
              <p
                className="max-w-sm text-[10px] leading-tight"
                style={{ color: "var(--tt-fg-mute)" }}
              >
                RSVP updates, reminders, and offers via SMS. Sent by Coucou on
                behalf of {smsSenderDisplayName} using Club Chlorine. Msg &amp;
                data rates may apply. Reply STOP to cancel. Consent not
                required for purchase.{" "}
                <a href="/terms" className="underline">
                  Terms
                </a>{" "}
                &amp;{" "}
                <a href="/privacy" className="underline">
                  Privacy
                </a>
                .
              </p>
            </div>
          </div>
        }
      />
    </div>
    );
}
