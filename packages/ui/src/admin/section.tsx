import type { ReactNode } from "react";

export interface AdminSectionProps {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}

/**
 * Standard admin section layout: title + meta header line, then children
 * (typically rows or a table). Used for "Attention", "Houses", "Pending".
 */
export function AdminSection({ title, meta, children }: AdminSectionProps) {
  return (
    <section
      className="py-12"
      style={{ borderBottom: "1px solid var(--tt-rule)" }}
    >
      <div
        className="flex items-center justify-between pb-6 text-[13px]"
        style={{ borderBottom: "1px solid var(--tt-rule)" }}
      >
        <span style={{ color: "var(--tt-fg)" }}>{title}</span>
        {meta ? <span style={{ color: "var(--tt-fg-dim)" }}>{meta}</span> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}
