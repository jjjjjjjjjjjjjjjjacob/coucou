"use client";

import {
  useRef,
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ChlorineComposedLogo,
  useLandingViewport,
} from "./chlorine-split-frame";

export interface ChlorineSplitShellProps {
  children: ReactNode;
  /** Optional top-right caption. */
  tagline?: string;
  /** Footer left text. Hidden when empty (the default). */
  contactEmail?: string;
  /** Footer right text. Defaults to the current year. */
  yearLabel?: string;
  /** Force the mobile breakpoint regardless of viewport width. */
  mobile?: boolean;
  /**
   * When the measured viewport height is below this threshold the shell
   * collapses (no anchored wordmark) and just renders children. Lets short
   * laptop screens / browser dev tools layouts not get pushed below the fold.
   */
  minTallScreenPx?: number;
  /** Max-width of the central content column. */
  contentMaxWidthPx?: number;
  /** Wordmark click target. Defaults to `"/"`. */
  wordmarkHref?: string;
  /**
   * Router-aware link component (e.g. Next.js `Link`). When omitted the
   * wordmark click-catcher is not rendered.
   */
  linkComponent?: ComponentType<
    AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
  >;
}

const DEFAULT_MIN_TALL_SCREEN_PX = 720;
const DEFAULT_CONTENT_MAX_WIDTH_PX = 760;

/**
 * Static, animation-free version of the Club Chlorine split chrome. Anchors
 * the CLUB + swimmer to the top edge, CHLORINE to the bottom edge, and
 * renders `children` between them. Children render inside a fixed central
 * band — content taller than the band scrolls vertically without pushing the
 * wordmark off the viewport edges.
 *
 * The shell does NOT provide its own preset/theme — it inherits whatever
 * `--tt-bg` / `--tt-fg` are in the surrounding scope. Wrap the shell in a
 * `<TenantTemplateProvider>` (with an optional `event={...}` override) so
 * the wordmark colour and the viewport background follow the active theme.
 */
export function ChlorineSplitShell({
  children,
  tagline = "",
  contactEmail = "",
  yearLabel = "2026",
  mobile: forceMobile,
  minTallScreenPx = DEFAULT_MIN_TALL_SCREEN_PX,
  contentMaxWidthPx = DEFAULT_CONTENT_MAX_WIDTH_PX,
  wordmarkHref = "/",
  linkComponent,
}: ChlorineSplitShellProps) {
  const shellElementRef = useRef<HTMLDivElement | null>(null);
  const landingViewport = useLandingViewport(shellElementRef, forceMobile);
  const isMobile = landingViewport.isMobile;
  const hasTagline = tagline.length > 0;

  const isViewportTallEnough =
    !landingViewport.hasMeasuredViewport ||
    landingViewport.height >= minTallScreenPx;
  const shouldRenderSplit =
    isViewportTallEnough && !landingViewport.isShortDesktop;

  if (!shouldRenderSplit) {
    return (
      <div
        ref={shellElementRef}
        style={{
          position: "relative",
          width: "100%",
          minHeight: "100dvh",
          background: "var(--tt-bg)",
          color: "var(--tt-fg)",
          fontFamily: "var(--tt-text)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? 24 : 48,
        }}
      >
        <div style={{ width: "100%", maxWidth: contentMaxWidthPx }}>
          {children}
        </div>
      </div>
    );
  }

  const horizontalPadding = isMobile ? 24 : 64;
  const topReserve = isMobile ? 120 : 180;
  const bottomReserve = isMobile ? 100 : 140;

  return (
    <div
      ref={shellElementRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
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
        phase={2}
        hasEnabledIntroTransitions={true}
        hasStartedIntroColor={true}
        landingViewport={landingViewport}
        wordmarkHref={wordmarkHref}
        linkComponent={linkComponent}
        wordmarkLinkLabel="Club Chlorine — home"
      />

      <div
        style={{
          position: "absolute",
          top: topReserve,
          bottom: bottomReserve,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `0 ${horizontalPadding}px`,
          zIndex: 5,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: contentMaxWidthPx,
            maxHeight: "100%",
            overflowY: "auto",
          }}
        >
          {children}
        </div>
      </div>

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
          pointerEvents: "none",
        }}
      >
        {contactEmail ? (
          <span style={{ pointerEvents: "auto" }}>{contactEmail}</span>
        ) : null}
        <span style={{ pointerEvents: "auto" }}>{yearLabel}</span>
      </div>
    </div>
  );
}
