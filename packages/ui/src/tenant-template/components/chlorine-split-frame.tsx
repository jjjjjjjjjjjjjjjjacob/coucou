"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ComponentType,
  type CSSProperties,
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

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export const CHLORINE_PHASE_SPLIT_MS = 1400;
export const CHLORINE_PHASE_CASCADE_MS = 2200;
export const CHLORINE_COLOR_FADE_MS = 900;
export const CHLORINE_LOGO_RIPPLE_REFRESH_MS = 1400;

export const CHLORINE_MOBILE_BREAKPOINT_PX = 720;
const SHORT_DESKTOP_CENTER_BAND_HEIGHT_PX = 500;
const FALLBACK_VIEWPORT_DIMENSIONS = { width: 1024, height: 768 } as const;

export type ChlorinePhase = 0 | 1 | 2;
export type ChlorinePieceGroup = "top" | "bottom";

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface LandingViewport extends ViewportDimensions {
  isMobile: boolean;
  isShortDesktop: boolean;
  hasMeasuredViewport: boolean;
}

export function useLandingViewport(
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

  const isMobile =
    forceMobile ?? viewportState.width < CHLORINE_MOBILE_BREAKPOINT_PX;
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

type ChlorinePiece = (typeof chlorineMarkPieces)[keyof typeof chlorineMarkPieces];

interface PieceTarget {
  left: number;
  top: number;
  scale: number;
}

interface AnimatedPieceStyleInput {
  piece: ChlorinePiece;
  group: ChlorinePieceGroup;
  phase: ChlorinePhase;
  hasEnabledIntroTransitions: boolean;
  hasStartedIntroColor: boolean;
  landingViewport: LandingViewport;
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
  const colorTransition = `background-color ${CHLORINE_COLOR_FADE_MS}ms ease`;
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
  phase: ChlorinePhase,
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

interface ChlorineComposedLogoProps {
  phase: ChlorinePhase;
  hasEnabledIntroTransitions: boolean;
  hasStartedIntroColor: boolean;
  landingViewport: LandingViewport;
  /**
   * When set together with `linkComponent`, transparent click-catcher links
   * are rendered over each wordmark piece so clicking the wordmark routes
   * to this href. Click-throughs only activate once the intro animation has
   * settled (phase 2) so the cascade can't be hijacked.
   */
  wordmarkHref?: string;
  /**
   * Router-aware link component (e.g. Next.js `Link`). The package is
   * framework-agnostic and accepts the consumer's link to keep client-side
   * navigation behavior consistent.
   */
  linkComponent?: ComponentType<
    AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
  >;
  /**
   * Accessible label applied to the click-catcher links. Defaults to
   * "Home".
   */
  wordmarkLinkLabel?: string;
}

export function ChlorineComposedLogo({
  phase,
  hasEnabledIntroTransitions,
  hasStartedIntroColor,
  landingViewport,
  wordmarkHref,
  linkComponent: LinkComponent,
  wordmarkLinkLabel = "Home",
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
        refreshDurationMs={CHLORINE_LOGO_RIPPLE_REFRESH_MS}
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
      {wordmarkHref && LinkComponent ? (
        <>
          <LinkComponent
            href={wordmarkHref}
            aria-label={wordmarkLinkLabel}
            style={buildWordmarkLinkOverlayStyle(clubStyle, phase)}
          />
          <LinkComponent
            href={wordmarkHref}
            aria-label={wordmarkLinkLabel}
            style={buildWordmarkLinkOverlayStyle(iconStyle, phase)}
          />
          <LinkComponent
            href={wordmarkHref}
            aria-label={wordmarkLinkLabel}
            style={buildWordmarkLinkOverlayStyle(chlorineStyle, phase)}
          />
        </>
      ) : null}
    </>
  );
}

function buildWordmarkLinkOverlayStyle(
  pieceStyle: CSSProperties,
  phase: ChlorinePhase,
): CSSProperties {
  return {
    position: pieceStyle.position,
    left: pieceStyle.left,
    top: pieceStyle.top,
    width: pieceStyle.width,
    height: pieceStyle.height,
    transform: pieceStyle.transform,
    transformOrigin: pieceStyle.transformOrigin,
    transition: pieceStyle.transition,
    background: "transparent",
    zIndex: 4,
    pointerEvents: phase === 2 ? "auto" : "none",
    cursor: phase === 2 ? "pointer" : "default",
    display: "block",
  };
}
