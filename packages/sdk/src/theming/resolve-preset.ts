import {
  PRESET_DEFINITIONS,
  isPresetKey,
  type PresetDefinition,
  type PresetKey,
} from "./presets";
import {
  buildEventThemeStyle,
  getEventThemeColors,
  mixHexColors,
  normalizeHexColorInput,
  type EventThemeColorSource,
} from "./build-event-theme";
import type { CSSProperties } from "react";

export interface ResolvePresetInput {
  /**
   * Per-event preset override. Highest priority. Reserved for future use.
   */
  eventPreset?: string | null;
  /**
   * Per-tenant preset stored on the workspace. Second priority.
   */
  workspacePreset?: string | null;
  /**
   * Per-app fallback baked into siteConfiguration. Third priority.
   */
  siteConfigurationPreset?: string | null;
  /**
   * Per-event hex color overrides. Merged on top of the resolved preset.
   */
  event?: EventThemeColorSource | null;
}

export interface ResolvedPreset {
  key: PresetKey;
  definition: PresetDefinition;
  /**
   * The preset's tokens with per-event color overrides applied. The display
   * tokens (fonts, button radius, layout knobs) are unchanged; bg/fg/qr
   * colors and derived rules pick up overrides from the event.
   */
  effective: PresetDefinition;
  /**
   * Inline CSS variable map suitable for spreading onto a wrapper element.
   * Includes shadcn-style --background, --foreground, --primary, etc., plus
   * tenant-template-specific --tt-* tokens.
   */
  styleVars: CSSProperties;
}

const FINAL_FALLBACK_PRESET: PresetKey = "dojo";

function pickPresetKey(input: ResolvePresetInput): PresetKey {
  if (isPresetKey(input.eventPreset)) return input.eventPreset;
  if (isPresetKey(input.workspacePreset)) return input.workspacePreset;
  if (isPresetKey(input.siteConfigurationPreset)) {
    return input.siteConfigurationPreset;
  }
  return FINAL_FALLBACK_PRESET;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbaForHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function deriveOverriddenPreset(
  base: PresetDefinition,
  event: EventThemeColorSource | null | undefined,
): PresetDefinition {
  const overrideBackground = normalizeHexColorInput(
    event?.themeBackgroundColor,
  );
  const overrideText = normalizeHexColorInput(event?.themeTextColor);

  if (!overrideBackground && !overrideText) {
    return base;
  }

  const nextBg = overrideBackground ?? base.bg;
  const nextFg = overrideText ?? base.fg;

  // Derive every color token from the override pair so the entire surface
  // (including dim text, hairline rules, mute labels, and the secondary
  // surface fill) takes on the event takeover instead of leaving preset
  // defaults bleeding through.
  const nextBg2 = mixHexColors(nextBg, nextFg, 0.06);
  const nextFgDim = mixHexColors(nextFg, nextBg, 0.35);
  const nextFgMute = mixHexColors(nextFg, nextBg, 0.65);
  const nextRule = rgbaForHex(nextFg, 0.16);
  const nextRuleStrong = rgbaForHex(nextFg, 0.32);
  const nextAccent = nextFg;

  return {
    ...base,
    bg: nextBg,
    bg2: nextBg2,
    fg: nextFg,
    fgDim: nextFgDim,
    fgMute: nextFgMute,
    rule: nextRule,
    ruleStrong: nextRuleStrong,
    accent: nextAccent,
    qrBg: nextBg,
    qrFg: nextFg,
  };
}

function buildStyleVars(
  preset: PresetDefinition,
  event: EventThemeColorSource | null | undefined,
): CSSProperties {
  const eventThemeStyle = buildEventThemeStyle(event, {
    backgroundColor: preset.bg,
    textColor: preset.fg,
  });

  const tenantTemplateVars: Record<string, string | number> = {
    "--tt-bg": preset.bg,
    "--tt-bg-2": preset.bg2,
    "--tt-fg": preset.fg,
    "--tt-fg-dim": preset.fgDim,
    "--tt-fg-mute": preset.fgMute,
    "--tt-rule": preset.rule,
    "--tt-rule-strong": preset.ruleStrong,
    "--tt-accent": preset.accent,
    "--tt-display": preset.display,
    "--tt-text": preset.text,
    "--tt-title-size": `${preset.titleSize}px`,
    "--tt-button-radius": `${preset.buttonRadius}px`,
    "--tt-qr-fg": preset.qrFg,
    "--tt-qr-bg": preset.qrBg,
  };

  return {
    ...eventThemeStyle,
    ...tenantTemplateVars,
  } as CSSProperties;
}

export function resolvePreset(input: ResolvePresetInput): ResolvedPreset {
  const key = pickPresetKey(input);
  const definition = PRESET_DEFINITIONS[key];
  const effective = deriveOverriddenPreset(definition, input.event);
  const styleVars = buildStyleVars(effective, input.event);
  return {
    key,
    definition,
    effective,
    styleVars,
  };
}

/**
 * Convenience helper for callers that just want the resolved hex colors,
 * with full preset + event override resolution. Mirrors the signature of
 * the legacy getEventThemeColors() but accepts a preset hint.
 */
export function resolveEventColors(
  input: ResolvePresetInput,
): { backgroundColor: string; textColor: string } {
  const resolved = resolvePreset(input);
  return getEventThemeColors(input.event, {
    backgroundColor: resolved.definition.bg,
    textColor: resolved.definition.fg,
  });
}
