"use client";

import {
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { TenantTemplateProvider } from "../provider";
import {
  CHLORINE_PHASE_CASCADE_MS,
  CHLORINE_PHASE_SPLIT_MS,
  ChlorineComposedLogo,
  type ChlorinePhase,
  calculateCollapsedWordmarkBottomPx,
  useLandingViewport,
} from "./chlorine-split-frame";

// Module-level flag persists across re-mounts within the same JS module
// instance — i.e. across client-side route changes within the same tab.
// Resets on full page reload (a fresh module is evaluated). The flag also
// flips to true when the shell mounts directly into collapsed mode, so a
// later navigation to the landing won't replay the intro.
let introHasPlayedInThisModuleInstance = false;

export type ChlorineAppShellMode = "expanded" | "collapsed";

export interface ChlorineAppShellProps {
  /**
   * Drives the wordmark layout. `expanded` anchors CLUB+swimmer to the top
   * edge and CHLORINE to the bottom edge with content in a centered band —
   * used by the home/landing route. `collapsed` groups the wordmark in the
   * upper-left at a small scale so the rest of the viewport hosts the page
   * content — used by every post-landing route (events list, RSVP, ticket,
   * status, account, profile, etc.).
   *
   * When the mode flips after mount the existing CSS transitions on the
   * SVG transforms tween the wordmark between the two layouts. When the
   * shell mounts directly with `collapsed`, the intro animation is skipped
   * and the wordmark sits at its corner target with no animation.
   */
  mode: ChlorineAppShellMode;
  children: ReactNode;
  /**
   * Optional content rendered above the children inside the collapsed body
   * — e.g. a sign-out menu in the upper-right. Pass-through for the menu
   * that previously lived in `HeaderClient`.
   */
  topRightSlot?: ReactNode;
  /** Optional top-right caption (rendered in expanded mode only). */
  tagline?: string;
  /** Footer left text. Hidden when empty (the default). */
  contactEmail?: string;
  /** Footer right text. Defaults to the current year. */
  yearLabel?: string;
  /** Extra vertical padding after the shell's first viewport section. */
  postViewportBottomPaddingPx?: number;
  /** Force the mobile breakpoint regardless of viewport width. */
  mobile?: boolean;
  /**
   * Max-width of the central content column. Omit to let children own
   * their own widths (e.g. wider settings pages with internal
   * `max-w-6xl` wrappers).
   */
  contentMaxWidthPx?: number;
  /** Wordmark click target. Defaults to `"/"`. */
  wordmarkHref?: string;
  /**
   * Router-aware link component (e.g. Next.js `Link`). Required for the
   * wordmark click-catcher overlay; without it the wordmark renders but is
   * not clickable.
   */
  linkComponent?: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;
  /**
   * When true, content renders at its final position with no animation.
   * Useful for SSR snapshots and preview canvases. Independent from `mode`
   * — applies to both expanded and collapsed.
   */
  skipAnimation?: boolean;
  /**
   * Wraps the inner content in a `TenantTemplateProvider` with the chlorine
   * preset. Defaults to true — set to false when the shell is mounted
   * inside an outer provider (e.g. on coucou.events) to avoid double-scope.
   */
  applyChlorinePreset?: boolean;
}

/**
 * Persistent chrome for the Club Chlorine satellite. Mounts once at the
 * app level and never unmounts across navigations — the `mode` prop drives
 * the layout, and the wordmark tweens between layouts via the CSS
 * transitions baked into `ChlorineComposedLogo`.
 *
 * Usage in `app-chrome.tsx`:
 *
 *   <ChlorineAppShell mode={pathname === "/" ? "expanded" : "collapsed"}>
 *     {children}
 *   </ChlorineAppShell>
 */
export function ChlorineAppShell({
  mode,
  children,
  topRightSlot,
  tagline = "",
  contactEmail = "",
  yearLabel = "2026",
  postViewportBottomPaddingPx = 0,
  mobile: forceMobile,
  contentMaxWidthPx,
  wordmarkHref = "/",
  linkComponent,
  skipAnimation = false,
  applyChlorinePreset = true,
}: ChlorineAppShellProps) {
  const shellElementRef = useRef<HTMLDivElement | null>(null);
  const landingViewport = useLandingViewport(shellElementRef, forceMobile);
  const isMobile = landingViewport.isMobile;

  // The intro (centered → split → content) only plays when mounting into
  // the expanded landing layout for the first time in this module instance.
  // Direct collapsed mounts (e.g. someone hits /events/[id]/ticket on a
  // fresh tab) skip the intro and just appear at the collapsed target.
  const initialModeRef = useRef(mode);
  const shouldSkipIntro =
    skipAnimation || introHasPlayedInThisModuleInstance || initialModeRef.current === "collapsed";

  const [phase, setPhase] = useState<ChlorinePhase>(shouldSkipIntro ? 2 : 0);
  const [hasEnabledIntroTransitions, setHasEnabledIntroTransitions] = useState(shouldSkipIntro);
  const [hasStartedIntroColor, setHasStartedIntroColor] = useState(shouldSkipIntro);
  const [introCheckComplete, setIntroCheckComplete] = useState(shouldSkipIntro);

  useEffect(() => {
    if (shouldSkipIntro) {
      // Mounting into collapsed (or replaying a same-tab landing visit) —
      // mark the intro as played so future navigations to "/" don't replay
      // it from a fresh state.
      introHasPlayedInThisModuleInstance = true;
      setIntroCheckComplete(true);
      return;
    }
    setIntroCheckComplete(true);
  }, [shouldSkipIntro]);

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
  }, [introCheckComplete, hasStartedIntroColor, landingViewport.hasMeasuredViewport]);

  useEffect(() => {
    if (!introCheckComplete) return;
    if (!landingViewport.hasMeasuredViewport || !hasStartedIntroColor) return;
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
  }, [introCheckComplete, hasStartedIntroColor, landingViewport.hasMeasuredViewport]);

  const isExpanded = mode === "expanded";
  const forceCollapsed = mode === "collapsed";
  const hasTagline = isExpanded && tagline.length > 0;
  const hasContactEmail = contactEmail.length > 0;
  const hasYearLabel = yearLabel.length > 0;
  const shouldRenderFooter = hasContactEmail || hasYearLabel;
  const resolvedPostViewportBottomPadding = Math.max(0, postViewportBottomPaddingPx);

  // Vertical reserves keep page content clear of the wordmark anchors.
  // Expanded: top reserve sized to the top-anchored CLUB+swimmer block,
  // bottom reserve sized to the CHLORINE wordmark. Collapsed: dynamic —
  // tracks the actual rendered wordmark bottom edge so post-login pages
  // never have content sliding under the corner mark, regardless of the
  // scale calculations or in-flight transitions. Top and bottom reserves
  // mirror each other so the centered content band sits at the visual
  // middle of the viewport instead of being pushed below the wordmark.
  const horizontalPadding = isMobile ? 24 : 64;
  const collapsedBreathingRoomPx = isMobile ? 48 : 64;
  const collapsedFloorPx = isMobile ? 160 : 200;
  const collapsedWordmarkBottomPx = forceCollapsed
    ? calculateCollapsedWordmarkBottomPx(landingViewport)
    : 0;
  const collapsedReserve = Math.max(
    collapsedFloorPx,
    Math.ceil(collapsedWordmarkBottomPx) + collapsedBreathingRoomPx,
  );
  const topReserve = isExpanded ? (isMobile ? 110 : 180) : collapsedReserve;
  const bottomReserve = isExpanded ? (isMobile ? 100 : 160) : collapsedReserve;
  const shellMinHeight =
    isMobile && landingViewport.hasMeasuredViewport ? landingViewport.height : "100dvh";

  const shellInner = (
    <div
      data-shell-mode={mode}
      style={{
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        background: "var(--tt-bg)",
        color: "var(--tt-fg)",
        fontFamily: "var(--tt-text)",
      }}
    >
      <div
        ref={shellElementRef}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          minHeight: typeof shellMinHeight === "number" ? `${shellMinHeight}px` : shellMinHeight,
          overflowX: "hidden",
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
          forceCollapsed={forceCollapsed}
          wordmarkHref={wordmarkHref}
          linkComponent={linkComponent}
          wordmarkLinkLabel="Club Chlorine — home"
        />

        {topRightSlot ? (
          <div
            style={{
              position: "absolute",
              top: isMobile ? 12 : 20,
              right: isMobile ? 12 : 20,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {topRightSlot}
          </div>
        ) : null}

        <div style={{ height: topReserve, flexShrink: 0 }} aria-hidden />

        <div
          style={{
            flex: "1 0 auto",
            minHeight: 0,
            padding: `0 ${horizontalPadding}px`,
            boxSizing: "border-box",
            maxWidth: "100%",
            overflowX: "hidden",
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
            {children}
          </div>
        </div>

        {bottomReserve > 0 ? (
          <div style={{ height: bottomReserve, flexShrink: 0 }} aria-hidden />
        ) : null}

        {shouldRenderFooter ? (
          <div
            style={{
              position: "absolute",
              bottom: isMobile ? 8 : 12,
              left: 0,
              right: 0,
              padding: isMobile ? "0 24px" : "0 40px",
              display: "flex",
              justifyContent:
                hasContactEmail && hasYearLabel
                  ? "space-between"
                  : hasContactEmail
                    ? "flex-start"
                    : "flex-end",
              fontSize: 10,
              color: "var(--tt-fg-mute)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              zIndex: 10,
              opacity: phase >= 2 ? 1 : 0,
              transition: "opacity 800ms ease 600ms",
              pointerEvents: "none",
            }}
          >
            {hasContactEmail ? <span style={{ pointerEvents: "auto" }}>{contactEmail}</span> : null}
            {hasYearLabel ? <span style={{ pointerEvents: "auto" }}>{yearLabel}</span> : null}
          </div>
        ) : null}
      </div>

      {resolvedPostViewportBottomPadding > 0 ? (
        <div style={{ height: resolvedPostViewportBottomPadding }} aria-hidden />
      ) : null}
    </div>
  );

  if (!applyChlorinePreset) {
    return shellInner;
  }

  return (
    <TenantTemplateProvider siteConfigurationPreset="chlorine">{shellInner}</TenantTemplateProvider>
  );
}
