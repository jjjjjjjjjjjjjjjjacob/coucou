"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import QRCode from "react-qr-code";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useEventBranding } from "@/contexts/event-branding-context";
import { hasEventSecondaryTitle } from "@/lib/event-display";
import {
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  getAccessibleTextColor,
  getColorContrastRatio,
  getEventThemeColors,
} from "@/lib/event-theme";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

export default function TicketPage() {
  const workspaceScope = useWorkspaceScope();
  const featuredEventQuery = useQuery(
    convexQuery(api.events.getFeaturedEvent, workspaceScope?.queryArgs ?? {}),
  );
  const featuredEvent = featuredEventQuery.data;
  const featuredEventId = featuredEvent?._id ?? null;
  const featuredEventIconQuery = useQuery(
    convexQuery(
      api.files.getUrl,
      featuredEvent?.customIconStorageId
        ? { storageId: featuredEvent.customIconStorageId as Id<"_storage"> }
        : "skip",
    ),
  );
  const featuredEventIconUrl = featuredEventIconQuery.data?.url ?? null;
  const { applyBranding, clearBranding } = useEventBranding();

  useEffect(() => {
    if (!featuredEventId) {
      clearBranding("door:featured");
      return () => {
        clearBranding("door:featured");
      };
    }
    const brandingSourceId = `door:${featuredEventId}`;
    if (featuredEventIconUrl) {
      applyBranding({
        sourceId: brandingSourceId,
        iconUrl: featuredEventIconUrl,
      });
      return () => {
        clearBranding(brandingSourceId);
      };
    }
    clearBranding(brandingSourceId);
    return () => {
      clearBranding(brandingSourceId);
    };
  }, [applyBranding, clearBranding, featuredEventIconUrl, featuredEventId]);

  if (featuredEventQuery.isLoading) {
    return (
      <div className="flex text-primary items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!featuredEvent) {
    return (
      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>No Active Event</CardTitle>
            <CardDescription>There is no featured event at this time.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const ticketUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${featuredEvent._id}/ticket`;
  const eventDate = new Date(featuredEvent.eventDate);
  const { backgroundColor: eventBackgroundColor, textColor: eventTextColor } =
    getEventThemeColors(featuredEvent);
  const contrastRatio = getColorContrastRatio(eventTextColor, eventBackgroundColor);
  const hasAdequateContrast = contrastRatio >= 4.5;
  const qrForegroundColor = hasAdequateContrast
    ? eventTextColor
    : getAccessibleTextColor(eventBackgroundColor);
  const qrBackgroundColor = hasAdequateContrast
    ? eventBackgroundColor
    : EVENT_THEME_DEFAULT_BACKGROUND_COLOR;

  return (
    <section className="space-y-3">
      <Card>
        <CardHeader>
          <div className="space-y-1">
            <CardTitle>{featuredEvent.name}</CardTitle>
            {hasEventSecondaryTitle(featuredEvent) && (
              <p className="text-lg font-medium text-muted-foreground/80 leading-tight">
                {featuredEvent.secondaryTitle}
              </p>
            )}
          </div>
          <CardDescription>
            {eventDate.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: featuredEvent.eventTimezone ?? "UTC",
            })}{" "}
            at {featuredEvent.location}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <div className="p-4 rounded-lg" style={{ backgroundColor: qrBackgroundColor }}>
            <QRCode
              value={ticketUrl}
              size={256}
              fgColor={qrForegroundColor}
              bgColor={qrBackgroundColor}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Scan this QR code to access the ticket page
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
