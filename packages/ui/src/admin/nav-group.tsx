import type { ReactNode } from "react";

export interface NavGroupProps {
  label: string;
  children: ReactNode;
}

export function NavGroup({ label, children }: NavGroupProps) {
  return (
    <div className="mb-8">
      <div
        className="px-6 pb-3 text-[11px] uppercase tracking-[0.06em]"
        style={{ color: "var(--tt-fg-mute)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
