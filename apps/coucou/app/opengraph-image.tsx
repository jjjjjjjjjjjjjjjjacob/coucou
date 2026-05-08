import { ImageResponse } from "next/og";
import { siteConfiguration } from "@/lib/site";

export const alt = siteConfiguration.brandName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND_BACKGROUND = "#000000";
const BRAND_FOREGROUND = "#FFFFFF";

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
        backgroundColor: BRAND_BACKGROUND,
        color: BRAND_FOREGROUND,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <svg
        width={280}
        height={280}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M60 43.0137L60 60L68.8582 71.2387M97 60C97 80.4345 80.4345 97 60 97C39.5655 97 23 80.4345 23 60C23 39.5655 39.5655 23 60 23C80.4345 23 97 39.5655 97 60Z"
          stroke={BRAND_FOREGROUND}
          strokeWidth={10}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 56,
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {siteConfiguration.brandName}
        </div>
        <div
          style={{
            fontSize: 32,
            opacity: 0.85,
            marginTop: 24,
          }}
        >
          {new URL(siteConfiguration.domain).host}
        </div>
      </div>
    </div>,
    { ...size },
  );
}
