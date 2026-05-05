"use client";

import { OTPInput, type SlotProps } from "input-otp";
import { useCallback } from "react";
import { combineClassNames } from "./internal-utils";
import { usePresetOptional } from "../tenant-template/use-preset";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  error?: string | null;
  maxLength?: number;
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
  const handleComplete = useCallback(
    (code: string) => {
      if (code.length === maxLength) {
        onComplete(code);
      }
    },
    [maxLength, onComplete],
  );

  return (
    <div className="flex w-full flex-col items-center gap-4">
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
                hasError={Boolean(error)}
              />
            ))}
          </>
        )}
      />

      {error ? (
        <p
          className="text-[13px] leading-snug"
          role="alert"
          style={{ color: "var(--tt-fg)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface SlotComponentProps extends SlotProps {
  hasError?: boolean;
}

function Slot({ char, isActive, hasFakeCaret, hasError }: SlotComponentProps) {
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
          hasError
            ? "var(--tt-fg)"
            : isActive
              ? "var(--tt-fg)"
              : "var(--tt-rule-strong)"
        }`,
        boxShadow: isActive && !hasError
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
        border: `1px solid ${
          hasError || isActive ? "var(--tt-fg)" : "var(--tt-rule-strong)"
        }`,
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
      {hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="h-6 w-px animate-pulse"
            style={{ background: "var(--tt-fg)" }}
          />
        </div>
      ) : null}
    </div>
  );
}
