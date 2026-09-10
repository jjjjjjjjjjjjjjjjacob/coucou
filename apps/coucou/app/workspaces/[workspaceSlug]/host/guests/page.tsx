"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery, useConvexAction, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type OnChangeFn, type RowSelectionState } from "@tanstack/react-table";
import { MessageSquare, Tag, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { toast } from "sonner";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { ContactHistory } from "@/components/guests/contact-history";
import { GuestDirectoryColumnsMenu } from "@/components/guests/guest-directory-columns-menu";
import { GuestDirectoryFilters } from "@/components/guests/guest-directory-filters";
import { GuestDirectoryTable } from "@/components/guests/guest-directory-table";
import { type GuestProfilePatch, GuestProfileSheet } from "@/components/guests/guest-profile-sheet";
import {
  buildGuestRowActionDescriptors,
  GuestRowActionsContextMenuContent,
  GuestRowActionsDropdownMenuContent,
} from "@/components/guests/guest-row-actions";
import { useGuestDirectoryTable } from "@/components/guests/use-guest-directory-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectOption } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { UserDetailContent } from "@/components/users/user-detail-content";
import { useWorkspaceAccess } from "@/components/workspace-access-gate";
import {
  readContactDirectoryFilters,
  writeContactDirectoryFilters,
} from "@/lib/contact-directory-url";
import {
  HOST_GUEST_DIRECTORY_TABLE_KEY,
  HOST_GUEST_DIRECTORY_TABLE_SCOPE_KEY,
} from "@/lib/dashboard-table-preferences";
import {
  GUEST_DIRECTORY_COLUMN_IDS,
  GUEST_DIRECTORY_COLUMN_LABELS,
  GUEST_DIRECTORY_DEFAULT_VISIBLE_COLUMN_IDS,
} from "@/lib/guest-directory-columns";
import { buildGuestDirectoryPersonKey } from "@/lib/guest-directory-helpers";
import { useContactDirectory } from "@/lib/hooks/use-contact-directory";
import { useContactFilterOptions } from "@/lib/hooks/use-contact-filter-options";
import { useDashboardTableColumnLayout } from "@/lib/hooks/use-dashboard-table-column-layout";
import { useIsViewportAtLeast } from "@/lib/hooks/use-viewport-at-least";
import { type GuestDirectoryFilterState } from "@/lib/text-blast-filters";
import type { GuestDirectoryFacets, GuestDirectoryPerson, TextBlast } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import TextBlastDialog, { type TextBlastInitialTargeting } from "../text-blasts/text-blast-dialog";

const GUEST_DETAIL_PANEL_QUERY_PARAM = "guest";
const GUEST_DETAIL_PANEL_MIN_VIEWPORT_WIDTH = 1024;

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

  const requestedPageSize = Number.parseInt(searchParams.get("pageSize") || "20", 10);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.max(1, Math.min(40, requestedPageSize))
    : 20;
  const detailPanelUserReference = searchParams.get(GUEST_DETAIL_PANEL_QUERY_PARAM);

  const [filterState, setFilterState] = React.useState<GuestDirectoryFilterState>(() =>
    readContactDirectoryFilters(new URLSearchParams(searchParams.toString())),
  );

  React.useEffect(() => {
    setFilterState(readContactDirectoryFilters(new URLSearchParams(searchParams.toString())));
  }, [searchParams]);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedPeopleByKey, setSelectedPeopleByKey] = React.useState<
    Record<string, GuestDirectoryPerson>
  >({});

  const selectionFilterKey = JSON.stringify({
    ...filterState,
    listKeys: filterState.listKeys ?? [],
    sortBy: undefined,
    sortDirection: undefined,
    workspace: workspaceScope?.workspaceSlug,
  });
  const selectionFilterReference = React.useRef(selectionFilterKey);
  React.useEffect(() => {
    if (selectionFilterReference.current !== selectionFilterKey) {
      setRowSelection({});
      setSelectedPeopleByKey({});
      selectionFilterReference.current = selectionFilterKey;
    }
  }, [selectionFilterKey]);

  const [profileSheetPerson, setProfileSheetPerson] = React.useState<GuestDirectoryPerson | null>(
    null,
  );
  const [isProfileSheetOpen, setIsProfileSheetOpen] = React.useState(false);
  const [isTextBlastDialogOpen, setIsTextBlastDialogOpen] = React.useState(false);
  const [textBlastTargeting, setTextBlastTargeting] =
    React.useState<TextBlastInitialTargeting | null>(null);
  const [bulkTagInput, setBulkTagInput] = React.useState("");

  const directory = useContactDirectory(filterState, workspaceScope, pageSize);
  const people = directory.people;
  const activeContactId = searchParams.get("contact") as Id<"workspaceContacts"> | null;
  const activeContactQuery = useQuery({
    ...convexQuery(api.contacts.get, {
      workspaceSlug: workspaceScope?.workspaceSlug ?? "",
      contactId: activeContactId as Id<"workspaceContacts">,
    }),
    enabled: Boolean(workspaceScope && activeContactId && !detailPanelUserReference),
  });
  React.useEffect(() => {
    if (activeContactQuery.data && activeContactId && !detailPanelUserReference) {
      setProfileSheetPerson(activeContactQuery.data);
      setIsProfileSheetOpen(true);
    }
  }, [activeContactQuery.data, activeContactId, detailPanelUserReference]);

  const facetsQuery = useContactFilterOptions(workspaceScope);
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
    availableColumnIds: GUEST_DIRECTORY_COLUMN_IDS,
    defaultVisibleColumnIds: GUEST_DIRECTORY_DEFAULT_VISIBLE_COLUMN_IDS,
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
      const audienceChanged =
        JSON.stringify({ ...nextFilterState, sortBy: undefined, sortDirection: undefined }) !==
        JSON.stringify({ ...filterState, sortBy: undefined, sortDirection: undefined });
      setFilterState(nextFilterState);
      if (audienceChanged) {
        setRowSelection({});
        setSelectedPeopleByKey({});
      }
      navigateWithParams((params) => {
        writeContactDirectoryFilters(params, nextFilterState);
        if (audienceChanged) {
          params.delete(GUEST_DETAIL_PANEL_QUERY_PARAM);
          params.delete("contact");
        }
      });
    },
    [filterState, navigateWithParams],
  );

  const openPersonDetail = React.useCallback(
    (person: GuestDirectoryPerson) => {
      if (!person.detailReference) {
        setProfileSheetPerson(person);
        setIsProfileSheetOpen(true);
        return;
      }
      if (isWideViewport) {
        // Push so browser back closes the panel.
        navigateWithParams(
          (params) => {
            params.set(GUEST_DETAIL_PANEL_QUERY_PARAM, person.detailReference as string);
            if (person.contactId) params.set("contact", person.contactId);
          },
          { pushHistory: true },
        );
      } else {
        router.push(`${usersPath}/${encodeURIComponent(person.detailReference)}`);
      }
    },
    [isWideViewport, navigateWithParams, router, usersPath],
  );

  const closePersonDetail = React.useCallback(() => {
    navigateWithParams((params) => {
      params.delete(GUEST_DETAIL_PANEL_QUERY_PARAM);
      params.delete("contact");
    });
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
          if (nextSelection[person.contactId ?? person.personKey]) {
            nextPeopleByKey[person.contactId ?? person.personKey] = person;
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
      toast.success("Contact profile saved");
      setIsProfileSheetOpen(false);
    } catch (error) {
      toast.error(`Failed to save contact profile: ${(error as Error).message}`);
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
          ? `Tagged ${selectedPeople.length} contacts with “${normalizedTag}”`
          : `Removed “${normalizedTag}” from ${selectedPeople.length} contacts`,
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
          ? `Set default list “${listKey}” for ${selectedPeople.length} contacts`
          : `Cleared default list for ${selectedPeople.length} contacts`,
      );
    } catch (error) {
      toast.error(`Failed to set default list: ${(error as Error).message}`);
    }
  };

  const selectedPeopleWithoutConsent = selectedPeople.filter((person) => !person.smsConsent);

  const handleStartTextBlast = () => {
    if (selectedPeople.length === 0) return;
    const contactIds = selectedPeople
      .map((person) => person.contactId)
      .filter((identifier): identifier is Id<"workspaceContacts"> => Boolean(identifier));
    if (!contactIds.length) return;
    setTextBlastTargeting({ contactIds });
    setIsTextBlastDialogOpen(true);
  };

  const handleRoleChange = React.useCallback(
    async (person: GuestDirectoryPerson, newRole: string) => {
      if (!workspaceScope) return;
      const userDocumentId = person.detailReference;
      if (!userDocumentId || userDocumentId.startsWith("rsvp~")) {
        toast.error("This contact has no account to assign a role to");
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

  const renderActions = React.useCallback(
    (person: GuestDirectoryPerson) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="border-[var(--border-subtle)] text-xs">
            Actions
          </Button>
        </DropdownMenuTrigger>
        <GuestRowActionsDropdownMenuContent descriptors={buildRowActionDescriptors(person)} />
      </DropdownMenu>
    ),
    [buildRowActionDescriptors],
  );
  const table = useGuestDirectoryTable({
    people,
    columnLayout,
    rowSelection,
    onRowSelectionChange: handleRowSelectionChange,
    renderActions,
  });

  const isDirectoryLoading = directory.isLoading;
  const pagination = {
    pageIndex: directory.pageIndex,
    hasNextPage: directory.hasNextPage,
    hasPreviousPage: directory.hasPreviousPage,
  };
  const isDetailPanelOpen = detailPanelUserReference !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-w-0 flex-1 space-y-5 lg:pr-0">
          <DashboardTitleBar
            title="Contacts"
            subtitle="Search, organize, and message everyone in your workspace"
            breadcrumb={[{ label: "Workspace" }]}
          />

          {activeContactQuery.error ? (
            <div role="alert">
              Contact could not be loaded.{" "}
              <Button variant="link" onClick={() => void activeContactQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <GuestDirectoryFilters
                value={filterState}
                onChange={handleFilterChange}
                variant="full"
                eventOptions={facets?.events ?? []}
                blastOptions={blastOptions}
                tagOptions={facets?.tags ?? []}
                listKeyOptions={facets?.workspaceListKeys ?? []}
                defaultListKeyOptions={Array.from(
                  new Set([
                    ...(facets?.defaultListKeys ?? []),
                    ...(facets?.workspaceListKeys ?? []),
                  ]),
                ).sort()}
                customFieldOptions={facets?.customFieldOptions ?? []}
              />
              {facetsQuery.error ? (
                <div role="alert" className="mt-2 text-sm">
                  Filter options could not be loaded.{" "}
                  <Button variant="link" onClick={() => void facetsQuery.refetch()}>
                    Retry filters
                  </Button>
                </div>
              ) : null}
            </div>
            <GuestDirectoryColumnsMenu columnLayout={columnLayout} />
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
                    Tag {selectedPeople.length} contacts
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
              {directory.error ? (
                <div role="alert" className="space-y-3">
                  <p>{directory.error}</p>
                  <Button variant="outline" onClick={() => void directory.retry()}>
                    Retry
                  </Button>
                </div>
              ) : directory.isPreparing ? (
                <p role="status" className="py-8 text-center">
                  Preparing the contact directory…
                </p>
              ) : !directory.configured ? (
                <p className="py-8 text-center">Complete the filter details to search contacts.</p>
              ) : isDirectoryLoading ? (
                <TableSkeleton rows={10} columns={8} />
              ) : (
                <GuestDirectoryTable
                  table={table}
                  columnLayout={columnLayout}
                  columnLabels={GUEST_DIRECTORY_COLUMN_LABELS}
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
                  Page {pagination.pageIndex + 1} · {people.length} contacts shown
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
                {[10, 20, 40].map((pageSizeOption) => (
                  <SelectOption key={pageSizeOption} value={String(pageSizeOption)}>
                    {pageSizeOption} / page
                  </SelectOption>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={directory.previousPage}
                disabled={!pagination?.hasPreviousPage}
                className="border-[var(--border-subtle)]"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={directory.nextPage}
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
            {activeContactId ? (
              <ContactHistory key={activeContactId} contactId={activeContactId} />
            ) : null}
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
        onOpenChange={(open) => {
          setIsProfileSheetOpen(open);
          if (!open && activeContactId && !detailPanelUserReference) closePersonDetail();
        }}
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
