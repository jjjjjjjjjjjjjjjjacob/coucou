"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AdminTableToolbarSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface AdminTableToolbarPagination {
  cursor: string | null;
  nextCursor: string | null;
  isDone: boolean;
  onCursorChange: (cursor: string | null) => void;
  cursorStack: string[];
  onCursorStackChange: (stack: string[]) => void;
  totalCount?: number;
}

export interface AdminTableToolbarProps {
  search?: AdminTableToolbarSearch;
  pagination?: AdminTableToolbarPagination;
  filters?: ReactNode;
}

/**
 * Search / filter / pagination toolbar shared by the admin data table and the
 * event-style tenancy card list.
 */
export function AdminTableToolbar({ search, pagination, filters }: AdminTableToolbarProps) {
  if (!search && !filters && !pagination) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 pb-4"
      style={{ borderBottom: "1px solid var(--tt-rule)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        {search ? (
          <Input
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder ?? "Search…"}
            className="h-8 w-56 text-[13px]"
          />
        ) : null}
        {filters}
      </div>
      {pagination ? (
        <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--tt-fg-dim)" }}>
          {typeof pagination.totalCount === "number" ? (
            <span>{pagination.totalCount} total</span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={pagination.cursorStack.length === 0}
            onClick={() => {
              const nextStack = [...pagination.cursorStack];
              const previous = nextStack.pop() ?? null;
              pagination.onCursorStackChange(nextStack);
              pagination.onCursorChange(previous);
            }}
            className="h-7 px-2 text-[12px]"
            style={{ color: "var(--tt-fg)" }}
          >
            ← prev
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pagination.isDone || !pagination.nextCursor}
            onClick={() => {
              if (!pagination.nextCursor) return;
              pagination.onCursorStackChange([...pagination.cursorStack, pagination.cursor ?? ""]);
              pagination.onCursorChange(pagination.nextCursor);
            }}
            className="h-7 px-2 text-[12px]"
            style={{ color: "var(--tt-fg)" }}
          >
            next →
          </Button>
        </div>
      ) : null}
    </div>
  );
}
