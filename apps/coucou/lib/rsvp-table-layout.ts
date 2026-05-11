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
  minContentWidth: number;
  preferredSize?: number;
  maxSize?: number;
}

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

const RSVP_ROW_SELECTION_EXCLUDED_COLUMN_IDS = new Set([
  "select",
  "listKey",
  "approvalStatus",
  "attendanceStatus",
  "ticketStatus",
  "actions",
]);

const RSVP_TABLE_COLUMN_MIN_WIDTH_FLOOR = 80;
const RSVP_TABLE_HEADER_CHARACTER_WIDTH = 8;
const RSVP_TABLE_HEADER_AFFORDANCE_WIDTH = 52;
const RSVP_TABLE_BODY_HORIZONTAL_AFFORDANCE_WIDTH = 32;

export function getRsvpTableColumnSizing({
  label,
  minContentWidth,
  preferredSize = 150,
  maxSize = RSVP_TABLE_COLUMN_MAX_WIDTH,
}: RsvpTableColumnSizingOptions): RsvpResizableColumnSizing {
  const labelWidth =
    label.trim().length * RSVP_TABLE_HEADER_CHARACTER_WIDTH + RSVP_TABLE_HEADER_AFFORDANCE_WIDTH;
  const contentWidth = minContentWidth + RSVP_TABLE_BODY_HORIZONTAL_AFFORDANCE_WIDTH;
  const minSize = Math.ceil(Math.max(RSVP_TABLE_COLUMN_MIN_WIDTH_FLOOR, labelWidth, contentWidth));
  const resolvedMaxSize = Math.max(minSize, maxSize);

  return {
    enableResizing: true,
    size: Math.min(Math.max(preferredSize, minSize), resolvedMaxSize),
    minSize,
    maxSize: resolvedMaxSize,
  };
}

export function canToggleRsvpTableRowFromBodyCell({
  columnIdentifier,
  isReadOnly,
}: RsvpTableBodyCellClassNameOptions): boolean {
  return !isReadOnly && !RSVP_ROW_SELECTION_EXCLUDED_COLUMN_IDS.has(columnIdentifier);
}

export function getRsvpTableBodyCellClassName({
  columnIdentifier,
  isReadOnly,
}: RsvpTableBodyCellClassNameOptions): string {
  return cn(
    "py-1 pr-2 border-r border-foreground/10 last:border-r-0",
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
