import type { ReactNode } from "react";

export interface AdminSectionProps {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}

/**
 * Standard admin section layout: title + meta header line, then children
 * (typically rows or a table). Used for "Attention", "Partners", "Pending".
 */
export function AdminSection({ title, meta, children }: AdminSectionProps) {
  return (
    <section className="py-8" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between pb-4">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {title}
        </span>
        {meta ? (
          <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {meta}
          </span>
        ) : null}
      </div>
      <div>{children}</div>
    </section>
  );
}
