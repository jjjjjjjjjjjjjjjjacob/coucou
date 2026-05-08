import type { AnchorHTMLAttributes, ComponentType, HTMLAttributes, ReactNode } from "react";
import { combineClassNames } from "../../internal-utils";

export interface EyebrowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /**
   * Optional trailing content rendered to the right of the eyebrow on the
   * same line (e.g. an `EyebrowPill`). Lays out via `flex justify-between`
   * so the eyebrow stays left and the trailing content right-aligns.
   */
  trailing?: ReactNode;
}

export function Eyebrow({ className, children, trailing, ...rest }: EyebrowProps) {
  if (trailing) {
    return (
      <div
        className={combineClassNames(
          "mb-6 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.06em]",
          className,
        )}
        style={{ color: "var(--tt-fg-mute)" }}
        {...rest}
      >
        <span>{children}</span>
        {trailing}
      </div>
    );
  }
  return (
    <div
      className={combineClassNames("mb-6 text-[11px] uppercase tracking-[0.06em]", className)}
      style={{ color: "var(--tt-fg-mute)" }}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface EyebrowPillProps {
  href: string;
  children: ReactNode;
  /**
   * Router-aware link component (e.g. Next.js `Link`). Falls back to a
   * plain `<a>` when omitted.
   */
  linkComponent?: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;
  className?: string;
}

/**
 * Small inline link rendered alongside an `Eyebrow` (typically as
 * `Eyebrow.trailing`). Used for cross-route nav like "← BACK TO EVENT" on
 * status / ticket pages and "MY RSVP →" on the detail page.
 *
 * The component renders the consumer's `linkComponent` (e.g. Next.js
 * `Link`) directly when provided so client-side routing stays intact;
 * otherwise it falls back to a plain `<a>`. Avoid using a dynamic
 * `<Tag>` cast — Next.js `Link` is a forwarded-ref component and the
 * cast can interfere with prop forwarding in some setups.
 */
export function EyebrowPill({
  href,
  children,
  linkComponent: LinkComponent,
  className,
}: EyebrowPillProps) {
  const pillClassName = combineClassNames(
    "inline-block text-[10px] uppercase tracking-[0.1em] no-underline",
    "px-2 py-0.5 transition-colors cursor-pointer",
    className,
  );
  const pillStyle: React.CSSProperties = {
    border: "1px solid var(--tt-rule)",
    color: "var(--tt-fg-dim)",
    pointerEvents: "auto",
    textDecoration: "none",
  };
  if (LinkComponent) {
    return (
      <LinkComponent href={href} className={pillClassName} style={pillStyle}>
        {children}
      </LinkComponent>
    );
  }
  return (
    <a href={href} className={pillClassName} style={pillStyle}>
      {children}
    </a>
  );
}
