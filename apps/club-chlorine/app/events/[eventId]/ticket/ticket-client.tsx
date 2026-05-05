"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useConvexMutation } from "@convex-dev/react-query";
import {
  useQuery as useConvexQuery,
  Preloaded,
  usePreloadedQuery,
} from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  formatEventTitleInline,
  hasEventSecondaryTitle,
} from "@/lib/event-display";
import { siteConfiguration } from "@/lib/site";
import { resolveQrCodeColors } from "@coucou/sdk/shared/qr-code-colors";
import {
  TenantTemplateProvider,
  Ticket,
  TenantButton,
  type TicketDetailRow,
} from "@coucou/ui/tenant-template";

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
  eventId: string;
  eventPreload: Preloaded<typeof api.events.get>;
  statusPreload: Preloaded<typeof api.rsvps.statusForUserEvent>;
}

export default function TicketClientPage({
  eventId,
  eventPreload,
  statusPreload,
}: TicketClientPageProps) {
  const router = useRouter();
  const event = usePreloadedQuery(eventPreload);
  const status = usePreloadedQuery(statusPreload);

  const myRedemption = useConvexQuery(api.redemptions.forCurrentUserEvent, {
    eventId: eventId as Id<"events">,
    siteKey: siteConfiguration.siteKey,
  });

  const acceptRsvp = useMutation({
    mutationFn: useConvexMutation(api.rsvps.acceptRsvp),
  });
  const [hasCelebrated, setHasCelebrated] = useState(false);

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
      router.replace(`/events/${eventId}/status`);
    }
    if (status.status === "denied") {
      router.replace(`/events/${eventId}/denied`);
    }
  }, [status, eventId, router]);

  // Trigger acceptRsvp once when an approval is observed.
  useEffect(() => {
    if (
      event?.name &&
      status?.status === "approved" &&
      !acceptRsvp.isPending &&
      !hasCelebrated
    ) {
      acceptRsvp.mutate(
        {
          eventId: eventId as Id<"events">,
          siteKey: siteConfiguration.siteKey,
        },
        {
          onSuccess: () => {
            toast.success(`You're confirmed for ${eventDisplayName} 🎉`, {
              description: "Your QR code is now visible below.",
            });
            setHasCelebrated(true);
          },
          onError: (error) => {
            console.error("Failed to accept RSVP:", error);
            toast.error("Failed to confirm attendance. Please refresh.");
          },
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.name, status?.status, eventId, acceptRsvp.isPending, hasCelebrated]);

  if (!event) {
    return (
      <TenantTemplateProvider
        siteConfigurationPreset={siteConfiguration.preset}
      >
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="text-center" style={{ color: "var(--tt-fg-dim)" }}>
            <p className="text-lg font-medium">Event Not Found</p>
            <p className="mt-2 text-sm">
              This event may not exist or may have been removed.
            </p>
          </div>
        </main>
      </TenantTemplateProvider>
    );
  }

  // Loading the redemption when we know we should have one.
  const expectingQr =
    status?.status === "approved" || status?.status === "attending";
  const isLoadingRedemption = expectingQr && myRedemption === undefined;
  const hasRedemption = Boolean(myRedemption?.code);
  const generatesQr = status?.generateQR !== false;

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
    <TenantTemplateProvider
      siteConfigurationPreset={siteConfiguration.preset}
      event={event}
    >
      {isLoadingRedemption ? (
        <main className="flex min-h-screen items-center justify-center p-6">
          <Spinner />
        </main>
      ) : (
        <Ticket
          eventName={event.name}
          secondaryTitle={eventHasSecondaryTitle ? event.secondaryTitle : null}
          whenLabel={dateText || null}
          whereLabel={event.location ?? null}
          qrValue={qrValue}
          redemptionCode={myRedemption?.code ?? undefined}
          qrFgColor={qrForegroundColor}
          qrBgColor={qrBackgroundColor}
          qrSvgId={QR_SVG_ID}
          showQr={generatesQr && hasRedemption}
          noQrSlot={
            generatesQr ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner />
                <div
                  className="text-[12px]"
                  style={{ color: "var(--tt-fg-dim)" }}
                >
                  Generating your QR code…
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="text-[14px] font-medium"
                  style={{ color: "var(--tt-fg)" }}
                >
                  ✓ {status?.listKey?.toUpperCase()} confirmed
                </div>
                <div
                  className="text-[12px] text-center max-w-[280px]"
                  style={{ color: "var(--tt-fg-dim)" }}
                >
                  This list verifies guests by name at the door, not by QR.
                </div>
              </div>
            )
          }
          actions={
            generatesQr && hasRedemption ? (
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
            ) : null
          }
          details={ticketDetails}
        />
      )}
    </TenantTemplateProvider>
  );
}
