"use client";

import { Columns, X } from "lucide-react";
import { useRsvpTableContext } from "@/app/workspaces/[workspaceSlug]/host/rsvps/page";
import type { ApprovalStatusOption } from "@/components/rsvps/rsvp-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectOption } from "@/components/ui/select";
import { formatEventTitleInline } from "@/lib/event-display";
import type { Event } from "@/lib/types";

type ApprovalFilterOption = "all" | ApprovalStatusOption;
type SortOrderOption = "asc" | "desc";

interface RsvpToolbarProps {
  eventsSorted: Event[];
  eventId: string | undefined;
  setEventId: (value: string) => void;
  guestSearch: string;
  setGuestSearch: (value: string) => void;
  approvalFilter: ApprovalFilterOption;
  setApprovalFilter: (value: ApprovalFilterOption) => void;
  listFilter: string;
  setListFilter: (value: string) => void;
  redemptionFilter: string;
  setRedemptionFilter: (value: string) => void;
  socialPlatformFilter: string;
  setSocialPlatformFilter: (value: string) => void;
  sortBy: string;
  setSortBy: (value: string) => void;
  sortOrder: SortOrderOption;
  setSortOrder: (value: SortOrderOption) => void;
  uniqueApprovalStatuses: ApprovalStatusOption[];
  uniqueListKeys: string[];
  shouldShowSocialPlatformFilter: boolean;
  currentEventSocialPlatforms: Array<{ platformKey: string; label: string }>;
  currentEvent: Event | null | undefined;
  columnVisibilityOpen: boolean;
  setColumnVisibilityOpen: (open: boolean) => void;
  visibleColumns: Set<string>;
  columnVisibility: Record<string, boolean>;
  handleColumnVisibilityChange: (visibility: Record<string, boolean>) => void;
  getAllAvailableColumnIds: () => string[];
  getColumnDisplayName: (columnId: string) => string;
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
  rsvpCount: number;
  showEventSelector?: boolean;
}

export function RsvpToolbar({
  eventsSorted,
  eventId,
  setEventId,
  guestSearch,
  setGuestSearch,
  approvalFilter,
  setApprovalFilter,
  listFilter,
  setListFilter,
  redemptionFilter,
  setRedemptionFilter,
  socialPlatformFilter,
  setSocialPlatformFilter,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  uniqueApprovalStatuses,
  uniqueListKeys,
  shouldShowSocialPlatformFilter,
  currentEventSocialPlatforms,
  currentEvent,
  columnVisibilityOpen,
  setColumnVisibilityOpen,
  visibleColumns,
  columnVisibility,
  handleColumnVisibilityChange,
  getAllAvailableColumnIds,
  getColumnDisplayName,
  hasActiveFilters,
  clearAllFilters,
  rsvpCount,
  showEventSelector = true,
}: RsvpToolbarProps) {
  const { isReadOnly } = useRsvpTableContext();

  return (
    <div className="space-y-3">
      {showEventSelector ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[var(--text-secondary)]">Event:</span>
          <Select
            value={eventId}
            onValueChange={setEventId}
            className="h-8 max-w-sm border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
          >
            {eventsSorted.map((event) => {
              const inlineTitle = formatEventTitleInline(event);
              return (
                <SelectOption key={event._id} value={event._id}>
                  {new Date(event.eventDate).toLocaleDateString()} • {inlineTitle}
                </SelectOption>
              );
            })}
          </Select>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          className="h-8 max-w-xs border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
          placeholder="Search guest, social, invited by"
          value={guestSearch}
          onChange={(event) => setGuestSearch(event.target.value)}
        />
        <span className="mx-2 h-6 w-px bg-[var(--border-subtle)]" />

        <Select
          value={approvalFilter}
          onValueChange={(value) => setApprovalFilter(value as ApprovalFilterOption)}
          className="h-8 w-32 border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
        >
          <SelectOption value="all">All Approval</SelectOption>
          {uniqueApprovalStatuses.map((status) => (
            <SelectOption key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </SelectOption>
          ))}
        </Select>

        <Select
          value={listFilter}
          onValueChange={setListFilter}
          className="h-8 w-32 border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
        >
          <SelectOption value="all">All Lists</SelectOption>
          {uniqueListKeys.map((listKey) => (
            <SelectOption key={listKey} value={listKey}>
              {listKey.toUpperCase()}
            </SelectOption>
          ))}
        </Select>

        <Select
          value={redemptionFilter}
          onValueChange={setRedemptionFilter}
          className="h-8 w-36 border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
        >
          <SelectOption value="all">All Tickets</SelectOption>
          <SelectOption value="issued">Issued</SelectOption>
          <SelectOption value="redeemed">Redeemed</SelectOption>
          <SelectOption value="disabled">Disabled</SelectOption>
          <SelectOption value="not-issued">None</SelectOption>
        </Select>

        {shouldShowSocialPlatformFilter && (
          <Select
            value={socialPlatformFilter}
            onValueChange={setSocialPlatformFilter}
            className="h-8 w-36 border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
          >
            <SelectOption value="all">All Socials</SelectOption>
            {currentEventSocialPlatforms.map((platform) => (
              <SelectOption key={platform.platformKey} value={platform.platformKey}>
                {platform.label}
              </SelectOption>
            ))}
          </Select>
        )}

        <span className="mx-2 h-6 w-px bg-[var(--border-subtle)]" />

        <Select
          value={sortBy}
          onValueChange={setSortBy}
          className="h-8 w-36 border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
        >
          <SelectOption value="createdAt">Created Date</SelectOption>
          <SelectOption value="updatedAt">Updated Date</SelectOption>
          <SelectOption value="name">Guest Name</SelectOption>
          <SelectOption value="firstName">First Name</SelectOption>
          <SelectOption value="lastName">Last Name</SelectOption>
          <SelectOption value="approvalStatus">Approval Status</SelectOption>
          <SelectOption value="attendanceStatus">Attendance Status</SelectOption>
          <SelectOption value="ticketStatus">Ticket Status</SelectOption>
          <SelectOption value="ticketViewedAt">Ticket Viewed</SelectOption>
          <SelectOption value="listKey">List</SelectOption>
          <SelectOption value="attendees">Attendees</SelectOption>
          {currentEvent?.primaryFieldConfig?.invitedBy?.enabled === true && (
            <SelectOption value="invitedByName">
              {currentEvent.primaryFieldConfig.invitedBy.label ?? "Invited By"}
            </SelectOption>
          )}
          <SelectOption value="referredByName">Referred By</SelectOption>
          {currentEvent?.primaryFieldConfig?.socialPlatforms?.map((platform) => (
            <SelectOption
              key={`sort-${platform.platformKey}`}
              value={`social:${platform.platformKey}`}
            >
              {platform.label}
            </SelectOption>
          ))}
        </Select>

        <Select
          value={sortOrder}
          onValueChange={(value) => setSortOrder(value as SortOrderOption)}
          className="h-8 w-28 border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
        >
          <SelectOption value="desc">Descending</SelectOption>
          <SelectOption value="asc">Ascending</SelectOption>
        </Select>

        <span className="mx-2 h-6 w-px bg-[var(--border-subtle)]" />

        <Popover open={columnVisibilityOpen} onOpenChange={setColumnVisibilityOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
            >
              <Columns className="h-4 w-4 mr-2" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 border-[var(--border-subtle)] bg-[var(--surface-2)]"
            align="end"
          >
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-2 text-[var(--text-primary)]">
                  Show Columns
                </h4>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {getAllAvailableColumnIds()
                  .filter(
                    (columnId) => columnId !== "select" && (!isReadOnly || columnId !== "actions"),
                  )
                  .map((columnId) => {
                    const displayName = getColumnDisplayName(columnId);
                    const isVisible = visibleColumns.has(columnId);
                    return (
                      <div key={columnId} className="flex items-center">
                        <Checkbox
                          id={`column-${columnId}`}
                          checked={isVisible}
                          onCheckedChange={(checked) => {
                            handleColumnVisibilityChange({
                              ...columnVisibility,
                              [columnId]: checked === true,
                            });
                          }}
                        />
                        <label
                          htmlFor={`column-${columnId}`}
                          className="ml-2 text-sm cursor-pointer text-[var(--text-primary)]"
                        >
                          {displayName}
                        </label>
                      </div>
                    );
                  })}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button
            size="sm"
            variant="outline"
            onClick={clearAllFilters}
            className="text-xs border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[var(--text-secondary)]">Active filters:</span>
          {guestSearch.trim() !== "" && (
            <Badge
              variant="secondary"
              className="gap-1 border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-primary)]"
            >
              Search: &ldquo;{guestSearch}&rdquo;
              <button
                onClick={() => setGuestSearch("")}
                className="ml-1 hover:bg-[var(--surface-4)] rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {approvalFilter !== "all" && (
            <Badge
              variant="secondary"
              className="gap-1 border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-primary)]"
            >
              Approval: {approvalFilter.charAt(0).toUpperCase() + approvalFilter.slice(1)}
              <button
                onClick={() => setApprovalFilter("all")}
                className="ml-1 hover:bg-[var(--surface-4)] rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {listFilter !== "all" && (
            <Badge
              variant="secondary"
              className="gap-1 border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-primary)]"
            >
              List: {listFilter.toUpperCase()}
              <button
                onClick={() => setListFilter("all")}
                className="ml-1 hover:bg-[var(--surface-4)] rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {redemptionFilter !== "all" && (
            <Badge
              variant="secondary"
              className="gap-1 border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-primary)]"
            >
              Ticket:{" "}
              {redemptionFilter === "not-issued"
                ? "None"
                : redemptionFilter.charAt(0).toUpperCase() + redemptionFilter.slice(1)}
              <button
                onClick={() => setRedemptionFilter("all")}
                className="ml-1 hover:bg-[var(--surface-4)] rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {shouldShowSocialPlatformFilter && socialPlatformFilter !== "all" && (
            <Badge
              variant="secondary"
              className="gap-1 border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-primary)]"
            >
              Social:{" "}
              {currentEventSocialPlatforms.find(
                (platform) => platform.platformKey === socialPlatformFilter,
              )?.label ?? socialPlatformFilter}
              <button
                onClick={() => setSocialPlatformFilter("all")}
                className="ml-1 hover:bg-[var(--surface-4)] rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          <span className="text-xs text-[var(--text-tertiary)]">
            (Showing {rsvpCount} guests on this page)
          </span>
        </div>
      )}
    </div>
  );
}
