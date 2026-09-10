"use client";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectOption } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DirectoryPaginationProps {
  itemCount: number;
  itemLabel: string;
  currentPage: number;
  startItem?: number;
  endItem?: number;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  totalCount?: number;
  hasActiveFilters?: boolean;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  isLoading?: boolean;
  onPageSizeChange?: (pageSize: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  className?: string;
}

export function DirectoryPagination({
  itemCount,
  itemLabel,
  currentPage,
  startItem,
  endItem,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  totalCount,
  hasActiveFilters = false,
  hasPreviousPage,
  hasNextPage,
  isLoading = false,
  onPageSizeChange,
  onPreviousPage,
  onNextPage,
  className,
}: DirectoryPaginationProps) {
  if (isLoading) return null;

  const resolvedStartItem =
    startItem ?? (itemCount === 0 ? 0 : (currentPage - 1) * (pageSize ?? itemCount) + 1);
  const resolvedEndItem = endItem ?? resolvedStartItem + Math.max(itemCount - 1, 0);
  const filteredLabel = hasActiveFilters ? " (filtered)" : "";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <div className="text-sm text-[var(--text-secondary)] tabular-nums">
          {itemCount === 0 ? (
            <span>
              No {itemLabel} found{filteredLabel}
            </span>
          ) : (
            <span>
              Showing {resolvedStartItem}-{resolvedEndItem}
              {typeof totalCount === "number" ? ` of ${totalCount}` : ""} {itemLabel}
              {filteredLabel}
            </span>
          )}
        </div>
        {pageSize && onPageSizeChange ? (
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
            className="h-8 w-auto border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
          >
            {pageSizeOptions.map((number) => (
              <SelectOption key={number} value={String(number)}>
                {number} per page
              </SelectOption>
            ))}
          </Select>
        ) : null}
      </div>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent className="gap-1 sm:gap-2">
          <PaginationItem>
            <PaginationPrevious
              onClick={hasPreviousPage ? onPreviousPage : undefined}
              aria-disabled={!hasPreviousPage}
              className={cn(
                "h-8 w-8 sm:h-9 sm:w-auto sm:px-3",
                hasPreviousPage ? "cursor-pointer" : "pointer-events-none opacity-50",
              )}
            />
          </PaginationItem>
          <span className="text-sm text-[var(--text-secondary)] tabular-nums">
            Page {currentPage}
          </span>
          <PaginationItem>
            <PaginationNext
              onClick={hasNextPage ? onNextPage : undefined}
              aria-disabled={!hasNextPage}
              className={cn(
                "h-8 w-8 sm:h-9 sm:w-auto sm:px-3",
                hasNextPage ? "cursor-pointer" : "pointer-events-none opacity-50",
              )}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
