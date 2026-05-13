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

const RSVP_TABLE_COLUMN_MIN_WIDTH_FLOOR = 72;
const RSVP_TABLE_HEADER_CHARACTER_WIDTH = 8;
const RSVP_TABLE_HEADER_AFFORDANCE_WIDTH = 52;
const RSVP_TABLE_BODY_HORIZONTAL_AFFORDANCE_WIDTH = 32;
const RSVP_TABLE_BODY_CHARACTER_WIDTH = 8;

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
  return !isReadOnly && !RSVP_ROW_SELECTION_EXCLUDED_COLUMN_IDS.has(columnIdentifier);
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
