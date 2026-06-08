"use client";

import { type CSSProperties, forwardRef } from "react";
import { usePresetOptional } from "../use-preset";

export interface HeaderMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Two-letter accent (e.g. "DP", "CC", "CO"). Typically passed from the
   * tenant's `siteConfiguration.accentMark`. Required.
   */
  accentMark: string;
  /**
   * Pixel size of the trigger square. Defaults to 32 (header-friendly).
   */
  size?: number;
}

/**
 * Preset-aware menu trigger button intended for use as the rightSlot inside
 * `<TenantMasthead>`. Each preset gets its own visual treatment so the
 * menu trigger feels native to the rest of the chrome:
 *
 *   - dojo:   filled-circle, fg-on-bg
 *   - maison: square outline with italic serif initials
 *   - atrium: square outline (italic serif)
 *   - coucou/chlorine: thin-ring circle with preset text initials
 *
 * Uses the active preset from `<TenantTemplateProvider>` via
 * `usePresetOptional()`. When rendered outside a provider it falls back to
 * the dojo preset's filled-circle style.
 *
 * The button itself is unstyled beyond what the preset prescribes — wire
 * it up with Radix DropdownMenuTrigger or a Link `asChild` from the
 * surrounding HeaderClient.
 */
export const HeaderMenuTrigger = forwardRef<HTMLButtonElement, HeaderMenuTriggerProps>(
  function HeaderMenuTrigger({ accentMark, size = 32, className, style, ...rest }, ref) {
    const { presetKey } = usePresetOptional();
    const baseStyle: CSSProperties = {
      width: size,
      height: size,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transition: "opacity 150ms ease",
      flexShrink: 0,
      ...style,
    };

    if (presetKey === "dojo") {
      return (
        <button
          ref={ref}
          type="button"
          {...rest}
          className={className}
          style={{
            ...baseStyle,
            background: "var(--tt-fg)",
            color: "var(--tt-bg)",
            borderRadius: "50%",
            border: "none",
            fontFamily: "var(--tt-display)",
            fontWeight: 700,
            fontSize: size * 0.36,
            letterSpacing: "0.02em",
          }}
        >
          {accentMark}
        </button>
      );
    }

    if (presetKey === "maison" || presetKey === "atrium") {
      return (
        <button
          ref={ref}
          type="button"
          {...rest}
          className={className}
          style={{
            ...baseStyle,
            background: "transparent",
            color: "var(--tt-fg)",
            border: "1px solid var(--tt-fg)",
            borderRadius: 0,
            fontFamily: "var(--tt-display)",
            fontWeight: 400,
            fontStyle: "italic",
            fontSize: size * 0.4,
          }}
        >
          {accentMark}
        </button>
      );
    }

    // coucou, chlorine, and any preset we haven't enumerated: thin-ring circle.
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={className}
        style={{
          ...baseStyle,
          background: "transparent",
          color: "var(--tt-fg)",
          border: "1px solid var(--tt-fg)",
          borderRadius: "50%",
          fontFamily:
            'var(--tt-text, "Helvetica Neue", "Helvetica", "Arial", system-ui, sans-serif)',
          fontSize: size * 0.32,
          letterSpacing: "0.08em",
        }}
      >
        {accentMark}
      </button>
    );
  },
);
