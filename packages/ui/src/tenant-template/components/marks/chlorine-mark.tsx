import type { CSSProperties, HTMLAttributes, Ref } from "react";

export const CHLORINE_MARK_SOURCE_WIDTH = 650;
export const CHLORINE_MARK_SOURCE_HEIGHT = 285;

export const CHLORINE_WORDMARK_SOURCE = "/brand/wordmark.svg";

export const chlorineMarkPieces = {
  club: {
    source: "/brand/club.svg",
    left: 1,
    top: 34,
    width: 326,
    height: 138,
  },
  icon: {
    source: "/brand/icon.svg",
    left: 342,
    top: 3,
    width: 258,
    height: 152,
  },
  chlorine: {
    source: "/brand/chlorine.svg",
    left: 0,
    top: 147,
    width: 650,
    height: 138,
  },
} as const;

interface ChlPieceProps extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  fg?: string;
  foregroundColor?: string;
  ref?: Ref<HTMLSpanElement>;
}

interface ChlorineSvgPieceProps extends ChlPieceProps {
  source: string;
}

function ChlorineSvgPiece({ source, fg, foregroundColor, style, ...props }: ChlorineSvgPieceProps) {
  const resolvedForegroundColor = foregroundColor ?? fg ?? "currentColor";

  return (
    <span
      aria-hidden="true"
      {...props}
      style={{
        display: "block",
        backgroundColor: resolvedForegroundColor,
        maskImage: `url(${source})`,
        maskMode: "alpha",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "100% 100%",
        WebkitMaskImage: `url(${source})`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "100% 100%",
        ...style,
      }}
    />
  );
}

export function ChlClubSvg(props: ChlPieceProps) {
  return <ChlorineSvgPiece source={chlorineMarkPieces.club.source} {...props} />;
}

export function ChlIconSvg(props: ChlPieceProps) {
  return <ChlorineSvgPiece source={chlorineMarkPieces.icon.source} {...props} />;
}

export function ChlChlorineSvg(props: ChlPieceProps) {
  return <ChlorineSvgPiece source={chlorineMarkPieces.chlorine.source} {...props} />;
}

export function ChlWordmarkSvg(props: ChlPieceProps) {
  return <ChlorineSvgPiece source={CHLORINE_WORDMARK_SOURCE} {...props} />;
}

export interface ChlorineMarkProps {
  /**
   * Width of the composed mark in pixels. Height is derived from the source
   * 650x285 layout's aspect ratio.
   */
  size?: number;
  /**
   * Fill color for all three SVG pieces. Defaults to currentColor so the mark
   * inherits its parent's text color.
   */
  fg?: string;
  foregroundColor?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

/**
 * Composed Club Chlorine wordmark. Renders a single combined SVG mask so the
 * three letterform groups (club / swimmer / chlorine) compose without the
 * cross-mask anti-aliasing seam that appears when each piece is rasterized as
 * its own overlapping span.
 */
export function ChlorineMark({
  size = 140,
  fg,
  foregroundColor,
  className,
  style,
  ariaLabel = "Club Chlorine",
}: ChlorineMarkProps) {
  const width = size;
  const height = (size * CHLORINE_MARK_SOURCE_HEIGHT) / CHLORINE_MARK_SOURCE_WIDTH;
  const resolvedForegroundColor = foregroundColor ?? fg ?? "currentColor";

  return (
    <div
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
      <ChlWordmarkSvg
        foregroundColor={resolvedForegroundColor}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
