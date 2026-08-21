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

// Danza Organica builds on the shared landing event shape while keeping the
// editorial event title separate from its artist lineup.
export interface DanzaLandingEvent extends ChlorineLandingEvent {
  title: string;
  subtitle?: string | null;
  hosts?: string[];
  location?: string;
  compactDate?: string;
  time?: string;
}
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
   * Optional href to the event's dedicated detail page. Default rows render
   * it beneath the RSVP action; minimized rows use it for the entire row.
   */
  detailHref?: string;
  /**
   * Optional label for the link beneath the RSVP action. Defaults to
   * "Details"; event detail pages use "← Back" in the same position.
   */
  detailLabel?: string;
  /**
   * Content rendered below the row when `variant === "expanded"`.
   */
  expandedContent?: ReactNode;
  /**
   * Optional sponsor section rendered after hosts and before event timing.
   */
  sponsorSlot?: ReactNode;
  /**
   * Optional unlabeled partner row rendered at the bottom of expanded details.
   */
  partnerSlot?: ReactNode;
  /**
   * Optional content rendered above the RSVP action.
   */
  topRightSlot?: ReactNode;
  /**
   * Optional content rendered below the RSVP action.
   */
  bottomRightSlot?: ReactNode;
}

/**
 * Danza Organica's centered event composition. The title and subtitle lead,
 * with artists, date, location, and actions following in a single editorial
 * stack that echoes Dojo's event detail page.
 */
export function DanzaEventRow({
  event,
  mobile,
  visible,
  delayMs,
  linkComponent: LinkComponent,
  variant = "default",
  detailHref,
  detailLabel = "Details",
  expandedContent,
  sponsorSlot,
  partnerSlot,
  topRightSlot,
  bottomRightSlot,
}: DanzaEventRowProps) {
  const isMinimized = variant === "minimized";
  const isExpanded = variant === "expanded";
  const rsvpClickable = Boolean(event.rsvpHref && !event.rsvpDisabled);
  const rowIsLink = isMinimized && Boolean(detailHref);
  const RowTag = rowIsLink ? ((LinkComponent ?? "a") as ElementType) : "div";
  const rowHref = rowIsLink ? detailHref : undefined;
  const rowProps =
    rowIsLink && rowHref ? ({ href: rowHref } as { href: string }) : ({} as Record<string, never>);
  const lineupText = event.lineup
    .map((lineupEntry) => (typeof lineupEntry === "string" ? lineupEntry : lineupEntry.label))
    .join(" · ");

  const renderBrick = () => {
    if (!rsvpClickable) {
      return <span style={buildRsvpBrickStyle(mobile, true)}>{event.rsvpLabel ?? "CLOSED"}</span>;
    }
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
    if (!detailHref || isMinimized) return null;
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
          color: "var(--tt-fg-mute, var(--tt-fg))",
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        {detailLabel}
      </DetailTag>
    );
  };

  return (
    <RowTag
      {...rowProps}
      style={{
        display: isMinimized ? "grid" : "flex",
        gridTemplateColumns: isMinimized ? (mobile ? "1fr auto" : "100px 1fr auto") : undefined,
        flexDirection: isMinimized ? undefined : "column",
        justifyContent: "center",
        gap: isMinimized ? (mobile ? 10 : 24) : mobile ? 20 : 24,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflowX: "hidden",
        padding: isMinimized ? (mobile ? "14px 0" : "16px 0") : "0",
        alignItems: "center",
        textAlign: isMinimized ? "left" : "center",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 700ms ease ${delayMs}ms, transform 700ms cubic-bezier(0.2,0,0.2,1) ${delayMs}ms`,
        color: "inherit",
        textDecoration: "none",
        cursor: rowIsLink ? "pointer" : "default",
      }}
    >
      {isMinimized ? (
        <>
          <div
            style={{
              display: mobile ? "none" : "block",
              fontFamily: "var(--tt-text)",
              fontSize: 12,
              color: "var(--tt-fg-mute)",
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            {event.date}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--tt-display)",
                fontSize: mobile ? 15 : 16,
                fontWeight: 700,
                lineHeight: 1.15,
                color: "var(--tt-fg-mute)",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {event.title}
              {event.subtitle ? ` — ${event.subtitle}` : ""}
            </div>
            <div
              style={{
                marginTop: 3,
                color: "var(--tt-fg-mute)",
                fontSize: 10,
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {mobile ? `${event.date} · ` : ""}
              {lineupText}
            </div>
          </div>
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
        </>
      ) : (
        <>
          <div style={{ width: "100%", maxWidth: 600 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--tt-display)",
                fontSize: mobile ? 38 : 56,
                fontWeight: 700,
                lineHeight: 0.98,
                color: "var(--tt-fg)",
                textTransform: "uppercase",
                letterSpacing: "-0.035em",
                overflowWrap: "anywhere",
              }}
            >
              {event.title}
            </h1>
            {event.subtitle ? (
              <p
                style={{
                  margin: mobile ? "10px 0 0" : "12px 0 0",
                  fontFamily: "var(--tt-display)",
                  fontSize: mobile ? 21 : 28,
                  fontWeight: 650,
                  lineHeight: 1.05,
                  color: "var(--tt-fg-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.01em",
                }}
              >
                {event.subtitle}
              </p>
            ) : null}
          </div>

          {event.lineup.length > 0 ? (
            <div
              aria-label="Featuring"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 7,
                maxWidth: 520,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--tt-text)",
                  fontSize: 10,
                  fontWeight: 650,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--tt-fg-mute)",
                }}
              >
                Featuring
              </span>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: "5px 12px",
                  fontFamily: "var(--tt-display)",
                  fontSize: mobile ? 16 : 19,
                  fontWeight: 650,
                  lineHeight: 1.2,
                  color: "var(--tt-fg)",
                  textTransform: "uppercase",
                  letterSpacing: "0.025em",
                }}
              >
                {event.lineup.map((lineupEntry, lineupIndex) => {
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
                  const artistContent = normalizedLineupEntry.href ? (
                    <DanzaLineupAnchor href={normalizedLineupEntry.href}>
                      {labelWithBadges}
                    </DanzaLineupAnchor>
                  ) : (
                    labelWithBadges
                  );
                  return (
                    <span key={`${normalizedLineupEntry.label}-${lineupIndex}`}>
                      {artistContent}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          {event.hosts?.length ? (
            <div
              aria-label="Hosted by"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 7,
                maxWidth: 560,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--tt-text)",
                  fontSize: 10,
                  fontWeight: 650,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--tt-fg-mute)",
                }}
              >
                Hosted by
              </span>
              <span
                style={{
                  fontFamily: "var(--tt-display)",
                  fontSize: mobile ? 14 : 16,
                  fontWeight: 650,
                  lineHeight: 1.3,
                  color: "var(--tt-fg)",
                  textTransform: "uppercase",
                  letterSpacing: "0.025em",
                }}
              >
                {event.hosts.join(" · ")}
              </span>
            </div>
          ) : null}

          {sponsorSlot}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              fontFamily: "var(--tt-text)",
              fontSize: mobile ? 14 : 16,
              fontWeight: 550,
              lineHeight: 1.25,
              color: "var(--tt-fg)",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            <span>{event.date}</span>
            {event.location ? <span>{event.location}</span> : null}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            {topRightSlot}
            {renderBrick()}
            {renderDetailsLink()}
            {bottomRightSlot}
          </div>
        </>
      )}
      {isExpanded && expandedContent ? (
        <div
          style={{
            width: "100%",
            maxWidth: 540,
            paddingTop: mobile ? 8 : 12,
            textAlign: "left",
          }}
        >
          {expandedContent}
        </div>
      ) : null}
      {isExpanded && partnerSlot ? (
        <div
          style={{
            width: "100%",
            maxWidth: 540,
            paddingTop: mobile ? 4 : 8,
          }}
        >
          {partnerSlot}
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
        color: isHovered ? "var(--tt-fg-dim, var(--tt-fg))" : "inherit",
        display: "inline-block",
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
    background: "var(--tt-accent, var(--tt-fg))",
    color: "var(--tt-fg)",
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
