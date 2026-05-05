"use client";

import type { ReactNode } from "react";
import {
  AdminTable,
  AdminTableEmpty,
  AdminTableRow,
} from "@coucou/ui/admin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface AdminDataTableColumn<TRow> {
  key: string;
  label: string;
  width: string;
  alignRight?: boolean;
  sortable?: boolean;
  render: (row: TRow) => ReactNode;
  cellStyle?: (row: TRow) => React.CSSProperties | undefined;
}

export interface AdminDataTableProps<TRow> {
  columns: Array<AdminDataTableColumn<TRow>>;
  rows: TRow[] | undefined;
  rowKey: (row: TRow) => string;
  emptyMessage?: ReactNode;
  loadingMessage?: ReactNode;

  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  pagination?: {
    cursor: string | null;
    nextCursor: string | null;
    isDone: boolean;
    onCursorChange: (cursor: string | null) => void;
    cursorStack: string[];
    onCursorStackChange: (stack: string[]) => void;
    totalCount?: number;
  };
  filters?: ReactNode;

  onRowClick?: (row: TRow) => void;
}

export function AdminDataTable<TRow>({
  columns,
  rows,
  rowKey,
  emptyMessage = "Nothing here yet.",
  loadingMessage = "Loading…",
  search,
  pagination,
  filters,
  onRowClick,
}: AdminDataTableProps<TRow>) {
  const isLoading = rows === undefined;

  return (
    <div>
      {(search || filters || pagination) && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 pb-4"
          style={{ borderBottom: "1px solid var(--tt-rule)" }}
        >
          <div className="flex flex-wrap items-center gap-3">
            {search ? (
              <Input
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder ?? "search…"}
                className="h-8 w-56 border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0"
                style={{
                  borderBottom: "1px solid var(--tt-rule)",
                  borderRadius: 0,
                  color: "var(--tt-fg)",
                }}
              />
            ) : null}
            {filters}
          </div>
          {pagination ? (
            <div
              className="flex items-center gap-3 text-[12px]"
              style={{ color: "var(--tt-fg-dim)" }}
            >
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
                  pagination.onCursorStackChange([
                    ...pagination.cursorStack,
                    pagination.cursor ?? "",
                  ]);
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
      )}

      <AdminTable columns={columns}>
        {isLoading ? (
          <AdminTableEmpty>{loadingMessage}</AdminTableEmpty>
        ) : rows.length === 0 ? (
          <AdminTableEmpty>{emptyMessage}</AdminTableEmpty>
        ) : (
          rows.map((row) => (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : undefined }}
            >
              <AdminTableRow
                cells={columns.map((column) => ({
                  content: column.render(row),
                  width: column.width,
                  alignRight: column.alignRight,
                  style: column.cellStyle?.(row),
                }))}
              />
            </div>
          ))
        )}
      </AdminTable>
    </div>
  );
}
