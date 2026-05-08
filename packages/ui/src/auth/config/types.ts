// Phone-auth state machine types. Ported from
// the-market/apps/web/src/components/phone-auth/config/types.ts.

export type PhoneAuthStep = "phone" | "verification" | "completing";

export interface PhoneAuthError {
  type: "invalid_code" | "expired_code" | "rate_limit" | "invalid_phone" | "network" | "unknown";
  message: string;
}

export interface PhoneAuthState {
  step: PhoneAuthStep;
  phoneNumber: string;
  countryCode: string;
  isLoading: boolean;
  error: PhoneAuthError | null;
  canResend: boolean;
  resendCooldown: number;
  /** Whether we're signing in (existing user) or signing up (new user) */
  authMode: "signin" | "signup" | null;
}

export interface CountryOption {
  /** Dial code, e.g., "+1" */
  code: string;
  /** Country name, e.g., "United States" */
  country: string;
  /** ISO code, e.g., "US" */
  iso: string;
  /** Flag emoji */
  flag: string;
}

export const initialPhoneAuthState: PhoneAuthState = {
  step: "phone",
  phoneNumber: "",
  countryCode: "+1",
  isLoading: false,
  error: null,
  canResend: false,
  resendCooldown: 0,
  authMode: null,
};
