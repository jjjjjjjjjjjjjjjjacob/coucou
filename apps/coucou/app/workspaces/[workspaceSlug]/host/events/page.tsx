"use client";

import { api } from "@convex/_generated/api";
import { resolveEventEndTimestamp } from "@convex/lib/eventTiming";
import { useQuery } from "convex/react";
import { Grid, List, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { EventListRow } from "@/components/event-list-row";
import { PageToolbar } from "@/components/page-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Event } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import EventCardClient from "./event-card-client";
import CreatedToastOnce from "./toast-client";

type ViewMode = "card" | "list";
type SortOption = "date" | "name" | "rsvps";
type FilterOption = "all" | "draft" | "upcoming" | "past";

type EventWithFlyer = { event: Event; flyerUrl: string | null };

function EventsLoadingState() {
  return (
    <div role="status" aria-label="Loading events" className="grid grid-cols-1 gap-3">
      <span className="sr-only">Loading events</span>
      {Array.from({ length: 5 }).map((_, eventRowIndex) => (
        <div
          key={`event-loading-row-${eventRowIndex}`}
          className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="size-8 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function EventsPage() {
  const router = useRouter();
  const workspaceScope = useWorkspaceScope();
  const newEventPath = useWorkspaceOperationPath("host", "new");
  const eventEntries = useQuery(
    api.events.listAllWithFlyerUrls,
    workspaceScope ? workspaceScope.queryArgs : "skip",
  ) as EventWithFlyer[] | undefined;
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");

  const filteredAndSortedEntries = useMemo(() => {
    if (!eventEntries) return [];

    const filtered = eventEntries.filter(({ event }) => {
      const normalizedQuery = searchQuery.toLowerCase();
      const matchesSearch =
        (event.name?.toLowerCase() ?? "").includes(normalizedQuery) ||
        (event.secondaryTitle?.toLowerCase() ?? "").includes(normalizedQuery) ||
        (event.location?.toLowerCase() ?? "").includes(normalizedQuery);
      if (!matchesSearch) return false;

      if (filterBy === "all") return true;

      const lifecycle = event.lifecycle ?? "published";
      if (filterBy === "draft") return lifecycle === "draft";

      if (lifecycle === "draft") return false;
      const now = Date.now();
      const endTimestamp =
        resolveEventEndTimestamp({
          eventDate: event.eventDate,
          eventEndDate: event.eventEndDate,
        }) ?? 0;
      const isPast = endTimestamp > 0 && endTimestamp < now;
      if (filterBy === "upcoming") return !isPast;
      if (filterBy === "past") return isPast;

      return true;
    });

    filtered.sort((firstEntry, secondEntry) => {
      const firstEvent = firstEntry.event;
      const secondEvent = secondEntry.event;
      switch (sortBy) {
        case "name":
          return (firstEvent.name || "").localeCompare(secondEvent.name || "");
        case "date":
          return (secondEvent.eventDate || 0) - (firstEvent.eventDate || 0);
        case "rsvps":
          return 0;
        default:
          return 0;
      }
    });

    return filtered;
  }, [eventEntries, searchQuery, sortBy, filterBy]);

  return (
    <div className="flex-1 space-y-5">
      <CreatedToastOnce />

      <DashboardTitleBar
        title="Events"
        subtitle="Manage and view all your events"
        breadcrumb={[{ label: "Workspace" }, { label: "Events" }]}
        actions={
          <Button onClick={() => router.push(newEventPath)}>
            <Plus className="h-4 w-4" />
            New Event
          </Button>
        }
      />

      <PageToolbar
        mobileFilterContent={
          <>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">Filter</label>
              <Select
                value={filterBy}
                onValueChange={(value) => setFilterBy(value as FilterOption)}
              >
                <SelectOption value="all">All Events</SelectOption>
                <SelectOption value="draft">Drafts</SelectOption>
                <SelectOption value="upcoming">Upcoming</SelectOption>
                <SelectOption value="past">Past</SelectOption>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-secondary)]">Sort</label>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectOption value="date">Sort by Date</SelectOption>
                <SelectOption value="name">Sort by Name</SelectOption>
                <SelectOption value="rsvps">Sort by RSVPs</SelectOption>
              </Select>
            </div>
          </>
        }
      >
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
          <Input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-8 border-[var(--border-subtle)] bg-transparent pl-8 text-sm"
          />
        </div>
        <Select
          value={filterBy}
          onValueChange={(value) => setFilterBy(value as FilterOption)}
          className="hidden h-8 w-36 border-[var(--border-subtle)] bg-transparent text-sm sm:inline-flex"
        >
          <SelectOption value="all">All Events</SelectOption>
          <SelectOption value="draft">Drafts</SelectOption>
          <SelectOption value="upcoming">Upcoming</SelectOption>
          <SelectOption value="past">Past</SelectOption>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(value) => setSortBy(value as SortOption)}
          className="hidden h-8 w-40 border-[var(--border-subtle)] bg-transparent text-sm sm:inline-flex"
        >
          <SelectOption value="date">Sort by Date</SelectOption>
          <SelectOption value="name">Sort by Name</SelectOption>
          <SelectOption value="rsvps">Sort by RSVPs</SelectOption>
        </Select>

        <div className="ml-auto flex w-fit items-center gap-1 rounded-md border border-[var(--border-subtle)] p-1">
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="size-7"
            aria-label="Show list view"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "card" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("card")}
            className="size-7"
            aria-label="Show grid view"
          >
            <Grid className="h-4 w-4" />
          </Button>
        </div>
      </PageToolbar>

      {eventEntries ? (
        <div className="text-xs tabular-nums text-[var(--text-secondary)]">
          Showing {filteredAndSortedEntries.length} of {eventEntries.length} events
        </div>
      ) : null}

      {eventEntries === undefined ? <EventsLoadingState /> : null}

      {eventEntries !== undefined && eventEntries.length === 0 && (
        <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
          <p className="text-lg text-[var(--text-secondary)]">No events yet</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Create your first event to get started
          </p>
        </div>
      )}

      {eventEntries && eventEntries.length > 0 && filteredAndSortedEntries.length === 0 && (
        <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
          <p className="text-lg text-[var(--text-secondary)]">No events found</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Try adjusting your search or filters
          </p>
        </div>
      )}

      {viewMode === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredAndSortedEntries.map(({ event, flyerUrl }) => (
            <EventCardClient key={event._id} event={event} fileUrl={flyerUrl} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredAndSortedEntries.map(({ event }) => (
            <EventListRow key={event._id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
