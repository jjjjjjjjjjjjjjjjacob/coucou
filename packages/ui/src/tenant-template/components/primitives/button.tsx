"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { combineClassNames } from "../../internal-utils";
import { usePresetOptional } from "../../use-preset";

export interface TenantButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  /**
   * Visual size. Default is "md".
   */
  size?: "sm" | "md" | "lg";
  /**
   * Stretch to fill the parent container.
   */
  fullWidth?: boolean;
}

/**
 * Preset-aware CTA. Switches between rounded (dojo), ghost-link
 * (maison), and ghost-bordered (atrium) shapes. Color comes from the
 * resolved preset's --tt-fg / --tt-bg vars so per-event overrides take
 * effect automatically.
 */
export function TenantButton({
  children,
  size = "md",
  fullWidth,
  className,
  type = "button",
  style,
  ...rest
}: TenantButtonProps) {
  const { preset } = usePresetOptional();

  const sizeClassNames =
    size === "sm"
      ? "px-3 py-2 text-[12px]"
      : size === "lg"
        ? "px-5 py-3.5 text-[14px]"
        : "px-4 py-2.5 text-[13px]";

  if (preset.ctaShape === "rounded") {
    return (
      <button
        type={type}
        className={combineClassNames(
          "inline-flex items-center justify-center font-semibold tracking-[0.02em] transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60",
          sizeClassNames,
          fullWidth ? "w-full" : "",
          className,
        )}
        style={{
          background: "var(--tt-fg)",
          color: "var(--tt-bg)",
          borderRadius: "var(--tt-button-radius)",
          fontFamily: "var(--tt-text)",
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
    );
  }

  if (preset.ctaShape === "ghost-bordered") {
    return (
      <button
        type={type}
        className={combineClassNames(
          "inline-flex items-center justify-center transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
          sizeClassNames,
          fullWidth ? "w-full" : "",
          className,
        )}
        style={{
          background: "transparent",
          color: "var(--tt-fg)",
          border: "1px solid var(--tt-fg)",
          borderRadius: "var(--tt-button-radius)",
          fontFamily: "var(--tt-text)",
          letterSpacing: "0.02em",
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
    );
  }

  // Ghost link — used by maison. The text itself is the click target;
  // a hairline underline grows on hover.
  return (
    <button
      type={type}
      className={combineClassNames(
        "inline-flex items-center justify-center pb-0.5 text-[14px] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60",
        sizeClassNames,
        fullWidth ? "w-full" : "",
        className,
      )}
      style={{
        color: "var(--tt-fg)",
        borderBottom: "1px solid var(--tt-fg)",
        background: "transparent",
        fontFamily: "var(--tt-text)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
