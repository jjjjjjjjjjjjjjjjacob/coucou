"use client";

import type { ReadonlyURLSearchParams } from "next/navigation";
import { DirectoryPagination } from "@/components/ui/directory-pagination";
import type { HostRsvp } from "@/lib/types";

interface AppRouterLike {
  replace: (url: string, options?: { scroll?: boolean }) => void;
}

interface RsvpPaginationProps {
  isLoading: boolean;
  rsvpsPaginated:
    | {
        page: HostRsvp[];
        nextCursor: string | null;
        isDone: boolean;
      }
    | undefined;
  rsvps: HostRsvp[];
  startItem: number;
  endItem: number;
  totalCount: number | undefined;
  hasActiveFilters: boolean;
  pageSize: number;
  searchParams: ReadonlyURLSearchParams;
  router: AppRouterLike;
  rsvpsPath: string;
  cursor: string | null;
  cursorHistory: (string | null)[];
  setCursor: (cursor: string | null) => void;
  setCursorHistory: (history: string[]) => void;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
  currentPage: number;
}

export function RsvpPagination({
  isLoading,
  rsvpsPaginated,
  rsvps,
  startItem,
  endItem,
  totalCount,
  hasActiveFilters,
  pageSize,
  searchParams,
  router,
  rsvpsPath,
  cursor,
  cursorHistory,
  setCursor,
  setCursorHistory,
  goToPreviousPage,
  goToNextPage,
  currentPage,
}: RsvpPaginationProps) {
  if (isLoading || !rsvpsPaginated) {
    return null;
  }

  return (
    <DirectoryPagination
      itemCount={rsvps.length}
      itemLabel="guests"
      currentPage={currentPage}
      startItem={startItem}
      endItem={endItem}
      pageSize={pageSize}
      pageSizeOptions={[10, 20, 50, 100]}
      totalCount={totalCount}
      hasActiveFilters={hasActiveFilters}
      hasPreviousPage={cursor !== null || cursorHistory.length > 0}
      hasNextPage={!rsvpsPaginated.isDone && Boolean(rsvpsPaginated.nextCursor)}
      onPageSizeChange={(nextPageSize) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("pageSize", String(nextPageSize));
        router.replace(`${rsvpsPath}?${params.toString()}`, { scroll: false });
        setCursor(null);
        setCursorHistory([]);
      }}
      onPreviousPage={goToPreviousPage}
      onNextPage={goToNextPage}
    />
  );
}
