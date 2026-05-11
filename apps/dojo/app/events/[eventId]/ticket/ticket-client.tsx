"use client";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexMutation } from "@convex-dev/react-query";
import { resolveQrCodeColors } from "@coucou/sdk/shared/qr-code-colors";
import { useMutation } from "@tanstack/react-query";
import {
  type Preloaded,
  useConvexAuth,
  useQuery as useConvexQuery,
  usePreloadedQuery,
} from "convex/react";
import { Check, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { EventReferralShareButton } from "@/components/event-referral-share-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatEventTitleInline, hasEventSecondaryTitle } from "@/lib/event-display";
import { siteConfiguration } from "@/lib/site";

function downloadQRCodeAsImage(
  qrCodeValue: string,
  fileName: string,
  colors: { foregroundColor: string; backgroundColor: string },
) {
  const temporaryContainer = document.createElement("div");
  temporaryContainer.style.position = "absolute";
  temporaryContainer.style.left = "-9999px";
  temporaryContainer.style.top = "-9999px";
  document.body.appendChild(temporaryContainer);

  const qrCodeElement = document.createElement("div");
  temporaryContainer.appendChild(qrCodeElement);

  import("react-dom/client")
    .then(({ createRoot }) => {
      import("react-qr-code").then(({ default: QRCode }) => {
        import("react").then((React) => {
          const root = createRoot(qrCodeElement);

          root.render(
            React.createElement(QRCode, {
              value: qrCodeValue,
              size: 300,
              fgColor: colors.foregroundColor,
              bgColor: colors.backgroundColor,
              style: { height: "auto", maxWidth: "100%", width: "100%" },
            }),
          );

          setTimeout(() => {
            const svgElement = qrCodeElement.querySelector("svg");
            if (!svgElement) {
              toast.error("Failed to generate QR code");
              document.body.removeChild(temporaryContainer);
              return;
            }

            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) {
              toast.error("Unable to download QR code");
              document.body.removeChild(temporaryContainer);
              return;
            }

            const qrCodeSize = 300;
            canvas.width = qrCodeSize;
            canvas.height = qrCodeSize;

            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgData], {
              type: "image/svg+xml;charset=utf-8",
            });
            const svgUrl = URL.createObjectURL(svgBlob);

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

                toast.success("QR code downloaded successfully");
              }, "image/png");
            };

            image.onerror = () => {
              toast.error("Failed to generate QR code image");
              URL.revokeObjectURL(svgUrl);
            };

            image.src = svgUrl;
            document.body.removeChild(temporaryContainer);
          }, 100);
        });
      });
    })
    .catch(() => {
      toast.error("Failed to load QR code generator");
      document.body.removeChild(temporaryContainer);
    });
}

interface TicketClientPageProps {
  eventRouteId: string;
  eventPreload: Preloaded<typeof api.events.getByRouteId>;
  statusPreload: Preloaded<typeof api.rsvps.statusForUserEventByRouteId>;
}

export default function TicketClientPage({ eventPreload, statusPreload }: TicketClientPageProps) {
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexAuthLoading } =
    useConvexAuth();
  const canLoadAuthenticatedTicketData = isClerkLoaded && isSignedIn && isConvexAuthenticated;

  const event = usePreloadedQuery(eventPreload);
  const status = usePreloadedQuery(statusPreload);
  const canonicalEventId = event?._id;

  const myRedemptionQuery = useConvexQuery(
    api.redemptions.forCurrentUserEvent,
    canLoadAuthenticatedTicketData && canonicalEventId
      ? {
          eventId: canonicalEventId as Id<"events">,
          siteKey: siteConfiguration.siteKey,
        }
      : "skip",
  );
  const myRedemption = myRedemptionQuery;
  const guestPortalImageResponse = useConvexQuery(
    api.files.getUrl,
    event?.guestPortalImageStorageId
      ? { storageId: event.guestPortalImageStorageId as Id<"_storage"> }
      : "skip",
  );
  const guestPortalImageUrl = guestPortalImageResponse?.url ?? null;
  const guestPortalLinkLabel = event?.guestPortalLinkLabel?.trim() ?? "";
  const guestPortalLinkUrl = event?.guestPortalLinkUrl?.trim() ?? "";
  const shouldShowGuestLink = guestPortalLinkLabel.length > 0 && guestPortalLinkUrl.length > 0;

  const markTicketViewed = useMutation({
    mutationFn: useConvexMutation(api.rsvps.markTicketViewed),
  });
  const [celebrate, setCelebrate] = useState(false);
  const { foregroundColor: qrForegroundColor, backgroundColor: qrBackgroundColor } =
    resolveQrCodeColors({
      foregroundColor: event?.themeTextColor,
      backgroundColor: event?.themeBackgroundColor,
    });
  const eventDisplayName = formatEventTitleInline(event);
  const eventHasSecondaryTitle = hasEventSecondaryTitle(event);
  const sanitizedFileName = eventDisplayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const qrFileName = sanitizedFileName || "ticket";

  useEffect(() => {
    if (
      event?.name &&
      status?.status === "approved" &&
      !status.ticketViewedAt &&
      !markTicketViewed.isPending &&
      !celebrate &&
      canLoadAuthenticatedTicketData &&
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
              description: "Your QR code is now visible below.",
            });
            setCelebrate(true);
            setTimeout(() => setCelebrate(false), 5000);
          },
          onError: (error) => {
            console.error("Failed to mark ticket viewed:", error);
            toast.error("Failed to record ticket view. Please refresh and try again.");
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
    celebrate,
    canLoadAuthenticatedTicketData,
  ]);

  const dateText = useMemo(() => {
    const timestamp = event?.eventDate;
    const timezone = event?.eventTimezone;
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const day = date.toLocaleDateString(undefined, {
      weekday: "long",
      timeZone: timezone ?? "UTC",
    });
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      timeZone: timezone ?? "UTC",
    });
    return `${day} ${formattedDate.replace(/\//g, ".")}`;
  }, [event?.eventDate, event?.eventTimezone]);

  const isStatusLoading =
    !canLoadAuthenticatedTicketData || isConvexAuthLoading || status === undefined;
  const isRedemptionLoading = canLoadAuthenticatedTicketData && myRedemptionQuery === undefined;
  const hasRedemptionData = myRedemption && myRedemption.code;

  const renderEventNotFound = () => (
    <div className="w-full max-w-2xl space-y-6 text-center">
      <div className="text-primary/70">
        <p className="text-lg font-medium">Event Not Found</p>
        <p className="text-sm mt-2">This event may not exist or may have been removed.</p>
      </div>
    </div>
  );

  const renderEventHeader = () => (
    <header className="space-y-1">
      <div className="space-y-1">
        <h1 className="text-4xl font-semibold text-primary">{event?.name}</h1>
        {eventHasSecondaryTitle && (
          <p className="text-3xl text-primary/85 font-medium leading-tight">
            {event?.secondaryTitle}
          </p>
        )}
      </div>
      <div>
        <p className="text-sm text-foreground/70 text-primary">{event?.location}</p>
        <p className="text-sm text-foreground/70 text-primary">{dateText}</p>
      </div>
    </header>
  );

  const renderStatusLoading = () => (
    <div className="rounded border border-primary/20 p-3 space-y-2 mt-2">
      <div className="font-medium text-sm text-primary">Checking your status...</div>
      <div className="flex justify-center text-primary py-4">
        <Spinner />
      </div>
    </div>
  );

  const renderQRCode = () => (
    <>
      <div className="font-medium text-sm text-primary">Your QR Code</div>
      <div className="flex flex-col items-center gap-2 text-primary">
        <QRCode
          value={`${window.location.origin}/redeem/${myRedemption?.code}`}
          size={200}
          fgColor={qrForegroundColor}
          bgColor={qrBackgroundColor}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadQRCodeAsImage(
              `${window.location.origin}/redeem/${myRedemption?.code}`,
              qrFileName,
              {
                foregroundColor: qrForegroundColor,
                backgroundColor: qrBackgroundColor,
              },
            )
          }
          className="text-primary border-primary/20 hover:bg-primary/5"
        >
          <Download className="w-4 h-4 mr-2" />
          Download QR Code
        </Button>
        <div className="text-xs text-primary">Show this at the door to get in.</div>
        <div className="text-xs text-primary/80 font-medium">
          ⚠️ This QR code can only be redeemed once
        </div>
        {myRedemption?.listKey?.toLowerCase() === "ga" ? (
          <div className="text-xs text-primary/70">
            GA: This doesn&apos;t guarantee admission; required to get in.
          </div>
        ) : myRedemption?.listKey?.toLowerCase() === "vip" ? (
          <div className="text-xs text-primary/70">VIP: This guarantees admission.</div>
        ) : (
          ""
        )}
      </div>
    </>
  );

  const renderRedemptionLoading = () => (
    <>
      <div className="font-medium text-sm text-primary">Loading QR Code...</div>
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    </>
  );

  const renderGeneratingQR = () => (
    <>
      <div className="font-medium text-sm text-amber-700">Generating Your QR Code...</div>
      <div className="text-xs text-amber-600">
        Your ticket is being prepared. This usually takes just a moment.
      </div>
      <div className="flex text-primary justify-center py-2">
        <Spinner />
      </div>
    </>
  );

  const renderApprovedContent = () => {
    if (status?.generateQR === false) {
      return renderNoQRContent();
    }

    if (isRedemptionLoading) {
      return renderRedemptionLoading();
    }

    if (hasRedemptionData) {
      return renderQRCode();
    }

    return renderGeneratingQR();
  };

  const renderPendingContent = () => (
    <div className="rounded border border-amber-200 p-3 space-y-2 mt-2">
      <div className="font-medium text-sm text-amber-700">RSVP Pending Approval</div>
      <div className="text-xs text-amber-600">
        Your RSVP request is being reviewed by the hosts.
      </div>
    </div>
  );

  const renderDeniedContent = () => (
    <div className="rounded border border-red-200 p-3 space-y-2 mt-2">
      <div className="font-medium text-sm text-red-600">RSVP Denied</div>
      <div className="text-xs text-red-500">Your RSVP was not approved for this event.</div>
    </div>
  );

  const renderUnavailableContent = () => (
    <div className="rounded border border-primary/20 p-3 space-y-2 mt-2">
      <div className="font-medium text-sm text-primary/70">QR Code Not Available</div>
      <div className="text-xs text-primary/60">
        Your RSVP needs to be approved before your QR code will be available.
      </div>
    </div>
  );

  const renderNoQRContent = () => (
    <div className="rounded p-3 space-y-2">
      <div className="flex items-center gap-1.5 font-medium text-sm text-primary">
        <Check className="h-3.5 w-3.5" aria-hidden />
        <span>{status?.listKey?.toUpperCase()} Confirmed</span>
      </div>
      <div className="text-xs text-primary/70">
        {status?.listKey?.toLowerCase() === "ga" ? (
          <>GA: General Admission - Name verification at door</>
        ) : (
          <>This list does not use QR codes for entry</>
        )}
      </div>
      <div className="text-xs text-primary/60 mt-2">
        Please provide your name at the door for entry verification.
      </div>
    </div>
  );

  const renderStatusContent = () => {
    if (isStatusLoading) {
      return renderStatusLoading();
    }

    if (status?.status === "approved") {
      return (
        <div className="rounded border border-primary/20 p-3 space-y-2 mt-2">
          {renderApprovedContent()}
        </div>
      );
    }

    if (status?.status === "pending") {
      return renderPendingContent();
    }

    if (status?.status === "denied") {
      return renderDeniedContent();
    }

    return renderUnavailableContent();
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      {!event ? (
        renderEventNotFound()
      ) : (
        <div className="w-full max-w-2xl space-y-6 text-center animate-in fade-in">
          {renderEventHeader()}
          <section className="space-y-3">{renderStatusContent()}</section>
          <div className="flex justify-center">
            <div className="flex flex-col items-center gap-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500">
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Invite friends
              </span>
              <EventReferralShareButton event={event} variant="prominent" />
              <span className="text-[12px] text-muted-foreground/80">
                Tap to copy your referral link
              </span>
            </div>
          </div>
          {(guestPortalImageUrl || shouldShowGuestLink) && (
            <section className="space-y-3 rounded-lg border border-primary/15 bg-card/70 p-4">
              {guestPortalImageUrl && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={guestPortalImageUrl}
                    alt={event?.name ? `${event.name} guest info` : "Event guest information"}
                    className="max-h-72 w-full rounded-md object-cover"
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
        </div>
      )}
      {celebrate && event && <ConfettiOverlay count={120} />}
    </main>
  );
}

function ConfettiOverlay({ count = 140 }: { count?: number }) {
  const pieces = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const left = Math.random() * 100;
      const size = 6 + Math.random() * 8;
      const delay = Math.random() * 0.6;
      const duration = 4.9 + Math.random() * 0.9;
      const shape = Math.random() < 0.5 ? "50%" : "4px";
      const opacity = 0.6 + Math.random() * 0.4;
      const dx = (Math.random() * 60 - 30).toFixed(2);
      const startY = -(8 + Math.random() * 14).toFixed(2);
      const endY = (95 + Math.random() * 20).toFixed(2);
      return {
        left,
        size,
        delay,
        duration,
        shape,
        opacity,
        dx,
        startY,
        endY,
        i,
      };
    });
  }, [count]);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden text-primary">
      {pieces.map((p) => (
        <span
          key={p.i}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}vw`,
            width: p.size,
            height: p.size,
            backgroundColor: "currentColor",
            opacity: 1,
            borderRadius: p.shape as string,
            // @ts-expect-error CSS var for drift
            ["--dx"]: `${p.dx}vw`,
            ["--startY"]: `${p.startY}vh`,
            ["--endY"]: `${p.endY}vh`,
            transform: `translate3d(0, var(--startY), 0)`,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
            willChange: "transform",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translate3d(0, var(--startY), 0);
            opacity: 1;
          }
          60% {
            transform: translate3d(calc(var(--dx) * 0.6), 60vh, 0);
            opacity: 0.6;
          }
          100% {
            transform: translate3d(var(--dx), var(--endY), 0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
