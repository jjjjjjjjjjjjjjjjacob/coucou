"use client";

import QRCode from "react-qr-code";
import { usePresetOptional } from "../../use-preset";

export interface QrFrameProps {
  /**
   * The URL or token encoded into the QR. Required.
   */
  value: string;
  /**
   * Pixel size of the QR (the visual square, not including padding).
   */
  size?: number;
  /**
   * Override the foreground color. Defaults to the resolved preset's --tt-qr-fg.
   */
  fgColor?: string;
  /**
   * Override the background color. Defaults to the resolved preset's --tt-qr-bg.
   */
  bgColor?: string;
  /**
   * Optional id forwarded to the underlying SVG so download-as-PNG helpers
   * can locate it.
   */
  id?: string;
}

/**
 * Padded QR specimen styled to match the design's "QR-with-padding-box".
 * Uses react-qr-code under the hood; foreground and background colors
 * pull from the resolved preset's QR tokens unless overridden.
 */
export function QrFrame({ value, size = 240, fgColor, bgColor, id }: QrFrameProps) {
  const { preset } = usePresetOptional();
  const resolvedFg = fgColor ?? preset.qrFg;
  const resolvedBg = bgColor ?? preset.qrBg;
  const padding = Math.round(size / 12);

  return (
    <div className="inline-block" style={{ background: resolvedBg, padding }}>
      <QRCode
        id={id}
        value={value}
        size={size}
        fgColor={resolvedFg}
        bgColor={resolvedBg}
        level="M"
        viewBox="0 0 256 256"
        style={{ display: "block" }}
      />
    </div>
  );
}
