import { ImageResponse } from "next/og";
import { siteConfiguration } from "@/lib/site";

export const alt = siteConfiguration.brandName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Danza preset colors — bright turquoise backdrop, near-black type.
const BRAND_BACKGROUND = "#17E1E5";
const BRAND_FOREGROUND = "#0A0A0A";

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        backgroundColor: BRAND_BACKGROUND,
        color: BRAND_FOREGROUND,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 9999,
          backgroundColor: BRAND_FOREGROUND,
          color: BRAND_BACKGROUND,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {siteConfiguration.accentMark}
      </div>
      <div
        style={{
          fontSize: 88,
          fontWeight: 700,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
        }}
      >
        {siteConfiguration.brandName}
      </div>
    </div>,
    { ...size },
  );
}
