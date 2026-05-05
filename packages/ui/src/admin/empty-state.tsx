import type { ReactNode } from "react";

export interface AdminEmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

/**
 * Quiet empty state used inside admin sections when a data source has nothing
 * to show. Mirrors the Maison Obscur typography and spacing.
 */
export function AdminEmptyState({
  title,
  description,
  action,
}: AdminEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-16 text-center"
      style={{ color: "var(--tt-fg-dim)" }}
    >
      <div
        className="text-[14px]"
        style={{ color: "var(--tt-fg)", fontFamily: "var(--tt-display)" }}
      >
        {title}
      </div>
      {description ? (
        <div className="max-w-sm text-[12px] leading-relaxed">{description}</div>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
