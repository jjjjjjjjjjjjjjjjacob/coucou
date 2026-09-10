"use client";

import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQueries } from "@tanstack/react-query";
import type { FunctionArgs } from "convex/server";
import { useEffect, useMemo, useState } from "react";

type ContactMatchCountArgs = Omit<FunctionArgs<typeof api.contacts.countPage>, "cursor">;

export function useContactMatchCount(args: ContactMatchCountArgs | null) {
  const filterKey = JSON.stringify(args);
  const [navigation, setNavigation] = useState<{
    key: string;
    cursors: Array<string | undefined>;
  }>({ key: filterKey, cursors: [undefined] });
  const currentCursors = useMemo(
    () => (navigation.key === filterKey ? navigation.cursors : [undefined]),
    [navigation, filterKey],
  );
  const queries = useQueries({
    queries: args
      ? currentCursors.map((cursor) => convexQuery(api.contacts.countPage, { ...args, cursor }))
      : [],
  });
  const batches = useMemo(() => {
    const cursors: Array<string | undefined> = [undefined];
    let count = 0;
    let error: string | null = null;
    let isDone = false;
    for (const [batchIndex, query] of queries.entries()) {
      // A changed continuation invalidates every subsequent batch from the old chain.
      if (currentCursors[batchIndex] !== cursors[batchIndex]) break;
      const result = query.data;
      error = query.error?.message ?? null;
      if (error || result?.directoryStatus !== "ready") break;
      count += result.count;
      isDone = result.isDone;
      if (isDone || !result.nextCursor) break;
      cursors.push(result.nextCursor);
    }
    return { cursors, count, error, isDone };
  }, [queries, currentCursors]);
  useEffect(() => {
    setNavigation((previous) => {
      if (
        previous.key === filterKey &&
        previous.cursors.length === batches.cursors.length &&
        previous.cursors.every((cursor, batchIndex) => cursor === batches.cursors[batchIndex])
      )
        return previous;
      return { key: filterKey, cursors: batches.cursors };
    });
  }, [batches.cursors, filterKey]);
  return {
    totalCount: args && batches.isDone ? batches.count : undefined,
    error: batches.error,
    retry: async () => {
      const failedQueries = queries.filter((query) => query.error);
      await Promise.all(
        (failedQueries.length ? failedQueries : queries).map((query) => query.refetch()),
      );
    },
  };
}
