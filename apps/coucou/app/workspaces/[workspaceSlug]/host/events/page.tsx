"use client";

import { api } from "@convex/_generated/api";
import { resolveEventEndTimestamp } from "@convex/lib/eventTiming";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle,
  Edit,
  EyeOff,
  Grid,
  List,
  MoreHorizontal,
  Search,
  Share,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ShareEventPopover } from "@/components/share-event-popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { formatEventTitleInline } from "@/lib/event-display";
import {
  getEventLifecycleActionLabel,
  runEventLifecycleAction,
} from "@/lib/event-lifecycle-actions";
import { buildPublicEventUrl } from "@/lib/event-public-url";
import type { Event } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { formatEventDateTime } from "@/lib/utils";
import EditEventDialog from "./edit-event-dialog";
import EventCardClient from "./event-card-client";
import CreatedToastOnce from "./toast-client";

type ViewMode = "card" | "list";
type SortOption = "date" | "name" | "rsvps";
type FilterOption = "all" | "draft" | "upcoming" | "past";

type EventWithFlyer = { event: Event; flyerUrl: string | null };

export default function EventsPage() {
  const router = useRouter();
  const workspaceScope = useWorkspaceScope();
  const newEventPath = useWorkspaceOperationPath("host", "new");
  const eventEntries = useQuery(api.events.listAllWithFlyerUrls, {
    ...(workspaceScope?.queryArgs ?? {}),
  }) as EventWithFlyer[] | undefined;
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");

  const filteredAndSortedEntries = useMemo(() => {
    if (!eventEntries) return [];

    const filtered = eventEntries.filter(({ event }) => {
      // Search filter
      const normalizedQuery = searchQuery.toLowerCase();
      const matchesSearch =
        event.name?.toLowerCase().includes(normalizedQuery) ||
        event.secondaryTitle?.toLowerCase().includes(normalizedQuery) ||
        event.location?.toLowerCase().includes(normalizedQuery);
      if (!matchesSearch) return false;

      // Lifecycle / time filter
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

    // Sort
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
    <div className="flex-1 space-y-4">
      <CreatedToastOnce />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Events</h2>
          <p className="text-muted-foreground">Manage and view all your events</p>
        </div>
        <Button onClick={() => router.push(newEventPath)}>+ New Event</Button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Filters */}
          <Select value={filterBy} onValueChange={(value) => setFilterBy(value as FilterOption)}>
            <SelectOption value="all">All Events</SelectOption>
            <SelectOption value="draft">Drafts</SelectOption>
            <SelectOption value="upcoming">Upcoming</SelectOption>
            <SelectOption value="past">Past</SelectOption>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectOption value="date">Sort by Date</SelectOption>
            <SelectOption value="name">Sort by Name</SelectOption>
            <SelectOption value="rsvps">Sort by RSVPs</SelectOption>
          </Select>
        </div>

        {/* View Toggle */}
        <div className="flex gap-1 border rounded-lg p-1">
          <Button
            variant={viewMode === "card" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("card")}
            className="px-2"
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="px-2"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Results Count */}
      {eventEntries && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredAndSortedEntries.length} of {eventEntries.length} events
        </div>
      )}

      {/* Empty State */}
      {(!eventEntries || eventEntries.length === 0) && (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <p className="text-lg text-muted-foreground mb-2">No events yet</p>
          <p className="text-sm text-muted-foreground">Create your first event to get started</p>
        </div>
      )}

      {/* No Results State */}
      {eventEntries && eventEntries.length > 0 && filteredAndSortedEntries.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <p className="text-lg text-muted-foreground mb-2">No events found</p>
          <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
        </div>
      )}

      {/* Events Display */}
      {viewMode === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedEntries.map(({ event, flyerUrl }) => (
            <EventCard key={event._id} event={event} flyerUrl={flyerUrl} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAndSortedEntries.map(({ event }) => (
            <EventListItem key={event._id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event, flyerUrl }: { event: Event; flyerUrl: string | null }) {
  return <EventCardClient event={event} fileUrl={flyerUrl} />;
}

function EventListItem({ event }: { event: Event }) {
  const router = useRouter();
  const workspaceScope = useWorkspaceScope();
  const rsvpsPath = useWorkspaceOperationPath("host", `rsvps?eventId=${event._id}`);
  const editDraftPath = useWorkspaceOperationPath("host", `new?draftId=${event._id}`);
  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    workspaceScope ? { slug: workspaceScope.workspaceSlug } : "skip",
  );
  const [showEditDialog, setShowEditDialog] = useState(false);
  const removeEvent = useMutation(api.events.remove);
  const setFeaturedEvent = useMutation(api.events.setFeaturedEvent);
  const publishEvent = useMutation(api.events.publishEvent);
  const unpublishEvent = useMutation(api.events.unpublishEvent);
  const inlineTitle = formatEventTitleInline(event);
  const lifecycle = event.lifecycle ?? "published";
  const isDraft = lifecycle === "draft";
  const now = Date.now();
  const endTimestamp =
    resolveEventEndTimestamp({
      eventDate: event.eventDate,
      eventEndDate: event.eventEndDate,
    }) ?? 0;
  const isPast = !isDraft && endTimestamp > 0 && endTimestamp < now;
  const badgeLabel = isDraft ? "Draft" : isPast ? "Past" : "Published";
  const badgeVariant: "secondary" | "outline" | "success" = isDraft
    ? "outline"
    : isPast
      ? "outline"
      : "success";
  const publicEventUrl = buildPublicEventUrl(workspace ?? null, event, {
    currentOrigin: typeof window !== "undefined" ? window.location.origin : null,
    vercelEnvironment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  });
  const canShareEvent = Boolean(publicEventUrl);
  const lifecycleActionLabel = getEventLifecycleActionLabel(isDraft);

  const togglePublish = async () => {
    try {
      const lifecycleActionResult = await runEventLifecycleAction({
        eventId: event._id,
        isDraft,
        workspaceScope,
        publishEvent,
        unpublishEvent,
      });
      if (lifecycleActionResult === "published") {
        toast.success("Event published");
      }
      if (lifecycleActionResult === "unpublished") {
        toast.success("Event unpublished");
      }
      if (lifecycleActionResult === "skipped") return;
      router.refresh();
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to update lifecycle");
    }
  };

  const handleViewClick = () => {
    if (isDraft) {
      router.push(editDraftPath);
      return;
    }
    if (publicEventUrl) {
      window.open(publicEventUrl, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(`/events/${event._id}`);
  };

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate max-w-[18rem]">{inlineTitle}</h3>
              {event.isFeatured && (
                <Badge variant="secondary" className="text-xs">
                  Featured
                </Badge>
              )}
              <Badge variant={badgeVariant} className="text-xs capitalize">
                {badgeLabel}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {formatEventDateTime(event.eventDate, event.eventTimezone)} • {event.location}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleViewClick}>
            {isDraft ? "Continue editing" : "View"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(rsvpsPath)}>
            RSVPs
          </Button>
          {canShareEvent ? (
            <ShareEventPopover
              eventId={event._id}
              eventUrl={publicEventUrl}
              siteKey={workspaceScope?.siteKey}
              workspaceSlug={workspaceScope?.workspaceSlug}
            >
              <Button variant="outline" size="sm" className="rounded-full" aria-label="Share event">
                <Share className="h-4 w-4" />
              </Button>
            </ShareEventPopover>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              aria-label="Share event"
              disabled
            >
              <Share className="h-4 w-4" />
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Open event actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void togglePublish();
                }}
              >
                {isDraft ? (
                  <CheckCircle className="mr-2 h-4 w-4" />
                ) : (
                  <EyeOff className="mr-2 h-4 w-4" />
                )}
                {lifecycleActionLabel}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async (e) => {
                  e.preventDefault();
                  if (!workspaceScope) {
                    return;
                  }
                  try {
                    await setFeaturedEvent({
                      eventId: event._id,
                      ...workspaceScope.queryArgs,
                    });
                    toast.success(`"${inlineTitle}" is now the featured event`);
                    router.refresh();
                  } catch (error) {
                    toast.error("Failed to set featured event: " + (error as Error).message);
                  }
                }}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Set as Featured
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove the event and its list credentials.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        if (!workspaceScope) {
                          return;
                        }
                        await removeEvent({
                          eventId: event._id,
                          ...workspaceScope.queryArgs,
                        });
                        router.refresh();
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <EditEventDialog
          event={event}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          showTrigger={false}
        />
      </CardContent>
    </Card>
  );
}
