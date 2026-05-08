"use client";

import { useSignIn, useSignUp, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { initialPhoneAuthState, type PhoneAuthError, type PhoneAuthState } from "../config/types";
import { digitsOnly, getClerkErrorCode, mapClerkErrorToPhoneAuth } from "../internal-utils";

const RESEND_COOLDOWN_SECONDS = 30;

interface UsePhoneAuthFlowOptions {
  onSuccess: () => void;
  onError?: (error: PhoneAuthError) => void;
}

interface UsePhoneAuthFlowReturn {
  state: PhoneAuthState;
  setPhone: (phone: string) => void;
  setCountryCode: (code: string) => void;
  sendVerificationCode: () => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  resendCode: () => Promise<void>;
  goBack: () => void;
  clearError: () => void;
}

/**
 * Phone-auth state machine + Clerk integration. Implements entry-agnostic
 * auth: tries `signIn.create()` first; on `form_identifier_not_found`,
 * falls back to `signUp.create()`. The single OTP flow handles both paths
 * via the `authMode` field on state.
 *
 * Faithful port of the-market/apps/web/src/components/phone-auth/hooks/
 * use-phone-auth-flow.ts. Differences:
 *   - imports `@clerk/nextjs` instead of `@clerk/clerk-react` (same hook API)
 *   - PostHog tracking removed (sunsetted in this repo)
 *   - error mapping uses `mapClerkErrorToPhoneAuth` from internal-utils
 */
export function usePhoneAuthFlow({
  onSuccess,
  onError,
}: UsePhoneAuthFlowOptions): UsePhoneAuthFlowReturn {
  const { signIn, setActive: setSignInActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: isSignUpLoaded } = useSignUp();

  const { isSignedIn } = useUser();

  const [state, setState] = useState<PhoneAuthState>(initialPhoneAuthState);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Latest onSuccess for the session-watching effect to call without stale closure.
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  // Whether we're waiting for Clerk to confirm the new session is live.
  const awaitingSessionRef = useRef(false);

  // Don't fire onSuccess until both: (1) we've moved to "completing" and
  // (2) Clerk's useUser() reflects isSignedIn === true. Without this guard
  // the redirect can happen before the session cookie is set, looping the
  // user back to the phone form.
  useEffect(() => {
    if (awaitingSessionRef.current && state.step === "completing" && isSignedIn) {
      awaitingSessionRef.current = false;
      onSuccessRef.current();
    }
  }, [state.step, isSignedIn]);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
      }
    };
  }, []);

  const setPhone = useCallback((phone: string) => {
    setState((prev) => ({ ...prev, phoneNumber: phone, error: null }));
  }, []);

  const setCountryCode = useCallback((code: string) => {
    setState((prev) => ({ ...prev, countryCode: code, error: null }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const goBack = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: "phone",
      error: null,
      authMode: null,
    }));
  }, []);

  const startResendCooldown = useCallback(() => {
    setState((prev) => ({
      ...prev,
      canResend: false,
      resendCooldown: RESEND_COOLDOWN_SECONDS,
    }));

    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }

    cooldownTimerRef.current = setInterval(() => {
      setState((prev) => {
        const next = prev.resendCooldown - 1;
        if (next <= 0) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          return { ...prev, canResend: true, resendCooldown: 0 };
        }
        return { ...prev, resendCooldown: next };
      });
    }, 1000);
  }, []);

  const sendVerificationCode = useCallback(async () => {
    if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) return;

    const fullPhone = `${state.countryCode}${digitsOnly(state.phoneNumber)}`;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await signIn.create({
        strategy: "phone_code",
        identifier: fullPhone,
      });
      setState((prev) => ({
        ...prev,
        step: "verification",
        isLoading: false,
        authMode: "signin",
      }));
      startResendCooldown();
    } catch (signInError) {
      const errorCode = getClerkErrorCode(signInError);
      if (errorCode === "form_identifier_not_found") {
        try {
          await signUp.create({ phoneNumber: fullPhone });
          await signUp.preparePhoneNumberVerification();
          setState((prev) => ({
            ...prev,
            step: "verification",
            isLoading: false,
            authMode: "signup",
          }));
          startResendCooldown();
        } catch (signUpError) {
          const error = mapClerkErrorToPhoneAuth(signUpError);
          setState((prev) => ({ ...prev, isLoading: false, error }));
          onError?.(error);
        }
      } else {
        const error = mapClerkErrorToPhoneAuth(signInError);
        setState((prev) => ({ ...prev, isLoading: false, error }));
        onError?.(error);
      }
    }
  }, [
    isSignInLoaded,
    isSignUpLoaded,
    signIn,
    signUp,
    state.countryCode,
    state.phoneNumber,
    startResendCooldown,
    onError,
  ]);

  const verifyCode = useCallback(
    async (code: string) => {
      if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        if (state.authMode === "signin") {
          const result = await signIn.attemptFirstFactor({
            strategy: "phone_code",
            code,
          });
          if (result.status === "complete") {
            if (!result.createdSessionId) {
              setState((prev) => ({
                ...prev,
                isLoading: false,
                error: {
                  type: "unknown",
                  message: "Something went wrong. Please try again.",
                },
              }));
              return;
            }
            setState((prev) => ({ ...prev, step: "completing" }));
            awaitingSessionRef.current = true;
            await setSignInActive({ session: result.createdSessionId });
          } else {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: {
                type: "unknown",
                message: "Additional verification required.",
              },
            }));
          }
        } else {
          const result = await signUp.attemptPhoneNumberVerification({ code });
          if (result.status === "complete") {
            if (!result.createdSessionId) {
              setState((prev) => ({
                ...prev,
                isLoading: false,
                error: {
                  type: "unknown",
                  message: "Something went wrong. Please try again.",
                },
              }));
              return;
            }
            setState((prev) => ({ ...prev, step: "completing" }));
            awaitingSessionRef.current = true;
            await setSignUpActive({ session: result.createdSessionId });
          } else {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: {
                type: "unknown",
                message: "Additional verification required.",
              },
            }));
          }
        }
      } catch (error) {
        const mappedError = mapClerkErrorToPhoneAuth(error);
        awaitingSessionRef.current = false;
        setState((prev) => ({
          ...prev,
          step: prev.step === "completing" ? "verification" : prev.step,
          isLoading: false,
          error: mappedError,
        }));
        onError?.(mappedError);
      }
    },
    [
      isSignInLoaded,
      isSignUpLoaded,
      signIn,
      signUp,
      state.authMode,
      setSignInActive,
      setSignUpActive,
      onError,
    ],
  );

  const resendCode = useCallback(async () => {
    if (!state.canResend) return;
    if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (state.authMode === "signin") {
        const fullPhone = `${state.countryCode}${digitsOnly(state.phoneNumber)}`;
        await signIn.create({
          strategy: "phone_code",
          identifier: fullPhone,
        });
      } else {
        await signUp.preparePhoneNumberVerification();
      }
      setState((prev) => ({ ...prev, isLoading: false }));
      startResendCooldown();
    } catch (error) {
      const mappedError = mapClerkErrorToPhoneAuth(error);
      setState((prev) => ({ ...prev, isLoading: false, error: mappedError }));
      onError?.(mappedError);
    }
  }, [
    state.canResend,
    state.authMode,
    state.countryCode,
    state.phoneNumber,
    isSignInLoaded,
    isSignUpLoaded,
    signIn,
    signUp,
    startResendCooldown,
    onError,
  ]);

  return {
    state,
    setPhone,
    setCountryCode,
    sendVerificationCode,
    verifyCode,
    resendCode,
    goBack,
    clearError,
  };
}
