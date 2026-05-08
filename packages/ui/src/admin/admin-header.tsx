import type { ReactNode } from "react";

export interface AdminHeaderProps {
  /**
   * Small uppercase eyebrow above the title (e.g. "Tenancies").
   */
  eyebrow?: string;
  /**
   * Title — large display text.
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
      className="flex items-end justify-between pb-12"
      style={{ borderBottom: "1px solid var(--tt-rule)" }}
    >
      <div>
        {eyebrow ? (
          <div
            className="mb-3 text-[11px] uppercase tracking-[0.06em]"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            {eyebrow}
          </div>
        ) : null}
        <div
          className="text-[26px] leading-tight tracking-[-0.01em]"
          style={{ color: "var(--tt-fg)", fontFamily: "var(--tt-display)" }}
        >
          {title}
        </div>
      </div>
      {status ? (
        <div className="text-[13px]" style={{ color: "var(--tt-fg-dim)" }}>
          {status}
        </div>
      ) : null}
    </div>
  );
}
