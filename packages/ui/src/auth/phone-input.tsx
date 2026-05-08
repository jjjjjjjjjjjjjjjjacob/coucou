"use client";

import { Loader2 } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useCallback } from "react";
import { usePresetOptional } from "../tenant-template/use-preset";
import { CountrySelector } from "./country-selector";
import {
  combineClassNames,
  formatPhoneNumberForDisplay,
  isPhoneNumberLikelyValid,
} from "./internal-utils";

interface PhoneInputProps {
  value: string;
  countryCode: string;
  onValueChange: (value: string) => void;
  onCountryCodeChange: (code: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Phone input with integrated country chip + tenant-themed CTA. The
 * submit-button visual switches based on the active preset's `ctaShape`
 * (rounded for dojo; ghost-bordered for maison/coucou).
 */
export function PhoneInput({
  value,
  countryCode,
  onValueChange,
  onCountryCodeChange,
  onSubmit,
  disabled,
  isLoading,
  error,
}: PhoneInputProps) {
  const { preset } = usePresetOptional();

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onValueChange(formatPhoneNumberForDisplay(event.target.value, countryCode));
    },
    [countryCode, onValueChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !disabled && !isLoading) {
        event.preventDefault();
        onSubmit();
      }
    },
    [disabled, isLoading, onSubmit],
  );

  const isValid = isPhoneNumberLikelyValid(value, countryCode);
  const isReady = isValid && !disabled && !isLoading;

  return (
    <div className="flex w-full flex-col gap-3">
      <label
        htmlFor="phone-auth-phone-number"
        className="text-[11px] uppercase tracking-[0.06em]"
        style={{ color: "var(--tt-fg-mute)" }}
      >
        Phone number
      </label>

      <div
        className="flex items-stretch transition-colors"
        style={{
          border: `1px solid ${error ? "var(--tt-fg)" : "var(--tt-rule-strong)"}`,
          background: "transparent",
          borderRadius: preset.ctaShape === "rounded" ? 8 : 0,
        }}
      >
        <CountrySelector
          value={countryCode}
          onChange={onCountryCodeChange}
          disabled={disabled || isLoading}
        />
        <input
          id="phone-auth-phone-number"
          type="tel"
          inputMode="numeric"
          suppressHydrationWarning
          autoComplete="tel"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="000 000 0000"
          disabled={disabled || isLoading}
          autoFocus
          aria-label="Phone number"
          className="flex-1 bg-transparent px-3 py-3 text-[15px] focus:outline-none disabled:cursor-not-allowed"
          style={{
            color: "var(--tt-fg)",
            fontFamily: "var(--tt-text)",
          }}
        />
      </div>

      <CtaButton
        preset={preset.ctaShape}
        disabled={!isReady}
        onClick={onSubmit}
        isLoading={isLoading}
      >
        Text me a code
      </CtaButton>

      {error ? (
        <p className="text-[13px] leading-snug" role="alert" style={{ color: "var(--tt-fg)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface CtaButtonProps {
  preset: "rounded" | "ghost-link" | "ghost-bordered";
  disabled?: boolean;
  isLoading?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function CtaButton({ preset, disabled, isLoading, onClick, children }: CtaButtonProps) {
  const baseClass =
    "flex w-full items-center justify-center px-5 py-3 text-[14px] font-semibold tracking-[0.02em] transition-[filter,opacity] duration-150 hover:brightness-105 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60";

  if (preset === "rounded") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={combineClassNames(baseClass)}
        style={{
          background: "var(--tt-fg)",
          color: "var(--tt-bg)",
          borderRadius: "var(--tt-button-radius)",
          fontFamily: "var(--tt-text)",
        }}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
      </button>
    );
  }

  if (preset === "ghost-bordered") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={combineClassNames(baseClass)}
        style={{
          background: "transparent",
          color: "var(--tt-fg)",
          border: "1px solid var(--tt-fg)",
          fontFamily: "var(--tt-text)",
        }}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
      </button>
    );
  }

  // ghost-link
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={combineClassNames(
        "flex w-full items-center justify-center pb-1 text-[14px] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60",
      )}
      style={{
        background: "transparent",
        color: "var(--tt-fg)",
        borderBottom: "1px solid var(--tt-fg)",
        fontFamily: "var(--tt-text)",
      }}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}
