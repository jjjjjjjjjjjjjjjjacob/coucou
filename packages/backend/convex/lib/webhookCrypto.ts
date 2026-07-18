import { API_VERSION } from "@coucou/sdk/api-v1";

/**
 * Webhook payload crypto for the partner API.
 *
 * Scheme: AES-256-GCM payload encryption + HMAC-SHA256 request signing, using
 * two independent per-endpoint secrets. Pure WebCrypto so the same code runs in
 * the Convex runtime, Node >= 18, edge runtimes, and bun. The consumer-side
 * counterparts live in @coucou/sdk (api-v1/webhook-consumer) and must stay
 * byte-compatible with this file.
 */

const GCM_IV_LENGTH_BYTES = 12;
const ENDPOINT_SECRET_LENGTH_BYTES = 32;

export interface WebhookEnvelope {
  apiVersion: string;
  encryption: "aes-256-gcm";
  keyGeneration: number;
  iv: string; // base64url, 12 bytes
  ciphertext: string; // base64url, ciphertext || 16-byte GCM tag
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binaryString = "";
  for (const byte of bytes) {
    binaryString += String.fromCharCode(byte);
  }
  return btoa(binaryString).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(base64Url: string) {
  const base64 = base64Url.replaceAll("-", "+").replaceAll("_", "/");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binaryString.length));
  for (let index = 0; index < binaryString.length; index++) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateWebhookEndpointSecrets(): {
  encryptionSecretBase64: string;
  signingSecretBase64: string;
} {
  const encryptionSecretBytes = new Uint8Array(ENDPOINT_SECRET_LENGTH_BYTES);
  const signingSecretBytes = new Uint8Array(ENDPOINT_SECRET_LENGTH_BYTES);
  globalThis.crypto.getRandomValues(encryptionSecretBytes);
  globalThis.crypto.getRandomValues(signingSecretBytes);
  return {
    encryptionSecretBase64: bytesToBase64Url(encryptionSecretBytes),
    signingSecretBase64: bytesToBase64Url(signingSecretBytes),
  };
}

async function importAesGcmKey(encryptionSecretBase64: string): Promise<CryptoKey> {
  const secretBytes = base64UrlToBytes(encryptionSecretBase64);
  return await globalThis.crypto.subtle.importKey("raw", secretBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function buildWebhookEnvelope(
  payloadJson: string,
  encryptionSecretBase64: string,
  keyGeneration: number,
): Promise<WebhookEnvelope> {
  const aesKey = await importAesGcmKey(encryptionSecretBase64);
  const initializationVector = new Uint8Array(GCM_IV_LENGTH_BYTES);
  globalThis.crypto.getRandomValues(initializationVector);

  // WebCrypto appends the 16-byte GCM auth tag to the ciphertext, so the
  // envelope carries a single field that subtle.decrypt accepts directly.
  const ciphertextWithTag = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: initializationVector },
      aesKey,
      new TextEncoder().encode(payloadJson),
    ),
  );

  return {
    apiVersion: API_VERSION,
    encryption: "aes-256-gcm",
    keyGeneration,
    iv: bytesToBase64Url(initializationVector),
    ciphertext: bytesToBase64Url(ciphertextWithTag),
  };
}

export async function decryptWebhookEnvelope(
  envelope: Pick<WebhookEnvelope, "iv" | "ciphertext">,
  encryptionSecretBase64: string,
): Promise<string> {
  const aesKey = await importAesGcmKey(encryptionSecretBase64);
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(envelope.iv) },
    aesKey,
    base64UrlToBytes(envelope.ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

async function computeSignatureHex(
  signingSecretBase64: string,
  signedContent: string,
): Promise<string> {
  const hmacKey = await globalThis.crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(signingSecretBase64),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await globalThis.crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(signedContent),
  );
  return bytesToHex(new Uint8Array(signatureBytes));
}

export async function buildWebhookSignatureHeader(
  rawBody: string,
  signingSecretBase64: string,
  timestampSeconds: number,
): Promise<string> {
  const signatureHex = await computeSignatureHex(
    signingSecretBase64,
    `${timestampSeconds}.${rawBody}`,
  );
  return `t=${timestampSeconds},v1=${signatureHex}`;
}

export function parseWebhookSignatureHeader(
  signatureHeader: string,
): { timestampSeconds: number; signatureHex: string } | null {
  const parts = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, ...valueParts] = part.trim().split("=");
      return [key, valueParts.join("=")] as const;
    }),
  );
  const timestampSeconds = Number.parseInt(parts.get("t") ?? "", 10);
  const signatureHex = parts.get("v1");
  if (Number.isNaN(timestampSeconds) || !signatureHex) {
    return null;
  }
  return { timestampSeconds, signatureHex };
}

function timingSafeEqualStrings(firstValue: string, secondValue: string): boolean {
  if (firstValue.length !== secondValue.length) {
    return false;
  }
  let differenceAccumulator = 0;
  for (let index = 0; index < firstValue.length; index++) {
    differenceAccumulator |= firstValue.charCodeAt(index) ^ secondValue.charCodeAt(index);
  }
  return differenceAccumulator === 0;
}

export async function verifyWebhookSignatureHeader({
  rawBody,
  signatureHeader,
  signingSecretBase64,
  nowSeconds,
  toleranceSeconds,
}: {
  rawBody: string;
  signatureHeader: string;
  signingSecretBase64: string;
  nowSeconds: number;
  toleranceSeconds: number;
}): Promise<boolean> {
  const parsedHeader = parseWebhookSignatureHeader(signatureHeader);
  if (!parsedHeader) {
    return false;
  }
  if (Math.abs(nowSeconds - parsedHeader.timestampSeconds) > toleranceSeconds) {
    return false;
  }
  const expectedSignatureHex = await computeSignatureHex(
    signingSecretBase64,
    `${parsedHeader.timestampSeconds}.${rawBody}`,
  );
  return timingSafeEqualStrings(expectedSignatureHex, parsedHeader.signatureHex);
}
