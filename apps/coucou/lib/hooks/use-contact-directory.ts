"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import {
  encodeGuestDirectoryFilterArgs,
  type GuestDirectoryFilterState,
  isGuestDirectoryFilterConfigured,
} from "@/lib/text-blast-filters";
import type { WorkspaceScope } from "@/lib/use-workspace-scope";
import { useDebounce } from "./use-debounce";

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
    workspace: workspaceScope?.workspaceSlug,
    pageSize,
  });
  const [navigation, setNavigation] = useState<{ key: string; cursors: Array<string | undefined> }>(
    { key: filterKey, cursors: [undefined] },
  );
  const cursors = useMemo(
    () => (navigation.key === filterKey ? navigation.cursors : [undefined]),
    [navigation, filterKey],
  );
  const cursor = cursors[cursors.length - 1];
  const configured = isGuestDirectoryFilterConfigured(filterState);
  const directoryQuery = useQuery({
    ...convexQuery(api.contacts.list, {
      ...filterArgs,
      workspaceSlug: workspaceScope?.workspaceSlug ?? "",
      siteKey: workspaceScope?.siteKey,
      cursor,
      pageSize,
    }),
    enabled: Boolean(workspaceScope) && configured,
  });
  const startBackfill = useMutation(api.contactSync.startBackfill);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const directoryStatus = directoryQuery.data?.directoryStatus;
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
  // A bounded candidate page may have no matches. Continue searching instead of reporting a false empty result.
  useEffect(() => {
    const result = directoryQuery.data;
    if (result?.directoryStatus === "ready" && result.people.length === 0 && result.nextCursor) {
      setNavigation({ key: filterKey, cursors: [...cursors.slice(0, -1), result.nextCursor] });
    }
  }, [directoryQuery.data, filterKey, cursors]);
  const searching =
    directoryStatus === "ready" &&
    directoryQuery.data?.people.length === 0 &&
    Boolean(directoryQuery.data.nextCursor);
  const isLoading =
    directoryQuery.isLoading || searching || debouncedSearch !== filterState.searchText;
  return {
    // Never let a consumer display results from the previous debounced search term.
    people: isLoading ? [] : (directoryQuery.data?.people ?? []),
    configured,
    isLoading,
    isPreparing: directoryStatus === "not_started" || directoryStatus === "building",
    error:
      backfillError ??
      directoryQuery.error?.message ??
      (directoryStatus === "failed" ? "The contact directory could not be prepared." : null),
    retry: async () => {
      setBackfillError(null);
      if ((directoryStatus === "failed" || directoryStatus === "not_started") && workspaceScope)
        await startBackfill(workspaceScope.queryArgs);
      else await directoryQuery.refetch();
    },
    pageIndex: cursors.length - 1,
    hasNextPage: Boolean(directoryQuery.data?.nextCursor),
    hasPreviousPage: cursors.length > 1,
    nextPage: () => {
      const next = directoryQuery.data?.nextCursor;
      if (next) setNavigation({ key: filterKey, cursors: [...cursors, next] });
    },
    previousPage: () =>
      setNavigation({
        key: filterKey,
        cursors: cursors.length > 1 ? cursors.slice(0, -1) : cursors,
      }),
  };
}
