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

const danzaPreset = PRESET_DEFINITIONS.danza;

// Tokens that drive popovers, dropdowns, and card surfaces. Danza Organica
// keeps these neutral regardless of the event takeover so menus stay on the
// app's teal-default brand instead of picking up a tinted (or dark) event
// background. Event overrides still flow through every other token —
// background, primary, accent, border, sidebar — so the page itself adopts
// the takeover; only the floating surfaces stay neutral.
const NEUTRAL_SURFACE_VARIABLES = new Set([
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
]);

function stripNeutralSurfaceOverrides(style: CSSProperties): CSSProperties {
  const filteredEntries = Object.entries(style).filter(
    ([key]) => !NEUTRAL_SURFACE_VARIABLES.has(key),
  );
  return Object.fromEntries(filteredEntries) as CSSProperties;
}

// Danza Organica ships the danza preset (black on turquoise). Events without
// explicit theme colors fall back to danza's turquoise/black pair, and event
// overrides leave the popover/card tokens untouched so dropdowns and cards
// stay on the white-default brand even when the rest of the page goes dark.
export function buildEventThemeStyle(
  event: EventThemeColorSource | null | undefined,
  fallbacks?: { backgroundColor?: string; textColor?: string },
): CSSProperties {
  const baseStyle = baseBuildEventThemeStyle(event, {
    backgroundColor: fallbacks?.backgroundColor ?? danzaPreset.bg,
    textColor: fallbacks?.textColor ?? danzaPreset.fg,
  });
  return stripNeutralSurfaceOverrides(baseStyle);
}
