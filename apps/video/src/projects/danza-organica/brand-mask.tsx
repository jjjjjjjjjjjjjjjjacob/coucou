import type { CSSProperties } from "react";
import { staticFile } from "remotion";

interface BrandMaskProps {
  readonly assetPath: string;
  readonly color: string;
  readonly width: number;
  readonly height: number;
  readonly style?: CSSProperties;
}

export function BrandMask({ assetPath, color, width, height, style }: BrandMaskProps) {
  const source = `url(${staticFile(assetPath)})`;

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: color,
        maskImage: source,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: source,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        ...style,
      }}
    />
  );
}
