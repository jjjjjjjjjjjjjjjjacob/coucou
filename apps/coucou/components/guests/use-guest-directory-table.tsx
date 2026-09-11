"use client";

import {
  type ColumnDef,
  getCoreRowModel,
  type OnChangeFn,
  type RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import React from "react";
import { ListName } from "@/components/list-name";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip, ChipGroup } from "@/components/ui/chip-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DashboardTableColumnLayout } from "@/lib/hooks/use-dashboard-table-column-layout";
import { getRsvpTableColumnSizing, RSVP_SELECT_COLUMN_SIZING } from "@/lib/rsvp-table-layout";
import type { GuestDirectoryPerson } from "@/lib/types";
import { ContactSocialProfiles } from "./contact-social-profiles";

interface GuestDirectoryTableOptions {
  people: GuestDirectoryPerson[];
  columnLayout: DashboardTableColumnLayout;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  renderActions: (person: GuestDirectoryPerson) => React.ReactNode;
  selectionDisabled?: boolean;
}

export function useGuestDirectoryTable({
  people,
  columnLayout,
  rowSelection,
  onRowSelectionChange,
  renderActions,
  selectionDisabled = false,
}: GuestDirectoryTableOptions) {
  const columns = React.useMemo<ColumnDef<GuestDirectoryPerson>[]>(() => {
    return [
      {
        id: "select",
        ...RSVP_SELECT_COLUMN_SIZING,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllRowsSelected() ||
              (table.getIsSomeRowsSelected() ? "indeterminate" : false)
            }
            onCheckedChange={(checkedState) => table.toggleAllRowsSelected(checkedState === true)}
            disabled={selectionDisabled}
            aria-label="Select all contacts on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checkedState) => row.toggleSelected(checkedState === true)}
            disabled={selectionDisabled}
            aria-label={`Select ${row.original.name}`}
          />
        ),
      },
      {
        id: "person",
        header: "Contact",
        ...getRsvpTableColumnSizing({
          label: "Contact",
          minContentWidth: 180,
        }),
        cell: ({ row }) => {
          const person = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={person.imageUrl || undefined} />
                <AvatarFallback>
                  {(person.firstName || person.name || "G").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="block truncate font-medium text-[var(--text-primary)]">
                  {person.name}
                </span>
                {person.phoneObfuscated ? (
                  <div className="text-xs text-[var(--text-secondary)]">
                    {person.phoneObfuscated}
                  </div>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        id: "socials",
        header: "Socials",
        ...getRsvpTableColumnSizing({ label: "Socials", minContentWidth: 200 }),
        cell: ({ row }) => <ContactSocialProfiles profiles={row.original.socialProfiles ?? []} />,
      },
      {
        id: "tags",
        header: "Tags",
        ...getRsvpTableColumnSizing({
          label: "Tags",
          minContentWidth: 120,
        }),
        cell: ({ row }) =>
          row.original.tags.length > 0 ? (
            <ChipGroup aria-label={`Tags for ${row.original.name}`}>
              {row.original.tags.map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
            </ChipGroup>
          ) : (
            <span className="text-xs text-[var(--text-secondary)]">—</span>
          ),
      },
      {
        id: "notes",
        header: "Notes",
        ...getRsvpTableColumnSizing({
          label: "Notes",
          minContentWidth: 160,
          contentWidthCap: 280,
        }),
        cell: ({ row }) =>
          row.original.notes ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block max-w-full truncate text-[var(--text-secondary)]">
                  {row.original.notes}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-pre-wrap">
                {row.original.notes}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-xs text-[var(--text-secondary)]">—</span>
          ),
      },
      {
        id: "defaultListKey",
        header: "Default List",
        ...getRsvpTableColumnSizing({ label: "Default List" }),
        cell: ({ row }) =>
          row.original.defaultListKey ? (
            <Badge variant="secondary">{row.original.defaultListKey}</Badge>
          ) : (
            <span className="text-xs text-[var(--text-secondary)]">—</span>
          ),
      },
      {
        id: "latestEventStatus",
        header: "Latest Event",
        ...getRsvpTableColumnSizing({ label: "Latest Event" }),
        cell: ({ row }) =>
          row.original.rsvpedToLatestEvent ? (
            <Badge variant="success">RSVP'd</Badge>
          ) : (
            <Badge variant="outline" className="text-[var(--text-secondary)]">
              No RSVP
            </Badge>
          ),
      },
      {
        id: "smsConsent",
        header: "SMS Consent",
        ...getRsvpTableColumnSizing({ label: "SMS Consent" }),
        cell: ({ row }) => {
          const person = row.original;
          if (person.hasOptedOut) {
            return <Badge variant="destructive">Opted out</Badge>;
          }
          return person.smsConsent ? (
            <Badge variant="success">Yes</Badge>
          ) : (
            <Badge variant="outline" className="text-[var(--text-secondary)]">
              No
            </Badge>
          );
        },
      },
      {
        id: "receivedTexts",
        header: "Received Texts",
        ...getRsvpTableColumnSizing({ label: "Received Texts" }),
        cell: ({ row }) => (
          <span className="tabular-nums text-[var(--text-secondary)]">
            {row.original.receivedTextCount ?? 0}
          </span>
        ),
      },
      {
        id: "eventCount",
        header: "Events",
        ...getRsvpTableColumnSizing({ label: "Events" }),
        cell: ({ row }) => (
          <span className="tabular-nums text-[var(--text-secondary)]">
            {row.original.eventCount}
          </span>
        ),
      },
      {
        id: "eventsAttended",
        header: "Attended",
        ...getRsvpTableColumnSizing({ label: "Attended" }),
        cell: ({ row }) => (
          <span className="tabular-nums text-[var(--text-secondary)]">
            {row.original.eventsAttendedCount}
          </span>
        ),
      },
      {
        id: "role",
        header: "Role",
        ...getRsvpTableColumnSizing({ label: "Role" }),
        cell: ({ row }) => {
          const person = row.original;
          const roleLabel = person.role ? person.role.replace(/^org:/, "") : "guest";
          return (
            <Badge
              variant="secondary"
              className="bg-[var(--surface-3)] capitalize text-[var(--text-primary)]"
            >
              {roleLabel}
            </Badge>
          );
        },
      },
      {
        id: "firstRsvpAt",
        header: "First RSVP",
        ...getRsvpTableColumnSizing({ label: "First RSVP" }),
        cell: ({ row }) => (
          <span className="text-[var(--text-secondary)]">
            {row.original.firstRsvpAt
              ? new Date(row.original.firstRsvpAt).toLocaleDateString()
              : "No RSVPs"}
          </span>
        ),
      },
      {
        id: "events",
        header: "Recent events",
        ...getRsvpTableColumnSizing({
          label: "Recent events",
          minContentWidth: 220,
          contentWidthCap: 360,
        }),
        cell: ({ row }) => {
          const person = row.original;
          const visibleEventEntries = person.events.slice(0, 2);
          const overflowCount = person.events.length - visibleEventEntries.length;
          return (
            <div className="flex flex-wrap items-center gap-1">
              {visibleEventEntries.map((eventEntry) => (
                <Badge
                  key={eventEntry.rsvpId}
                  variant="outline"
                  className="max-w-40 truncate font-normal"
                >
                  {eventEntry.eventName}
                </Badge>
              ))}
              {overflowCount > 0 ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs text-[var(--text-secondary)]"
                    >
                      +{overflowCount}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="max-h-72 w-72 overflow-y-auto p-2">
                    <div className="space-y-1.5">
                      {person.events.map((eventEntry) => (
                        <div
                          key={eventEntry.rsvpId}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-[var(--text-primary)]">
                            {eventEntry.eventName}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                            {eventEntry.listKey ? (
                              <>
                                <ListName
                                  eventId={eventEntry.eventId}
                                  listKey={eventEntry.listKey}
                                />{" "}
                                ·{" "}
                              </>
                            ) : (
                              ""
                            )}
                            {eventEntry.approvalStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        ...getRsvpTableColumnSizing({ label: "Actions", minContentWidth: 120 }),
        cell: ({ row }) => renderActions(row.original),
      },
    ];
  }, [renderActions, selectionDisabled]);

  return useReactTable<GuestDirectoryPerson>({
    data: people,
    columns,
    state: {
      rowSelection,
      columnVisibility: columnLayout.columnVisibility,
      columnOrder: columnLayout.columnOrder,
      columnSizing: columnLayout.columnSizing,
    },
    getRowId: (person) => person.contactId ?? person.personKey,
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    onRowSelectionChange,
    onColumnSizingChange: columnLayout.onColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: -1,
  });
}
