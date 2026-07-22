"use client";

import type { ReactNode } from "react";
import {
  AdminTableToolbar,
  type AdminTableToolbarPagination,
  type AdminTableToolbarSearch,
} from "@/components/admin/admin-table-toolbar";
import { type TenancyListItem, TenancyListRow } from "@/components/admin/tenancy-list-row";

export interface TenancyListProps {
  rows: TenancyListItem[] | undefined;
  emptyMessage?: ReactNode;
  loadingMessage?: ReactNode;
  search?: AdminTableToolbarSearch;
  pagination?: AdminTableToolbarPagination;
  filters?: ReactNode;
}

/**
 * Event-list-style tenancy list: search/pagination toolbar above a stack of
 * card rows with hover actions and right-click context menus.
 */
export function TenancyList({
  rows,
  emptyMessage = "No workspaces yet.",
  loadingMessage = "Loading…",
  search,
  pagination,
  filters,
}: TenancyListProps) {
  const isLoading = rows === undefined;

  return (
    <div>
      <AdminTableToolbar search={search} pagination={pagination} filters={filters} />

      {isLoading ? (
        <div className="py-6 text-[13px]" style={{ color: "var(--tt-fg-dim)" }}>
          {loadingMessage}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-[13px]" style={{ color: "var(--tt-fg-dim)" }}>
          {emptyMessage}
        </div>
      ) : (
        <div className="flex flex-col gap-3 pt-4">
          {rows.map((tenancy) => (
            <TenancyListRow key={tenancy._id} tenancy={tenancy} />
          ))}
        </div>
      )}
    </div>
  );
}
