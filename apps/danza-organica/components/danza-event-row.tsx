"use client";

import type { ChlorineLandingEvent, ChlorineLineupEntry } from "@coucou/ui/tenant-template";
import type {
  AnchorHTMLAttributes,
  ComponentType,
  CSSProperties,
  ElementType,
  ReactNode,
} from "react";
import { useState } from "react";

// Danza Organica reuses the chlorine landing-row data shape so the page
// logic (contextual RSVP bricks, preserved-query hrefs) ports verbatim
// between tenant apps; only the rendering below is danza-specific.
export type DanzaLandingEvent = ChlorineLandingEvent;
export type DanzaLineupEntry = ChlorineLineupEntry;

export type DanzaEventRowVariant = "default" | "minimized" | "expanded";

export interface DanzaEventRowProps {
  event: DanzaLandingEvent;
  mobile: boolean;
  visible: boolean;
  delayMs: number;
  /**
   * Render override for the RSVP link. Apps should pass their router's
   * `Link` (e.g. Next.js `next/link`) so clicking the row stays in the
   * client-side navigation flow. Defaults to a native `<a>`.
   */
  linkComponent?: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;
  /**
   * Visual variant. "default" matches the home listing. "minimized" shrinks
   * the row to a single dim line — used for sibling events on the detail
   * page. "expanded" keeps the standard row size and renders
   * `expandedContent` inline below.
   */
  variant?: DanzaEventRowVariant;
  /**
   * Optional href to the event's dedicated detail page. When set on a
   * "default" row, a small "DETAILS" link is rendered under the RSVP
   * brick. On a "minimized" row the entire row becomes a link to this href.
   */
  detailHref?: string;
  /**
   * Content rendered below the row when `variant === "expanded"`.
   */
  expandedContent?: ReactNode;
  /**
   * Optional content rendered in column 3 ABOVE the RSVP brick.
   */
  topRightSlot?: ReactNode;
  /**
   * Optional content rendered in column 3 below the RSVP brick.
   */
  bottomRightSlot?: ReactNode;
}

/**
 * Danza Organica's event row. Same 3-column grid (date · lineup · RSVP
 * brick) and interaction rules as `ChlorineEventRow`, but typography comes
 * entirely from the preset tokens — `var(--tt-display)` (Geist for the
 * danza preset) at the dojo scale instead of chlorine's hard-coded Bowlby
 * One — and the brick respects the preset's `--tt-button-radius`.
 */
export function DanzaEventRow({
  event,
  mobile,
  visible,
  delayMs,
  linkComponent: LinkComponent,
  variant = "default",
  detailHref,
  expandedContent,
  topRightSlot,
  bottomRightSlot,
}: DanzaEventRowProps) {
  const isMinimized = variant === "minimized";
  const isExpanded = variant === "expanded";
  const isDefault = variant === "default";
  const rsvpClickable = Boolean(event.rsvpHref && !event.rsvpDisabled);
  // When a `detailHref` is present on a default row we DO NOT wrap the
  // entire row in an anchor — the secondary "Details" link below the brick
  // would become a nested `<a>` inside another `<a>` (invalid HTML and the
  // source of a Next.js hydration warning). The brick itself becomes the
  // link target instead. Minimized rows still wrap because they have no
  // nested links.
  const wrapMinimizedAsDetailLink = isMinimized && Boolean(detailHref);
  const wrapDefaultAsRsvpLink = isDefault && rsvpClickable && !detailHref;
  const rowIsLink = wrapMinimizedAsDetailLink || wrapDefaultAsRsvpLink;
  const RowTag = rowIsLink ? ((LinkComponent ?? "a") as ElementType) : "div";
  const rowHref = wrapMinimizedAsDetailLink ? detailHref! : event.rsvpHref;
  const rowProps =
    rowIsLink && rowHref ? ({ href: rowHref } as { href: string }) : ({} as Record<string, never>);
  const verticalPadding = isMinimized ? (mobile ? "6px 0" : "8px 0") : mobile ? "10px 0" : "14px 0";

  // Brick = the visible "RSVP" / "CLOSED" tile in column 3. When we are NOT
  // wrapping the whole row in the rsvp anchor, the brick must itself be the
  // link target so the user has something clickable.
  const renderBrick = () => {
    if (!rsvpClickable) {
      return <span style={buildRsvpBrickStyle(mobile, true)}>{event.rsvpLabel ?? "CLOSED"}</span>;
    }
    if (wrapDefaultAsRsvpLink) {
      // Whole row is the link → brick is just the visual tile.
      return <span style={buildRsvpBrickStyle(mobile, false)}>{event.rsvpLabel ?? "RSVP"}</span>;
    }
    // Row is a div (because detailHref forces no row-anchor), so the brick
    // owns the click.
    const BrickTag = (LinkComponent ?? "a") as ElementType;
    return (
      <BrickTag
        href={event.rsvpHref}
        style={{
          ...buildRsvpBrickStyle(mobile, false),
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        {event.rsvpLabel ?? "RSVP"}
      </BrickTag>
    );
  };

  const renderDetailsLink = () => {
    if (!detailHref || !isDefault) return null;
    const DetailTag = (LinkComponent ?? "a") as ElementType;
    return (
      <DetailTag
        href={detailHref}
        style={{
          fontFamily: "var(--tt-text)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--tt-fg-mute)",
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        Details
      </DetailTag>
    );
  };

  return (
    <RowTag
      {...rowProps}
      style={{
        display: "grid",
        gridTemplateColumns: mobile ? "auto 1fr auto" : "120px 1fr 90px",
        gap: mobile ? 16 : 32,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflowX: "hidden",
        padding: verticalPadding,
        alignItems: "baseline",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 700ms ease ${delayMs}ms, transform 700ms cubic-bezier(0.2,0,0.2,1) ${delayMs}ms`,
        color: "inherit",
        textDecoration: "none",
        cursor: rowIsLink ? "pointer" : "default",
      }}
    >
      <div
        style={{
          fontFamily: "var(--tt-text)",
          fontSize: mobile ? 13 : 16,
          color: isMinimized ? "var(--tt-fg-mute)" : "var(--tt-fg)",
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        {event.date}
      </div>
      <div
        style={{
          fontFamily: "var(--tt-display)",
          fontSize: mobile ? 17 : 22,
          fontWeight: 700,
          lineHeight: 1.15,
          color: isMinimized ? "var(--tt-fg-mute)" : "var(--tt-fg)",
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          minWidth: 0,
          overflowWrap: "anywhere",
          ...(isMinimized
            ? {
                fontSize: mobile ? 14 : 16,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }
            : null),
        }}
      >
        {isMinimized ? (
          <span>
            {event.lineup
              .map((lineupEntry) =>
                typeof lineupEntry === "string" ? lineupEntry : lineupEntry.label,
              )
              .join(" · ")}
          </span>
        ) : (
          event.lineup.map((lineupEntry, lineupIndex) => {
            const normalizedLineupEntry =
              typeof lineupEntry === "string" ? { label: lineupEntry } : lineupEntry;
            const labelWithBadges = (
              <>
                <span>{normalizedLineupEntry.label}</span>
                {normalizedLineupEntry.descriptorBadges?.length ? (
                  <DanzaLineupBadges badges={normalizedLineupEntry.descriptorBadges} />
                ) : null}
              </>
            );
            // Lineup entries become real `<a>`s only when (a) an href is
            // provided AND (b) the row itself is NOT already wrapped in an
            // anchor — otherwise we'd nest `<a>` inside `<a>`.
            const canRenderLineupAnchor = Boolean(normalizedLineupEntry.href) && !rowIsLink;
            return canRenderLineupAnchor ? (
              <DanzaLineupAnchor
                key={`${normalizedLineupEntry.label}-${lineupIndex}`}
                href={normalizedLineupEntry.href!}
              >
                {labelWithBadges}
              </DanzaLineupAnchor>
            ) : (
              <div key={`${normalizedLineupEntry.label}-${lineupIndex}`}>{labelWithBadges}</div>
            );
          })
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isExpanded ? "flex-end" : "center",
          gap: 6,
        }}
      >
        {isMinimized ? (
          <span
            style={{
              fontFamily: "var(--tt-text)",
              fontSize: mobile ? 10 : 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--tt-fg-mute)",
              padding: mobile ? "4px 0" : "6px 0",
            }}
          >
            DETAILS →
          </span>
        ) : (
          <>
            {topRightSlot}
            {renderBrick()}
            {bottomRightSlot}
            {renderDetailsLink()}
          </>
        )}
      </div>
      {isExpanded && expandedContent ? (
        <div
          style={{
            gridColumn: mobile ? "1 / -1" : "2 / -1",
            paddingTop: mobile ? 14 : 18,
          }}
        >
          {expandedContent}
        </div>
      ) : null}
    </RowTag>
  );
}

interface DanzaLineupBadgesProps {
  badges: string[];
}

function DanzaLineupBadges({ badges }: DanzaLineupBadgesProps) {
  return (
    <sup
      style={{
        fontFamily: "var(--tt-text)",
        fontSize: "0.42em",
        verticalAlign: "super",
        letterSpacing: "0.06em",
        marginLeft: 4,
        color: "var(--tt-fg)",
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      ({badges.join(" ")})
    </sup>
  );
}

interface DanzaLineupAnchorProps {
  href: string;
  children: ReactNode;
}

/**
 * Lineup entry link with a soft text-color hover shift in place of an
 * underline.
 */
function DanzaLineupAnchor({ href, children }: DanzaLineupAnchorProps) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      style={{
        color: isHovered ? "var(--tt-fg-dim)" : "inherit",
        display: "block",
        textDecoration: "none",
        width: "fit-content",
        transition: "color 180ms ease",
      }}
    >
      {children}
    </a>
  );
}

export function buildRsvpBrickStyle(mobile: boolean, disabled: boolean): CSSProperties {
  return {
    background: "var(--tt-fg)",
    color: "var(--tt-bg)",
    fontFamily: "var(--tt-text)",
    fontSize: mobile ? 11 : 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: mobile ? "6px 10px" : "8px 14px",
    borderRadius: "var(--tt-button-radius, 0px)",
    textDecoration: "none",
    textAlign: "center",
    display: "inline-block",
    textTransform: "uppercase",
    opacity: disabled ? 0.45 : 1,
  };
}
