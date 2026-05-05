import {
  buildEventThemeStyle as baseBuildEventThemeStyle,
  type EventThemeColorSource,
} from "@coucou/sdk/theming/build-event-theme";
import { PRESET_DEFINITIONS } from "@coucou/sdk/theming/presets";
import type { CSSProperties } from "react";

export {
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
  getAccessibleTextColor,
  getColorContrastRatio,
  getEventThemeColors,
  isValidHexColor,
  mixHexColors,
  normalizeHexColorInput,
} from "@coucou/sdk/theming/build-event-theme";

const maisonPreset = PRESET_DEFINITIONS.maison;

// Club Chlorine is locked to the maison preset, so any event without explicit
// theme colors should fall back to maison's bone/black pair instead of the
// SDK's dojo defaults (white/red).
export function buildEventThemeStyle(
  event: EventThemeColorSource | null | undefined,
  fallbacks?: { backgroundColor?: string; textColor?: string },
): CSSProperties {
  return baseBuildEventThemeStyle(event, {
    backgroundColor: fallbacks?.backgroundColor ?? maisonPreset.bg,
    textColor: fallbacks?.textColor ?? maisonPreset.fg,
  });
}
