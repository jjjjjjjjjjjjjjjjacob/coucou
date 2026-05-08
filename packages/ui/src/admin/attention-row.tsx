import type { ReactNode } from "react";

export interface AttentionRowProps {
  /**
   * Severity tag. "flag" highlights with foreground color; "watch" stays dim.
   */
  kind: "flag" | "watch";
  /**
   * Main label describing the condition.
   */
  label: ReactNode;
  /**
   * Right-aligned timestamp / context.
   */
  timestamp?: ReactNode;
}

export function AttentionRow({ kind, label, timestamp }: AttentionRowProps) {
  return (
    <div
      className="grid items-center py-4 text-[13px]"
      style={{
        gridTemplateColumns: "60px 1fr 100px",
        borderBottom: "1px solid var(--tt-rule)",
      }}
    >
      <span
        style={{
          color: kind === "flag" ? "var(--tt-fg)" : "var(--tt-fg-dim)",
        }}
      >
        {kind}
      </span>
      <span style={{ color: "var(--tt-fg)" }}>{label}</span>
      {timestamp ? (
        <span className="text-right" style={{ color: "var(--tt-fg-dim)" }}>
          {timestamp}
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}

export function AttentionEmptyRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="py-6 text-[13px]"
      style={{
        color: "var(--tt-fg-dim)",
      }}
    >
      {children}
    </div>
  );
}
