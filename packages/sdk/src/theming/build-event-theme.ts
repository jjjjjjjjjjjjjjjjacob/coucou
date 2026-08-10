import type { CSSProperties } from "react";

export const EVENT_THEME_DEFAULT_BACKGROUND_COLOR = "#FFFFFF";
export const EVENT_THEME_DEFAULT_TEXT_COLOR = "#EF4444";
export const EVENT_THEME_DEFAULT_ACCENT_COLOR = EVENT_THEME_DEFAULT_TEXT_COLOR;

const HEX_COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{6})$/;

export interface EventThemeColorSource {
  themeBackgroundColor?: string | null;
  themeTextColor?: string | null;
  themeAccentColor?: string | null;
}

function clampHexChannel(channel: string): number {
  return Math.max(0, Math.min(255, parseInt(channel, 16)));
}

function componentToHex(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, "0").toUpperCase();
}

function hexToRgbComponents(hexColor: string): {
  red: number;
  green: number;
  blue: number;
} {
  const normalizedHex = hexColor.replace("#", "");
  return {
    red: clampHexChannel(normalizedHex.slice(0, 2)),
    green: clampHexChannel(normalizedHex.slice(2, 4)),
    blue: clampHexChannel(normalizedHex.slice(4, 6)),
  };
}

export function mixHexColors(baseColor: string, mixColor: string, weight: number): string {
  const ratio = Math.max(0, Math.min(1, weight));
  const normalizedBase = normalizeHexColorInput(baseColor) ?? "#000000";
  const normalizedMix = normalizeHexColorInput(mixColor) ?? "#000000";
  const baseComponents = hexToRgbComponents(normalizedBase);
  const mixComponents = hexToRgbComponents(normalizedMix);
  const mixedRed = baseComponents.red * (1 - ratio) + mixComponents.red * ratio;
  const mixedGreen = baseComponents.green * (1 - ratio) + mixComponents.green * ratio;
  const mixedBlue = baseComponents.blue * (1 - ratio) + mixComponents.blue * ratio;
  return `#${componentToHex(mixedRed)}${componentToHex(mixedGreen)}${componentToHex(mixedBlue)}`;
}

function calculateRelativeLuminance(hexColor: string): number {
  const { red, green, blue } = hexToRgbComponents(hexColor);
  const channelValues = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channelValues[0] + 0.7152 * channelValues[1] + 0.0722 * channelValues[2];
}

export function isValidHexColor(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return false;
  const normalizedValue = trimmedValue.startsWith("#") ? trimmedValue : `#${trimmedValue}`;
  return HEX_COLOR_PATTERN.test(normalizedValue);
}

export function normalizeHexColorInput(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return undefined;
  const normalizedValue = trimmedValue.startsWith("#") ? trimmedValue : `#${trimmedValue}`;
  if (!HEX_COLOR_PATTERN.test(normalizedValue)) {
    return undefined;
  }
  return `#${normalizedValue.slice(1).toUpperCase()}`;
}

export function getAccessibleTextColor(hexColor: string): string {
  const normalizedHex = normalizeHexColorInput(hexColor) || "#000000";
  const luminance = calculateRelativeLuminance(normalizedHex);
  const blackContrastRatio = (luminance + 0.05) / 0.05;
  const whiteContrastRatio = 1.05 / (luminance + 0.05);
  return blackContrastRatio >= whiteContrastRatio ? "#000000" : "#FFFFFF";
}

export function getColorContrastRatio(colorA: string, colorB: string): number {
  const normalizedColorA = normalizeHexColorInput(colorA) ?? "#000000";
  const normalizedColorB = normalizeHexColorInput(colorB) ?? "#000000";
  const luminanceA = calculateRelativeLuminance(normalizedColorA);
  const luminanceB = calculateRelativeLuminance(normalizedColorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getEventThemeColors(
  event: EventThemeColorSource | null | undefined,
  fallbacks?: { backgroundColor?: string; textColor?: string; accentColor?: string },
): {
  backgroundColor: string;
  textColor: string;
  accentColor: string;
} {
  const fallbackBackground = fallbacks?.backgroundColor ?? EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
  const fallbackText = fallbacks?.textColor ?? EVENT_THEME_DEFAULT_TEXT_COLOR;
  const normalizedBackground =
    normalizeHexColorInput(event?.themeBackgroundColor) ?? fallbackBackground;
  const normalizedText = normalizeHexColorInput(event?.themeTextColor) ?? fallbackText;
  const normalizedAccent = normalizeHexColorInput(event?.themeAccentColor) ?? normalizedText;
  return {
    backgroundColor: normalizedBackground,
    textColor: normalizedText,
    accentColor: normalizedAccent,
  };
}

export function buildEventThemeStyle(
  event: EventThemeColorSource | null | undefined,
  fallbacks?: { backgroundColor?: string; textColor?: string; accentColor?: string },
): CSSProperties {
  const { backgroundColor, textColor, accentColor } = getEventThemeColors(event, fallbacks);
  const primaryForegroundColor = getAccessibleTextColor(accentColor);
  const accentSurfaceColor = mixHexColors(backgroundColor, textColor, 0.12);
  const mutedForegroundColor = mixHexColors(textColor, backgroundColor, 0.35);
  const borderColor = mixHexColors(backgroundColor, textColor, 0.24);

  return {
    "--background": backgroundColor,
    "--foreground": textColor,
    "--card": backgroundColor,
    "--card-foreground": textColor,
    "--popover": backgroundColor,
    "--popover-foreground": textColor,
    "--primary": accentColor,
    "--primary-foreground": primaryForegroundColor,
    "--secondary": accentSurfaceColor,
    "--secondary-foreground": textColor,
    "--muted": accentSurfaceColor,
    "--muted-foreground": mutedForegroundColor,
    "--accent": accentColor,
    "--accent-foreground": primaryForegroundColor,
    "--destructive": accentColor,
    "--destructive-foreground": primaryForegroundColor,
    "--border": borderColor,
    "--input": borderColor,
    "--ring": accentColor,
    "--sidebar": accentSurfaceColor,
    "--sidebar-foreground": textColor,
    "--sidebar-primary": accentColor,
    "--sidebar-primary-foreground": primaryForegroundColor,
    "--sidebar-accent": accentSurfaceColor,
    "--sidebar-accent-foreground": textColor,
    "--sidebar-border": borderColor,
    "--sidebar-ring": accentColor,
    backgroundColor,
    color: textColor,
  } as CSSProperties;
}
