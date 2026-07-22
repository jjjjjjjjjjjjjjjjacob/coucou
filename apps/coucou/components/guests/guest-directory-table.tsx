"use client";

import { flexRender, type Table as TanStackTable } from "@tanstack/react-table";
import { GripVertical } from "lucide-react";
import type React from "react";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { DashboardTableColumnLayout } from "@/lib/hooks/use-dashboard-table-column-layout";
import {
  getRsvpTableDisplayWidth,
  getRsvpTableFillerColumnWidth,
  RSVP_TABLE_RESIZE_HANDLE_TEST_ID,
  shouldRenderRsvpTableResizeHandle,
} from "@/lib/rsvp-table-layout";
import type { GuestDirectoryPerson } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GuestDirectoryTableProps {
  table: TanStackTable<GuestDirectoryPerson>;
  columnLayout: DashboardTableColumnLayout;
  columnLabels: Record<string, string>;
  onRowClick?: (person: GuestDirectoryPerson) => void;
  renderRowContextMenuContent?: (person: GuestDirectoryPerson) => React.ReactNode;
  activePersonDetailReference?: string | null;
  emptyState?: React.ReactNode;
}

const INTERACTIVE_ELEMENT_SELECTOR =
  "button, a, input, select, textarea, [role='menuitem'], [role='checkbox'], [role='separator'], [data-slot='popover-trigger']";

export function GuestDirectoryTable({
  table,
  columnLayout,
  columnLabels,
  onRowClick,
  renderRowContextMenuContent,
  activePersonDetailReference,
  emptyState,
}: GuestDirectoryTableProps) {
  const rows = table.getRowModel().rows;
  const isDraggingColumn = columnLayout.draggedColumnIdentifier !== null;

  const columnTotalWidth = table.getTotalSize();
  const tableFillerColumnWidth = getRsvpTableFillerColumnWidth({
    containerWidth: columnLayout.tableContainerWidth,
    columnTotalWidth,
  });
  const tableDisplayWidth = getRsvpTableDisplayWidth({
    containerWidth: columnLayout.tableContainerWidth,
    columnTotalWidth,
  });
  const shouldRenderTableFillerColumn = tableFillerColumnWidth > 0;

  const renderRow = (row: (typeof rows)[number]) => {
    const person = row.original;
    const isActivePerson =
      activePersonDetailReference !== undefined &&
      activePersonDetailReference !== null &&
      person.detailReference === activePersonDetailReference;

    const rowElement = (
      <tr
        key={row.id}
        role={onRowClick ? "link" : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        aria-label={onRowClick ? `Open ${person.name} details` : undefined}
        className={cn(
          "border-t border-[var(--border-subtle)] transition-colors hover:bg-[var(--surface-3)]",
          onRowClick &&
            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--text-primary)]/30",
          row.getIsSelected() && "bg-[var(--surface-3)]/60",
          isActivePerson && "bg-[var(--surface-3)]",
        )}
        onClick={(clickEvent) => {
          if (!onRowClick) return;
          if (
            clickEvent.target instanceof Element &&
            clickEvent.target.closest(INTERACTIVE_ELEMENT_SELECTOR)
          ) {
            return;
          }
          onRowClick(person);
        }}
        onKeyDown={(keyboardEvent) => {
          if (!onRowClick) return;
          if (keyboardEvent.target !== keyboardEvent.currentTarget) return;
          if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
            keyboardEvent.preventDefault();
            onRowClick(person);
          }
        }}
      >
        {row.getVisibleCells().map((cell) => (
          <td
            key={cell.id}
            className="overflow-hidden px-2 py-3 align-middle"
            style={{
              width: cell.column.getSize(),
              minWidth: cell.column.columnDef.minSize,
              maxWidth: cell.column.columnDef.maxSize,
            }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
        {shouldRenderTableFillerColumn && (
          <td aria-hidden="true" className="p-0" style={{ width: tableFillerColumnWidth }} />
        )}
      </tr>
    );

    if (!renderRowContextMenuContent) {
      return rowElement;
    }

    return (
      <ContextMenu key={row.id}>
        <ContextMenuTrigger asChild>{rowElement}</ContextMenuTrigger>
        {renderRowContextMenuContent(person)}
      </ContextMenu>
    );
  };

  return (
    <div
      ref={columnLayout.setTableContainerElement}
      className="w-full max-w-full min-w-0 overflow-x-auto"
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
          {shouldRenderTableFillerColumn && <col style={{ width: tableFillerColumnWidth }} />}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="text-left text-[var(--text-secondary)]">
              {headerGroup.headers.map((header) => {
                const columnIdentifier = header.column.id;
                const isDragSourceEnabled = columnIdentifier !== "select";
                const columnDisplayLabel =
                  columnLabels[columnIdentifier] ??
                  (typeof header.column.columnDef.header === "string"
                    ? header.column.columnDef.header
                    : columnIdentifier);
                const shouldShowResizeHandle = shouldRenderRsvpTableResizeHandle({
                  columnIdentifier,
                  canResize: header.column.getCanResize(),
                });
                const isColumnResizing = header.column.getIsResizing();
                const resizeHandler = header.getResizeHandler();
                const dragHoverDetails = columnLayout.dragHoverDetails;

                return (
                  <th
                    key={header.id}
                    className={cn(
                      "group relative select-none overflow-hidden border-b border-r border-[var(--border-subtle)] py-2 pl-2 pr-4 font-medium last:border-r-0",
                      isDraggingColumn && "cursor-grabbing",
                      dragHoverDetails?.columnId === columnIdentifier &&
                        dragHoverDetails.position === "before" &&
                        "border-l-2 border-l-[var(--text-secondary)]/40",
                      dragHoverDetails?.columnId === columnIdentifier &&
                        dragHoverDetails.position === "after" &&
                        "border-r-2 border-r-[var(--text-secondary)]/40",
                      columnLayout.draggedColumnIdentifier === columnIdentifier && "opacity-60",
                    )}
                    style={{
                      width: header.getSize(),
                      minWidth: header.column.columnDef.minSize,
                      maxWidth: header.column.columnDef.maxSize,
                    }}
                    title={columnDisplayLabel}
                    onDragOver={(event) => {
                      event.preventDefault();
                      columnLayout.handleColumnDragOver(event, columnIdentifier);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      columnLayout.handleColumnDrop(event, columnIdentifier);
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
                              columnLayout.handleColumnDragStart(
                                syntheticEvent,
                                columnIdentifier,
                                columnDisplayLabel,
                              );
                            }
                          : undefined
                      }
                      onDragEnd={columnLayout.handleColumnDragEnd}
                    >
                      {isDragSourceEnabled && (
                        <GripVertical
                          aria-hidden="true"
                          className="h-3 w-3 flex-shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      )}
                      <span className="min-w-0 truncate whitespace-nowrap">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
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
        <tbody>{rows.map(renderRow)}</tbody>
      </table>

      {rows.length === 0
        ? (emptyState ?? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="mb-2 text-lg text-[var(--text-secondary)]">No guests found</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Try adjusting the filters or search query.
              </p>
            </div>
          ))
        : null}
    </div>
  );
}
