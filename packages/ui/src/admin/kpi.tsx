import type { ReactNode } from "react";

export interface KpiProps {
  label: string;
  value: ReactNode;
  /**
   * Whether this KPI sits as the last column in its row. Suppresses the
   * right-edge hairline.
   */
  last?: boolean;
}

export function Kpi({ label, value, last }: KpiProps) {
  return (
    <div
      className="px-6 first:pl-0 last:pr-0"
      style={{
        borderRight: last ? undefined : "1px solid var(--tt-rule)",
      }}
    >
      <div
        className="mb-4 text-[11px] uppercase tracking-[0.06em]"
        style={{ color: "var(--tt-fg-mute)" }}
      >
        {label}
      </div>
      <div
        className="text-[24px] tracking-[-0.01em]"
        style={{ color: "var(--tt-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}

export interface KpiRowProps {
  children: ReactNode;
  /**
   * Number of columns. Defaults to the number of children if not set.
   */
  columns?: number;
}

export function KpiRow({ children, columns = 5 }: KpiRowProps) {
  return (
    <div
      className="grid py-12"
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        borderBottom: "1px solid var(--tt-rule)",
      }}
    >
      {children}
    </div>
  );
}
