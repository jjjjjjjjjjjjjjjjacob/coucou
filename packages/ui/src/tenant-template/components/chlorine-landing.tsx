"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  CHLORINE_MARK_SOURCE_HEIGHT,
  CHLORINE_MARK_SOURCE_WIDTH,
  ChlChlorineSvg,
  ChlClubSvg,
  ChlIconSvg,
  chlorineMarkPieces,
} from "./marks/chlorine-mark";
import {
  ChlorineRippleSurface,
  type ChlorineRippleSurfacePiece,
} from "./marks/chlorine-ripple-surface";
import { TenantTemplateProvider } from "../provider";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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
}

export interface ChlorineLandingProps {
  events: ChlorineLandingEvent[];
  /**
   * Top-right caption that fades in after the split. Pass an empty string
   * (or omit) to leave the corner blank — the design's "season iv · pool
   * hours" placeholder is no longer the default.
   */
  tagline?: string;
  /**
   * Footer left text. Defaults to "chlorine@coucou.events".
   */
  contactEmail?: string;
  /**
   * Footer right text. Defaults to "MMXXVI".
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
}

const PHASE_SPLIT_MS = 1400;
const PHASE_CASCADE_MS = 2200;
const COLOR_FADE_MS = 900;
const LOGO_RIPPLE_REFRESH_MS = 1400;

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
  tagline = "",
  contactEmail = "chlorine@coucou.events",
  yearLabel = "MMXXVI",
  mobile: forceMobile,
  emptyState,
  skipAnimation = false,
}: ChlorineLandingProps) {
  const landingElementRef = useRef<HTMLDivElement | null>(null);
  const landingViewport = useLandingViewport(landingElementRef, forceMobile);
  const isMobile = landingViewport.isMobile;
  const [phase, setPhase] = useState<0 | 1 | 2>(skipAnimation ? 2 : 0);
  const [hasEnabledIntroTransitions, setHasEnabledIntroTransitions] =
    useState(skipAnimation);
  const [hasStartedIntroColor, setHasStartedIntroColor] =
    useState(skipAnimation);

  useEffect(() => {
    if (skipAnimation) {
      setHasEnabledIntroTransitions(true);
      setHasStartedIntroColor(true);
      return;
    }
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
  }, [landingViewport.hasMeasuredViewport, skipAnimation]);

  useEffect(() => {
    if (skipAnimation) {
      setPhase(2);
      return;
    }
    if (!landingViewport.hasMeasuredViewport || !hasStartedIntroColor) return;
    setPhase(0);
    const split = window.setTimeout(() => setPhase(1), PHASE_SPLIT_MS);
    const cascade = window.setTimeout(() => setPhase(2), PHASE_CASCADE_MS);
    return () => {
      window.clearTimeout(split);
      window.clearTimeout(cascade);
    };
  }, [
    hasStartedIntroColor,
    landingViewport.hasMeasuredViewport,
    skipAnimation,
  ]);

  const showEvents = events.length > 0;
  const hasTagline = tagline.length > 0;

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
          overflow: "hidden",
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
        />

        {/* Cascading events list — vertically centered between the split logo
            halves. Each row stages in 140ms after the next once phase >= 2. */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            transform: "translateY(-50%)",
            padding: isMobile ? "0 24px" : "0 64px",
            zIndex: 5,
          }}
        >
          {showEvents
            ? events.map((event, index) => (
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

        <div
          style={{
            position: "absolute",
            bottom: isMobile ? 8 : 12,
            left: 0,
            right: 0,
            padding: isMobile ? "0 24px" : "0 40px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "var(--tt-fg-mute)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            zIndex: 10,
            opacity: phase >= 2 ? 1 : 0,
            transition: "opacity 800ms ease 600ms",
          }}
        >
          <span>{contactEmail}</span>
          <span>{yearLabel}</span>
        </div>
      </div>
    </TenantTemplateProvider>
  );
}

interface ChlorineComposedLogoProps {
  phase: 0 | 1 | 2;
  hasEnabledIntroTransitions: boolean;
  hasStartedIntroColor: boolean;
  landingViewport: LandingViewport;
}

/**
 * Three SVG pieces composed in the source 650x285 layout. Phase 0 holds them
 * centered; phase 1+ either splits the top and bottom groups or, for short
 * desktop viewports, keeps the mark grouped and shrinks it to the upper-left.
 *
 * Every position is expressed as one transform from the same source canvas, so
 * the browser never has to reconcile top/bottom/auto changes mid-animation.
 */
function ChlorineComposedLogo({
  phase,
  hasEnabledIntroTransitions,
  hasStartedIntroColor,
  landingViewport,
}: ChlorineComposedLogoProps) {
  const clubElementRef = useRef<HTMLSpanElement | null>(null);
  const iconElementRef = useRef<HTMLSpanElement | null>(null);
  const chlorineElementRef = useRef<HTMLSpanElement | null>(null);
  const [isRippleReady, setIsRippleReady] = useState(false);
  const clubStyle = buildAnimatedPieceStyle({
    piece: chlorineMarkPieces.club,
    group: "top",
    phase,
    hasEnabledIntroTransitions,
    hasStartedIntroColor,
    landingViewport,
  });
  const iconStyle = buildAnimatedPieceStyle({
    piece: chlorineMarkPieces.icon,
    group: "top",
    phase,
    hasEnabledIntroTransitions,
    hasStartedIntroColor,
    landingViewport,
  });
  const chlorineStyle = buildAnimatedPieceStyle({
    piece: chlorineMarkPieces.chlorine,
    group: "bottom",
    phase,
    hasEnabledIntroTransitions,
    hasStartedIntroColor,
    landingViewport,
  });
  const ripplePieces = useMemo<readonly ChlorineRippleSurfacePiece[]>(
    () => [
      {
        source: chlorineMarkPieces.club.source,
        elementRef: clubElementRef as RefObject<HTMLElement | null>,
      },
      {
        source: chlorineMarkPieces.icon.source,
        elementRef: iconElementRef as RefObject<HTMLElement | null>,
      },
      {
        source: chlorineMarkPieces.chlorine.source,
        elementRef: chlorineElementRef as RefObject<HTMLElement | null>,
      },
    ],
    [],
  );
  const canEnableRipple = landingViewport.hasMeasuredViewport;
  const rippleRefreshKey = [
    phase,
    landingViewport.width,
    landingViewport.height,
    hasEnabledIntroTransitions,
    hasStartedIntroColor,
  ].join(":");
  const fallbackOpacity = isRippleReady ? 0 : 1;

  return (
    <>
      <ChlorineRippleSurface
        pieces={ripplePieces}
        foregroundColor="var(--tt-fg)"
        disabled={!canEnableRipple}
        refreshKey={rippleRefreshKey}
        refreshDurationMs={LOGO_RIPPLE_REFRESH_MS}
        onReadyChange={setIsRippleReady}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: isRippleReady ? 1 : 0,
          pointerEvents: "none",
          zIndex: 3,
        }}
      />
      <ChlClubSvg
        ref={clubElementRef}
        foregroundColor="var(--tt-fg)"
        style={{ ...clubStyle, opacity: fallbackOpacity }}
      />
      <ChlIconSvg
        ref={iconElementRef}
        foregroundColor="var(--tt-fg)"
        style={{ ...iconStyle, opacity: fallbackOpacity }}
      />
      <ChlChlorineSvg
        ref={chlorineElementRef}
        foregroundColor="var(--tt-fg)"
        style={{ ...chlorineStyle, opacity: fallbackOpacity }}
      />
    </>
  );
}

type ChlorinePiece = (typeof chlorineMarkPieces)[keyof typeof chlorineMarkPieces];
type ChlorinePieceGroup = "top" | "bottom";

interface AnimatedPieceStyleInput {
  piece: ChlorinePiece;
  group: ChlorinePieceGroup;
  phase: 0 | 1 | 2;
  hasEnabledIntroTransitions: boolean;
  hasStartedIntroColor: boolean;
  landingViewport: LandingViewport;
}

interface PieceTarget {
  left: number;
  top: number;
  scale: number;
}

function buildAnimatedPieceStyle({
  piece,
  group,
  phase,
  hasEnabledIntroTransitions,
  hasStartedIntroColor,
  landingViewport,
}: AnimatedPieceStyleInput): CSSProperties {
  const target = buildPieceTarget(piece, group, phase, landingViewport);
  const isReadyToAnimate =
    landingViewport.hasMeasuredViewport && hasEnabledIntroTransitions;
  const colorTransition = `background-color ${COLOR_FADE_MS}ms ease`;
  const transformTransition =
    "transform 1100ms cubic-bezier(0.65, 0, 0.2, 1)";

  return {
    position: "absolute",
    left: 0,
    top: 0,
    width: piece.width,
    height: piece.height,
    backgroundColor: hasStartedIntroColor ? "var(--tt-fg)" : "var(--tt-bg)",
    transform: `translate3d(${target.left}px, ${target.top}px, 0) scale(${target.scale})`,
    transformOrigin: "top left",
    transition: isReadyToAnimate
      ? `${colorTransition}, ${transformTransition}`
      : "none",
    zIndex: 2,
    willChange: "background-color, transform",
  };
}

function buildPieceTarget(
  piece: ChlorinePiece,
  group: ChlorinePieceGroup,
  phase: 0 | 1 | 2,
  landingViewport: LandingViewport,
): PieceTarget {
  const initialScale = calculateInitialLogoScale(landingViewport);
  const initialOrigin = calculateCenteredOrigin(landingViewport, initialScale);

  if (phase === 0) {
    return {
      left: initialOrigin.left + piece.left * initialScale,
      top: initialOrigin.top + piece.top * initialScale,
      scale: initialScale,
    };
  }

  if (landingViewport.isShortDesktop) {
    const groupedScale = calculateShortDesktopLogoScale(landingViewport);
    const groupedOrigin = calculateShortDesktopOrigin(landingViewport);

    return {
      left: groupedOrigin.left + piece.left * groupedScale,
      top: groupedOrigin.top + piece.top * groupedScale,
      scale: groupedScale,
    };
  }

  const edgeOffset = landingViewport.isMobile ? 24 : 48;
  const splitOriginLeft =
    (landingViewport.width - CHLORINE_MARK_SOURCE_WIDTH * initialScale) / 2;

  if (group === "bottom") {
    return {
      left: splitOriginLeft + piece.left * initialScale,
      top: landingViewport.height - edgeOffset - piece.height * initialScale,
      scale: initialScale,
    };
  }

  const topGroupSourceTop =
    piece === chlorineMarkPieces.icon
      ? calculateClubCenteredIconSourceTop()
      : piece.top;

  return {
    left: splitOriginLeft + piece.left * initialScale,
    top: edgeOffset + topGroupSourceTop * initialScale,
    scale: initialScale,
  };
}

function calculateClubCenteredIconSourceTop() {
  return (
    chlorineMarkPieces.club.top +
    (chlorineMarkPieces.club.height - chlorineMarkPieces.icon.height) / 2
  );
}

function calculateCenteredOrigin(
  landingViewport: LandingViewport,
  scale: number,
) {
  return {
    left: (landingViewport.width - CHLORINE_MARK_SOURCE_WIDTH * scale) / 2,
    top: (landingViewport.height - CHLORINE_MARK_SOURCE_HEIGHT * scale) / 2,
  };
}

function calculateInitialLogoScale(landingViewport: LandingViewport) {
  return calculateInitialLogoWidth(landingViewport) / CHLORINE_MARK_SOURCE_WIDTH;
}

function calculateInitialLogoWidth(landingViewport: LandingViewport) {
  const horizontalPadding = landingViewport.isMobile ? 24 : 48;
  const verticalPadding = landingViewport.isMobile ? 48 : 64;
  const availableWidth = Math.max(
    120,
    landingViewport.width - horizontalPadding * 2,
  );
  const availableHeightAsWidth = Math.max(
    120,
    ((landingViewport.height - verticalPadding * 2) *
      CHLORINE_MARK_SOURCE_WIDTH) /
      CHLORINE_MARK_SOURCE_HEIGHT,
  );

  return Math.min(
    CHLORINE_MARK_SOURCE_WIDTH,
    availableWidth,
    availableHeightAsWidth,
  );
}

function calculateShortDesktopLogoScale(landingViewport: LandingViewport) {
  const availableWidth = Math.max(160, landingViewport.width - 80);
  return Math.min(220, availableWidth) / CHLORINE_MARK_SOURCE_WIDTH;
}

function calculateShortDesktopOrigin(landingViewport: LandingViewport) {
  return {
    left: Math.min(40, Math.max(24, landingViewport.width * 0.04)),
    top: Math.min(28, Math.max(20, landingViewport.height * 0.04)),
  };
}

interface ChlorineEventRowProps {
  event: ChlorineLandingEvent;
  mobile: boolean;
  visible: boolean;
  delayMs: number;
}

function ChlorineEventRow({
  event,
  mobile,
  visible,
  delayMs,
}: ChlorineEventRowProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: mobile ? "auto 1fr auto" : "120px 1fr 90px",
        gap: mobile ? 16 : 32,
        padding: mobile ? "10px 0" : "14px 0",
        alignItems: "baseline",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 700ms ease ${delayMs}ms, transform 700ms cubic-bezier(0.2,0,0.2,1) ${delayMs}ms`,
      }}
    >
      <div
        style={{
          fontFamily:
            'var(--font-geist-mono), "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
          fontSize: mobile ? 13 : 16,
          color: "var(--tt-fg)",
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
          color: "var(--tt-fg)",
          textTransform: "uppercase",
          letterSpacing: "0.01em",
        }}
      >
        {event.lineup.map((lineupEntry, lineupIndex) => {
          const normalizedLineupEntry =
            typeof lineupEntry === "string"
              ? { label: lineupEntry }
              : lineupEntry;
          return normalizedLineupEntry.href ? (
            <a
              key={`${normalizedLineupEntry.label}-${lineupIndex}`}
              href={normalizedLineupEntry.href}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "inherit",
                display: "block",
                textDecoration: "none",
              }}
            >
              {normalizedLineupEntry.label}
            </a>
          ) : (
            <div key={`${normalizedLineupEntry.label}-${lineupIndex}`}>
              {normalizedLineupEntry.label}
            </div>
          );
        })}
      </div>
      {event.rsvpHref && !event.rsvpDisabled ? (
        <a
          href={event.rsvpHref}
          style={buildRsvpBrickStyle(mobile, false)}
        >
          {event.rsvpLabel ?? "RSVP"}
        </a>
      ) : (
        <span style={buildRsvpBrickStyle(mobile, true)}>
          {event.rsvpLabel ?? "CLOSED"}
        </span>
      )}
    </div>
  );
}

function buildRsvpBrickStyle(
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
    alignSelf: "start",
    textAlign: "center",
    display: "inline-block",
    textTransform: "uppercase",
    opacity: disabled ? 0.45 : 1,
  };
}

const MOBILE_BREAKPOINT_PX = 720;
const SHORT_DESKTOP_CENTER_BAND_HEIGHT_PX = 320;

interface ViewportDimensions {
  width: number;
  height: number;
}

interface LandingViewport extends ViewportDimensions {
  isMobile: boolean;
  isShortDesktop: boolean;
  hasMeasuredViewport: boolean;
}

function useLandingViewport(
  landingElementRef: RefObject<HTMLDivElement | null>,
  forceMobile?: boolean,
): LandingViewport {
  const [viewportState, setViewportState] = useState<
    ViewportDimensions & { hasMeasuredViewport: boolean }
  >({
    ...FALLBACK_VIEWPORT_DIMENSIONS,
    hasMeasuredViewport: false,
  });

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const landingElement = landingElementRef.current;
    if (!landingElement) return;

    const measureLandingElement = () => {
      const landingElementRect = landingElement.getBoundingClientRect();
      setViewportState({
        width: landingElementRect.width,
        height: landingElementRect.height,
        hasMeasuredViewport: true,
      });
    };

    measureLandingElement();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureLandingElement);
    resizeObserver?.observe(landingElement);
    window.addEventListener("resize", measureLandingElement);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureLandingElement);
    };
  }, [landingElementRef]);

  const isMobile = forceMobile ?? viewportState.width < MOBILE_BREAKPOINT_PX;
  const isShortDesktop =
    !isMobile && shouldUseShortDesktopLayout(viewportState, isMobile);

  return {
    width: viewportState.width,
    height: viewportState.height,
    isMobile,
    isShortDesktop,
    hasMeasuredViewport: viewportState.hasMeasuredViewport,
  };
}

const FALLBACK_VIEWPORT_DIMENSIONS = { width: 1024, height: 768 } as const;

function shouldUseShortDesktopLayout(
  viewportDimensions: ViewportDimensions,
  isMobile: boolean,
) {
  if (isMobile) return false;

  const landingViewport = {
    ...viewportDimensions,
    isMobile,
    isShortDesktop: false,
    hasMeasuredViewport: true,
  };
  const initialScale = calculateInitialLogoScale(landingViewport);
  const edgeOffset = 48;
  const topGroupHeight =
    Math.max(
      chlorineMarkPieces.club.top + chlorineMarkPieces.club.height,
      chlorineMarkPieces.icon.top + chlorineMarkPieces.icon.height,
    ) * initialScale;
  const bottomGroupHeight = chlorineMarkPieces.chlorine.height * initialScale;
  const centerBandHeight =
    viewportDimensions.height -
    edgeOffset * 2 -
    topGroupHeight -
    bottomGroupHeight;

  return centerBandHeight < SHORT_DESKTOP_CENTER_BAND_HEIGHT_PX;
}
