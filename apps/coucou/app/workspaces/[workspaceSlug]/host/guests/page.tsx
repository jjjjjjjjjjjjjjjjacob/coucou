"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery, useConvexAction, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  type OnChangeFn,
  type RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import { Columns3, MessageSquare, Tag, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { toast } from "sonner";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { GuestDirectoryFilters } from "@/components/guests/guest-directory-filters";
import { GuestDirectoryTable } from "@/components/guests/guest-directory-table";
import { type GuestProfilePatch, GuestProfileSheet } from "@/components/guests/guest-profile-sheet";
import {
  buildGuestRowActionDescriptors,
  GuestRowActionsContextMenuContent,
  GuestRowActionsDropdownMenuContent,
} from "@/components/guests/guest-row-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip, ChipGroup } from "@/components/ui/chip-group";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectOption } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserDetailContent } from "@/components/users/user-detail-content";
import { useWorkspaceAccess } from "@/components/workspace-access-gate";
import {
  HOST_GUEST_DIRECTORY_TABLE_KEY,
  HOST_GUEST_DIRECTORY_TABLE_SCOPE_KEY,
} from "@/lib/dashboard-table-preferences";
import { buildGuestDirectoryPersonKey } from "@/lib/guest-directory-helpers";
import { useDashboardTableColumnLayout } from "@/lib/hooks/use-dashboard-table-column-layout";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useIsViewportAtLeast } from "@/lib/hooks/use-viewport-at-least";
import { getRsvpTableColumnSizing, RSVP_SELECT_COLUMN_SIZING } from "@/lib/rsvp-table-layout";
import {
  createDefaultGuestDirectoryFilterState,
  encodeGuestDirectoryFilterArgs,
  type GuestDirectoryFilterState,
  isGuestDirectoryFilterConfigured,
} from "@/lib/text-blast-filters";
import type {
  GuestDirectoryFacets,
  GuestDirectoryPerson,
  GuestDirectoryResponse,
  TextBlast,
} from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import TextBlastDialog, { type TextBlastInitialTargeting } from "../text-blasts/text-blast-dialog";

const GUEST_DETAIL_PANEL_QUERY_PARAM = "guest";
const GUEST_DETAIL_PANEL_MIN_VIEWPORT_WIDTH = 1024;

const ALL_COLUMN_IDS = [
  "select",
  "person",
  "tags",
  "notes",
  "defaultListKey",
  "latestEventStatus",
  "smsConsent",
  "receivedTexts",
  "eventCount",
  "eventsAttended",
  "role",
  "firstRsvpAt",
  "events",
  "actions",
] as const;

const COLUMN_LABELS: Record<string, string> = {
  person: "Guest",
  tags: "Tags",
  notes: "Notes",
  defaultListKey: "Default List",
  latestEventStatus: "Latest Event",
  smsConsent: "SMS Consent",
  receivedTexts: "Received Texts",
  eventCount: "Events",
  eventsAttended: "Attended",
  role: "Role",
  firstRsvpAt: "First RSVP",
  events: "Event List",
  actions: "Actions",
};

const DEFAULT_HIDDEN_COLUMN_IDS = ["events"] as const;

const DEFAULT_VISIBLE_COLUMN_IDS = ALL_COLUMN_IDS.filter(
  (columnId) => !(DEFAULT_HIDDEN_COLUMN_IDS as readonly string[]).includes(columnId),
);

const TOGGLEABLE_COLUMN_IDS = ALL_COLUMN_IDS.filter(
  (columnId) => columnId !== "select" && columnId !== "person",
);

function normalizeRole(role: string): string {
  return role?.replace(/^org:/, "") || role;
}

function isAdminRole(role: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role ?? "");
  return normalizedRole === "admin";
}

export default function GuestDirectoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useAuth();
  const workspaceScope = useWorkspaceScope();
  const workspaceAccess = useWorkspaceAccess();
  const guestsPath = useWorkspaceOperationPath("host", "guests");
  const usersPath = useWorkspaceOperationPath("host", "users");
  const isWideViewport = useIsViewportAtLeast(GUEST_DETAIL_PANEL_MIN_VIEWPORT_WIDTH);

  const pageIndex = Number.parseInt(searchParams.get("page") || "0", 10);
  const pageSize = Number.parseInt(searchParams.get("pageSize") || "20", 10);
  const detailPanelUserReference = searchParams.get(GUEST_DETAIL_PANEL_QUERY_PARAM);

  const [filterState, setFilterState] = React.useState<GuestDirectoryFilterState>(
    createDefaultGuestDirectoryFilterState,
  );
  const debouncedSearchText = useDebounce(filterState.searchText, 250);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedPeopleByKey, setSelectedPeopleByKey] = React.useState<
    Record<string, GuestDirectoryPerson>
  >({});

  const [profileSheetPerson, setProfileSheetPerson] = React.useState<GuestDirectoryPerson | null>(
    null,
  );
  const [isProfileSheetOpen, setIsProfileSheetOpen] = React.useState(false);
  const [isTextBlastDialogOpen, setIsTextBlastDialogOpen] = React.useState(false);
  const [textBlastTargeting, setTextBlastTargeting] =
    React.useState<TextBlastInitialTargeting | null>(null);
  const [bulkTagInput, setBulkTagInput] = React.useState("");

  const queryFilterArgs = React.useMemo(() => {
    const encodedFilterArgs = encodeGuestDirectoryFilterArgs(filterState);
    return {
      ...encodedFilterArgs,
      searchText: debouncedSearchText.trim() || undefined,
      eventIds: encodedFilterArgs.eventIds as Id<"events">[] | undefined,
      recipientHistoryFilter: encodedFilterArgs.recipientHistoryFilter
        ? {
            type: encodedFilterArgs.recipientHistoryFilter.type,
            textBlastIds: encodedFilterArgs.recipientHistoryFilter
              .textBlastIds as Id<"textBlasts">[],
          }
        : undefined,
    };
  }, [filterState, debouncedSearchText]);

  const isFilterConfigured = isGuestDirectoryFilterConfigured(filterState);

  const directoryQuery = useQuery({
    ...convexQuery(api.guestDirectory.listGuestDirectoryPaginated, {
      ...queryFilterArgs,
      page: pageIndex,
      pageSize,
      ...(workspaceScope?.queryArgs ?? {}),
    }),
    enabled: !!isSignedIn && !!workspaceScope && isFilterConfigured,
  });
  const directoryData = directoryQuery.data as GuestDirectoryResponse | undefined;
  const people = React.useMemo(() => directoryData?.people ?? [], [directoryData]);

  const facetsQuery = useQuery({
    ...convexQuery(api.guestDirectory.getGuestDirectoryFacets, {
      ...(workspaceScope?.queryArgs ?? {}),
    }),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const facets = facetsQuery.data as GuestDirectoryFacets | undefined;

  const blastsQuery = useQuery({
    ...convexQuery(api.textBlasts.getBlastsByWorkspaceWithSenderNames, {
      limit: 100,
      ...(workspaceScope?.queryArgs ?? {}),
    }),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const blastOptions = React.useMemo(
    () =>
      ((blastsQuery.data as Array<TextBlast & { sentByName: string }> | undefined) ?? []).map(
        (blast) => ({
          id: blast._id,
          name: blast.name,
          deliveryTrackingEnabled: blast.deliveryTrackingEnabled === true,
          status: blast.status,
        }),
      ),
    [blastsQuery.data],
  );

  const columnLayout = useDashboardTableColumnLayout({
    tableKey: HOST_GUEST_DIRECTORY_TABLE_KEY,
    scopeKey: HOST_GUEST_DIRECTORY_TABLE_SCOPE_KEY,
    availableColumnIds: ALL_COLUMN_IDS,
    defaultVisibleColumnIds: DEFAULT_VISIBLE_COLUMN_IDS,
    isEnabled: !!isSignedIn && !!workspaceScope,
    queryArgs: workspaceScope?.queryArgs ?? {},
  });

  const upsertGuestProfile = useMutation({
    mutationFn: useConvexMutation(api.guestDirectory.upsertGuestProfile),
  });
  const bulkUpdateGuestProfiles = useMutation({
    mutationFn: useConvexMutation(api.guestDirectory.bulkUpdateGuestProfiles),
  });
  const updateUserRole = useMutation({
    mutationFn: useConvexAction(api.users.updateUserRoleWithClerk),
  });
  const promoteUserToOrganization = useMutation({
    mutationFn: useConvexAction(api.users.promoteUserToOrganizationWithClerk),
  });

  const canManageRoles = isAdminRole(workspaceAccess?.membershipRole);

  const navigateWithParams = React.useCallback(
    (updateParams: (params: URLSearchParams) => void, options?: { pushHistory?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      updateParams(params);
      const nextUrl = `${guestsPath}?${params.toString()}`;
      if (options?.pushHistory) {
        router.push(nextUrl, { scroll: false });
      } else {
        router.replace(nextUrl, { scroll: false });
      }
    },
    [guestsPath, router, searchParams],
  );

  const handleFilterChange = React.useCallback(
    (nextFilterState: GuestDirectoryFilterState) => {
      setFilterState(nextFilterState);
      if (searchParams.get("page") && searchParams.get("page") !== "0") {
        navigateWithParams((params) => params.set("page", "0"));
      }
    },
    [navigateWithParams, searchParams],
  );

  const openPersonDetail = React.useCallback(
    (person: GuestDirectoryPerson) => {
      if (!person.detailReference) return;
      if (isWideViewport) {
        // Push so browser back closes the panel.
        navigateWithParams(
          (params) => params.set(GUEST_DETAIL_PANEL_QUERY_PARAM, person.detailReference as string),
          { pushHistory: true },
        );
      } else {
        router.push(`${usersPath}/${encodeURIComponent(person.detailReference)}`);
      }
    },
    [isWideViewport, navigateWithParams, router, usersPath],
  );

  const closePersonDetail = React.useCallback(() => {
    navigateWithParams((params) => params.delete(GUEST_DETAIL_PANEL_QUERY_PARAM));
  }, [navigateWithParams]);

  const selectedPeople = React.useMemo(
    () =>
      Object.keys(rowSelection)
        .filter((personKey) => rowSelection[personKey])
        .map((personKey) => selectedPeopleByKey[personKey])
        .filter((person): person is GuestDirectoryPerson => person !== undefined),
    [rowSelection, selectedPeopleByKey],
  );

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = (updaterOrValue) => {
    setRowSelection((previousSelection) => {
      const nextSelection =
        typeof updaterOrValue === "function" ? updaterOrValue(previousSelection) : updaterOrValue;
      setSelectedPeopleByKey((previousPeopleByKey) => {
        const nextPeopleByKey = { ...previousPeopleByKey };
        for (const person of people) {
          if (nextSelection[person.personKey]) {
            nextPeopleByKey[person.personKey] = person;
          }
        }
        for (const personKey of Object.keys(nextPeopleByKey)) {
          if (!nextSelection[personKey]) {
            delete nextPeopleByKey[personKey];
          }
        }
        return nextPeopleByKey;
      });
      return nextSelection;
    });
  };

  const clearSelection = () => {
    setRowSelection({});
    setSelectedPeopleByKey({});
  };

  const handleSaveProfile = async (
    person: GuestDirectoryPerson,
    profilePatch: GuestProfilePatch,
  ) => {
    if (!workspaceScope) return;
    try {
      await upsertGuestProfile.mutateAsync({
        personKey: buildGuestDirectoryPersonKey(person),
        tags: profilePatch.tags,
        notes: profilePatch.notes,
        defaultListKey: profilePatch.defaultListKey,
        ...workspaceScope.queryArgs,
      });
      toast.success("Guest profile saved");
      setIsProfileSheetOpen(false);
    } catch (error) {
      toast.error(`Failed to save guest profile: ${(error as Error).message}`);
    }
  };

  const handleBulkTag = async (mode: "add" | "remove", tag: string) => {
    if (!workspaceScope || selectedPeople.length === 0) return;
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) return;
    try {
      await bulkUpdateGuestProfiles.mutateAsync({
        personKeys: selectedPeople.map(buildGuestDirectoryPersonKey),
        ...(mode === "add" ? { addTags: [normalizedTag] } : { removeTags: [normalizedTag] }),
        ...workspaceScope.queryArgs,
      });
      toast.success(
        mode === "add"
          ? `Tagged ${selectedPeople.length} guests with “${normalizedTag}”`
          : `Removed “${normalizedTag}” from ${selectedPeople.length} guests`,
      );
      setBulkTagInput("");
    } catch (error) {
      toast.error(`Failed to update tags: ${(error as Error).message}`);
    }
  };

  const handleBulkDefaultList = async (listKey: string) => {
    if (!workspaceScope || selectedPeople.length === 0) return;
    try {
      await bulkUpdateGuestProfiles.mutateAsync({
        personKeys: selectedPeople.map(buildGuestDirectoryPersonKey),
        defaultListKey: listKey,
        ...workspaceScope.queryArgs,
      });
      toast.success(
        listKey
          ? `Set default list “${listKey}” for ${selectedPeople.length} guests`
          : `Cleared default list for ${selectedPeople.length} guests`,
      );
    } catch (error) {
      toast.error(`Failed to set default list: ${(error as Error).message}`);
    }
  };

  const selectedPeopleWithoutConsent = selectedPeople.filter((person) => !person.smsConsent);

  const handleStartTextBlast = () => {
    if (selectedPeople.length === 0) return;
    const eventIds = new Set<string>();
    const rsvpIds = new Set<string>();
    const listKeys = new Set<string>();
    for (const person of selectedPeople) {
      for (const eventEntry of person.events) {
        eventIds.add(eventEntry.eventId);
        rsvpIds.add(eventEntry.rsvpId);
        if (eventEntry.listKey) {
          listKeys.add(eventEntry.listKey.toLowerCase());
        }
      }
    }
    setTextBlastTargeting({
      eventIds: Array.from(eventIds) as Id<"events">[],
      selectedRsvpIds: Array.from(rsvpIds) as Id<"rsvps">[],
      targetLists: Array.from(listKeys),
    });
    setIsTextBlastDialogOpen(true);
  };

  const handleRoleChange = React.useCallback(
    async (person: GuestDirectoryPerson, newRole: string) => {
      if (!workspaceScope) return;
      const userDocumentId = person.detailReference;
      if (!userDocumentId || userDocumentId.startsWith("rsvp~")) {
        toast.error("This guest has no account to assign a role to");
        return;
      }
      try {
        if (person.hasOrganizationMembership) {
          await updateUserRole.mutateAsync({
            userId: userDocumentId as Id<"users">,
            newRole,
            ...workspaceScope.queryArgs,
          });
        } else {
          await promoteUserToOrganization.mutateAsync({
            userId: userDocumentId as Id<"users">,
            role: newRole,
            ...workspaceScope.queryArgs,
          });
        }
        toast.success("Role updated");
      } catch (error) {
        toast.error(`Failed to update role: ${(error as Error).message}`);
      }
    },
    [promoteUserToOrganization, updateUserRole, workspaceScope],
  );

  const openProfileSheet = React.useCallback((person: GuestDirectoryPerson) => {
    setProfileSheetPerson(person);
    setIsProfileSheetOpen(true);
  }, []);

  const buildRowActionDescriptors = React.useCallback(
    (person: GuestDirectoryPerson) =>
      buildGuestRowActionDescriptors({
        person,
        canManageRoles,
        onEditProfile: openProfileSheet,
        onViewDetails: openPersonDetail,
        onRoleChange: handleRoleChange,
      }),
    [canManageRoles, handleRoleChange, openPersonDetail, openProfileSheet],
  );

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
            aria-label="Select all guests on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checkedState) => row.toggleSelected(checkedState === true)}
            aria-label={`Select ${row.original.name}`}
          />
        ),
      },
      {
        id: "person",
        header: "Guest",
        ...getRsvpTableColumnSizing({
          label: "Guest",
          contentValues: people.map((person) => person.name),
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
        id: "tags",
        header: "Tags",
        ...getRsvpTableColumnSizing({
          label: "Tags",
          contentValues: people.map((person) => person.tags.join(" ")),
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
          const roleLabel = person.role ? normalizeRole(person.role) : "guest";
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
            {new Date(row.original.firstRsvpAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "events",
        header: "Event List",
        ...getRsvpTableColumnSizing({
          label: "Event List",
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
                            {eventEntry.listKey ? `${eventEntry.listKey} · ` : ""}
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
        ...getRsvpTableColumnSizing({ label: "Actions" }),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-[var(--border-subtle)] text-xs">
                Actions
              </Button>
            </DropdownMenuTrigger>
            <GuestRowActionsDropdownMenuContent
              descriptors={buildRowActionDescriptors(row.original)}
            />
          </DropdownMenu>
        ),
      },
    ];
  }, [buildRowActionDescriptors, people]);

  const table = useReactTable<GuestDirectoryPerson>({
    data: people,
    columns,
    state: {
      rowSelection,
      columnVisibility: columnLayout.columnVisibility,
      columnOrder: columnLayout.columnOrder,
      columnSizing: columnLayout.columnSizing,
    },
    getRowId: (person) => person.personKey,
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    onRowSelectionChange: handleRowSelectionChange,
    onColumnSizingChange: columnLayout.onColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: directoryData?.pagination.totalPages ?? 1,
  });

  const isDirectoryLoading = directoryQuery.isLoading && isFilterConfigured;
  const pagination = directoryData?.pagination;
  const isDetailPanelOpen = detailPanelUserReference !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-w-0 flex-1 space-y-5 lg:pr-0">
          <DashboardTitleBar
            title="Guests"
            subtitle="Every guest across all events — filter, annotate, and text them"
            breadcrumb={[{ label: "Workspace" }]}
          />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <GuestDirectoryFilters
                value={filterState}
                onChange={handleFilterChange}
                variant="full"
                eventOptions={facets?.events ?? []}
                blastOptions={blastOptions}
                tagOptions={facets?.tags ?? []}
                defaultListKeyOptions={Array.from(
                  new Set([
                    ...(facets?.defaultListKeys ?? []),
                    ...(facets?.workspaceListKeys ?? []),
                  ]),
                ).sort()}
                customFieldOptions={facets?.customFieldOptions ?? []}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--border-subtle)] text-xs"
                >
                  <Columns3 className="mr-1.5 h-3.5 w-3.5" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                {TOGGLEABLE_COLUMN_IDS.map((columnId) => (
                  <label
                    key={columnId}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
                  >
                    <Checkbox
                      checked={!columnLayout.hiddenColumnIds.includes(columnId)}
                      onCheckedChange={(checkedState) => {
                        columnLayout.setHiddenColumnIds(
                          checkedState === true
                            ? columnLayout.hiddenColumnIds.filter(
                                (hiddenId) => hiddenId !== columnId,
                              )
                            : [...columnLayout.hiddenColumnIds, columnId],
                        );
                      }}
                    />
                    {COLUMN_LABELS[columnId] ?? columnId}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {selectedPeople.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {selectedPeople.length} selected
              </span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[var(--border-subtle)] text-xs"
                  >
                    <Tag className="mr-1.5 h-3.5 w-3.5" />
                    Add tag
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 space-y-2 p-3">
                  <Input
                    placeholder="Tag name…"
                    value={bulkTagInput}
                    onChange={(changeEvent) => setBulkTagInput(changeEvent.target.value)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter") {
                        keyboardEvent.preventDefault();
                        handleBulkTag("add", bulkTagInput);
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!bulkTagInput.trim() || bulkUpdateGuestProfiles.isPending}
                    onClick={() => handleBulkTag("add", bulkTagInput)}
                  >
                    Tag {selectedPeople.length} guests
                  </Button>
                  {(facets?.tags ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(facets?.tags ?? []).slice(0, 8).map((existingTag) => (
                        <button
                          key={existingTag}
                          type="button"
                          onClick={() => handleBulkTag("add", existingTag)}
                          className="rounded-full border border-dashed border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                        >
                          + {existingTag}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>

              {selectedPeople.some((person) => person.tags.length > 0) ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[var(--border-subtle)] text-xs"
                    >
                      Remove tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-2">
                    {Array.from(new Set(selectedPeople.flatMap((person) => person.tags)))
                      .sort()
                      .map((selectedTag) => (
                        <button
                          key={selectedTag}
                          type="button"
                          onClick={() => handleBulkTag("remove", selectedTag)}
                          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
                        >
                          {selectedTag}
                        </button>
                      ))}
                  </PopoverContent>
                </Popover>
              ) : null}

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[var(--border-subtle)] text-xs"
                  >
                    Set default list
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-2">
                  <button
                    type="button"
                    onClick={() => handleBulkDefaultList("")}
                    className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
                  >
                    No default list
                  </button>
                  {(facets?.workspaceListKeys ?? []).map((listKeyOption) => (
                    <button
                      key={listKeyOption}
                      type="button"
                      onClick={() => handleBulkDefaultList(listKeyOption)}
                      className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
                    >
                      {listKeyOption}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <Button size="sm" className="text-xs" onClick={handleStartTextBlast}>
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                Send text blast
              </Button>

              {selectedPeopleWithoutConsent.length > 0 ? (
                <span className="text-xs text-[var(--text-secondary)]">
                  {selectedPeopleWithoutConsent.length} of {selectedPeople.length} selected haven't
                  consented to SMS and will be excluded from the blast.
                </span>
              ) : null}

              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-xs text-[var(--text-secondary)]"
                onClick={clearSelection}
              >
                Clear selection
              </Button>
            </div>
          ) : null}

          <Card className="border-[var(--border-subtle)] bg-[var(--surface-2)] shadow-[var(--shadow-card)]">
            <CardContent className="pt-6">
              {isDirectoryLoading ? (
                <TableSkeleton rows={10} columns={8} />
              ) : (
                <GuestDirectoryTable
                  table={table}
                  columnLayout={columnLayout}
                  columnLabels={COLUMN_LABELS}
                  onRowClick={openPersonDetail}
                  renderRowContextMenuContent={(person) => (
                    <GuestRowActionsContextMenuContent
                      descriptors={buildRowActionDescriptors(person)}
                    />
                  )}
                  activePersonDetailReference={detailPanelUserReference}
                />
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Users className="h-3.5 w-3.5" />
              {pagination ? (
                <>
                  {pagination.totalCount} guests · Page {pagination.pageIndex + 1} of{" "}
                  {pagination.totalPages}
                </>
              ) : (
                <>Page 1 of 1</>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(nextValue) =>
                  navigateWithParams((params) => {
                    params.set("pageSize", nextValue);
                    params.set("page", "0");
                  })
                }
                className="w-24"
              >
                {[10, 20, 50, 100].map((pageSizeOption) => (
                  <SelectOption key={pageSizeOption} value={String(pageSizeOption)}>
                    {pageSizeOption} / page
                  </SelectOption>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigateWithParams((params) => params.set("page", String(pageIndex - 1)))
                }
                disabled={!pagination?.hasPreviousPage}
                className="border-[var(--border-subtle)]"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigateWithParams((params) => params.set("page", String(pageIndex + 1)))
                }
                disabled={!pagination?.hasNextPage}
                className="border-[var(--border-subtle)]"
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        {isDetailPanelOpen ? (
          <aside className="hidden shrink-0 lg:sticky lg:top-0 lg:block lg:max-h-screen lg:w-[400px] lg:overflow-y-auto lg:border-l lg:border-[var(--border-subtle)] lg:pl-5 lg:ml-5">
            <UserDetailContent
              key={detailPanelUserReference}
              userReference={detailPanelUserReference}
              variant="panel"
              onClose={closePersonDetail}
            />
          </aside>
        ) : null}
      </div>

      <GuestProfileSheet
        person={profileSheetPerson}
        open={isProfileSheetOpen}
        onOpenChange={setIsProfileSheetOpen}
        onSave={handleSaveProfile}
        listKeyOptions={facets?.workspaceListKeys ?? []}
        tagSuggestions={facets?.tags ?? []}
        isSaving={upsertGuestProfile.isPending}
      />

      <TextBlastDialog
        isOpen={isTextBlastDialogOpen}
        onClose={() => {
          setIsTextBlastDialogOpen(false);
          setTextBlastTargeting(null);
        }}
        initialTargeting={textBlastTargeting ?? undefined}
      />
    </div>
  );
}
