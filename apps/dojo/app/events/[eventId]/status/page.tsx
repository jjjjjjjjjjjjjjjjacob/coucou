"use client";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useQuery as useConvexQuery, useMutation } from "convex/react";
import React, { use } from "react";
import { toast } from "sonner";
import { SmsOptInPrompt } from "@/components/sms-opt-in-prompt";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { resolveEventMessagingBrandName } from "@/lib/event-display";
import { getEventThemeColors } from "@/lib/event-theme";
import { siteConfiguration } from "@/lib/site";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";

export default function StatusPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventRouteId } = use(params);
  const { isSignedIn, isLoaded } = useAuth();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexAuthLoading } =
    useConvexAuth();
  const canLoadAuthenticatedStatus = isLoaded && isSignedIn && isConvexAuthenticated;
  const updateSmsPreference = useMutation(api.rsvps.updateSmsPreference);
  const [isUpdatingSmsPreference, setIsUpdatingSmsPreference] = React.useState(false);
  const [smsConsentIpAddress, setSmsConsentIpAddress] = React.useState<string | undefined>(
    undefined,
  );

  const statusQuery = useQuery(
    convexQuery(
      api.rsvps.statusForUserEventByRouteId,
      canLoadAuthenticatedStatus
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

  const status = statusQuery.data;
  const event = eventQuery.data;
  const eventThemeColors = React.useMemo(() => getEventThemeColors(event ?? null), [event]);
  const smsSenderDisplayName = React.useMemo(
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

  React.useEffect(() => {
    if (typeof status?.smsConsentIpAddress === "string" && status.smsConsentIpAddress.length > 0) {
      setSmsConsentIpAddress(status.smsConsentIpAddress);
    }
  }, [status?.smsConsentIpAddress]);

  const handleEnableSmsPreference = async () => {
    if (!status?.rsvpId) return;
    try {
      setIsUpdatingSmsPreference(true);
      let consentIpAddress = smsConsentIpAddress;
      if (!consentIpAddress) {
        consentIpAddress = await fetchSmsConsentIpAddress();
        if (consentIpAddress) {
          setSmsConsentIpAddress(consentIpAddress);
        }
      }
      await updateSmsPreference({
        rsvpId: status.rsvpId as Id<"rsvps">,
        smsConsent: true,
        smsConsentIpAddress: consentIpAddress,
      });
      await statusQuery.refetch();
      toast.success(`SMS updates from ${smsSenderDisplayName} enabled.`);
    } catch (error) {
      const errorDetails = error as Error;
      toast.error(errorDetails.message || "Failed to enable SMS notifications.");
    } finally {
      setIsUpdatingSmsPreference(false);
    }
  };

  // Show loading while auth is initializing
  if (!isLoaded || (isSignedIn && (isConvexAuthLoading || !isConvexAuthenticated))) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="flex items-center text-primary justify-center py-10">
          <Spinner />
        </div>
      </main>
    );
  }

  // If not signed in (shouldn't happen due to middleware, but safety check)
  if (!isSignedIn) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center text-red-500">
          <p>Please sign in to view your RSVP status.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      {eventQuery.isLoading || statusQuery.isLoading || !event ? (
        <div className="flex items-center text-primary justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-6 text-center">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold text-primary">RSVP Status</h1>
            <div className="space-y-1 text-primary">
              <p className="text-3xl font-semibold leading-tight">{event.name}</p>
              {event.secondaryTitle?.trim() && (
                <p className="text-2xl leading-tight text-primary/85 font-medium">
                  {event.secondaryTitle}
                </p>
              )}
              {event.location && <p className="text-sm text-primary/70">{event.location}</p>}
            </div>
          </header>
          {(guestPortalImageUrl || shouldShowGuestLink) && (
            <section className="space-y-3 rounded-lg border border-primary/15 bg-card/70 p-4">
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
          {status?.status === "pending" && (
            <div className="flex flex-col text-sm text-primary gap-2">
              <p>
                Your request is <span className="font-medium">pending host approval</span>. You’ll
                receive instructions once approved.
              </p>
              <p className="font-medium">IMPORTANT: Approval is necessary to access the event.</p>
            </div>
          )}
          {status && (
            <SmsOptInPrompt
              isSmsConsentEnabled={status.smsConsent === true}
              isUpdatingSmsPreference={isUpdatingSmsPreference}
              isUpdateDisabled={
                statusQuery.isLoading || statusQuery.isFetching || isUpdatingSmsPreference
              }
              onEnableSms={handleEnableSmsPreference}
              smsSenderDisplayName={smsSenderDisplayName}
              textColor={eventThemeColors.textColor}
            />
          )}
          {status?.status === "denied" && (
            <div className="text-sm">
              Sorry, you were denied. You can try a different list password.
            </div>
          )}
          {!status?.status && (
            <div className="text-sm text-foreground/70">No request on file yet.</div>
          )}
        </div>
      )}
    </main>
  );
}
