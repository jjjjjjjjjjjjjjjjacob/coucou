"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { EyebrowPill, RsvpPending } from "@coucou/ui/tenant-template";
import { useQuery } from "@tanstack/react-query";
import { useQuery as useConvexQuery, useMutation } from "convex/react";
import { CircleDashed } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EventReferralShareButton } from "@/components/event-referral-share-button";
import { SmsProgramDisclosure } from "@/components/sms-program-disclosure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  buildEventDetailPathWithPreservedQuery,
  buildPathWithPreservedQuery,
} from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";
import type { Event as ClubEvent, RSVP } from "@/lib/types";

interface CurrentUserEventStatus {
  rsvpId?: Id<"rsvps">;
  listKey?: string;
  status?: RSVP["status"];
  smsConsent?: boolean;
  smsConsentIpAddress?: string;
}

export default function StatusPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventRouteId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();
  const updateSmsPreference = useMutation(api.rsvps.updateSmsPreference);
  const claimGuestRsvps = useMutation(api.rsvps.claimGuestRsvpsForCurrentUser);
  const [isUpdatingSmsPreference, setIsUpdatingSmsPreference] = useState(false);
  const [hasAttemptedGuestRsvpClaim, setHasAttemptedGuestRsvpClaim] = useState(false);
  const [smsConsentIpAddress, setSmsConsentIpAddress] = useState<string | undefined>(undefined);
  const hasStartedGuestRsvpClaimRef = useRef(false);

  const statusQuery = useQuery(
    convexQuery(
      api.rsvps.statusForUserEventByRouteId,
      isLoaded && isSignedIn
        ? {
            eventRouteId,
            siteKey: siteConfiguration.siteKey,
          }
        : "skip",
    ),
  );
  const eventQuery = useQuery(
    convexQuery(api.events.getByRouteId, {
      eventRouteId,
      siteKey: siteConfiguration.siteKey,
    }),
  );

  const status = statusQuery.data as CurrentUserEventStatus | null | undefined;
  const event = eventQuery.data as ClubEvent | null | undefined;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || hasStartedGuestRsvpClaimRef.current) return;
    hasStartedGuestRsvpClaimRef.current = true;
    void claimGuestRsvps()
      .then(() => statusQuery.refetch())
      .catch((error) => {
        console.error("Failed to claim guest RSVPs:", error);
      })
      .finally(() => {
        setHasAttemptedGuestRsvpClaim(true);
      });
  }, [claimGuestRsvps, isLoaded, isSignedIn, statusQuery]);

  const guestPortalImageResponse = useConvexQuery(
    api.files.getUrl,
    event?.guestPortalImageStorageId
      ? { storageId: event.guestPortalImageStorageId as Id<"_storage"> }
      : "skip",
  );
  const guestPortalLinkLabel = event?.guestPortalLinkLabel?.trim() ?? "";
  const guestPortalLinkUrl = event?.guestPortalLinkUrl?.trim() ?? "";
  const shouldShowGuestLink = guestPortalLinkLabel.length > 0 && guestPortalLinkUrl.length > 0;
  const guestPortalImageUrl = guestPortalImageResponse?.url ?? null;
  const shouldShowReferralSharing = event?.referralSharingEnabled === true;

  useEffect(() => {
    if (typeof status?.smsConsentIpAddress === "string" && status.smsConsentIpAddress.length > 0) {
      setSmsConsentIpAddress(status.smsConsentIpAddress);
    }
  }, [status?.smsConsentIpAddress]);

  // Auto-redirect on terminal RSVP states.
  useEffect(() => {
    if (!status) return;
    if (status.status === "approved") {
      router.replace(
        buildPathWithPreservedQuery(`/events/${eventRouteId}/ticket`, searchParams, ["step"]),
      );
    }
    if (status.status === "denied") {
      router.replace(
        buildPathWithPreservedQuery(`/events/${eventRouteId}/denied`, searchParams, ["step"]),
      );
    }
  }, [status, eventRouteId, router, searchParams]);

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
        smsConsentIpAddress: desiredSmsConsent && consentIpAddress ? consentIpAddress : undefined,
      });
      await statusQuery.refetch();
      toast.success(
        desiredSmsConsent
          ? "Danza Organica SMS updates enabled."
          : "Danza Organica SMS updates disabled.",
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

  if (
    !isLoaded ||
    eventQuery.isLoading ||
    statusQuery.isLoading ||
    (isSignedIn && !hasAttemptedGuestRsvpClaim) ||
    !event
  ) {
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
              href={buildEventDetailPathWithPreservedQuery(eventRouteId, searchParams)}
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
          <EyebrowPill
            href={buildEventDetailPathWithPreservedQuery(eventRouteId, searchParams)}
            linkComponent={Link}
          >
            ← Back to event
          </EyebrowPill>
        }
        description={
          <>
            {status.listKey ? (
              <div className="mb-3">
                <Badge variant="outline" style={{ letterSpacing: "0.05em" }}>
                  {status.listKey.toUpperCase()}
                </Badge>
              </div>
            ) : null}
            Your request is <strong>pending host approval</strong>. You will receive instructions
            once approved. Approval is necessary to access the event.
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
                      alt={event?.name ? `${event.name} guest info` : "Event guest information"}
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

            {shouldShowReferralSharing ? (
              <section className="flex w-full flex-col items-center gap-3 text-center">
                <EventReferralShareButton
                  event={event}
                  variant="prominent"
                  className="h-auto p-3"
                />
              </section>
            ) : null}

            {status.smsConsent !== true ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3">
                  <div
                    className="flex items-center gap-2 text-sm font-medium"
                    style={{ color: "var(--tt-fg)" }}
                  >
                    <CircleDashed className="h-4 w-4" />
                    <span>Danza Organica SMS is disabled</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSmsPreferenceChange(true)}
                    disabled={
                      statusQuery.isLoading || statusQuery.isFetching || isUpdatingSmsPreference
                    }
                  >
                    {isUpdatingSmsPreference && <Spinner className="h-3.5 w-3.5" />}
                    Enable SMS Updates
                  </Button>
                </div>
                <p
                  className="max-w-sm text-[10px] leading-tight"
                  style={{ color: "var(--tt-fg-mute)" }}
                >
                  <SmsProgramDisclosure />
                </p>
              </div>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
