"use client";

import { AdminTable, AdminTableEmpty, AdminTableRow } from "@coucou/ui/admin";
import type { ReactNode } from "react";
import {
  AdminTableToolbar,
  type AdminTableToolbarPagination,
  type AdminTableToolbarSearch,
} from "@/components/admin/admin-table-toolbar";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";

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

  search?: AdminTableToolbarSearch;
  pagination?: AdminTableToolbarPagination;
  filters?: ReactNode;

  onRowClick?: (row: TRow) => void;
  /**
   * Optional right-click context menu content for each row — render a
   * <ContextMenuContent> with the row's relevant actions.
   */
  renderRowContextMenu?: (row: TRow) => ReactNode;
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
  renderRowContextMenu,
}: AdminDataTableProps<TRow>) {
  const isLoading = rows === undefined;

  return (
    <div>
      <AdminTableToolbar search={search} pagination={pagination} filters={filters} />

      <AdminTable columns={columns}>
        {isLoading ? (
          <AdminTableEmpty>{loadingMessage}</AdminTableEmpty>
        ) : rows.length === 0 ? (
          <AdminTableEmpty>{emptyMessage}</AdminTableEmpty>
        ) : (
          rows.map((row) => {
            const tableRow = (
              <div
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
            );

            if (!renderRowContextMenu) {
              return <div key={rowKey(row)}>{tableRow}</div>;
            }

            return (
              <ContextMenu key={rowKey(row)}>
                <ContextMenuTrigger asChild>{tableRow}</ContextMenuTrigger>
                {renderRowContextMenu(row)}
              </ContextMenu>
            );
          })
        )}
      </AdminTable>
    </div>
  );
}
