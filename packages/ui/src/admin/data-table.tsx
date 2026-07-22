import type { ReactNode } from "react";

export interface AdminTableColumn {
  /**
   * Column header copy.
   */
  label: string;
  /**
   * Width of the column. Use a CSS-friendly string like "30%".
   */
  width: string;
  /**
   * Right-align the column content.
   */
  alignRight?: boolean;
}

export interface AdminTableProps {
  columns: AdminTableColumn[];
  children: ReactNode;
}

/**
 * Hairline-row table for the admin sections. Rows are siblings of the head;
 * each row uses `AdminTableRow` so widths line up.
 */
export function AdminTable({ columns, children }: AdminTableProps) {
  return (
    <div role="table">
      <div
        role="row"
        className="flex pt-3 pb-3 text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{
          borderBottom: "1px solid var(--tt-rule)",
          color: "var(--tt-fg-mute)",
        }}
      >
        {columns.map((column) => (
          <div
            key={column.label}
            role="columnheader"
            className={column.alignRight ? "text-right" : ""}
            style={{ width: column.width }}
          >
            {column.label}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

export interface AdminTableRowProps {
  cells: Array<{
    content: ReactNode;
    width: string;
    alignRight?: boolean;
    /**
     * Optional inline style override (e.g. dim secondary cells).
     */
    style?: React.CSSProperties;
  }>;
}

export function AdminTableRow({ cells }: AdminTableRowProps) {
  return (
    <div
      role="row"
      className="-mx-2 flex items-center rounded-md px-2 py-3 text-[13px] transition-colors hover:bg-[var(--tt-highlight)]"
      style={{
        borderBottom: "1px solid var(--tt-rule)",
        color: "var(--tt-fg)",
      }}
    >
      {cells.map((cell, index) => (
        <div
          key={index}
          role="cell"
          className={cell.alignRight ? "text-right" : ""}
          style={{ width: cell.width, ...cell.style }}
        >
          {cell.content}
        </div>
      ))}
    </div>
  );
}

export function AdminTableEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="py-6 text-[13px]" style={{ color: "var(--tt-fg-dim)" }}>
      {children}
    </div>
  );
}
