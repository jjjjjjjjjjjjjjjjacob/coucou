"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { usePhoneAuthFlow } from "./hooks/use-phone-auth-flow";
import { combineClassNames } from "./internal-utils";
import { OtpInput } from "./otp-input";
import { PhoneInput } from "./phone-input";

interface PhoneAuthFlowProps {
  onSuccess: () => void;
  className?: string;
}

/**
 * State machine: phone → verification → completing. The whole flow lives
 * inside `<AuthShell>`'s preset-themed body container, so colors/typography
 * resolve from the active tenant template.
 */
export function PhoneAuthFlow({ onSuccess, className }: PhoneAuthFlowProps) {
  const { state, setPhone, setCountryCode, sendVerificationCode, verifyCode, resendCode, goBack } =
    usePhoneAuthFlow({ onSuccess });

  const [otpValue, setOtpValue] = useState("");

  const handleGoBack = useCallback(() => {
    setOtpValue("");
    goBack();
  }, [goBack]);

  const handleResendCode = useCallback(async () => {
    setOtpValue("");
    await resendCode();
  }, [resendCode]);

  const handleOtpComplete = useCallback(
    (code: string) => {
      verifyCode(code);
    },
    [verifyCode],
  );

  const formattedPhone = `${state.countryCode} ${state.phoneNumber}`;

  return (
    <div className={combineClassNames("flex w-full flex-col gap-5", className)}>
      {/* Clerk requires this exact id for the bot-protection challenge. */}
      <div id="clerk-captcha" />

      {state.step === "phone" ? (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          <PhoneInput
            value={state.phoneNumber}
            countryCode={state.countryCode}
            onValueChange={setPhone}
            onCountryCodeChange={setCountryCode}
            onSubmit={sendVerificationCode}
            isLoading={state.isLoading}
            error={state.error?.message}
          />
        </div>
      ) : null}

      {state.step === "verification" ? (
        <div className="flex animate-in fade-in slide-in-from-bottom-1 flex-col gap-4 duration-300">
          <div
            className="flex items-center justify-center gap-2 text-[13px]"
            style={{ color: "var(--tt-fg-dim)" }}
          >
            <span>Sent to {formattedPhone}</span>
            <button
              type="button"
              onClick={handleGoBack}
              className="font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--tt-fg)" }}
            >
              edit
            </button>
          </div>

          <OtpInput
            value={otpValue}
            onChange={setOtpValue}
            onComplete={handleOtpComplete}
            disabled={state.isLoading}
            error={state.error?.message}
          />

          <div className="flex justify-center text-[13px]">
            {state.canResend ? (
              <button
                type="button"
                onClick={handleResendCode}
                disabled={state.isLoading}
                className="transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ color: "var(--tt-fg-dim)" }}
              >
                Resend code
              </button>
            ) : state.resendCooldown > 0 ? (
              <span style={{ color: "var(--tt-fg-mute)" }}>Resend in {state.resendCooldown}s</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.step === "completing" ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--tt-fg)" }} />
          <p className="text-[13px]" style={{ color: "var(--tt-fg-dim)" }}>
            Verifying…
          </p>
        </div>
      ) : null}
    </div>
  );
}
