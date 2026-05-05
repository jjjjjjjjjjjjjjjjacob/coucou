"use client";

import type { CSSProperties } from "react";
import type { PresetBrandMarkStyle, PresetKey } from "@coucou/sdk";
import { PRESET_DEFINITIONS } from "@coucou/sdk";

export interface BrandMarkProps {
  /**
   * Two-letter accent (e.g. "DP" for Dojo Pomodoro). The shell's
   * siteAuthConfiguration.accentMark is the natural source. Required if
   * `initials` isn't supplied.
   */
  accentMark?: string;
  /**
   * Override the initials. Falls back to `accentMark` or the preset's
   * default if both are unset.
   */
  initials?: string;
  /**
   * Pixel size of the mark.
   */
  size?: number;
  /**
   * The visual mark style. Falls back to the preset's default.
   */
  style?: PresetBrandMarkStyle;
  /**
   * Required so the mark can pull color/font tokens. The preset must be
   * loaded into <TenantTemplateProvider> for the CSS vars to resolve.
   */
  preset: PresetKey;
}

function deriveInitials(value: string | undefined): string {
  if (!value) return "";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function BrandMark({
  accentMark,
  initials,
  size = 72,
  style,
  preset,
}: BrandMarkProps) {
  const presetDefinition = PRESET_DEFINITIONS[preset];
  const resolvedStyle = style ?? presetDefinition.brandMarkStyle;
  const fallbackInitials = deriveInitials(presetDefinition.name);
  const resolvedInitials =
    (initials && initials.trim()) ||
    (accentMark && accentMark.trim()) ||
    fallbackInitials;

  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  if (resolvedStyle === "filled-circle") {
    return (
      <div
        style={{
          ...baseStyle,
          borderRadius: "50%",
          background: "var(--tt-fg)",
          color: "var(--tt-bg)",
          fontFamily: "var(--tt-display)",
          fontWeight: 700,
          fontSize: size * 0.34,
          letterSpacing: "0.02em",
        }}
      >
        {resolvedInitials}
      </div>
    );
  }

  if (resolvedStyle === "square-serif") {
    return (
      <div
        style={{
          ...baseStyle,
          border: "1.5px solid var(--tt-fg)",
          color: "var(--tt-fg)",
          fontFamily: "var(--tt-display)",
          fontWeight: 400,
          fontSize: size * 0.42,
          fontStyle: "italic",
        }}
      >
        {resolvedInitials}
      </div>
    );
  }

  if (resolvedStyle === "logo-upload" || resolvedStyle === "wordmark-only") {
    // These styles will be customized later by tenant. Render a quiet
    // placeholder for now using the wordmark-only treatment.
    return (
      <div
        style={{
          ...baseStyle,
          color: "var(--tt-fg)",
          fontFamily: "var(--tt-display)",
          fontWeight: 600,
          fontSize: size * 0.4,
          letterSpacing: "-0.01em",
        }}
      >
        {resolvedInitials}
      </div>
    );
  }

  // Default: thin-ring (maison)
  return (
    <div
      style={{
        ...baseStyle,
        borderRadius: "50%",
        border: "1px solid var(--tt-fg)",
        color: "var(--tt-fg)",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: size * 0.28,
        letterSpacing: "0.1em",
      }}
    >
      {resolvedInitials}
    </div>
  );
}
