import { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import EventPageClient from "./page-client";
import { formatEventDisplayName } from "@/lib/event-display";

type Props = {
  params: Promise<{ eventId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params;

  try {
    const event = await fetchQuery(api.events.get, { eventId: eventId as Id<"events"> });

    if (!event) {
      return {
        title: "Event Not Found | Dojo Pomodoro",
        description: "The requested event could not be found.",
      };
    }

    // Format the date as MM.DD.YYYY in the event's timezone
    const eventDate = new Date(event.eventDate);
    const eventTimezone = event.eventTimezone ?? "UTC";
    const formattedDate = eventDate.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      timeZone: eventTimezone,
    }).replace(/\//g, ".");

    const title = `Dojo Pomodoro | ${event.location} ${formattedDate}`;
    const eventDisplayName = formatEventDisplayName(event);
    const description = `Join us at ${eventDisplayName} on ${eventDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: eventTimezone,
    })} at ${event.location}`;

    // Get flyer image URL if available
    let imageUrl = "/og-image.png"; // Default fallback
    if (event.flyerStorageId) {
      try {
        const flyerData = await fetchQuery(api.files.getUrl, { storageId: event.flyerStorageId });
        if (flyerData?.url) {
          imageUrl = flyerData.url;
        }
      } catch (error) {
        console.error("Error fetching flyer URL:", error);
      }
    }
    let iconUrl: string | null = null;
    if (event.customIconStorageId) {
      try {
        const iconData = await fetchQuery(api.files.getUrl, {
          storageId: event.customIconStorageId,
        });
        iconUrl = iconData?.url ?? null;
      } catch (error) {
        console.error("Error fetching event icon URL:", error);
      }
    }
    const iconEntries = iconUrl
      ? [{ url: iconUrl }]
      : [
          { url: "/favicon.png", sizes: "32x32", type: "image/png" },
          { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
        ];

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `https://dojopomodoro.club/events/${eventId}`,
        siteName: "Dojo Pomodoro",
        images: [
          {
            url: imageUrl,
            width: 1200,
            height: 630,
            alt: eventDisplayName,
          },
        ],
        locale: "en_US",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [imageUrl],
      },
      icons: {
        icon: iconEntries,
        apple: iconUrl ?? "/apple-touch-icon.png",
        shortcut: iconUrl ?? "/favicon.png",
      },
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      title: "Event | Dojo Pomodoro",
      description: "Event details on Dojo Pomodoro",
    };
  }
}

export default function EventPage({ params }: Props) {
  return <EventPageClient params={params} />;
}
