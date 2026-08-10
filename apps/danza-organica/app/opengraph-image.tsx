import { ImageResponse } from "next/og";
import {
  BAUHAUS_DISPLAY_COLORS,
  DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
} from "@/lib/bauhaus-event-display";
import { siteConfiguration } from "@/lib/site";

export const alt = siteConfiguration.brandName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND_BACKGROUND = BAUHAUS_DISPLAY_COLORS.teal;
const BRAND_GLOBE_COLOR = BAUHAUS_DISPLAY_COLORS[DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.textColor];

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BRAND_BACKGROUND,
      }}
    >
      <svg
        width={300}
        height={300}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Danza Organica globe"
      >
        <circle cx="12" cy="12" r="10" stroke={BRAND_GLOBE_COLOR} strokeWidth="1.5" />
        <path
          d="M8 12C8 18 12 22 12 22C12 22 16 18 16 12C16 6 12 2 12 2C12 2 8 6 8 12Z"
          stroke={BRAND_GLOBE_COLOR}
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          d="M21 15H3"
          stroke={BRAND_GLOBE_COLOR}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          d="M21 9H3"
          stroke={BRAND_GLOBE_COLOR}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    </div>,
    { ...size },
  );
}
