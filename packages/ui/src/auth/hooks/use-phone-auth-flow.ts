"use client";

import { useSignIn, useSignUp, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { countries } from "../config/countries";
import { initialPhoneAuthState, type PhoneAuthError, type PhoneAuthState } from "../config/types";
import {
  digitsOnly,
  formatPhoneNumberForDisplay,
  getClerkErrorCode,
  getClerkErrorMessage,
  mapClerkErrorToPhoneAuth,
} from "../internal-utils";

const RESEND_COOLDOWN_SECONDS = 30;
const SESSION_ACTIVATION_FALLBACK_MS = 1200;
const AUTO_SEND_CAPTCHA_FALLBACK_MINIMUM_MS = 1200;
const AUTO_SEND_CAPTCHA_FALLBACK_CHECK_INTERVAL_MS = 250;

interface UsePhoneAuthFlowOptions {
  onSuccess: () => void;
  onError?: (error: PhoneAuthError) => void;
  initialPhoneNumber?: string | null;
  autoSendInitialCode?: boolean;
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

interface SignUpCompletionState {
  status: string | null;
  missingFields?: readonly string[] | null;
  unverifiedFields?: readonly string[] | null;
}

type SessionActivator = (params: { session: string }) => Promise<unknown>;

function formatRequirementLabel(field: string): string {
  switch (field) {
    case "email_address":
    case "emailAddress":
      return "email address";
    case "first_name":
    case "firstName":
      return "first name";
    case "last_name":
    case "lastName":
      return "last name";
    case "legal_accepted":
    case "legalAccepted":
      return "terms acceptance";
    case "phone_number":
    case "phoneNumber":
      return "phone number";
    default:
      return field.replace(/_/g, " ");
  }
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isOnlyMissingLegalAcceptance(result: SignUpCompletionState): boolean {
  const missingFields = result.missingFields ?? [];
  return (
    missingFields.length > 0 &&
    missingFields.every((field) => field === "legal_accepted" || field === "legalAccepted")
  );
}

function buildMissingSessionError(): PhoneAuthError {
  return {
    type: "unknown",
    message: "We verified the code, but Clerk did not return a session. Please try again.",
  };
}

function buildIncompleteSignInError(status: string | null): PhoneAuthError {
  if (status === "needs_second_factor") {
    return {
      type: "unknown",
      message:
        "This account needs another verification step. Contact support to finish signing in.",
    };
  }

  return {
    type: "unknown",
    message: "We could not finish signing in. Please try again.",
  };
}

function buildIncompleteSignUpError(result: SignUpCompletionState): PhoneAuthError {
  const pendingFields = uniqueValues([
    ...(result.missingFields ?? []),
    ...(result.unverifiedFields ?? []),
  ]);

  if (pendingFields.length > 0) {
    return {
      type: "unknown",
      message: `We still need ${pendingFields.map(formatRequirementLabel).join(", ")} to create this account. Contact support if this keeps happening.`,
    };
  }

  return {
    type: "unknown",
    message: "We could not finish creating this account. Please try again.",
  };
}

function isBotProtectionError(error: unknown): boolean {
  const errorCode = getClerkErrorCode(error)?.toLowerCase() ?? "";
  const errorMessage = getClerkErrorMessage(error)?.toLowerCase() ?? "";
  const searchableErrorText = `${errorCode} ${errorMessage}`;

  return (
    searchableErrorText.includes("captcha") ||
    searchableErrorText.includes("bot") ||
    searchableErrorText.includes("challenge") ||
    searchableErrorText.includes("turnstile") ||
    searchableErrorText.includes("cloudflare")
  );
}

function buildBotProtectionRequiredError(): PhoneAuthError {
  return {
    type: "unknown",
    message: "Captcha required.",
  };
}

function buildCaptchaRequiredState(previousState: PhoneAuthState): PhoneAuthState {
  return {
    ...previousState,
    step: "captcha",
    isLoading: false,
    authMode: null,
    error: buildBotProtectionRequiredError(),
    canResend: false,
    resendCooldown: 0,
  };
}

function hasRenderedClerkCaptchaChallenge(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const captchaElement = document.getElementById("clerk-captcha");
  return Boolean(captchaElement && captchaElement.childElementCount > 0);
}

function resolveInitialPhoneAuthState(
  initialPhoneNumber: string | null | undefined,
): PhoneAuthState {
  const initialPhoneDigits = digitsOnly(initialPhoneNumber ?? "");
  if (!initialPhoneDigits) {
    return initialPhoneAuthState;
  }

  const sortedCountries = [...countries].sort(
    (leftCountry, rightCountry) =>
      digitsOnly(rightCountry.code).length - digitsOnly(leftCountry.code).length,
  );
  const matchedCountry = sortedCountries.find((country) =>
    initialPhoneDigits.startsWith(digitsOnly(country.code)),
  );
  const countryCode =
    matchedCountry?.code ??
    (initialPhoneDigits.length === 10 ? "+1" : initialPhoneAuthState.countryCode);
  const countryCodeDigits = digitsOnly(countryCode);
  const nationalDigits =
    initialPhoneDigits.startsWith(countryCodeDigits) &&
    initialPhoneDigits.length > countryCodeDigits.length
      ? initialPhoneDigits.slice(countryCodeDigits.length)
      : initialPhoneDigits;

  return {
    ...initialPhoneAuthState,
    countryCode,
    phoneNumber: formatPhoneNumberForDisplay(nationalDigits, countryCode),
  };
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
  initialPhoneNumber,
  autoSendInitialCode = false,
}: UsePhoneAuthFlowOptions): UsePhoneAuthFlowReturn {
  const { signIn, setActive: setSignInActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: isSignUpLoaded } = useSignUp();

  const { isSignedIn } = useUser();

  const [state, setState] = useState<PhoneAuthState>(() => {
    const resolvedInitialState = resolveInitialPhoneAuthState(initialPhoneNumber);
    if (autoSendInitialCode && digitsOnly(resolvedInitialState.phoneNumber)) {
      return {
        ...resolvedInitialState,
        isLoading: true,
      };
    }
    return resolvedInitialState;
  });
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActivationFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSendCaptchaFallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoSentInitialCodeRef = useRef(false);
  const autoSendRequestInFlightRef = useRef(false);
  const autoSendLoadingStartedAtRef = useRef<number | null>(null);

  // Latest onSuccess for the session-watching effect to call without stale closure.
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  // Whether we're waiting for Clerk to confirm the new session is live.
  const awaitingSessionRef = useRef(false);
  const hasCompletedAuthenticationRef = useRef(false);

  const clearResendCooldown = useCallback(() => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  const clearSessionActivationFallback = useCallback(() => {
    if (sessionActivationFallbackTimerRef.current) {
      clearTimeout(sessionActivationFallbackTimerRef.current);
      sessionActivationFallbackTimerRef.current = null;
    }
  }, []);

  const triggerSuccess = useCallback(() => {
    if (hasCompletedAuthenticationRef.current) return;

    hasCompletedAuthenticationRef.current = true;
    awaitingSessionRef.current = false;
    clearSessionActivationFallback();
    onSuccessRef.current();
  }, [clearSessionActivationFallback]);

  const scheduleSessionActivationFallback = useCallback(() => {
    clearSessionActivationFallback();
    sessionActivationFallbackTimerRef.current = setTimeout(() => {
      triggerSuccess();
    }, SESSION_ACTIVATION_FALLBACK_MS);
  }, [clearSessionActivationFallback, triggerSuccess]);

  const clearAutoSendCaptchaFallbackInterval = useCallback(() => {
    if (autoSendCaptchaFallbackIntervalRef.current) {
      clearInterval(autoSendCaptchaFallbackIntervalRef.current);
      autoSendCaptchaFallbackIntervalRef.current = null;
    }
    autoSendLoadingStartedAtRef.current = null;
  }, []);

  const enterCaptchaStep = useCallback(() => {
    awaitingSessionRef.current = false;
    hasCompletedAuthenticationRef.current = false;
    clearSessionActivationFallback();
    clearAutoSendCaptchaFallbackInterval();
    clearResendCooldown();
    setState((prev) => buildCaptchaRequiredState(prev));
  }, [clearAutoSendCaptchaFallbackInterval, clearResendCooldown, clearSessionActivationFallback]);

  const startAutoSendCaptchaFallbackInterval = useCallback(() => {
    clearAutoSendCaptchaFallbackInterval();
    autoSendLoadingStartedAtRef.current = Date.now();
    autoSendCaptchaFallbackIntervalRef.current = setInterval(() => {
      const loadingStartedAt = autoSendLoadingStartedAtRef.current;
      if (!autoSendRequestInFlightRef.current || loadingStartedAt === null) {
        clearAutoSendCaptchaFallbackInterval();
        return;
      }

      const elapsedMilliseconds = Date.now() - loadingStartedAt;
      if (elapsedMilliseconds < AUTO_SEND_CAPTCHA_FALLBACK_MINIMUM_MS) return;
      if (!hasRenderedClerkCaptchaChallenge()) return;

      autoSendRequestInFlightRef.current = false;
      clearAutoSendCaptchaFallbackInterval();
      setState((prev) => {
        if (prev.step !== "phone" || !prev.isLoading) return prev;
        return buildCaptchaRequiredState(prev);
      });
    }, AUTO_SEND_CAPTCHA_FALLBACK_CHECK_INTERVAL_MS);
  }, [clearAutoSendCaptchaFallbackInterval]);

  // Don't fire onSuccess until both: (1) we've moved to "completing" and
  // (2) Clerk's useUser() reflects isSignedIn === true. Without this guard
  // the redirect can happen before the session cookie is set, looping the
  // user back to the phone form.
  useEffect(() => {
    if (awaitingSessionRef.current && state.step === "completing" && isSignedIn) {
      triggerSuccess();
    }
  }, [state.step, isSignedIn, triggerSuccess]);

  useEffect(() => {
    return () => {
      clearResendCooldown();
      clearSessionActivationFallback();
      clearAutoSendCaptchaFallbackInterval();
    };
  }, [clearAutoSendCaptchaFallbackInterval, clearResendCooldown, clearSessionActivationFallback]);

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
    awaitingSessionRef.current = false;
    hasCompletedAuthenticationRef.current = false;
    clearResendCooldown();
    clearSessionActivationFallback();
    setState((prev) => ({
      ...prev,
      step: "phone",
      error: null,
      authMode: null,
      canResend: false,
      resendCooldown: 0,
    }));
  }, [clearResendCooldown, clearSessionActivationFallback]);

  const completeSessionActivation = useCallback(
    async (activateSession: SessionActivator, createdSessionId: string) => {
      setState((prev) => ({ ...prev, step: "completing" }));
      awaitingSessionRef.current = true;
      await activateSession({ session: createdSessionId });
      scheduleSessionActivationFallback();
    },
    [scheduleSessionActivationFallback],
  );

  const startResendCooldown = useCallback(() => {
    setState((prev) => ({
      ...prev,
      canResend: false,
      resendCooldown: RESEND_COOLDOWN_SECONDS,
    }));

    if (cooldownTimerRef.current) {
      clearResendCooldown();
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
  }, [clearResendCooldown]);

  const sendVerificationCode = useCallback(async () => {
    if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) return;

    const fullPhone = `${state.countryCode}${digitsOnly(state.phoneNumber)}`;
    awaitingSessionRef.current = false;
    hasCompletedAuthenticationRef.current = false;
    clearSessionActivationFallback();
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
          await signUp.create({ phoneNumber: fullPhone, legalAccepted: true });
          await signUp.preparePhoneNumberVerification();
          setState((prev) => ({
            ...prev,
            step: "verification",
            isLoading: false,
            authMode: "signup",
          }));
          startResendCooldown();
        } catch (signUpError) {
          if (isBotProtectionError(signUpError)) {
            enterCaptchaStep();
            return;
          }

          const error = mapClerkErrorToPhoneAuth(signUpError);
          setState((prev) => ({ ...prev, isLoading: false, error }));
          onError?.(error);
        }
      } else {
        if (isBotProtectionError(signInError)) {
          enterCaptchaStep();
          return;
        }

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
    clearSessionActivationFallback,
    enterCaptchaStep,
    onError,
  ]);

  useEffect(() => {
    if (!autoSendInitialCode || hasAutoSentInitialCodeRef.current) return;
    if (state.step !== "phone") return;
    if (!digitsOnly(state.phoneNumber)) return;
    if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) return;

    hasAutoSentInitialCodeRef.current = true;
    autoSendRequestInFlightRef.current = true;
    startAutoSendCaptchaFallbackInterval();
    void sendVerificationCode().finally(() => {
      autoSendRequestInFlightRef.current = false;
      clearAutoSendCaptchaFallbackInterval();
    });
  }, [
    autoSendInitialCode,
    clearAutoSendCaptchaFallbackInterval,
    isSignInLoaded,
    isSignUpLoaded,
    sendVerificationCode,
    signIn,
    signUp,
    startAutoSendCaptchaFallbackInterval,
    state.phoneNumber,
    state.step,
  ]);

  const verifyCode = useCallback(
    async (code: string) => {
      if (
        !isSignInLoaded ||
        !isSignUpLoaded ||
        !signIn ||
        !signUp ||
        !setSignInActive ||
        !setSignUpActive
      ) {
        return;
      }

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
                error: buildMissingSessionError(),
              }));
              return;
            }
            await completeSessionActivation(setSignInActive, result.createdSessionId);
          } else {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: buildIncompleteSignInError(result.status),
            }));
          }
        } else {
          let result = await signUp.attemptPhoneNumberVerification({ code });
          if (result.status === "missing_requirements" && isOnlyMissingLegalAcceptance(result)) {
            result = await signUp.update({ legalAccepted: true });
          }

          if (result.status === "complete") {
            if (!result.createdSessionId) {
              setState((prev) => ({
                ...prev,
                isLoading: false,
                error: buildMissingSessionError(),
              }));
              return;
            }
            await completeSessionActivation(setSignUpActive, result.createdSessionId);
          } else {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: buildIncompleteSignUpError(result),
            }));
          }
        }
      } catch (error) {
        if (isBotProtectionError(error)) {
          enterCaptchaStep();
          return;
        }

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
      completeSessionActivation,
      enterCaptchaStep,
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
      if (isBotProtectionError(error)) {
        enterCaptchaStep();
        return;
      }

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
    enterCaptchaStep,
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
