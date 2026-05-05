import type { HTMLAttributes, ReactNode } from "react";
import { combineClassNames } from "../../internal-utils";

export interface EyebrowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Eyebrow({ className, children, ...rest }: EyebrowProps) {
  return (
    <div
      className={combineClassNames(
        "mb-6 text-[11px] uppercase tracking-[0.06em]",
        className,
      )}
      style={{ color: "var(--tt-fg-mute)" }}
      {...rest}
    >
      {children}
    </div>
  );
}
