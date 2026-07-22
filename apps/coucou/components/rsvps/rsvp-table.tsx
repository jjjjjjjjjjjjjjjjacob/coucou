"use client";

import { flexRender, type Table } from "@tanstack/react-table";
import { GripVertical } from "lucide-react";
import React from "react";
import { useRsvpTableContext } from "@/app/workspaces/[workspaceSlug]/host/rsvps/page";
import type { TicketDisplayStatus } from "@/components/rsvps/rsvp-controls";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  getRsvpTableBodyCellClassName,
  hasStringAccessorKey,
  RSVP_TABLE_RESIZE_HANDLE_TEST_ID,
  shouldRenderRsvpTableResizeHandle,
} from "@/lib/rsvp-table-layout";
import type { HostRsvp } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RsvpPendingChanges {
  originalApprovalStatus: "pending" | "approved" | "denied";
  originalTicketStatus: TicketDisplayStatus;
  currentApprovalStatus: "pending" | "approved" | "denied";
  currentTicketStatus: TicketDisplayStatus;
}

interface RsvpTableProps {
  table: Table<HostRsvp>;
  isLoading: boolean;
  setTableContainerElement: (element: HTMLDivElement | null) => void;
  tableDisplayWidth: number;
  tableFillerColumnWidth: number;
  shouldRenderTableFillerColumn: boolean;
  draggedColumnIdentifier: string | null;
  dragHoverDetails: { columnId: string; position: "before" | "after" } | null;
  handleColumnDragStart: (
    event: React.DragEvent<HTMLTableHeaderCellElement>,
    columnIdentifier: string,
    columnDisplayLabel: string,
  ) => void;
  handleColumnDragOver: (
    event: React.DragEvent<HTMLTableHeaderCellElement>,
    targetColumnIdentifier: string,
  ) => void;
  handleColumnDrop: (
    event: React.DragEvent<HTMLTableHeaderCellElement>,
    targetColumnIdentifier: string,
  ) => void;
  handleColumnDragEnd: () => void;
  formatColumnIdentifier: (identifier: string) => string;
  getColumnDisplayName: (columnId: string) => string;
  pendingChanges: Record<string, RsvpPendingChanges>;
  renderRowContextMenuContent: (rsvp: HostRsvp) => React.ReactNode;
}

export function RsvpTable({
  table,
  isLoading,
  setTableContainerElement,
  tableDisplayWidth,
  tableFillerColumnWidth,
  shouldRenderTableFillerColumn,
  draggedColumnIdentifier,
  dragHoverDetails,
  handleColumnDragStart,
  handleColumnDragOver,
  handleColumnDrop,
  handleColumnDragEnd,
  formatColumnIdentifier,
  getColumnDisplayName,
  pendingChanges,
  renderRowContextMenuContent,
}: RsvpTableProps) {
  const { isReadOnly, selectedRows } = useRsvpTableContext();
  const isDraggingColumn = draggedColumnIdentifier !== null;

  return isLoading ? (
    <TableSkeleton rows={10} columns={8} />
  ) : (
    <div
      ref={setTableContainerElement}
      className="w-full max-w-full min-w-0 overflow-x-auto rounded-md border border-[var(--border-subtle)]"
    >
      <table
        className="text-sm text-[var(--text-primary)]"
        style={{ tableLayout: "fixed", width: tableDisplayWidth }}
      >
        <colgroup>
          {table.getVisibleLeafColumns().map((column) => (
            <col
              key={column.id}
              style={{
                width: column.getSize(),
                minWidth: column.columnDef.minSize,
                maxWidth: column.columnDef.maxSize,
              }}
            />
          ))}
          {shouldRenderTableFillerColumn && (
            <col
              style={{
                width: tableFillerColumnWidth,
              }}
            />
          )}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="text-left text-[var(--text-secondary)]">
              {headerGroup.headers.map((header) => {
                const columnIdentifier =
                  header.column.id ??
                  (hasStringAccessorKey(header.column.columnDef)
                    ? header.column.columnDef.accessorKey
                    : header.id);
                const sortingHandler = header.column.getCanSort()
                  ? header.column.getToggleSortingHandler()
                  : undefined;
                const isDragSourceEnabled = columnIdentifier !== "select";
                const columnMeta = header.column.columnDef.meta as { label?: string } | undefined;
                const columnDisplayLabel =
                  typeof header.column.columnDef.header === "string" &&
                  header.column.columnDef.header.trim().length > 0
                    ? header.column.columnDef.header
                    : columnMeta?.label && columnMeta.label.trim().length > 0
                      ? columnMeta.label
                      : (getColumnDisplayName(columnIdentifier) ??
                        formatColumnIdentifier(columnIdentifier));
                const canResizeColumn = header.column.getCanResize();
                const shouldShowResizeHandle = shouldRenderRsvpTableResizeHandle({
                  columnIdentifier,
                  canResize: canResizeColumn,
                });
                const isColumnResizing = header.column.getIsResizing();
                const resizeHandler = header.getResizeHandler();

                return (
                  <th
                    key={header.id}
                    className={cn(
                      "group relative select-none overflow-hidden border-b border-r border-[var(--border-subtle)] py-1 pl-2 pr-4 last:border-r-0",
                      isDraggingColumn ? "cursor-grabbing" : "cursor-pointer",
                      dragHoverDetails?.columnId === columnIdentifier &&
                        dragHoverDetails.position === "before" &&
                        "border-l-2 border-l-[var(--text-secondary)]/40",
                      dragHoverDetails?.columnId === columnIdentifier &&
                        dragHoverDetails.position === "after" &&
                        "border-r-2 border-r-[var(--text-secondary)]/40",
                      draggedColumnIdentifier === columnIdentifier && "opacity-60",
                    )}
                    style={{
                      width: header.getSize(),
                      minWidth: header.column.columnDef.minSize,
                      maxWidth: header.column.columnDef.maxSize,
                    }}
                    title={columnDisplayLabel}
                    onDragOver={(event) => {
                      event.preventDefault();
                      handleColumnDragOver(event, columnIdentifier);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleColumnDrop(event, columnIdentifier);
                    }}
                    onClick={(event) => {
                      if (isDraggingColumn) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }

                      if (sortingHandler) {
                        sortingHandler(event);
                      }
                    }}
                  >
                    <div
                      className="flex min-w-0 items-center gap-1"
                      draggable={isDragSourceEnabled}
                      onDragStart={
                        isDragSourceEnabled
                          ? (event) => {
                              const headerElement = event.currentTarget.closest(
                                "th",
                              ) as HTMLTableHeaderCellElement | null;
                              if (!headerElement) return;

                              const syntheticEvent = {
                                ...event,
                                currentTarget: headerElement,
                              } as React.DragEvent<HTMLTableHeaderCellElement>;
                              handleColumnDragStart(
                                syntheticEvent,
                                columnIdentifier,
                                columnDisplayLabel,
                              );
                            }
                          : undefined
                      }
                      onDragEnd={handleColumnDragEnd}
                    >
                      {isDragSourceEnabled && (
                        <GripVertical
                          aria-hidden="true"
                          className={cn(
                            "h-3 w-3 flex-shrink-0 text-[var(--text-tertiary)] transition-opacity",
                            "opacity-0 group-hover:opacity-100",
                          )}
                        />
                      )}
                      <div className="flex min-w-0 items-center gap-1 whitespace-nowrap">
                        <span className="min-w-0 truncate">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                        {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    </div>
                    {shouldShowResizeHandle && (
                      <div
                        role="separator"
                        aria-label={`Resize ${columnDisplayLabel} column`}
                        aria-orientation="vertical"
                        data-testid={RSVP_TABLE_RESIZE_HANDLE_TEST_ID}
                        draggable={false}
                        className={cn(
                          "absolute top-0 right-0 z-10 h-full w-3 translate-x-1/2 cursor-col-resize touch-none select-none",
                          "after:absolute after:inset-y-1 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-[var(--border-subtle)] after:transition-colors",
                          "hover:after:bg-[var(--text-secondary)]",
                          isColumnResizing && "after:bg-[var(--text-primary)]",
                        )}
                        onMouseDown={(resizeStartEvent) => {
                          resizeStartEvent.preventDefault();
                          resizeStartEvent.stopPropagation();
                          resizeHandler(resizeStartEvent);
                        }}
                        onTouchStart={(resizeStartEvent) => {
                          resizeStartEvent.preventDefault();
                          resizeStartEvent.stopPropagation();
                          resizeHandler(resizeStartEvent);
                        }}
                        onClick={(resizeClickEvent) => {
                          resizeClickEvent.preventDefault();
                          resizeClickEvent.stopPropagation();
                        }}
                        onDoubleClick={(resizeDoubleClickEvent) => {
                          resizeDoubleClickEvent.preventDefault();
                          resizeDoubleClickEvent.stopPropagation();
                          header.column.resetSize();
                        }}
                        onDragStart={(resizeDragStartEvent) => {
                          resizeDragStartEvent.preventDefault();
                          resizeDragStartEvent.stopPropagation();
                        }}
                      />
                    )}
                  </th>
                );
              })}
              {shouldRenderTableFillerColumn && (
                <th
                  aria-hidden="true"
                  className="border-b border-[var(--border-subtle)] p-0"
                  style={{ width: tableFillerColumnWidth }}
                />
              )}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const rsvp = row.original;
            const changes = pendingChanges[rsvp.id];
            const hasChanges =
              changes &&
              (changes.currentApprovalStatus !== changes.originalApprovalStatus ||
                changes.currentTicketStatus !== changes.originalTicketStatus);

            const isSelected = selectedRows.has(rsvp.id);

            return (
              <ContextMenu key={row.id}>
                <ContextMenuTrigger asChild>
                  <tr
                    className={cn(
                      "border-t border-[var(--border-subtle)] transition-colors hover:bg-[var(--surface-3)]",
                      hasChanges &&
                        "bg-[var(--status-pending-bg)] border-[var(--status-pending)]/20",
                      isSelected && "bg-[var(--status-issued-bg)] border-[var(--status-issued)]/20",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const columnIdentifier = cell.column.id;
                      return (
                        <td
                          key={cell.id}
                          className={getRsvpTableBodyCellClassName({
                            columnIdentifier,
                            isReadOnly,
                          })}
                          style={{
                            width: cell.column.getSize(),
                            minWidth: cell.column.columnDef.minSize,
                            maxWidth: cell.column.columnDef.maxSize,
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                    {shouldRenderTableFillerColumn && (
                      <td
                        aria-hidden="true"
                        className="p-0"
                        style={{ width: tableFillerColumnWidth }}
                      />
                    )}
                  </tr>
                </ContextMenuTrigger>
                {renderRowContextMenuContent(rsvp)}
              </ContextMenu>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
