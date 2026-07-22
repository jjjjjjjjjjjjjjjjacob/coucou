import { hashOpaqueValue } from "./phoneHash";

export const API_CLIENT_KEY_PREFIX = "coucou_sk_";
export const API_CLIENT_KEY_DISPLAY_PREFIX_LENGTH = 14;

export const API_CLIENT_SCOPES = [
  "events:read",
  "events:write",
  "rsvps:read",
  "rsvps:write",
] as const;

export type ApiClientScope = (typeof API_CLIENT_SCOPES)[number];

export function isApiClientScope(value: string): value is ApiClientScope {
  return (API_CLIENT_SCOPES as readonly string[]).includes(value);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binaryString = "";
  for (const byte of bytes) {
    binaryString += String.fromCharCode(byte);
  }
  return btoa(binaryString).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function generateApiClientKey(): {
  plaintextKey: string;
  keyPrefix: string;
} {
  const randomBytes = new Uint8Array(30);
  globalThis.crypto.getRandomValues(randomBytes);
  const plaintextKey = `${API_CLIENT_KEY_PREFIX}${bytesToBase64Url(randomBytes)}`;
  return {
    plaintextKey,
    keyPrefix: plaintextKey.slice(0, API_CLIENT_KEY_DISPLAY_PREFIX_LENGTH),
  };
}

export async function hashApiClientKey(plaintextKey: string): Promise<string> {
  return await hashOpaqueValue(plaintextKey);
}
