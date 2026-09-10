"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ContactAudience } from "@convex/lib/contactValidators";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import { useQuery as useConvexQuery, useMutation } from "convex/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DirectoryPagination } from "@/components/ui/directory-pagination";
import {
  HOST_GUEST_DIRECTORY_TABLE_KEY,
  HOST_GUEST_DIRECTORY_TABLE_SCOPE_KEY,
} from "@/lib/dashboard-table-preferences";
import {
  GUEST_DIRECTORY_COLUMN_IDS,
  GUEST_DIRECTORY_COLUMN_LABELS,
  GUEST_DIRECTORY_DEFAULT_VISIBLE_COLUMN_IDS,
} from "@/lib/guest-directory-columns";
import { useContactDirectory } from "@/lib/hooks/use-contact-directory";
import { useContactFilterOptions } from "@/lib/hooks/use-contact-filter-options";
import { useDashboardTableColumnLayout } from "@/lib/hooks/use-dashboard-table-column-layout";
import { useDebounce } from "@/lib/hooks/use-debounce";
import {
  createDefaultGuestDirectoryFilterState,
  decodeRecipientFilter,
  encodeGuestDirectoryFilterArgs,
  type GuestDirectoryFilterState,
} from "@/lib/text-blast-filters";
import type { GuestDirectoryPerson } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { GuestDirectoryColumnsMenu } from "./guest-directory-columns-menu";
import { GuestDirectoryFilters } from "./guest-directory-filters";
import { GuestDirectoryTable } from "./guest-directory-table";
import { useGuestDirectoryTable } from "./use-guest-directory-table";

function buildFilterAudience(
  filters: GuestDirectoryFilterState,
): Extract<ContactAudience, { type: "filter" }> {
  const {
    sortBy: _sortBy,
    sortDirection: _sortDirection,
    ...encodedFilters
  } = encodeGuestDirectoryFilterArgs(filters);
  return {
    type: "filter",
    filters: {
      ...encodedFilters,
      eventIds: encodedFilters.eventIds as Id<"events">[] | undefined,
      recipientHistoryFilter: encodedFilters.recipientHistoryFilter
        ? {
            ...encodedFilters.recipientHistoryFilter,
            textBlastIds: encodedFilters.recipientHistoryFilter.textBlastIds as Id<"textBlasts">[],
          }
        : undefined,
    },
  };
}

export function ContactAudiencePicker({
  audience,
  onChange,
}: {
  audience: ContactAudience | null;
  onChange: (audience: ContactAudience | null) => void;
}) {
  const workspace = useWorkspaceScope();
  const [filters, setFilters] = useState<GuestDirectoryFilterState>(() => {
    const defaults = {
      ...createDefaultGuestDirectoryFilterState(),
      smsConsentFilter: "consented" as const,
    };
    if (audience?.type !== "filter") return defaults;
    return {
      ...defaults,
      ...audience.filters,
      smsConsentFilter: "consented",
      searchText: audience.filters.searchText ?? "",
      eventIds: audience.filters.eventIds ?? [],
      tags: audience.filters.tags ?? [],
      defaultListKeys: audience.filters.defaultListKeys ?? [],
      recipientFilter: decodeRecipientFilter(audience.filters.recipientFilter),
      recipientHistoryFilter:
        audience.filters.recipientHistoryFilter ?? defaults.recipientHistoryFilter,
    };
  });
  const [eligibilityPreviewState, setEligibilityPreviewState] = useState<{
    filterKey: string;
    previewId: Id<"contactAudiencePreviews">;
  } | null>(null);
  const eligibilityRequest = useRef({ filterKey: null as string | null, version: 0 });
  const [eligibilityCountError, setEligibilityCountError] = useState<string | null>(null);
  const directory = useContactDirectory(filters, workspace);
  const facetsQuery = useContactFilterOptions(workspace);
  const facets = facetsQuery.data;
  const blasts = useConvexQuery(
    api.textBlasts.getBlastsByWorkspaceWithSenderNames,
    workspace ? { ...workspace.queryArgs, limit: 100 } : "skip",
  );
  const selectedIds = audience?.type === "contacts" ? audience.contactIds : [];
  const allMatching = audience?.type === "filter";
  const debouncedSearchText = useDebounce(filters.searchText, 250);
  const eligibilityAudience = useMemo(
    () => buildFilterAudience({ ...filters, searchText: debouncedSearchText }),
    [debouncedSearchText, filters],
  );
  const eligibilityFilterKey = JSON.stringify(eligibilityAudience);
  const activeEligibilityPreviewId =
    eligibilityPreviewState?.filterKey === eligibilityFilterKey
      ? eligibilityPreviewState.previewId
      : undefined;
  const eligibilityPreview = useConvexQuery(
    api.contactAudiences.get,
    workspace && activeEligibilityPreviewId
      ? {
          workspaceSlug: workspace.workspaceSlug,
          siteKey: workspace.siteKey,
          previewId: activeEligibilityPreviewId,
        }
      : "skip",
  );
  const prepareEligibilityCount = useMutation(api.contactAudiences.prepare);
  useEffect(() => {
    if (!workspace || eligibilityRequest.current.filterKey === eligibilityFilterKey) return;
    const requestVersion = eligibilityRequest.current.version + 1;
    eligibilityRequest.current = { filterKey: eligibilityFilterKey, version: requestVersion };
    setEligibilityCountError(null);
    prepareEligibilityCount({
      ...workspace.queryArgs,
      audience: eligibilityAudience,
    })
      .then((previewId) => {
        if (eligibilityRequest.current.version === requestVersion)
          setEligibilityPreviewState({ filterKey: eligibilityFilterKey, previewId });
      })
      .catch((error: unknown) => {
        if (eligibilityRequest.current.version === requestVersion)
          setEligibilityCountError(
            error instanceof Error ? error.message : "Could not count matching contacts",
          );
      });
  }, [eligibilityAudience, eligibilityFilterKey, prepareEligibilityCount, workspace]);
  const clearAudience = () => {
    onChange(null);
  };
  const setSelected = (identifiers: Id<"workspaceContacts">[]) => {
    onChange(identifiers.length ? { type: "contacts", contactIds: identifiers } : null);
  };
  const updateFilters = (next: GuestDirectoryFilterState) => {
    const enforcedFilters = { ...next, smsConsentFilter: "consented" as const };
    const changedAudience =
      JSON.stringify({ ...filters, sortBy: undefined, sortDirection: undefined }) !==
      JSON.stringify({ ...enforcedFilters, sortBy: undefined, sortDirection: undefined });
    setFilters(enforcedFilters);
    if (changedAudience) clearAudience();
  };
  const selectAllMatching = () => {
    onChange(buildFilterAudience(filters));
  };
  const selectedCount = allMatching
    ? eligibilityPreview?.status === "ready"
      ? eligibilityPreview.processedCount
      : undefined
    : selectedIds.length;
  const selectionLabel =
    selectedCount !== undefined
      ? `${selectedCount.toLocaleString()} ${selectedCount === 1 ? "person" : "people"} selected`
      : eligibilityPreview?.status === "failed" || eligibilityCountError
        ? "Selected count unavailable"
        : "Counting selected people…";
  const columnLayout = useDashboardTableColumnLayout({
    tableKey: HOST_GUEST_DIRECTORY_TABLE_KEY,
    scopeKey: HOST_GUEST_DIRECTORY_TABLE_SCOPE_KEY,
    availableColumnIds: GUEST_DIRECTORY_COLUMN_IDS,
    defaultVisibleColumnIds: GUEST_DIRECTORY_DEFAULT_VISIBLE_COLUMN_IDS,
    insertMissingColumnsCanonically: true,
    isEnabled: Boolean(workspace),
    queryArgs: workspace?.queryArgs ?? {},
  });
  const rowSelection: RowSelectionState = Object.fromEntries(
    (allMatching ? directory.people.map((person) => person.contactId) : selectedIds).map(
      (identifier) => [identifier, true],
    ),
  );
  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = (updater) => {
    if (allMatching) return;
    const nextSelection = typeof updater === "function" ? updater(rowSelection) : updater;
    setSelected(
      Object.keys(nextSelection).filter(
        (identifier) => nextSelection[identifier],
      ) as Id<"workspaceContacts">[],
    );
  };
  const contactsPath = useWorkspaceOperationPath("host", "guests");
  const renderActions = useCallback(
    (person: GuestDirectoryPerson) => (
      <Button variant="outline" size="sm" className="border-[var(--border-subtle)] text-xs" asChild>
        <Link
          href={`${contactsPath}?contact=${person.contactId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View contact
        </Link>
      </Button>
    ),
    [contactsPath],
  );
  const table = useGuestDirectoryTable({
    people: directory.people,
    columnLayout,
    rowSelection,
    onRowSelectionChange: handleRowSelectionChange,
    renderActions,
    selectionDisabled: allMatching,
  });
  return (
    <div className="min-w-0 space-y-3">
      {audience?.type === "legacy_events" ? (
        <div className="rounded-md border border-[var(--border-subtle)] p-3 text-sm">
          This draft keeps its original event, list, RSVP status, and guest selections.{" "}
          <Button variant="link" onClick={clearAudience}>
            Choose a different audience
          </Button>
        </div>
      ) : (
        <>
          <GuestDirectoryFilters
            value={filters}
            onChange={updateFilters}
            variant="full"
            hideSmsConsentFilter
            eventOptions={facets?.events ?? []}
            tagOptions={facets?.tags ?? []}
            defaultListKeyOptions={facets?.defaultListKeys ?? []}
            listKeyOptions={facets?.workspaceListKeys ?? []}
            customFieldOptions={facets?.customFieldOptions ?? []}
            blastOptions={(blasts ?? []).map((blast) => ({
              id: blast._id,
              name: blast.name,
              deliveryTrackingEnabled: blast.deliveryTrackingEnabled === true,
              status: blast.status,
            }))}
          />
          {facetsQuery.error ? (
            <p role="alert">
              Filters could not be loaded.{" "}
              <Button variant="link" onClick={() => void facetsQuery.refetch()}>
                Retry
              </Button>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="tabular-nums">{selectionLabel}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!directory.configured || directory.isPreparing || Boolean(directory.error)}
              onClick={selectAllMatching}
            >
              Select all matching
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAudience}>
              Clear selection
            </Button>
            <div className="ml-auto">
              <GuestDirectoryColumnsMenu columnLayout={columnLayout} />
            </div>
          </div>
          {directory.error ? (
            <div role="alert">
              {directory.error}{" "}
              <Button variant="outline" onClick={() => void directory.retry()}>
                Retry
              </Button>
            </div>
          ) : directory.isPreparing ? (
            <p role="status">Preparing the contact directory…</p>
          ) : !directory.configured ? (
            <p>Complete the filter details to search contacts.</p>
          ) : directory.isLoading ? (
            <p role="status">Searching contacts…</p>
          ) : (
            <GuestDirectoryTable
              className="max-h-80 overflow-auto rounded-lg border border-[var(--border-subtle)]"
              table={table}
              columnLayout={columnLayout}
              columnLabels={GUEST_DIRECTORY_COLUMN_LABELS}
              emptyState={
                <p className="p-6 text-center text-[var(--text-secondary)]">
                  No contacts match these filters.
                </p>
              }
            />
          )}
          <DirectoryPagination
            itemCount={directory.people.length}
            itemLabel="contacts"
            currentPage={directory.pageIndex + 1}
            pageSize={20}
            hasActiveFilters
            hasPreviousPage={directory.hasPreviousPage}
            hasNextPage={directory.hasNextPage}
            isLoading={directory.isLoading}
            onPreviousPage={directory.previousPage}
            onNextPage={directory.nextPage}
          />
        </>
      )}
    </div>
  );
}
