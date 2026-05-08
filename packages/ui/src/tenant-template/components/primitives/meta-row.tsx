import type { ReactNode } from "react";

export interface MetaRowProps {
  label: string;
  children: ReactNode;
  /**
   * Width of the label column in pixels. Defaults to 100.
   */
  labelWidth?: number;
  /**
   * Right-aligned column. Useful for "recent events" rows where the count or
   * date sits on the right.
   */
  alignRight?: boolean;
}

/**
 * Two-column hairline-bordered key/value row used across the tenant template.
 * Key is small-caps eyebrow on the left; value flows on the right.
 */
export function MetaRow({ label, children, labelWidth = 100, alignRight = false }: MetaRowProps) {
  return (
    <div
      className="grid items-baseline border-b py-3.5 text-[14px]"
      style={{
        gridTemplateColumns: `${labelWidth}px 1fr`,
        borderBottomColor: "var(--tt-rule)",
      }}
    >
      <span
        className="text-[11px] uppercase tracking-[0.04em]"
        style={{ color: "var(--tt-fg-mute)" }}
      >
        {label}
      </span>
      <span className={alignRight ? "text-right" : ""} style={{ color: "var(--tt-fg)" }}>
        {children}
      </span>
    </div>
  );
}
