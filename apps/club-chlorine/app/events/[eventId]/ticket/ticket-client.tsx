"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexMutation } from "@convex-dev/react-query";
import { resolveQrCodeColors } from "@coucou/sdk/shared/qr-code-colors";
import {
  EyebrowPill,
  TenantButton,
  Ticket,
  type TicketDetailRow,
} from "@coucou/ui/tenant-template";
import { useMutation } from "@tanstack/react-query";
import {
  type Preloaded,
  useQuery as useConvexQuery,
  useMutation as useConvexReactMutation,
  usePreloadedQuery,
} from "convex/react";
import { Check, Download } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EventReferralShareButton } from "@/components/event-referral-share-button";
import { Spinner } from "@/components/ui/spinner";
import { formatEventTitleInline, hasEventSecondaryTitle } from "@/lib/event-display";
import {
  buildEventDetailPathWithPreservedQuery,
  buildPathWithPreservedQuery,
} from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import {
  getByNameTicketInstruction,
  getTicketConfirmationToastDescription,
  ticketCopyShouldMentionQr,
} from "@/lib/ticket-copy";

const QR_SVG_ID = "ticket-qr-svg";

function downloadQRCodeAsImage(
  qrSvgId: string,
  fileName: string,
  colors: { foregroundColor: string; backgroundColor: string },
) {
  const svgElement = document.getElementById(qrSvgId) as SVGSVGElement | null;
  if (!svgElement) {
    toast.error("Failed to find QR code");
    return;
  }
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgData], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    toast.error("Unable to download QR code");
    URL.revokeObjectURL(svgUrl);
    return;
  }

  const qrCodeSize = 600;
  canvas.width = qrCodeSize;
  canvas.height = qrCodeSize;

  const image = new Image();
  image.onload = () => {
    context.fillStyle = colors.backgroundColor;
    context.fillRect(0, 0, qrCodeSize, qrCodeSize);
    context.drawImage(image, 0, 0, qrCodeSize, qrCodeSize);

    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("Failed to create download file");
        URL.revokeObjectURL(svgUrl);
        return;
      }
      const downloadUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = downloadUrl;
      downloadLink.download = `${fileName}-ticket.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);
      URL.revokeObjectURL(svgUrl);
      toast.success("QR code downloaded");
    }, "image/png");
  };
  image.onerror = () => {
    toast.error("Failed to generate QR code image");
    URL.revokeObjectURL(svgUrl);
  };
  image.src = svgUrl;
}

interface TicketClientPageProps {
  eventRouteId: string;
  eventPreload: Preloaded<typeof api.events.getByRouteId>;
  statusPreload: Preloaded<typeof api.rsvps.statusForUserEventByRouteId>;
}

export default function TicketClientPage({
  eventRouteId,
  eventPreload,
  statusPreload,
}: TicketClientPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const event = usePreloadedQuery(eventPreload);
  const status = usePreloadedQuery(statusPreload);
  const canonicalEventId = event?._id;
  const claimGuestRsvps = useConvexReactMutation(api.rsvps.claimGuestRsvpsForCurrentUser);
  const [hasAttemptedGuestRsvpClaim, setHasAttemptedGuestRsvpClaim] = useState(false);

  const myRedemption = useConvexQuery(
    api.redemptions.forCurrentUserEvent,
    canonicalEventId
      ? {
          eventId: canonicalEventId as Id<"events">,
          siteKey: siteConfiguration.siteKey,
        }
      : "skip",
  );

  const markTicketViewed = useMutation({
    mutationFn: useConvexMutation(api.rsvps.markTicketViewed),
  });
  const [hasCelebrated, setHasCelebrated] = useState(false);
  const ticketCopyInput = {
    generateQR: status?.generateQR,
    redemptionCode: myRedemption?.code ?? null,
  };
  const shouldMentionQr = ticketCopyShouldMentionQr(ticketCopyInput);

  const eventDisplayName = formatEventTitleInline(event);
  const eventHasSecondaryTitle = hasEventSecondaryTitle(event);
  const sanitizedFileName = eventDisplayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const qrFileName = sanitizedFileName || "ticket";

  const { foregroundColor: qrForegroundColor, backgroundColor: qrBackgroundColor } =
    resolveQrCodeColors({
      foregroundColor: event?.themeTextColor,
      backgroundColor: event?.themeBackgroundColor,
    });

  useEffect(() => {
    if (hasAttemptedGuestRsvpClaim) return;
    void claimGuestRsvps()
      .catch((error) => {
        console.error("Failed to claim guest RSVPs:", error);
      })
      .finally(() => {
        setHasAttemptedGuestRsvpClaim(true);
      });
  }, [claimGuestRsvps, hasAttemptedGuestRsvpClaim]);

  const dateText = useMemo(() => {
    const timestamp = event?.eventDate;
    const timezone = event?.eventTimezone;
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const day = date.toLocaleDateString(undefined, {
      weekday: "long",
      timeZone: timezone ?? "UTC",
    });
    const formattedDate = date
      .toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
        timeZone: timezone ?? "UTC",
      })
      .replace(/\//g, ".");
    return `${day} ${formattedDate}`;
  }, [event?.eventDate, event?.eventTimezone]);

  // Auto-redirect off-state RSVPs.
  useEffect(() => {
    if (!status) return;
    if (status.status === "pending") {
      router.replace(
        buildPathWithPreservedQuery(`/events/${eventRouteId}/status`, searchParams, ["step"]),
      );
    }
    if (status.status === "denied") {
      router.replace(
        buildPathWithPreservedQuery(`/events/${eventRouteId}/denied`, searchParams, ["step"]),
      );
    }
  }, [status, eventRouteId, router, searchParams]);

  // Record the first time an approved guest opens their ticket.
  useEffect(() => {
    if (
      event?.name &&
      status?.status === "approved" &&
      !status.ticketViewedAt &&
      !markTicketViewed.isPending &&
      !hasCelebrated &&
      canonicalEventId
    ) {
      markTicketViewed.mutate(
        {
          eventId: canonicalEventId as Id<"events">,
          siteKey: siteConfiguration.siteKey,
        },
        {
          onSuccess: () => {
            toast.success(`You're confirmed for ${eventDisplayName} 🎉`, {
              description: getTicketConfirmationToastDescription(ticketCopyInput),
            });
            setHasCelebrated(true);
          },
          onError: (error) => {
            console.error("Failed to mark ticket viewed:", error);
            toast.error("Failed to record ticket view. Please refresh.");
          },
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    event?.name,
    status?.status,
    status?.ticketViewedAt,
    canonicalEventId,
    markTicketViewed.isPending,
    hasCelebrated,
    shouldMentionQr,
  ]);

  if (!event) {
    return (
      <div className="text-center" style={{ color: "var(--tt-fg-dim)" }}>
        <p className="text-lg font-medium">Event Not Found</p>
        <p className="mt-2 text-sm">This event may not exist or may have been removed.</p>
      </div>
    );
  }

  if (!hasAttemptedGuestRsvpClaim) {
    return (
      <div className="flex items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  // Loading the redemption when we know we should have one.
  const expectingTicket = status?.status === "approved";
  const isLoadingRedemption = expectingTicket && myRedemption === undefined;
  const hasRedemption = Boolean(myRedemption?.code);
  const generatesQr = status?.generateQR !== false;
  const showQr = generatesQr && hasRedemption;

  const qrValue =
    typeof window !== "undefined" && myRedemption?.code
      ? `${window.location.origin}/redeem/${myRedemption.code}`
      : "";

  const ticketDetails: TicketDetailRow[] = [];
  if (myRedemption?.listKey) {
    ticketDetails.push({
      label: "Tier",
      value: myRedemption.listKey.toUpperCase(),
    });
  }
  if (event.location) {
    ticketDetails.push({ label: "Where", value: event.location });
  }

  return (
    <>
      {isLoadingRedemption ? (
        <div className="flex items-center justify-center p-6">
          <Spinner />
        </div>
      ) : (
        <Ticket
          noShell
          eyebrow="Ticket"
          eyebrowTrailing={
            <EyebrowPill
              href={buildEventDetailPathWithPreservedQuery(eventRouteId, searchParams)}
              linkComponent={Link}
            >
              ← Back to event
            </EyebrowPill>
          }
          eventName={event.name}
          secondaryTitle={eventHasSecondaryTitle ? event.secondaryTitle : null}
          whenLabel={dateText || null}
          whereLabel={event.location ?? null}
          qrValue={qrValue}
          redemptionCode={myRedemption?.code ?? undefined}
          qrFgColor={qrForegroundColor}
          qrBgColor={qrBackgroundColor}
          qrSvgId={QR_SVG_ID}
          showQr={showQr}
          noQrSlot={
            generatesQr ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner />
                <div className="text-[12px]" style={{ color: "var(--tt-fg-dim)" }}>
                  Preparing your ticket…
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="flex items-center gap-1.5 text-[14px] font-medium"
                  style={{ color: "var(--tt-fg)" }}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  <span>{status?.listKey?.toUpperCase()} confirmed</span>
                </div>
                <div
                  className="text-[12px] text-center max-w-[280px]"
                  style={{ color: "var(--tt-fg-dim)" }}
                >
                  {getByNameTicketInstruction()}
                </div>
              </div>
            )
          }
          actions={
            <div className="flex flex-col items-center justify-center gap-4">
              {showQr ? (
                <TenantButton
                  type="button"
                  onClick={() =>
                    downloadQRCodeAsImage(QR_SVG_ID, qrFileName, {
                      foregroundColor: qrForegroundColor,
                      backgroundColor: qrBackgroundColor,
                    })
                  }
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Download
                </TenantButton>
              ) : null}
              <div className="my-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
                <EventReferralShareButton
                  event={event}
                  variant="prominent"
                  className="h-auto p-4 text-[15px]"
                />
              </div>
            </div>
          }
          details={ticketDetails}
        />
      )}
    </>
  );
}
