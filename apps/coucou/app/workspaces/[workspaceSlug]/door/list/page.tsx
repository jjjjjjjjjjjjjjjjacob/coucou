"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Filter, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectOption } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { hasEventSecondaryTitle } from "@/lib/event-display";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { CredentialResponse, Event } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";

type DoorListRsvp = {
  _id?: string;
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  status: string;
  listKey: string;
  attendees?: number;
  note?: string;
};

export default function GuestListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const listPath = useWorkspaceOperationPath("door", "list");

  const events = useQuery(api.events.listAll, {
    ...(workspaceScope?.queryArgs ?? {}),
  }) as Event[] | undefined;
  const eventsSorted = (events ?? [])
    .slice()
    .sort((firstEvent, secondEvent) => (secondEvent.eventDate ?? 0) - (firstEvent.eventDate ?? 0));
  const initialId = searchParams.get("eventId") ?? eventsSorted[0]?._id;
  const [eventId, setEventId] = React.useState<string | undefined>(initialId);
  const firstSortedEventId = eventsSorted[0]?._id as string | undefined;

  React.useEffect(() => {
    if (!eventId && firstSortedEventId) {
      setEventId(firstSortedEventId);
    }
  }, [eventId, firstSortedEventId]);

  const [guestSearch, setGuestSearch] = React.useState("");
  const debouncedGuest = useDebounce(guestSearch, 250);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [listFilter, setListFilter] = React.useState<string>("all");

  // Index-based pagination state
  const [pageIndex, setPageIndex] = React.useState(0);
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  // Reset page when filters change
  React.useEffect(() => {
    setPageIndex(0);
  }, [debouncedGuest, statusFilter, listFilter]);

  // Get all RSVPs for the event (no pagination)
  const allRsvps = useQuery(
    api.rsvps.listForEvent,
    eventId && workspaceScope
      ? { eventId: eventId as Id<"events">, ...workspaceScope.queryArgs }
      : "skip",
  ) as DoorListRsvp[] | undefined;

  // Apply filters and search client-side
  const filteredRsvps = React.useMemo(() => {
    if (!allRsvps) return [];

    return allRsvps.filter((rsvp) => {
      // Guest search filter
      if (debouncedGuest.trim()) {
        const searchTerm = debouncedGuest.toLowerCase();
        const name = (rsvp.name || rsvp.firstName || rsvp.lastName || "").toLowerCase();
        if (!name.includes(searchTerm)) return false;
      }

      // Status filter
      if (statusFilter !== "all" && rsvp.status !== statusFilter) {
        return false;
      }

      // List filter
      if (listFilter !== "all" && rsvp.listKey !== listFilter) {
        return false;
      }

      return true;
    });
  }, [allRsvps, debouncedGuest, statusFilter, listFilter]);

  // Apply pagination client-side
  const paginatedRsvps = React.useMemo(() => {
    const startIndex = pageIndex * pageSize;
    return filteredRsvps.slice(startIndex, startIndex + pageSize);
  }, [filteredRsvps, pageIndex, pageSize]);

  // Calculate pagination info
  const totalCount = filteredRsvps.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = pageIndex + 1;
  const startItem = totalCount === 0 ? 0 : pageIndex * pageSize + 1;
  const endItem = Math.min((pageIndex + 1) * pageSize, totalCount);

  const listCredentials = useQuery(
    api.credentials.getCredsForEvent,
    eventId && workspaceScope
      ? { eventId: eventId as Id<"events">, ...workspaceScope.queryArgs }
      : "skip",
  ) as CredentialResponse[] | undefined;

  const hasActiveFilters =
    guestSearch.trim() !== "" || statusFilter !== "all" || listFilter !== "all";

  const clearAllFilters = () => {
    setGuestSearch("");
    setStatusFilter("all");
    setListFilter("all");
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "approved":
        return "bg-green-100 text-green-800 border-green-200";
      case "denied":
        return "bg-red-100 text-red-800 border-red-200";
      case "redeemed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "issued":
        return "bg-teal-100 text-teal-800 border-teal-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (!eventId || allRsvps === undefined) {
    return <TableSkeleton rows={10} columns={5} />;
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm text-foreground/70">Event:</span>
        <Select value={eventId} onValueChange={setEventId} className="max-w-sm">
          {eventsSorted.map((event) => {
            const eventDate = new Date(event.eventDate);
            const formattedDate = eventDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: event.eventTimezone ?? "UTC",
            });
            return (
              <SelectOption key={event._id} value={event._id}>
                <div className="flex flex-col">
                  <span className="font-medium leading-tight">{event.name}</span>
                  {hasEventSecondaryTitle(event) && (
                    <span className="text-xs text-muted-foreground leading-tight">
                      {event.secondaryTitle}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                </div>
              </SelectOption>
            );
          })}
        </Select>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search guests..."
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {totalCount} guests{hasActiveFilters && " (filtered)"}
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter} className="w-32">
          <SelectOption value="all">All Status</SelectOption>
          <SelectOption value="pending">Pending</SelectOption>
          <SelectOption value="approved">Approved</SelectOption>
          <SelectOption value="denied">Denied</SelectOption>
          <SelectOption value="issued">Issued</SelectOption>
          <SelectOption value="redeemed">Redeemed</SelectOption>
        </Select>

        <Select value={listFilter} onValueChange={setListFilter} className="w-32">
          <SelectOption value="all">All Lists</SelectOption>
          {(listCredentials ?? []).map((credential) => (
            <SelectOption key={credential._id} value={credential.listKey}>
              {credential.listKey.toUpperCase()}
            </SelectOption>
          ))}
        </Select>

        {hasActiveFilters && (
          <Button size="sm" variant="outline" onClick={clearAllFilters} className="text-xs">
            Clear All
          </Button>
        )}
      </div>

      {hasActiveFilters && (
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm text-foreground/70">Active filters:</span>
          {guestSearch.trim() !== "" && (
            <Badge variant="secondary" className="gap-1">
              Search: &ldquo;{guestSearch}&rdquo;
              <button
                onClick={() => setGuestSearch("")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Status: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
              <button
                onClick={() => setStatusFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {listFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              List: {listFilter.toUpperCase()}
              <button
                onClick={() => setListFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-foreground/70 border-b">
              <th className="px-4 py-3 font-medium">Guest</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">List</th>
              <th className="px-4 py-3 font-medium">Attendees</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRsvps.map((rsvp) => (
              <tr key={rsvp.id ?? rsvp._id} className="border-b hover:bg-muted/20">
                <td className="px-4 py-3">
                  {rsvp.name || rsvp.firstName || rsvp.lastName || "(unknown)"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={cn(getStatusBadgeClass(rsvp.status))}>
                    {rsvp.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className="text-muted-foreground">{rsvp.listKey.toUpperCase()}</span>
                </td>
                <td className="px-4 py-3">{rsvp.attendees ?? 1}</td>
                <td className="px-4 py-3 max-w-xs truncate">{rsvp.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginatedRsvps.length === 0 && filteredRsvps.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          No guests found{hasActiveFilters && " matching your filters"}
        </div>
      )}

      {paginatedRsvps.length === 0 && filteredRsvps.length > 0 && (
        <div className="text-center py-10 text-muted-foreground">
          No guests on this page. Try a different page or adjust your filters.
        </div>
      )}

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between gap-3 pt-4 border-t">
          <div className="flex items-center gap-4">
            <div className="text-sm text-foreground/70">
              {totalCount === 0 ? (
                <span>No guests found{hasActiveFilters && " (filtered)"}</span>
              ) : (
                <span>
                  Showing {startItem}-{endItem} of {totalCount} guests
                  {hasActiveFilters && " (filtered)"}
                </span>
              )}
            </div>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("pageSize", value);
                router.replace(`${listPath}?${params.toString()}`, {
                  scroll: false,
                });
                setPageIndex(0);
              }}
            >
              {[10, 20, 50, 100].map((number) => (
                <SelectOption key={number} value={String(number)}>
                  {number} per page
                </SelectOption>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <Pagination className="justify-end">
              <PaginationContent className="gap-1 sm:gap-2">
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                    className={cn(
                      "h-8 w-8 sm:h-9 sm:w-auto sm:px-3",
                      pageIndex === 0 ? "pointer-events-none opacity-50" : "cursor-pointer",
                    )}
                  />
                </PaginationItem>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                </div>

                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPageIndex(Math.min(totalPages - 1, pageIndex + 1))}
                    className={cn(
                      "h-8 w-8 sm:h-9 sm:w-auto sm:px-3",
                      pageIndex >= totalPages - 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer",
                    )}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}
    </div>
  );
}
