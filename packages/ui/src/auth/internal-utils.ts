import type { PhoneAuthError } from "./config/types";

interface ClerkApiErrorShape {
  errors?: Array<{
    code?: string;
    message?: string;
    longMessage?: string;
  }>;
}

export function combineClassNames(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

export function getClerkErrorCode(error: unknown): string | undefined {
  return (error as ClerkApiErrorShape | null | undefined)?.errors?.[0]?.code;
}

export function getClerkErrorMessage(error: unknown): string | undefined {
  const firstError = (error as ClerkApiErrorShape | null | undefined)?.errors?.[0];
  return firstError?.longMessage ?? firstError?.message;
}

/**
 * Map Clerk API errors into the small PhoneAuthError type so the UI can
 * react with friendlier copy. Mirrors the-market's mapping with a few small
 * tweaks for the Coucou tone of voice.
 */
export function mapClerkErrorToPhoneAuth(error: unknown): PhoneAuthError {
  const code = getClerkErrorCode(error) ?? "";
  const fallbackMessage = getClerkErrorMessage(error);

  switch (code) {
    case "form_code_incorrect":
      return {
        type: "invalid_code",
        message: "That code didn't match. Try again.",
      };
    case "verification_expired":
      return {
        type: "expired_code",
        message: "Code expired. Send a new one.",
      };
    case "too_many_requests":
      return {
        type: "rate_limit",
        message: "Too many attempts. Wait a minute and try again.",
      };
    case "form_identifier_not_found":
      return {
        type: "invalid_phone",
        message: fallbackMessage ?? "We couldn't find that number.",
      };
    case "form_param_format_invalid":
    case "form_param_nil":
    case "form_identifier_exists":
      return {
        type: "invalid_phone",
        message: fallbackMessage ?? "Please enter a valid phone number.",
      };
    default:
      return {
        type: "unknown",
        message: fallbackMessage ?? "Something went wrong. Please try again.",
      };
  }
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isPhoneNumberLikelyValid(value: string, countryCode: string): boolean {
  const digits = digitsOnly(value);
  if (countryCode === "+1") {
    return digits.length >= 10;
  }
  return digits.length >= 8;
}

export function formatPhoneNumberForDisplay(value: string, countryCode: string): string {
  const digits = digitsOnly(value);
  if (countryCode === "+1") {
    let formatted = "";
    if (digits.length > 0) {
      formatted = digits.substring(0, 3);
    }
    if (digits.length > 3) {
      formatted += ` ${digits.substring(3, 6)}`;
    }
    if (digits.length > 6) {
      formatted += ` ${digits.substring(6, 10)}`;
    }
    return formatted;
  }
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}
