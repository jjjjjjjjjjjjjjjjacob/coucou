import Link from "next/link";
import type { ReactNode } from "react";

export interface NavLinkProps {
  href: string;
  active?: boolean;
  count?: ReactNode;
  children: ReactNode;
}

export function NavLink({ href, active, count, children }: NavLinkProps) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-6 py-2 text-[13px] transition-colors"
      style={{
        color: active ? "var(--tt-fg)" : "var(--tt-fg-dim)",
        borderLeft: active ? "1px solid var(--tt-fg)" : "1px solid transparent",
      }}
    >
      <span>{children}</span>
      {count !== undefined && count !== null ? (
        <span style={{ color: "var(--tt-fg-mute)" }}>{count}</span>
      ) : null}
    </Link>
  );
}
