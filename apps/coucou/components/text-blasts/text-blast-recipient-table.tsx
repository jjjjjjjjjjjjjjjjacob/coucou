"use client";

import type { Id } from "@convex/_generated/dataModel";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { RECIPIENT_STATUS_LABELS, type RecipientApprovalStatus } from "@/lib/text-blast-filters";

export interface TextBlastRecipientRow {
  rsvpId: Id<"rsvps">;
  name: string;
  listKey: string;
  eventId: Id<"events">;
  eventName: string;
  approvalStatus: RecipientApprovalStatus;
  attendanceStatus: "yes" | "no" | "maybe";
  ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed";
  smsConsent: boolean;
  createdAt: number;
}

interface TextBlastRecipientTableProps {
  recipients: TextBlastRecipientRow[] | undefined;
  selectedRsvpIds: Id<"rsvps">[];
  sendableRecipientCount: number;
  listOptions: string[];
  onSelectedRsvpIdsChange: (selectedRsvpIds: Id<"rsvps">[]) => void;
}

type RecipientSortOption =
  | "name"
  | "eventName"
  | "listKey"
  | "approvalStatus"
  | "attendanceStatus"
  | "ticketStatus"
  | "createdAt";

type RecipientSortDirection = "asc" | "desc";
type SmsConsentFilter = "all" | "consented" | "not_consented";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function getAttendanceStatusLabel(
  attendanceStatus: TextBlastRecipientRow["attendanceStatus"],
): string {
  switch (attendanceStatus) {
    case "yes":
      return "Yes";
    case "no":
      return "No";
    case "maybe":
      return "Maybe";
  }
}

function getTicketStatusLabel(ticketStatus: TextBlastRecipientRow["ticketStatus"]): string {
  switch (ticketStatus) {
    case "issued":
      return "Issued";
    case "redeemed":
      return "Redeemed";
    case "disabled":
      return "Disabled";
    case "not-issued":
      return "None";
  }
}

function getRecipientSortValue(
  recipient: TextBlastRecipientRow,
  sortBy: RecipientSortOption,
): number | string {
  switch (sortBy) {
    case "eventName":
      return recipient.eventName;
    case "listKey":
      return recipient.listKey;
    case "approvalStatus":
      return recipient.approvalStatus;
    case "attendanceStatus":
      return recipient.attendanceStatus;
    case "ticketStatus":
      return recipient.ticketStatus;
    case "createdAt":
      return recipient.createdAt;
    case "name":
      return recipient.name;
  }
}

export function TextBlastRecipientTable({
  recipients,
  selectedRsvpIds,
  sendableRecipientCount,
  listOptions,
  onSelectedRsvpIdsChange,
}: TextBlastRecipientTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [approvalFilter, setApprovalFilter] = useState<"all" | RecipientApprovalStatus>("all");
  const [smsConsentFilter, setSmsConsentFilter] = useState<SmsConsentFilter>("all");
  const [sortBy, setSortBy] = useState<RecipientSortOption>("name");
  const [sortDirection, setSortDirection] = useState<RecipientSortDirection>("asc");
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(1);

  const selectedRsvpIdsSet = useMemo(() => new Set(selectedRsvpIds), [selectedRsvpIds]);
  const filteredRecipients = useMemo(() => {
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const matchingRecipients = (recipients ?? []).filter((recipient) => {
      if (
        normalizedSearchQuery &&
        ![
          recipient.name,
          recipient.eventName,
          recipient.listKey,
          recipient.approvalStatus,
          recipient.attendanceStatus,
          recipient.ticketStatus,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearchQuery)
      ) {
        return false;
      }

      if (listFilter !== "all" && recipient.listKey !== listFilter) {
        return false;
      }

      if (approvalFilter !== "all" && recipient.approvalStatus !== approvalFilter) {
        return false;
      }

      if (smsConsentFilter === "consented" && !recipient.smsConsent) {
        return false;
      }

      if (smsConsentFilter === "not_consented" && recipient.smsConsent) {
        return false;
      }

      return true;
    });

    return matchingRecipients.sort((firstRecipient, secondRecipient) => {
      const firstValue = getRecipientSortValue(firstRecipient, sortBy);
      const secondValue = getRecipientSortValue(secondRecipient, sortBy);
      const directionMultiplier = sortDirection === "asc" ? 1 : -1;
      const comparison =
        typeof firstValue === "number" && typeof secondValue === "number"
          ? firstValue - secondValue
          : String(firstValue).localeCompare(String(secondValue));

      return comparison === 0
        ? firstRecipient.name.localeCompare(secondRecipient.name)
        : directionMultiplier * comparison;
    });
  }, [
    approvalFilter,
    listFilter,
    recipients,
    searchQuery,
    smsConsentFilter,
    sortBy,
    sortDirection,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRecipients.length / pageSize));
  const boundedPage = Math.min(page, totalPages);
  const pageRecipients = useMemo(() => {
    const startIndex = (boundedPage - 1) * pageSize;
    return filteredRecipients.slice(startIndex, startIndex + pageSize);
  }, [boundedPage, filteredRecipients, pageSize]);
  const pageSelectedCount = pageRecipients.filter((recipient) =>
    selectedRsvpIdsSet.has(recipient.rsvpId),
  ).length;
  const areAllPageRecipientsSelected =
    pageRecipients.length > 0 && pageSelectedCount === pageRecipients.length;
  const areSomePageRecipientsSelected =
    pageSelectedCount > 0 && pageSelectedCount < pageRecipients.length;
  const areAllMatchingRecipientsSelected =
    filteredRecipients.length > 0 &&
    filteredRecipients.every((recipient) => selectedRsvpIdsSet.has(recipient.rsvpId));
  const firstVisibleRecipientNumber =
    filteredRecipients.length === 0 ? 0 : (boundedPage - 1) * pageSize + 1;
  const lastVisibleRecipientNumber = Math.min(boundedPage * pageSize, filteredRecipients.length);

  useEffect(() => {
    setPage(1);
  }, [approvalFilter, listFilter, pageSize, searchQuery, smsConsentFilter, sortBy, sortDirection]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const updateSelectedRecipients = (recipientIds: Id<"rsvps">[], shouldSelect: boolean): void => {
    const nextSelectedRsvpIds = new Set(selectedRsvpIds);
    for (const recipientId of recipientIds) {
      if (shouldSelect) {
        nextSelectedRsvpIds.add(recipientId);
      } else {
        nextSelectedRsvpIds.delete(recipientId);
      }
    }
    onSelectedRsvpIdsChange(Array.from(nextSelectedRsvpIds));
  };

  const toggleRecipient = (recipientId: Id<"rsvps">): void => {
    updateSelectedRecipients([recipientId], !selectedRsvpIdsSet.has(recipientId));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-3 xl:flex-row xl:items-center">
        <div className="relative min-w-64 flex-1">
          <Search
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <Input
            aria-label="Search recipients"
            placeholder="Search guests, events, or lists…"
            value={searchQuery}
            onChange={(changeEvent) => setSearchQuery(changeEvent.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={listFilter} onValueChange={setListFilter} className="w-36">
            <SelectOption value="all">All lists</SelectOption>
            {listOptions.map((listOption) => (
              <SelectOption key={listOption} value={listOption}>
                {listOption.toUpperCase()}
              </SelectOption>
            ))}
          </Select>
          <Select
            value={approvalFilter}
            onValueChange={(nextValue) =>
              setApprovalFilter(nextValue as "all" | RecipientApprovalStatus)
            }
            className="w-40"
          >
            <SelectOption value="all">All approval</SelectOption>
            {(Object.keys(RECIPIENT_STATUS_LABELS) as RecipientApprovalStatus[]).map(
              (approvalStatus) => (
                <SelectOption key={approvalStatus} value={approvalStatus}>
                  {RECIPIENT_STATUS_LABELS[approvalStatus]}
                </SelectOption>
              ),
            )}
          </Select>
          <Select
            value={smsConsentFilter}
            onValueChange={(nextValue) => setSmsConsentFilter(nextValue as SmsConsentFilter)}
            className="w-40"
          >
            <SelectOption value="all">Any SMS consent</SelectOption>
            <SelectOption value="consented">SMS consented</SelectOption>
            <SelectOption value="not_consented">No SMS consent</SelectOption>
          </Select>
          <Select
            value={sortBy}
            onValueChange={(nextValue) => setSortBy(nextValue as RecipientSortOption)}
            className="w-40"
          >
            <SelectOption value="name">Sort by guest</SelectOption>
            <SelectOption value="eventName">Sort by event</SelectOption>
            <SelectOption value="listKey">Sort by list</SelectOption>
            <SelectOption value="approvalStatus">Sort by approval</SelectOption>
            <SelectOption value="attendanceStatus">Sort by attendance</SelectOption>
            <SelectOption value="ticketStatus">Sort by ticket</SelectOption>
            <SelectOption value="createdAt">Sort by created</SelectOption>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 border-[var(--border-subtle)]"
            onClick={() =>
              setSortDirection((previousDirection) =>
                previousDirection === "asc" ? "desc" : "asc",
              )
            }
          >
            <ArrowUpDown aria-hidden="true" className="mr-1.5 h-4 w-4" />
            {sortDirection === "asc" ? "Ascending" : "Descending"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-2.5">
        <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
          <span className="font-medium text-[var(--text-primary)]">{selectedRsvpIds.length}</span>{" "}
          selected · {filteredRecipients.length} matching · {sendableRecipientCount} sendable
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {selectedRsvpIds.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelectedRsvpIdsChange([])}
            >
              Clear selection
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateSelectedRecipients(
                filteredRecipients.map((recipient) => recipient.rsvpId),
                true,
              )
            }
            disabled={filteredRecipients.length === 0 || areAllMatchingRecipientsSelected}
          >
            Select all matching
          </Button>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[940px] text-sm text-[var(--text-primary)]">
          <thead className="bg-[var(--surface-1)] text-left text-[var(--text-secondary)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="w-12 px-3 py-2.5">
                <Checkbox
                  aria-label="Select all recipients on this page"
                  checked={
                    areAllPageRecipientsSelected
                      ? true
                      : areSomePageRecipientsSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checkedState) =>
                    updateSelectedRecipients(
                      pageRecipients.map((recipient) => recipient.rsvpId),
                      checkedState === true,
                    )
                  }
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Guest</th>
              <th className="px-3 py-2.5 font-medium">Event</th>
              <th className="px-3 py-2.5 font-medium">List</th>
              <th className="px-3 py-2.5 font-medium">Approval</th>
              <th className="px-3 py-2.5 font-medium">Attendance</th>
              <th className="px-3 py-2.5 font-medium">Ticket</th>
              <th className="px-3 py-2.5 font-medium">SMS consent</th>
              <th className="px-3 py-2.5 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {recipients === undefined ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-[var(--text-secondary)]">
                  Loading recipients…
                </td>
              </tr>
            ) : pageRecipients.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-[var(--text-secondary)]">
                  <p className="font-medium text-[var(--text-primary)]">No guests found</p>
                  <p className="mt-1 text-xs">Try adjusting the search or table filters.</p>
                </td>
              </tr>
            ) : (
              pageRecipients.map((recipient) => {
                const isSelected = selectedRsvpIdsSet.has(recipient.rsvpId);
                return (
                  <tr
                    key={recipient.rsvpId}
                    className="border-b border-[var(--border-subtle)] transition-colors last:border-b-0 hover:bg-[var(--surface-3)]"
                  >
                    <td className="px-3 py-3">
                      <Checkbox
                        aria-label={`Select ${recipient.name}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleRecipient(recipient.rsvpId)}
                      />
                    </td>
                    <td className="max-w-48 px-3 py-3">
                      <button
                        type="button"
                        className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => toggleRecipient(recipient.rsvpId)}
                      >
                        {recipient.name}
                      </button>
                    </td>
                    <td className="max-w-56 px-3 py-3">
                      <span className="block truncate">{recipient.eventName}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline">{recipient.listKey.toUpperCase()}</Badge>
                    </td>
                    <td className="px-3 py-3 capitalize">{recipient.approvalStatus}</td>
                    <td className="px-3 py-3">
                      {getAttendanceStatusLabel(recipient.attendanceStatus)}
                    </td>
                    <td className="px-3 py-3">{getTicketStatusLabel(recipient.ticketStatus)}</td>
                    <td className="px-3 py-3">
                      <Badge variant={recipient.smsConsent ? "success" : "secondary"}>
                        {recipient.smsConsent ? "Yes" : "No"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--text-secondary)]">
                      {new Date(recipient.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <span>
            Showing {firstVisibleRecipientNumber}–{lastVisibleRecipientNumber} of{" "}
            {filteredRecipients.length}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(nextValue) => setPageSize(Number(nextValue))}
            className="w-28"
          >
            {PAGE_SIZE_OPTIONS.map((pageSizeOption) => (
              <SelectOption key={pageSizeOption} value={String(pageSizeOption)}>
                {pageSizeOption} / page
              </SelectOption>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs tabular-nums text-[var(--text-secondary)]">
            Page {boundedPage} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 border-[var(--border-subtle)]"
            aria-label="Previous recipient page"
            disabled={boundedPage <= 1}
            onClick={() => setPage((previousPage) => Math.max(1, previousPage - 1))}
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 border-[var(--border-subtle)]"
            aria-label="Next recipient page"
            disabled={boundedPage >= totalPages}
            onClick={() => setPage((previousPage) => Math.min(totalPages, previousPage + 1))}
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
