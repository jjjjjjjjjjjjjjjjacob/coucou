import type { ReactNode } from "react";

export interface AdminHeaderProps {
  /**
   * Small uppercase eyebrow above the title (e.g. "Tenancies").
   */
  eyebrow?: string;
  /**
   * Title — page heading.
   */
  title: string;
  /**
   * Right-aligned status text (e.g. "all systems nominal").
   */
  status?: ReactNode;
}

export function AdminHeader({ eyebrow, title, status }: AdminHeaderProps) {
  return (
    <div
      className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="space-y-1.5">
        {eyebrow ? (
          <div
            className="text-[11px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--text-tertiary)" }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h1
          className="m-0 text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h1>
      </div>
      {status ? (
        <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {status}
        </div>
      ) : null}
    </div>
  );
}
