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
const CODE_REQUEST_COOLDOWN_KEY = "phone-auth-code-request-cooldown";

function readCodeRequestCooldown(): number {
  try {
    const timestamp = Number(sessionStorage.getItem(CODE_REQUEST_COOLDOWN_KEY));
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
}

function clerkRetryAfterSeconds(error: unknown): number {
  if (typeof error !== "object" || error === null || !("retryAfter" in error)) return 0;
  return typeof error.retryAfter === "number" && Number.isFinite(error.retryAfter)
    ? Math.max(0, error.retryAfter)
    : 0;
}
function hasPendingPhoneCode(
  verification:
    | {
        strategy: string | null;
        status: string | null;
        expireAt: Date | null;
      }
    | undefined,
): boolean {
  return (
    verification?.strategy === "phone_code" &&
    verification.status === "unverified" &&
    verification.expireAt !== null &&
    verification.expireAt.getTime() > Date.now()
  );
}

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
    message: "The security check didn't finish. Please try sending the code again.",
  };
}

function buildCaptchaRequiredState(previousState: PhoneAuthState): PhoneAuthState {
  return {
    ...previousState,
    step: hasRenderedClerkCaptchaChallenge() ? "captcha" : "phone",
    isLoading: false,
    authMode: null,
    error: buildBotProtectionRequiredError(),
  };
}

function hasRenderedClerkCaptchaChallenge(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const captchaElement = document.getElementById("clerk-captcha");
  if (!captchaElement) return false;
  return Array.from(captchaElement.children).some((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      bounds.width > 20 &&
      bounds.height > 20 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  });
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
  const verificationRequestIdRef = useRef(0);
  const codeVerificationInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const codeRequestCooldownUntilRef = useRef(readCodeRequestCooldown());

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

      clearAutoSendCaptchaFallbackInterval();
      setState((prev) => {
        if (prev.step !== "phone" || !prev.isLoading) return prev;
        return { ...prev, step: "captcha", error: null };
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
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
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
    verificationRequestIdRef.current += 1;
    autoSendRequestInFlightRef.current = false;
    clearAutoSendCaptchaFallbackInterval();
    awaitingSessionRef.current = false;
    hasCompletedAuthenticationRef.current = false;
    clearSessionActivationFallback();
    setState((prev) => ({
      ...prev,
      step: "phone",
      isLoading: false,
      error: null,
      authMode: null,
    }));
  }, [clearAutoSendCaptchaFallbackInterval, clearResendCooldown, clearSessionActivationFallback]);

  const clearVerifiedCodeRequest = useCallback(() => {
    clearResendCooldown();
    codeRequestCooldownUntilRef.current = 0;
    try {
      sessionStorage.removeItem(CODE_REQUEST_COOLDOWN_KEY);
    } catch {
      /* Storage is optional. */
    }
    setState((previous) => ({ ...previous, resendCooldown: 0, canResend: false }));
  }, [clearResendCooldown]);

  const completeSessionActivation = useCallback(
    async (activateSession: SessionActivator, createdSessionId: string) => {
      // Clerk returned a completed verification. A later sign-in starts a new request lifecycle.
      clearVerifiedCodeRequest();
      setState((prev) => ({ ...prev, step: "completing" }));
      awaitingSessionRef.current = true;
      await activateSession({ session: createdSessionId });
      scheduleSessionActivationFallback();
    },
    [clearVerifiedCodeRequest, scheduleSessionActivationFallback],
  );

  const startResendCooldown = useCallback(
    (seconds = RESEND_COOLDOWN_SECONDS) => {
      codeRequestCooldownUntilRef.current = Math.max(
        codeRequestCooldownUntilRef.current,
        Date.now() + seconds * 1000,
      );
      try {
        sessionStorage.setItem(
          CODE_REQUEST_COOLDOWN_KEY,
          String(codeRequestCooldownUntilRef.current),
        );
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
      clearResendCooldown();
      const updateCooldown = () => {
        const remainingSeconds = Math.max(
          0,
          Math.ceil((codeRequestCooldownUntilRef.current - Date.now()) / 1000),
        );
        setState((previous) => ({
          ...previous,
          canResend: remainingSeconds === 0,
          resendCooldown: remainingSeconds,
        }));
        if (remainingSeconds === 0) clearResendCooldown();
      };
      updateCooldown();
      if (codeRequestCooldownUntilRef.current > Date.now())
        cooldownTimerRef.current = setInterval(updateCooldown, 1000);
    },
    [clearResendCooldown],
  );

  useEffect(() => {
    if (codeRequestCooldownUntilRef.current > Date.now()) startResendCooldown(0);
  }, [startResendCooldown]);

  const resumePendingPhoneVerification = useCallback(() => {
    const fullPhoneDigits = digitsOnly(`${state.countryCode}${state.phoneNumber}`);
    const authMode =
      signIn?.status === "needs_first_factor" &&
      digitsOnly(signIn.identifier ?? "") === fullPhoneDigits &&
      hasPendingPhoneCode(signIn.firstFactorVerification)
        ? "signin"
        : signUp?.status === "missing_requirements" &&
            digitsOnly(signUp.phoneNumber ?? "") === fullPhoneDigits &&
            hasPendingPhoneCode(signUp.verifications?.phoneNumber)
          ? "signup"
          : null;
    if (!authMode) return false;
    setState((previous) => ({
      ...previous,
      step: "verification",
      authMode,
      isLoading: false,
      error: null,
      canResend: codeRequestCooldownUntilRef.current <= Date.now(),
    }));
    return true;
  }, [signIn, signUp, state.countryCode, state.phoneNumber]);

  const sendVerificationCode = useCallback(async () => {
    if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) return;
    if (autoSendRequestInFlightRef.current) return;
    if (resumePendingPhoneVerification()) return;
    if (codeRequestCooldownUntilRef.current > Date.now()) {
      setState((previous) => ({ ...previous, isLoading: false }));
      return;
    }
    startResendCooldown();
    const verificationRequestId = ++verificationRequestIdRef.current;
    autoSendRequestInFlightRef.current = true;
    startAutoSendCaptchaFallbackInterval();

    const fullPhone = `${state.countryCode}${digitsOnly(state.phoneNumber)}`;
    awaitingSessionRef.current = false;
    hasCompletedAuthenticationRef.current = false;
    clearSessionActivationFallback();
    setState((prev) => ({ ...prev, step: "phone", isLoading: true, error: null }));

    try {
      await signIn.create({
        strategy: "phone_code",
        identifier: fullPhone,
      });
      if (!isMountedRef.current || verificationRequestId !== verificationRequestIdRef.current)
        return;
      setState((prev) => ({
        ...prev,
        step: "verification",
        isLoading: false,
        authMode: "signin",
        error: null,
      }));
      startResendCooldown();
    } catch (signInError) {
      if (!isMountedRef.current || verificationRequestId !== verificationRequestIdRef.current)
        return;
      const errorCode = getClerkErrorCode(signInError);
      if (errorCode === "form_identifier_not_found") {
        try {
          await signUp.create({ phoneNumber: fullPhone, legalAccepted: true });
          if (!isMountedRef.current || verificationRequestId !== verificationRequestIdRef.current)
            return;
          await signUp.preparePhoneNumberVerification();
          if (!isMountedRef.current || verificationRequestId !== verificationRequestIdRef.current)
            return;
          setState((prev) => ({
            ...prev,
            step: "verification",
            isLoading: false,
            authMode: "signup",
            error: null,
          }));
          startResendCooldown();
        } catch (signUpError) {
          if (!isMountedRef.current || verificationRequestId !== verificationRequestIdRef.current)
            return;
          startResendCooldown(clerkRetryAfterSeconds(signUpError));
          if (isBotProtectionError(signUpError)) {
            enterCaptchaStep();
            return;
          }

          const error = mapClerkErrorToPhoneAuth(signUpError);
          setState((prev) => ({ ...prev, isLoading: false, error }));
          onError?.(error);
        }
      } else {
        startResendCooldown(clerkRetryAfterSeconds(signInError));
        if (isBotProtectionError(signInError)) {
          enterCaptchaStep();
          return;
        }

        const error = mapClerkErrorToPhoneAuth(signInError);
        setState((prev) => ({ ...prev, isLoading: false, error }));
        onError?.(error);
      }
    } finally {
      if (verificationRequestId === verificationRequestIdRef.current) {
        autoSendRequestInFlightRef.current = false;
        clearAutoSendCaptchaFallbackInterval();
      }
    }
  }, [
    resumePendingPhoneVerification,
    isSignInLoaded,
    isSignUpLoaded,
    signIn,
    signUp,
    state.countryCode,
    state.phoneNumber,
    startResendCooldown,
    clearSessionActivationFallback,
    clearAutoSendCaptchaFallbackInterval,
    startAutoSendCaptchaFallbackInterval,
    enterCaptchaStep,
    onError,
  ]);

  useEffect(() => {
    if (!autoSendInitialCode || hasAutoSentInitialCodeRef.current) return;
    if (state.step !== "phone") return;
    if (!digitsOnly(state.phoneNumber)) return;
    if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) return;

    hasAutoSentInitialCodeRef.current = true;
    void sendVerificationCode();
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

      if (codeVerificationInFlightRef.current || !state.authMode) return;
      codeVerificationInFlightRef.current = true;
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
      } finally {
        codeVerificationInFlightRef.current = false;
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
    if (
      !state.canResend ||
      autoSendRequestInFlightRef.current ||
      codeRequestCooldownUntilRef.current > Date.now()
    )
      return;
    if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) return;

    autoSendRequestInFlightRef.current = true;
    startResendCooldown();
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (state.authMode === "signin") {
        const phoneFactor = signIn.supportedFirstFactors?.find(
          (factor) => factor.strategy === "phone_code",
        );
        if (!phoneFactor) throw new Error("Please edit your phone number and request a new code.");
        await signIn.prepareFirstFactor({
          strategy: "phone_code",
          phoneNumberId: phoneFactor.phoneNumberId,
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
      startResendCooldown(clerkRetryAfterSeconds(error));
      onError?.(mappedError);
    } finally {
      autoSendRequestInFlightRef.current = false;
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
