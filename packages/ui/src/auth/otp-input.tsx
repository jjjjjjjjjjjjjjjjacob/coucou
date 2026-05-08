"use client";

import { OTPInput, type SlotProps } from "input-otp";
import { type FocusEvent, useCallback, useEffect, useRef } from "react";
import { usePresetOptional } from "../tenant-template/use-preset";
import { combineClassNames } from "./internal-utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  error?: string | null;
  maxLength?: number;
}

export function shouldShowOtpFakeCaret({
  hasFakeCaret,
  disabled,
}: {
  hasFakeCaret: boolean;
  disabled?: boolean;
}): boolean {
  return hasFakeCaret && disabled !== true;
}

function getBlurCapableElement(value: EventTarget | null): HTMLElement | null {
  const possibleElement = value as { blur?: unknown } | null;
  return typeof possibleElement?.blur === "function" ? (value as HTMLElement) : null;
}

/**
 * Six-digit OTP grid with autosubmit. Each slot's visual switches by
 * preset:
 *   - dojo: rounded slots, primary ring on focus, destructive ring on error
 *   - maison/coucou: hairline rectangles using preset rule colors
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  error,
  maxLength = 6,
}: OtpInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const handleFocusCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    lastFocusedElementRef.current = getBlurCapableElement(event.target);
  }, []);

  useEffect(() => {
    if (!disabled) return;
    const lastFocusedElement = lastFocusedElementRef.current;
    lastFocusedElement?.blur();

    const activeElement = getBlurCapableElement(document.activeElement);
    if (!activeElement || activeElement === lastFocusedElement) return;
    if (!containerRef.current?.contains(activeElement)) return;
    activeElement.blur();
  }, [disabled]);

  const handleComplete = useCallback(
    (code: string) => {
      if (code.length === maxLength) {
        onComplete(code);
      }
    },
    [maxLength, onComplete],
  );

  return (
    <div
      ref={containerRef}
      className="flex w-full flex-col items-center gap-4"
      onFocusCapture={handleFocusCapture}
    >
      <OTPInput
        value={value}
        onChange={onChange}
        onComplete={handleComplete}
        maxLength={maxLength}
        disabled={disabled}
        autoFocus
        containerClassName="flex gap-2 justify-center w-full"
        render={({ slots }) => (
          <>
            {slots.map((slot, index) => (
              <Slot
                key={`otp-slot-${index}`}
                {...slot}
                hideCaret={disabled === true}
                hasError={Boolean(error)}
              />
            ))}
          </>
        )}
      />

      {error ? (
        <p className="text-[13px] leading-snug" role="alert" style={{ color: "var(--tt-fg)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface SlotComponentProps extends SlotProps {
  hasError?: boolean;
  hideCaret?: boolean;
}

function Slot({ char, isActive, hasFakeCaret, hasError, hideCaret }: SlotComponentProps) {
  const { presetKey } = usePresetOptional();
  const isDojo = presetKey === "dojo";

  // dojo: rounded with primary ring; maison/coucou: hairline rectangles.
  const slotStyle: React.CSSProperties = isDojo
    ? {
        height: 56,
        width: 44,
        borderRadius: 6,
        background: "var(--tt-bg-2)",
        color: "var(--tt-fg)",
        border: `1px solid ${
          hasError ? "var(--tt-fg)" : isActive ? "var(--tt-fg)" : "var(--tt-rule-strong)"
        }`,
        boxShadow:
          isActive && !hasError
            ? `0 0 0 3px color-mix(in srgb, var(--tt-fg) 16%, transparent)`
            : undefined,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      }
    : {
        height: 56,
        width: 44,
        borderRadius: 0,
        background: "var(--tt-bg-2)",
        color: "var(--tt-fg)",
        border: `1px solid ${hasError || isActive ? "var(--tt-fg)" : "var(--tt-rule-strong)"}`,
        fontFamily: "var(--tt-text)",
      };

  return (
    <div
      className={combineClassNames(
        "relative flex items-center justify-center text-[20px] font-medium transition-all",
      )}
      style={slotStyle}
    >
      {char}
      {shouldShowOtpFakeCaret({ hasFakeCaret, disabled: hideCaret }) ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-px animate-pulse" style={{ background: "var(--tt-fg)" }} />
        </div>
      ) : null}
    </div>
  );
}
