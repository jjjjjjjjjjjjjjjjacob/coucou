"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQueries } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import {
  encodeGuestDirectoryFilterArgs,
  type GuestDirectoryFilterState,
  isGuestDirectoryFilterConfigured,
} from "@/lib/text-blast-filters";
import type { WorkspaceScope } from "@/lib/use-workspace-scope";
import { useDebounce } from "./use-debounce";

type ContactDirectoryBatch = FunctionReturnType<typeof api.contacts.list>;

export function useContactDirectory(
  filterState: GuestDirectoryFilterState,
  workspaceScope: WorkspaceScope | null,
  pageSize = 20,
) {
  const debouncedSearch = useDebounce(filterState.searchText, 250);
  const filterArgs = useMemo(() => {
    const encoded = encodeGuestDirectoryFilterArgs({ ...filterState, searchText: debouncedSearch });
    return {
      ...encoded,
      eventIds: encoded.eventIds as Id<"events">[] | undefined,
      recipientHistoryFilter: encoded.recipientHistoryFilter
        ? {
            ...encoded.recipientHistoryFilter,
            textBlastIds: encoded.recipientHistoryFilter.textBlastIds as Id<"textBlasts">[],
          }
        : undefined,
    };
  }, [filterState, debouncedSearch]);
  const filterKey = JSON.stringify({
    filterArgs,
    searchText: filterState.searchText,
    workspace: workspaceScope?.queryArgs,
    pageSize,
  });
  const [navigation, setNavigation] = useState<{
    key: string;
    pageIndex: number;
    cursors: Array<string | undefined>;
  }>({ key: filterKey, pageIndex: 0, cursors: [undefined] });
  const currentNavigation = useMemo(
    () =>
      navigation.key === filterKey
        ? navigation
        : { key: filterKey, pageIndex: 0, cursors: [undefined] },
    [navigation, filterKey],
  );
  const configured = isGuestDirectoryFilterConfigured(filterState);
  const isDebouncing = debouncedSearch !== filterState.searchText;
  const directoryQueries = useQueries({
    queries:
      workspaceScope && configured && !isDebouncing
        ? currentNavigation.cursors.map((cursor) =>
            convexQuery(api.contacts.list, {
              ...filterArgs,
              workspaceSlug: workspaceScope.workspaceSlug,
              siteKey: workspaceScope.siteKey,
              cursor,
              pageSize,
            }),
          )
        : [],
  });
  const pageEnd = (currentNavigation.pageIndex + 1) * pageSize;
  const batches = useMemo(() => {
    const peopleByContactId = new Map<
      Id<"workspaceContacts">,
      ContactDirectoryBatch["people"][number]
    >();
    const cursors: Array<string | undefined> = [undefined];
    let directoryStatus: ContactDirectoryBatch["directoryStatus"] | undefined;
    let error: string | null = null;
    let isExhausted = false;

    for (const [batchIndex, directoryQuery] of directoryQueries.entries()) {
      // A live update can change a continuation. Discard results from its old cursor chain.
      if (currentNavigation.cursors[batchIndex] !== cursors[batchIndex]) break;
      const result = directoryQuery.data;
      directoryStatus = result?.directoryStatus ?? directoryStatus;
      error = directoryQuery.error?.message ?? null;
      if (error || result?.directoryStatus !== "ready") break;
      for (const person of result.people) peopleByContactId.set(person.contactId, person);
      isExhausted = result.isDone;
      // Read one match beyond the displayed page so Next never leads to an empty page.
      if (isExhausted || peopleByContactId.size > pageEnd || !result.nextCursor) break;
      cursors.push(result.nextCursor);
    }
    return {
      people: [...peopleByContactId.values()],
      cursors,
      directoryStatus,
      error,
      isExhausted,
    };
  }, [directoryQueries, currentNavigation.cursors, pageEnd]);
  const pageIndex = batches.isExhausted
    ? Math.min(
        currentNavigation.pageIndex,
        Math.max(0, Math.ceil(batches.people.length / pageSize) - 1),
      )
    : currentNavigation.pageIndex;

  useEffect(() => {
    setNavigation((previous) => {
      if (
        previous.key === filterKey &&
        previous.pageIndex === pageIndex &&
        previous.cursors.length === batches.cursors.length &&
        previous.cursors.every((cursor, batchIndex) => cursor === batches.cursors[batchIndex])
      )
        return previous;
      return { key: filterKey, pageIndex, cursors: batches.cursors };
    });
  }, [batches.cursors, filterKey, pageIndex]);
  const startBackfill = useMutation(api.contactSync.startBackfill);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const directoryStatus = batches.directoryStatus;
  useEffect(() => {
    if (directoryStatus !== "not_started" || !workspaceScope) return;
    let active = true;
    startBackfill(workspaceScope.queryArgs).catch((error: unknown) => {
      if (active)
        setBackfillError(error instanceof Error ? error.message : "Could not prepare contacts");
    });
    return () => {
      active = false;
    };
  }, [directoryStatus, workspaceScope, startBackfill]);
  const isLoading =
    Boolean(workspaceScope && configured) &&
    !batches.error &&
    (isDebouncing ||
      directoryStatus === undefined ||
      (directoryStatus === "ready" && !batches.isExhausted && batches.people.length <= pageEnd));
  const hasNextPage =
    !isLoading && !batches.error && batches.people.length > (pageIndex + 1) * pageSize;
  return {
    // Never let a consumer display results from the previous debounced search term.
    people:
      isLoading || batches.error
        ? []
        : batches.people.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    configured,
    isLoading,
    isPreparing: directoryStatus === "not_started" || directoryStatus === "building",
    error:
      backfillError ??
      batches.error ??
      (directoryStatus === "failed" ? "The contact directory could not be prepared." : null),
    retry: async () => {
      setBackfillError(null);
      if ((directoryStatus === "failed" || directoryStatus === "not_started") && workspaceScope)
        await startBackfill(workspaceScope.queryArgs);
      else {
        const failedQueries = directoryQueries.filter((directoryQuery) => directoryQuery.error);
        await Promise.all(
          (failedQueries.length ? failedQueries : directoryQueries).map((directoryQuery) =>
            directoryQuery.refetch(),
          ),
        );
      }
    },
    pageIndex,
    hasNextPage,
    hasPreviousPage: pageIndex > 0,
    nextPage: () => {
      if (hasNextPage)
        setNavigation({ key: filterKey, pageIndex: pageIndex + 1, cursors: batches.cursors });
    },
    previousPage: () =>
      setNavigation({
        key: filterKey,
        pageIndex: Math.max(0, pageIndex - 1),
        cursors: batches.cursors,
      }),
  };
}
