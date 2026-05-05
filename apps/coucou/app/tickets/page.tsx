"use client";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Calendar, MapPin, Clock, QrCode, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatEventTitleInline } from "@/lib/event-display";
import type { UserTicket, RSVP } from "@/lib/types";

function formatDate(eventDate: number, timezone?: string) {
  return new Date(eventDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone ?? "UTC",
  });
}

function formatTime(eventDate: number, timezone?: string) {
  return new Date(eventDate).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone ?? "UTC",
  });
}

function getStatusBadgeColor(status: RSVP["status"]) {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    case "attending":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    case "pending":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    case "denied":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
  }
}

export default function TicketsPage() {
  const userTickets = useQuery(api.rsvps.listUserTickets) as
    | UserTicket[]
    | undefined;

  if (userTickets === undefined) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-screen">
          <Spinner />
        </div>
      </div>
    );
  }

  if (userTickets.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">My Tickets</h1>
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No tickets found</h3>
          <p className="text-muted-foreground mb-6">
            You haven&apos;t RSVP&apos;d to any events yet. Check out our upcoming events!
          </p>
          <Link href="/">
            <Button>Browse Events</Button>
          </Link>
        </div>
      </div>
    );
  }

  const now = Date.now();
  const upcomingTickets = userTickets.filter(
    (ticket) => ticket.event && ticket.event.eventDate > now
  );
  const pastTickets = userTickets.filter(
    (ticket) => ticket.event && ticket.event.eventDate <= now
  );

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">My Tickets</h1>

      {upcomingTickets.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Upcoming Events</h2>
          <div className="space-y-4">
            {upcomingTickets.map((ticket) => (
              <TicketCard key={ticket.rsvp._id} ticket={ticket} />
            ))}
          </div>
        </div>
      )}

      {pastTickets.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Past Events</h2>
          <div className="space-y-4">
            {pastTickets.map((ticket) => (
              <TicketCard key={ticket.rsvp._id} ticket={ticket} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: UserTicket }) {
  const { rsvp, event, redemption } = ticket;

  if (!event) return null;

  const isRedeemed = redemption?.redeemedAt;
  const hasValidTicket =
    (rsvp.status === "approved" || rsvp.status === "attending") && redemption;
  const inlineTitle = formatEventTitleInline(event);

  return (
    <div className="border rounded-lg p-6 bg-card">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-2" title={inlineTitle}>
            {inlineTitle}
          </h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(event.eventDate, event.eventTimezone)}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatTime(event.eventDate, event.eventTimezone)}
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
            <MapPin className="h-4 w-4" />
            {event.location}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge
            className={cn(
              "capitalize",
              getStatusBadgeColor(rsvp.status)
            )}
          >
            {rsvp.status}
          </Badge>
          {rsvp.listKey && (
            <Badge variant="outline" className="text-xs">
              {rsvp.listKey.toUpperCase()}
            </Badge>
          )}
        </div>
      </div>

      {rsvp.note && (
        <div className="mb-4 p-3 bg-muted rounded-md">
          <p className="text-sm">{rsvp.note}</p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Link href={`/events/${event._id}`}>
            <Button variant="outline" size="sm">
              View Event
            </Button>
          </Link>
          {hasValidTicket && (
            <Link href={`/events/${event._id}/ticket`}>
              <Button size="sm" className="flex items-center gap-1">
                <QrCode className="h-4 w-4" />
                View Ticket
              </Button>
            </Link>
          )}
        </div>

        {isRedeemed && (
          <Badge variant="outline" className="text-green-600 border-green-600">
            Checked In
          </Badge>
        )}
      </div>
    </div>
  );
}
