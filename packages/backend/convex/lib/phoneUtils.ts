/**
 * Shared phone number utilities
 * Consolidated phone number formatting and display helpers.
 */

/**
 * Formats a phone number to E.164 international format
 * Required for Twilio SMS sending
 * @param phoneNumber - Raw phone number input
 * @returns E.164 formatted phone number (e.g., +15551234567)
 * @throws Error if phone number is invalid
 */
export function formatPhoneNumberForSms(phoneNumber: string): string {
  if (!phoneNumber) {
    throw new Error("Phone number is required");
  }

  // Remove all non-digits
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (digitsOnly.length === 0) {
    throw new Error("Phone number must contain digits");
  }

  // Handle US numbers (10 digits or 11 with country code)
  if (digitsOnly.length === 10) {
    // Assume US number, add country code
    return `+1${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    // US number with country code
    return `+${digitsOnly}`;
  } else if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
    // International number, ensure it has + prefix
    return `+${digitsOnly}`;
  } else {
    throw new Error("Invalid phone number length");
  }
}

/**
 * Obfuscates a phone number for display purposes
 * Shows only the last 4 digits: ***-***-1234
 * @param phoneNumber - Phone number to obfuscate
 * @returns Obfuscated phone number string
 */
export function obfuscatePhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return "";

  // Remove all non-digits
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (digitsOnly.length < 4) {
    return "*".repeat(digitsOnly.length);
  }

  // Show last 4 digits with standard formatting
  const lastFour = digitsOnly.slice(-4);

  if (digitsOnly.length === 10) {
    // US format: ***-***-1234
    return `***-***-${lastFour}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    // US with country code: +1-***-***-1234
    return `+1-***-***-${lastFour}`;
  } else {
    // International format: +***...-1234
    return `+${"*".repeat(Math.max(1, digitsOnly.length - 4))}-${lastFour}`;
  }
}
