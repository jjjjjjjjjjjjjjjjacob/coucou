"use client";

import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectOption } from "@/components/ui/select";
import type { HostRsvp } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    <div className="flex items-center justify-between gap-3 pt-4 border-t border-[var(--border-subtle)]">
      <div className="flex items-center gap-4">
        <div className="text-sm text-[var(--text-secondary)]">
          {!rsvps || rsvps.length === 0 ? (
            <span>No guests found{hasActiveFilters && " (filtered)"}</span>
          ) : (
            <span>
              Showing {startItem}-{endItem} of {totalCount || "?"} guests
              {hasActiveFilters && " (filtered)"}
            </span>
          )}
        </div>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("pageSize", value);
            router.replace(`${rsvpsPath}?${params.toString()}`, {
              scroll: false,
            });
            setCursor(null);
            setCursorHistory([]);
          }}
          className="h-8 w-auto border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
        >
          {[10, 20, 50, 100].map((number) => (
            <SelectOption key={number} value={String(number)}>
              {number} per page
            </SelectOption>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-4">
        <Pagination className="justify-end">
          <PaginationContent className="gap-1 sm:gap-2">
            <PaginationItem>
              <PaginationPrevious
                onClick={goToPreviousPage}
                className={cn(
                  "h-8 w-8 sm:h-9 sm:w-auto sm:px-3",
                  cursor === null && cursorHistory.length === 0
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer",
                )}
              />
            </PaginationItem>

            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-secondary)]">Page {currentPage}</span>
            </div>

            <PaginationItem>
              <PaginationNext
                onClick={goToNextPage}
                className={cn(
                  "h-8 w-8 sm:h-9 sm:w-auto sm:px-3",
                  rsvpsPaginated?.isDone || !rsvpsPaginated?.nextCursor
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer",
                )}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
