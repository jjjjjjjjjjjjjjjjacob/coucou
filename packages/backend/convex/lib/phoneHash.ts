import { formatPhoneNumberForSms } from "./phoneUtils";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashNormalizedPhoneNumber(normalizedPhoneNumber: string): Promise<string> {
  const encodedValue = new TextEncoder().encode(normalizedPhoneNumber);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encodedValue);
  return bytesToHex(new Uint8Array(digest));
}

export async function normalizeAndHashPhoneNumber(phoneNumber: string): Promise<{
  normalizedPhoneNumber: string;
  phoneHash: string;
}> {
  const normalizedPhoneNumber = formatPhoneNumberForSms(phoneNumber);
  const phoneHash = await hashNormalizedPhoneNumber(normalizedPhoneNumber);

  return {
    normalizedPhoneNumber,
    phoneHash,
  };
}
