import { DanzaOrganicaMark } from "@coucou/ui/tenant-template";
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
const BRAND_MARK_COLOR = BAUHAUS_DISPLAY_COLORS[DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.textColor];

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
      <DanzaOrganicaMark
        size={300}
        aria-label="Danza Organica disco ball"
        style={{ color: BRAND_MARK_COLOR }}
      />
    </div>,
    { ...size },
  );
}
