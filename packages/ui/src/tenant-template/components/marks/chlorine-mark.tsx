import type { CSSProperties, HTMLAttributes, Ref } from "react";

export const CHLORINE_MARK_SOURCE_WIDTH = 650;
export const CHLORINE_MARK_SOURCE_HEIGHT = 285;

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

function ChlorineSvgPiece({
  source,
  fg,
  foregroundColor,
  style,
  ...props
}: ChlorineSvgPieceProps) {
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
  return (
    <ChlorineSvgPiece source={chlorineMarkPieces.chlorine.source} {...props} />
  );
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
 * Composed Club Chlorine wordmark. The three public SVG assets stay separate
 * so the landing animation can move each piece independently.
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
  const height =
    (size * CHLORINE_MARK_SOURCE_HEIGHT) / CHLORINE_MARK_SOURCE_WIDTH;
  const scale = size / CHLORINE_MARK_SOURCE_WIDTH;
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
      <ChlClubSvg
        foregroundColor={resolvedForegroundColor}
        style={{
          position: "absolute",
          left: chlorineMarkPieces.club.left * scale,
          top: chlorineMarkPieces.club.top * scale,
          width: chlorineMarkPieces.club.width * scale,
          height: chlorineMarkPieces.club.height * scale,
        }}
      />
      <ChlIconSvg
        foregroundColor={resolvedForegroundColor}
        style={{
          position: "absolute",
          left: chlorineMarkPieces.icon.left * scale,
          top: chlorineMarkPieces.icon.top * scale,
          width: chlorineMarkPieces.icon.width * scale,
          height: chlorineMarkPieces.icon.height * scale,
        }}
      />
      <ChlChlorineSvg
        foregroundColor={resolvedForegroundColor}
        style={{
          position: "absolute",
          left: chlorineMarkPieces.chlorine.left * scale,
          top: chlorineMarkPieces.chlorine.top * scale,
          width: chlorineMarkPieces.chlorine.width * scale,
          height: chlorineMarkPieces.chlorine.height * scale,
        }}
      />
    </div>
  );
}
