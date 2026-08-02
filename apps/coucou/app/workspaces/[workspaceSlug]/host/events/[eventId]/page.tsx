"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Users } from "lucide-react";
import { useParams } from "next/navigation";
import { EventDetailLayout } from "@/components/event-detail-layout";
import { LinearTabsTrigger, TabsContent } from "@/components/linear-tabs";
import { formatEventTitleInline } from "@/lib/event-display";
import type { Event } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import EditEventDialog from "../edit-event-dialog";
import { EventDetailActions } from "./event-detail-actions";
import { EventEditProvider } from "./event-edit-context";
import { EventGuestsTab } from "./event-guests-tab";
import { EventPropertyPanel } from "./event-property-panel";

function EventDetailSkeleton() {
  return (
    <div className="flex-1 space-y-5">
      <div className="h-8 w-48 animate-pulse rounded bg-[var(--surface-3)]" />
      <div className="h-4 w-64 animate-pulse rounded bg-[var(--surface-3)]" />
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="h-10 w-64 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="h-96 animate-pulse rounded-lg bg-[var(--surface-3)]" />
        </div>
        <div className="h-96 animate-pulse rounded-lg bg-[var(--surface-3)]" />
      </div>
    </div>
  );
}

interface EventDetailPageContentProps {
  event: Event;
  eventsPath: string;
}

function EventDetailPageContent({ event, eventsPath }: EventDetailPageContentProps) {
  const title = formatEventTitleInline(event);

  return (
    <EventDetailLayout
      titleBarProps={{
        title,
        subtitle:
          "Configure every event detail, guest experience, message, list, and lifecycle setting.",
        breadcrumb: [
          { label: "Workspace" },
          { label: "Events", href: eventsPath },
          { label: title },
        ],
        actions: <EventDetailActions event={event} />,
      }}
      propertyPanel={<EventPropertyPanel event={event} />}
    >
      <EditEventDialog
        event={event}
        inline
        initialTab="guests"
        variant="linear"
        showTrigger={false}
        additionalTabTriggers={
          <LinearTabsTrigger value="guests" className="flex-none gap-1.5">
            <Users className="h-4 w-4" />
            Guests
          </LinearTabsTrigger>
        }
        additionalTabContents={
          <TabsContent value="guests" className="pt-5">
            <EventGuestsTab eventId={event._id} />
          </TabsContent>
        }
      />
    </EventDetailLayout>
  );
}

export default function EventDetailPage() {
  const params = useParams();
  const workspaceScope = useWorkspaceScope();
  const eventsPath = useWorkspaceOperationPath("host", "events");
  const eventId = params.eventId as Id<"events">;

  const event = useQuery(
    api.events.get,
    workspaceScope ? { eventId, ...workspaceScope.queryArgs } : "skip",
  ) as Event | null | undefined;

  if (event === undefined) {
    return <EventDetailSkeleton />;
  }

  if (event === null) {
    return (
      <div className="flex-1 space-y-5">
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-[var(--border-subtle)]">
          <p className="text-lg text-[var(--text-primary)]">Event not found</p>
          <p className="text-sm text-[var(--text-secondary)]">
            This event may have been deleted or you do not have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <EventEditProvider>
      <EventDetailPageContent event={event} eventsPath={eventsPath} />
    </EventEditProvider>
  );
}
