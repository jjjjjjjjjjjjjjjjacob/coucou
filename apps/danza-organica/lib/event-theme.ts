import {
  buildEventThemeStyle as baseBuildEventThemeStyle,
  type EventThemeColorSource,
  getAccessibleTextColor,
  getEventThemeColors,
  mixHexColors,
  normalizeHexColorInput,
} from "@coucou/sdk/theming/build-event-theme";
import { PRESET_DEFINITIONS } from "@coucou/sdk/theming/presets";
import { resolvePreset } from "@coucou/sdk/theming/resolve-preset";
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

function resolveTenantTemplateThemeStyle(
  event: EventThemeColorSource | null | undefined,
  fallbacks?: { backgroundColor?: string; textColor?: string },
): CSSProperties {
  const resolvedEvent = fallbacks
    ? {
        themeBackgroundColor:
          normalizeHexColorInput(event?.themeBackgroundColor) ?? fallbacks.backgroundColor,
        themeTextColor: normalizeHexColorInput(event?.themeTextColor) ?? fallbacks.textColor,
        themeAccentColor:
          normalizeHexColorInput(event?.themeAccentColor) ??
          normalizeHexColorInput(event?.themeTextColor) ??
          fallbacks.textColor,
      }
    : event;
  const resolvedPresetStyle = resolvePreset({
    siteConfigurationPreset: danzaPreset.key,
    event: resolvedEvent,
  }).styleVars;
  const tenantTemplateEntries = Object.entries(resolvedPresetStyle).filter(([key]) =>
    key.startsWith("--tt-"),
  );
  return Object.fromEntries(tenantTemplateEntries) as CSSProperties;
}

/**
 * Danza uses an event accent as a deliberately scarce editorial color. Keep
 * shared form, navigation, focus, and feedback tokens tied to the event text
 * color so setting an orange accent does not recolor the entire application.
 * Individual Danza compositions opt into `--tt-accent` where it is wanted.
 */
function resolveDanzaControlThemeStyle(
  event: EventThemeColorSource | null | undefined,
  fallbacks?: { backgroundColor?: string; textColor?: string },
): CSSProperties {
  const { backgroundColor, textColor } = getEventThemeColors(event, {
    backgroundColor: fallbacks?.backgroundColor ?? danzaPreset.bg,
    textColor: fallbacks?.textColor ?? danzaPreset.fg,
  });
  const primaryForegroundColor = getAccessibleTextColor(textColor);
  const subtleInteractiveSurfaceColor = mixHexColors(backgroundColor, textColor, 0.12);

  return {
    "--primary": textColor,
    "--primary-foreground": primaryForegroundColor,
    "--accent": subtleInteractiveSurfaceColor,
    "--accent-foreground": textColor,
    "--destructive": "#B91C1C",
    "--destructive-foreground": "#FFFFFF",
    "--ring": textColor,
    "--sidebar-primary": textColor,
    "--sidebar-primary-foreground": primaryForegroundColor,
    "--sidebar-accent": subtleInteractiveSurfaceColor,
    "--sidebar-accent-foreground": textColor,
    "--sidebar-ring": textColor,
  } as CSSProperties;
}

// Danza Organica ships the danza preset (black on turquoise). Events without
// explicit theme colors fall back to danza's turquoise/black pair, and event
// overrides leave the popover/card tokens untouched so dropdowns and cards
// stay on the teal-default brand even when the rest of the page goes dark.
export function buildEventThemeStyle(
  event: EventThemeColorSource | null | undefined,
  fallbacks?: { backgroundColor?: string; textColor?: string },
): CSSProperties {
  const baseStyle = baseBuildEventThemeStyle(event, {
    backgroundColor: fallbacks?.backgroundColor ?? danzaPreset.bg,
    textColor: fallbacks?.textColor ?? danzaPreset.fg,
  });
  const controlThemeStyle = resolveDanzaControlThemeStyle(event, fallbacks);
  const tenantTemplateThemeStyle = resolveTenantTemplateThemeStyle(event, fallbacks);
  return stripNeutralSurfaceOverrides({
    ...baseStyle,
    ...controlThemeStyle,
    ...tenantTemplateThemeStyle,
  });
}
