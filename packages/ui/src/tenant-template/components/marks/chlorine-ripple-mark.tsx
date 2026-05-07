"use client";

import { useMemo, useState } from "react";
import {
  CHLORINE_MARK_SOURCE_HEIGHT,
  CHLORINE_MARK_SOURCE_WIDTH,
  CHLORINE_WORDMARK_SOURCE,
  ChlWordmarkSvg,
  type ChlorineMarkProps,
} from "./chlorine-mark";
import {
  ChlorineRippleSurface,
  type ChlorineRippleSurfacePiece,
} from "./chlorine-ripple-surface";

export interface ChlorineRippleMarkProps extends ChlorineMarkProps {
  disabled?: boolean;
}

/**
 * WebGL-enhanced Club Chlorine wordmark. The static SVG mask stays mounted as
 * a no-WebGL/reduced-motion fallback; once the transparent ripple canvas is
 * ready, it takes over the visible pixels. The combined wordmark SVG renders
 * as a single mask so its overlapping letterform groups (club / swimmer /
 * chlorine) compose without the anti-aliasing seam that appeared when each
 * piece was rasterized as its own span.
 */
export function ChlorineRippleMark({
  size = 140,
  fg,
  foregroundColor,
  className,
  style,
  ariaLabel = "Club Chlorine",
  disabled = false,
}: ChlorineRippleMarkProps) {
  const [isRippleReady, setIsRippleReady] = useState(false);
  const width = size;
  const height =
    (size * CHLORINE_MARK_SOURCE_HEIGHT) / CHLORINE_MARK_SOURCE_WIDTH;
  const resolvedForegroundColor = foregroundColor ?? fg ?? "currentColor";

  const ripplePieces = useMemo<readonly ChlorineRippleSurfacePiece[]>(
    () => [
      {
        source: CHLORINE_WORDMARK_SOURCE,
        rect: { left: 0, top: 0, width, height },
      },
    ],
    [width, height],
  );

  const fallbackOpacity = isRippleReady ? 0 : 1;

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{
        position: "relative",
        width,
        height,
        display: "inline-block",
        flexShrink: 0,
        ...style,
      }}
    >
      <ChlorineRippleSurface
        pieces={ripplePieces}
        foregroundColor={resolvedForegroundColor}
        disabled={disabled}
        refreshKey={size}
        onReadyChange={setIsRippleReady}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: isRippleReady ? 1 : 0,
          pointerEvents: "none",
        }}
      />
      <ChlWordmarkSvg
        foregroundColor={resolvedForegroundColor}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: fallbackOpacity,
        }}
      />
    </span>
  );
}
