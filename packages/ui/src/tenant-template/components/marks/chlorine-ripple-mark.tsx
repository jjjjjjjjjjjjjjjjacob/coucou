"use client";

import {
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  CHLORINE_MARK_SOURCE_HEIGHT,
  CHLORINE_MARK_SOURCE_WIDTH,
  ChlChlorineSvg,
  ChlClubSvg,
  ChlIconSvg,
  chlorineMarkPieces,
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
 * WebGL-enhanced Club Chlorine wordmark. The regular mask spans stay mounted
 * for layout, accessibility, and no-WebGL/reduced-motion fallback; once the
 * transparent ripple canvas is ready, it takes over the visible pixels.
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
  const clubElementRef = useRef<HTMLSpanElement | null>(null);
  const iconElementRef = useRef<HTMLSpanElement | null>(null);
  const chlorineElementRef = useRef<HTMLSpanElement | null>(null);
  const [isRippleReady, setIsRippleReady] = useState(false);
  const width = size;
  const height =
    (size * CHLORINE_MARK_SOURCE_HEIGHT) / CHLORINE_MARK_SOURCE_WIDTH;
  const scale = size / CHLORINE_MARK_SOURCE_WIDTH;
  const resolvedForegroundColor = foregroundColor ?? fg ?? "currentColor";

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
      <ChlClubSvg
        ref={clubElementRef}
        foregroundColor={resolvedForegroundColor}
        style={{
          position: "absolute",
          left: chlorineMarkPieces.club.left * scale,
          top: chlorineMarkPieces.club.top * scale,
          width: chlorineMarkPieces.club.width * scale,
          height: chlorineMarkPieces.club.height * scale,
          opacity: fallbackOpacity,
        }}
      />
      <ChlIconSvg
        ref={iconElementRef}
        foregroundColor={resolvedForegroundColor}
        style={{
          position: "absolute",
          left: chlorineMarkPieces.icon.left * scale,
          top: chlorineMarkPieces.icon.top * scale,
          width: chlorineMarkPieces.icon.width * scale,
          height: chlorineMarkPieces.icon.height * scale,
          opacity: fallbackOpacity,
        }}
      />
      <ChlChlorineSvg
        ref={chlorineElementRef}
        foregroundColor={resolvedForegroundColor}
        style={{
          position: "absolute",
          left: chlorineMarkPieces.chlorine.left * scale,
          top: chlorineMarkPieces.chlorine.top * scale,
          width: chlorineMarkPieces.chlorine.width * scale,
          height: chlorineMarkPieces.chlorine.height * scale,
          opacity: fallbackOpacity,
        }}
      />
    </span>
  );
}
