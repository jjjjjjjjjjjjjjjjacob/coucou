import { type ColumnDef, type RowData } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

interface RsvpSelectColumnSizing {
  enableResizing: false;
  size: number;
  minSize: number;
  maxSize: number;
}

interface RsvpResizableColumnSizing {
  enableResizing: true;
  size: number;
  minSize: number;
  maxSize: number;
}

interface RsvpTableColumnSizingOptions {
  label: string;
  contentValues?: readonly RsvpTableContentValue[];
  minContentWidth?: number;
  contentWidthCap?: number;
  contentHorizontalAffordance?: number;
  maxSize?: number;
}

type RsvpTableContentValue = boolean | null | number | string | undefined;

interface RsvpTableBodyCellClassNameOptions {
  columnIdentifier: string;
  isReadOnly: boolean;
}

interface RsvpTableResizeHandleOptions {
  columnIdentifier: string;
  canResize: boolean;
}

interface RsvpTableWidthOptions {
  containerWidth: number;
  columnTotalWidth: number;
}

type RsvpTableInteractiveTarget = EventTarget | null;

interface RsvpContextActionTargetOptions<TargetRow extends { id: string }> {
  contextRow: TargetRow;
  rows: TargetRow[];
  selectedRowIds: Set<string>;
}

export const RSVP_TABLE_BODY_ALIGNMENT_GUTTER_CLASS = "rsvp-table-cell-drag-gutter pl-6";
export const RSVP_TABLE_COLUMN_MAX_WIDTH = 640;
export const RSVP_TABLE_RESIZE_HANDLE_TEST_ID = "rsvp-table-column-resize-handle";
export const RSVP_SELECT_COLUMN_SIZING: RsvpSelectColumnSizing = {
  enableResizing: false,
  size: 60,
  minSize: 50,
  maxSize: 70,
};

export const RSVP_ROW_SELECTION_COLUMN_ID = "select" as const;

const RSVP_TABLE_COLUMN_MIN_WIDTH_FLOOR = 72;
const RSVP_TABLE_HEADER_CHARACTER_WIDTH = 8;
const RSVP_TABLE_HEADER_AFFORDANCE_WIDTH = 52;
const RSVP_TABLE_BODY_HORIZONTAL_AFFORDANCE_WIDTH = 32;
const RSVP_TABLE_BODY_CHARACTER_WIDTH = 8;
const RSVP_TABLE_INTERACTIVE_TARGET_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='dropdown-menu-item']",
  "[data-slot='dropdown-menu-radio-item']",
  "[data-rsvp-table-interactive='true']",
].join(",");

function getRsvpTableContentValueText(contentValue: RsvpTableContentValue): string {
  if (contentValue === null || contentValue === undefined) {
    return "";
  }

  if (typeof contentValue === "boolean") {
    return contentValue ? "Yes" : "No";
  }

  return String(contentValue).trim();
}

function getRsvpTableContentValueWidth(contentValue: RsvpTableContentValue): number {
  return getRsvpTableContentValueText(contentValue).length * RSVP_TABLE_BODY_CHARACTER_WIDTH;
}

export function getRsvpTableColumnSizing({
  label,
  contentValues = [],
  minContentWidth = 0,
  contentWidthCap,
  contentHorizontalAffordance = RSVP_TABLE_BODY_HORIZONTAL_AFFORDANCE_WIDTH,
  maxSize = RSVP_TABLE_COLUMN_MAX_WIDTH,
}: RsvpTableColumnSizingOptions): RsvpResizableColumnSizing {
  const labelWidth =
    label.trim().length * RSVP_TABLE_HEADER_CHARACTER_WIDTH + RSVP_TABLE_HEADER_AFFORDANCE_WIDTH;
  const widestContentValueWidth = Math.max(
    0,
    ...contentValues.map((contentValue) => getRsvpTableContentValueWidth(contentValue)),
  );
  const cappedContentValueWidth =
    contentWidthCap === undefined
      ? widestContentValueWidth
      : Math.min(widestContentValueWidth, contentWidthCap);
  const contentWidth =
    Math.max(minContentWidth, cappedContentValueWidth) + contentHorizontalAffordance;
  const minSize = Math.ceil(Math.max(RSVP_TABLE_COLUMN_MIN_WIDTH_FLOOR, labelWidth, contentWidth));
  const resolvedMaxSize = Math.max(minSize, maxSize);

  return {
    enableResizing: true,
    size: minSize,
    minSize,
    maxSize: resolvedMaxSize,
  };
}

export function canToggleRsvpTableRowFromBodyCell({
  columnIdentifier,
  isReadOnly,
}: RsvpTableBodyCellClassNameOptions): boolean {
  return !isReadOnly && columnIdentifier === RSVP_ROW_SELECTION_COLUMN_ID;
}

export function isRsvpTableInteractiveEventTarget(
  eventTarget: RsvpTableInteractiveTarget,
): boolean {
  return (
    typeof Element !== "undefined" &&
    eventTarget instanceof Element &&
    eventTarget.closest(RSVP_TABLE_INTERACTIVE_TARGET_SELECTOR) !== null
  );
}

export function getRsvpTableBodyCellClassName({
  columnIdentifier,
  isReadOnly,
}: RsvpTableBodyCellClassNameOptions): string {
  return cn(
    "max-w-0 overflow-hidden py-1 pr-2 align-middle border-r border-foreground/10 last:border-r-0",
    columnIdentifier === "select" ? "pl-2" : RSVP_TABLE_BODY_ALIGNMENT_GUTTER_CLASS,
    canToggleRsvpTableRowFromBodyCell({ columnIdentifier, isReadOnly }) && "cursor-pointer",
  );
}

export function shouldRenderRsvpTableResizeHandle({
  columnIdentifier,
  canResize,
}: RsvpTableResizeHandleOptions): boolean {
  return columnIdentifier !== "select" && canResize;
}

export function getRsvpTableDisplayWidth({
  containerWidth,
  columnTotalWidth,
}: RsvpTableWidthOptions): number {
  return Math.max(containerWidth, columnTotalWidth);
}

export function getRsvpTableFillerColumnWidth({
  containerWidth,
  columnTotalWidth,
}: RsvpTableWidthOptions): number {
  return Math.max(0, containerWidth - columnTotalWidth);
}

export function getRsvpContextActionTargets<TargetRow extends { id: string }>({
  contextRow,
  rows,
  selectedRowIds,
}: RsvpContextActionTargetOptions<TargetRow>): TargetRow[] {
  if (!selectedRowIds.has(contextRow.id)) {
    return [contextRow];
  }

  const selectedRows = rows.filter((row) => selectedRowIds.has(row.id));
  return selectedRows.length > 1 ? selectedRows : [contextRow];
}

export function hasStringAccessorKey<TData extends RowData>(
  columnDefinition: ColumnDef<TData>,
): columnDefinition is ColumnDef<TData> & { accessorKey: string } {
  const candidateAccessorKey = (columnDefinition as { accessorKey?: unknown }).accessorKey;
  return typeof candidateAccessorKey === "string";
}

export function getRsvpSelectionRangeIds(
  orderedRowIds: readonly string[],
  anchorRowId: string,
  focusRowId: string,
): string[] {
  const anchorIndex = orderedRowIds.indexOf(anchorRowId);
  const focusIndex = orderedRowIds.indexOf(focusRowId);
  if (anchorIndex === -1 || focusIndex === -1) {
    return [];
  }
  const startIndex = Math.min(anchorIndex, focusIndex);
  const endIndex = Math.max(anchorIndex, focusIndex);
  return orderedRowIds.slice(startIndex, endIndex + 1);
}
