"use client";

import {
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ComponentType,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { TenantTemplateProvider } from "../provider";
import {
  CHLORINE_PHASE_CASCADE_MS,
  CHLORINE_PHASE_SPLIT_MS,
  ChlorineComposedLogo,
  useLandingViewport,
  type ChlorinePhase,
} from "./chlorine-split-frame";

// Module-level flag persists across re-mounts within the same JS module
// instance — i.e. across client-side route changes within the same tab.
// Resets on full page reload (a fresh module is evaluated). Server renders
// always start with `false`, matching the initial client render and keeping
// hydration aligned. The flag flips to `true` after the intro completes,
// so any subsequent re-mount within this tab skips the animation.
let introHasPlayedInThisModuleInstance = false;

export interface ChlorineLandingEvent {
  /**
   * Stable identifier; used for the React key.
   */
  id: string;
  /**
   * Pre-formatted short date — e.g. "FRI 03.01". Rendered in mono.
   */
  date: string;
  /**
   * Lines printed under each other in the lineup column. Pass `[event.name]`
   * if there is no separate lineup data.
   */
  lineup: Array<string | ChlorineLineupEntry>;
  /**
   * Click target for the RSVP brick. Rendered as an `<a>` so right-click and
   * cmd-click open in a new tab as expected.
   */
  rsvpHref?: string;
  /**
   * Optional override for the brick label. Defaults to "RSVP".
   */
  rsvpLabel?: string;
  /**
   * When true, the RSVP brick renders visually but is not clickable.
   */
  rsvpDisabled?: boolean;
}

export interface ChlorineLineupEntry {
  label: string;
  href?: string;
  /**
   * Small descriptor badges (e.g. "DJ", "LIVE FR") rendered as superscripts
   * after the label. Order is preserved.
   */
  descriptorBadges?: string[];
}

export interface ChlorineLandingProps {
  /**
   * Optional events list rendered as cascading rows down the middle. Use
   * for the home landing surface. Ignored when `children` is provided.
   */
  events?: ChlorineLandingEvent[];
  /**
   * Optional content slot. When provided, replaces the events grid with
   * arbitrary children — used to nest sign-in / RSVP / status / ticket
   * surfaces inside the same animated split chrome.
   */
  children?: ReactNode;
  /**
   * Top-right caption that fades in after the split. Pass an empty string
   * (or omit) to leave the corner blank — the design's "season iv · pool
   * hours" placeholder is no longer the default.
   */
  tagline?: string;
  /**
   * Footer left text. Hidden when empty (the default).
   */
  contactEmail?: string;
  /**
   * Footer right text. Defaults to the current year.
   */
  yearLabel?: string;
  /**
   * Forces the mobile layout regardless of viewport. Useful for design canvas
   * artboards. The component otherwise uses a 720px breakpoint.
   */
  mobile?: boolean;
  /**
   * Optional empty state rendered when `events` is an empty array. Shown in
   * place of the events grid.
   */
  emptyState?: ReactNode;
  /**
   * When true, content renders at its final position with no animation.
   * Useful for SSR snapshots and preview canvases.
   */
  skipAnimation?: boolean;
  /**
   * Max-width of the children content column. Defaults to the source
   * wordmark width (650px) so nested forms align with the split anchors.
   */
  contentMaxWidthPx?: number;
  /**
   * Wraps each wordmark piece (CLUB / swimmer / CHLORINE) in a transparent
   * click-catcher link so clicking the wordmark routes home. The package
   * does not import Next.js itself; pass `linkComponent={Link}` from the
   * app to keep client-side navigation intact. Defaults to `"/"`.
   */
  wordmarkHref?: string;
  linkComponent?: ComponentType<
    AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
  >;
}

/**
 * Bespoke Club Chlorine landing. Three-phase entrance:
 *
 *   t=0.0s   composed wordmark fades in centered
 *   t=1.4s   wordmark "splits": CLUB + swimmer slide to the top edge,
 *            CHLORINE slides to the bottom edge
 *   t=2.2s   event rows cascade in down the middle
 *
 * The component owns its own viewport — host pages should bypass the shared
 * masthead / footer chrome on the route that renders this.
 */
export function ChlorineLanding({
  events,
  children,
  tagline = "",
  contactEmail = "",
  yearLabel = "2026",
  mobile: forceMobile,
  emptyState,
  skipAnimation = false,
  contentMaxWidthPx = 650,
  wordmarkHref = "/",
  linkComponent,
}: ChlorineLandingProps) {
  const landingElementRef = useRef<HTMLDivElement | null>(null);
  const landingViewport = useLandingViewport(landingElementRef, forceMobile);
  const isMobile = landingViewport.isMobile;
  // SSR-safe initial state: always start at phase=0 (centered) so the
  // server-rendered HTML matches the first client render. After hydration
  // the effect below reads `introHasPlayedInThisModuleInstance` and either
  // fast-forwards to phase=2 (no animation) or kicks off the timeline.
  const [phase, setPhase] = useState<ChlorinePhase>(skipAnimation ? 2 : 0);
  const [hasEnabledIntroTransitions, setHasEnabledIntroTransitions] =
    useState(skipAnimation);
  const [hasStartedIntroColor, setHasStartedIntroColor] =
    useState(skipAnimation);
  const [introCheckComplete, setIntroCheckComplete] = useState(skipAnimation);

  // Resolve whether the intro should run on this mount. Runs once per
  // mount on the client only; the server never reaches this branch.
  useEffect(() => {
    if (skipAnimation) {
      setIntroCheckComplete(true);
      return;
    }
    if (introHasPlayedInThisModuleInstance) {
      setPhase(2);
      setHasEnabledIntroTransitions(true);
      setHasStartedIntroColor(true);
    }
    setIntroCheckComplete(true);
  }, [skipAnimation]);

  useEffect(() => {
    if (!introCheckComplete) return;
    if (hasStartedIntroColor) return;
    if (!landingViewport.hasMeasuredViewport) return;

    setPhase(0);
    setHasEnabledIntroTransitions(false);
    setHasStartedIntroColor(false);
    let colorFrame = 0;
    const transitionFrame = window.requestAnimationFrame(() => {
      setHasEnabledIntroTransitions(true);
      colorFrame = window.requestAnimationFrame(() => {
        setHasStartedIntroColor(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(transitionFrame);
      if (colorFrame !== 0) {
        window.cancelAnimationFrame(colorFrame);
      }
    };
  }, [
    introCheckComplete,
    hasStartedIntroColor,
    landingViewport.hasMeasuredViewport,
  ]);

  useEffect(() => {
    if (!introCheckComplete) return;
    if (!landingViewport.hasMeasuredViewport || !hasStartedIntroColor) return;
    // Skip re-running the timeline if we already arrived at the final phase
    // (e.g. effect 1 fast-forwarded after a same-session re-mount). Reading
    // `phase` from the closure here is fine because the effect's deps below
    // intentionally exclude `phase` — we only want to run this once when the
    // gates flip true; re-running on every phase tick would loop.
    if (phase === 2) return;
    setPhase(0);
    const split = window.setTimeout(() => setPhase(1), CHLORINE_PHASE_SPLIT_MS);
    const cascade = window.setTimeout(() => {
      setPhase(2);
      introHasPlayedInThisModuleInstance = true;
    }, CHLORINE_PHASE_CASCADE_MS);
    return () => {
      window.clearTimeout(split);
      window.clearTimeout(cascade);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    introCheckComplete,
    hasStartedIntroColor,
    landingViewport.hasMeasuredViewport,
  ]);

  const showEvents = !children && (events?.length ?? 0) > 0;
  const showChildren = !!children;
  const hasTagline = tagline.length > 0;

  // Compute the vertical reserves for the wordmark anchors so the central
  // content band sits cleanly between them. Padding + half-mark height
  // approximates how much vertical room each anchor occupies at split.
  const horizontalPadding = isMobile ? 24 : 64;
  const topReserve = isMobile ? 110 : 180;
  const bottomReserve = isMobile ? 100 : 160;

  // Wrap the landing in TenantTemplateProvider so the chlorine preset's
  // --tt-* CSS vars are defined for the SVG masks + dim/mute text. Without
  // this wrap `var(--tt-fg)` resolves to undefined and the wordmark renders
  // as default-black-on-black.
  return (
    <TenantTemplateProvider siteConfigurationPreset="chlorine">
      <div
        ref={landingElementRef}
        style={{
          position: "relative",
          width: "100%",
          minHeight: "100dvh",
          background: "var(--tt-bg)",
          color: "var(--tt-fg)",
          fontFamily: "var(--tt-text)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {hasTagline ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              padding: isMobile ? "20px 24px" : "28px 40px",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              zIndex: 10,
              opacity: phase >= 1 ? 1 : 0,
              transition: "opacity 800ms ease 200ms",
            }}
          >
            <span
              style={{
                color: "var(--tt-fg-dim)",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {tagline}
            </span>
          </div>
        ) : null}

        <ChlorineComposedLogo
          phase={phase}
          hasEnabledIntroTransitions={hasEnabledIntroTransitions}
          hasStartedIntroColor={hasStartedIntroColor}
          landingViewport={landingViewport}
          wordmarkHref={wordmarkHref}
          linkComponent={linkComponent}
          wordmarkLinkLabel="Club Chlorine — home"
        />

        {/* Top reserve — flex spacer matching the wordmark anchor's
            vertical footprint. The wordmark itself is absolutely
            positioned and layered above; this in-flow spacer just keeps
            the central band offset by the same amount. */}
        <div style={{ height: topReserve, flexShrink: 0 }} aria-hidden />

        {/* Central content band — flex child that grows to fill
            remaining viewport space, vertically centering content when it
            fits. `safe center` falls back to top-anchored on tall
            content; in that case the band itself grows with the content
            and the parent's `min-height: 100dvh` lets the page scroll
            past CHLORINE rather than clipping. */}
        <div
          style={{
            flex: "1 0 auto",
            minHeight: 0,
            padding: `0 ${horizontalPadding}px`,
            zIndex: 5,
            display: "flex",
            alignItems: "safe center",
            justifyContent: "center",
            opacity: phase >= 2 ? 1 : 0,
            transition: "opacity 700ms ease 200ms",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: contentMaxWidthPx,
            }}
          >
            {showChildren
              ? children
              : showEvents
                ? events!.map((event, index) => (
                    <ChlorineEventRow
                      key={event.id}
                      event={event}
                      mobile={isMobile}
                      visible={phase >= 2}
                      delayMs={index * 140}
                    />
                  ))
                : phase >= 2 && emptyState}
          </div>
        </div>

        {/* Bottom reserve — matching spacer for the CHLORINE wordmark
            anchor area. */}
        <div style={{ height: bottomReserve, flexShrink: 0 }} aria-hidden />

        <div
          style={{
            position: "absolute",
            bottom: isMobile ? 8 : 12,
            left: 0,
            right: 0,
            padding: isMobile ? "0 24px" : "0 40px",
            display: "flex",
            justifyContent: contactEmail ? "space-between" : "flex-end",
            fontSize: 10,
            color: "var(--tt-fg-mute)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            zIndex: 10,
            opacity: phase >= 2 ? 1 : 0,
            transition: "opacity 800ms ease 600ms",
          }}
        >
          {contactEmail ? <span>{contactEmail}</span> : null}
          <span>{yearLabel}</span>
        </div>
      </div>
    </TenantTemplateProvider>
  );
}

export type ChlorineEventRowVariant = "default" | "minimized" | "expanded";

export interface ChlorineEventRowProps {
  event: ChlorineLandingEvent;
  mobile: boolean;
  visible: boolean;
  delayMs: number;
  /**
   * Render override for the RSVP link. Apps should pass their router's
   * `Link` (e.g. Next.js `next/link`) so clicking the row stays in the
   * client-side navigation flow — a plain `<a>` triggers a full document
   * reload, which would unmount the persistent shell and re-play the
   * intro animation. Defaults to a native `<a>`.
   */
  linkComponent?: ComponentType<
    AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
  >;
  /**
   * Visual variant. "default" matches the home listing. "minimized" shrinks
   * the row to a single dim line — used for sibling events on the detail
   * page. "expanded" keeps the standard row size and renders
   * `expandedContent` inline below.
   */
  variant?: ChlorineEventRowVariant;
  /**
   * Optional href to the event's dedicated detail page. When set on a
   * "default" row, a small "DETAILS" link is rendered under the RSVP
   * brick. On a "minimized" row the entire row becomes a link to this href
   * (replacing the RSVP brick with a small "DETAILS →" affordance).
   */
  detailHref?: string;
  /**
   * Content rendered below the row when `variant === "expanded"`. Inherits
   * the row's animation envelope (opacity / translate).
   */
  expandedContent?: ReactNode;
  /**
   * Optional content rendered in column 3 ABOVE the RSVP brick — used by
   * the detail page to surface a small "MY RSVP →" pill on the same line
   * as the date / title.
   */
  topRightSlot?: ReactNode;
}

export function ChlorineEventRow({
  event,
  mobile,
  visible,
  delayMs,
  linkComponent: LinkComponent,
  variant = "default",
  detailHref,
  expandedContent,
  topRightSlot,
}: ChlorineEventRowProps) {
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
    rowIsLink && rowHref
      ? ({ href: rowHref } as { href: string })
      : ({} as Record<string, never>);
  const verticalPadding = isMinimized
    ? mobile
      ? "6px 0"
      : "8px 0"
    : mobile
      ? "10px 0"
      : "14px 0";

  // Brick = the visible "RSVP" / "CLOSED" tile in column 3. When we are NOT
  // wrapping the whole row in the rsvp anchor, the brick must itself be the
  // link target so the user has something clickable.
  const renderBrick = () => {
    if (!rsvpClickable) {
      return (
        <span style={buildRsvpBrickStyle(mobile, true)}>
          {event.rsvpLabel ?? "CLOSED"}
        </span>
      );
    }
    if (wrapDefaultAsRsvpLink) {
      // Whole row is the link → brick is just the visual tile.
      return (
        <span style={buildRsvpBrickStyle(mobile, false)}>
          {event.rsvpLabel ?? "RSVP"}
        </span>
      );
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
          fontFamily:
            'var(--font-geist-mono), "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
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
          fontFamily:
            'var(--font-geist-mono), "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
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
          fontFamily:
            'var(--font-bowlby-one), "Bowlby One", "Fugaz One", "Anton", "Impact", sans-serif',
          fontSize: mobile ? 18 : 26,
          lineHeight: 1.1,
          color: isMinimized ? "var(--tt-fg-mute)" : "var(--tt-fg)",
          textTransform: "uppercase",
          letterSpacing: "0.01em",
          minWidth: 0,
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
                typeof lineupEntry === "string"
                  ? lineupEntry
                  : lineupEntry.label,
              )
              .join(" · ")}
          </span>
        ) : (
          event.lineup.map((lineupEntry, lineupIndex) => {
            const normalizedLineupEntry =
              typeof lineupEntry === "string"
                ? { label: lineupEntry }
                : lineupEntry;
            const labelWithBadges = (
              <>
                <span>{normalizedLineupEntry.label}</span>
                {normalizedLineupEntry.descriptorBadges?.length ? (
                  <ChlorineLineupBadges
                    badges={normalizedLineupEntry.descriptorBadges}
                  />
                ) : null}
              </>
            );
            // Lineup entries become real `<a>`s only when (a) an href is
            // provided AND (b) the row itself is NOT already wrapped in an
            // anchor — otherwise we'd nest `<a>` inside `<a>`.
            const canRenderLineupAnchor =
              Boolean(normalizedLineupEntry.href) && !rowIsLink;
            return canRenderLineupAnchor ? (
              <ChlorineLineupAnchor
                key={`${normalizedLineupEntry.label}-${lineupIndex}`}
                href={normalizedLineupEntry.href!}
              >
                {labelWithBadges}
              </ChlorineLineupAnchor>
            ) : (
              <div key={`${normalizedLineupEntry.label}-${lineupIndex}`}>
                {labelWithBadges}
              </div>
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
              fontFamily:
                'var(--font-geist-mono), "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
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

interface ChlorineLineupBadgesProps {
  badges: string[];
}

function ChlorineLineupBadges({ badges }: ChlorineLineupBadgesProps) {
  return (
    <sup
      style={{
        fontFamily:
          'var(--font-geist-mono), "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
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

interface ChlorineLineupAnchorProps {
  href: string;
  children: ReactNode;
}

/**
 * Lineup entry link with a soft text-color hover shift in place of the
 * prior border-bottom underline. Uses inline state so the package stays
 * free of external CSS dependencies.
 */
function ChlorineLineupAnchor({ href, children }: ChlorineLineupAnchorProps) {
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

export function buildRsvpBrickStyle(
  mobile: boolean,
  disabled: boolean,
): CSSProperties {
  return {
    background: "var(--tt-fg)",
    color: "var(--tt-bg)",
    fontFamily:
      'var(--font-geist-mono), "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
    fontSize: mobile ? 11 : 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: mobile ? "6px 10px" : "8px 14px",
    textDecoration: "none",
    textAlign: "center",
    display: "inline-block",
    textTransform: "uppercase",
    opacity: disabled ? 0.45 : 1,
  };
}
