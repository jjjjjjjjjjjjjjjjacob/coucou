import { WEBHOOK_SIGNATURE_TOLERANCE_SECONDS } from "./constants";
import type { CoucouWebhookEnvelope, CoucouWebhookPayload } from "./types";

/**
 * Consumer-side verification and decryption for coucou webhooks.
 *
 * Pure WebCrypto — works on Node >= 18, edge runtimes, bun, and browsers.
 * Must stay byte-compatible with the producer implementation in
 * packages/backend/convex/lib/webhookCrypto.ts.
 *
 * Recommended handling order for an incoming delivery:
 *   1. verifyCoucouWebhookSignature(...) — reject with 400 on failure
 *   2. decryptCoucouWebhookEnvelope(...) — reject with 400 on failure
 *   3. dedupe on payload.deliveryId (retries reuse the same id)
 */

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

export function parseCoucouSignatureHeader(
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

/**
 * Verify the X-Coucou-Signature header over the raw (encrypted) request body.
 * Returns false for malformed headers, stale timestamps (replay protection),
 * and signature mismatches.
 */
export async function verifyCoucouWebhookSignature({
  rawBody,
  signatureHeader,
  signingSecretBase64,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
}: {
  rawBody: string;
  signatureHeader: string;
  signingSecretBase64: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const parsedHeader = parseCoucouSignatureHeader(signatureHeader);
  if (!parsedHeader) {
    return false;
  }
  if (Math.abs(nowSeconds - parsedHeader.timestampSeconds) > toleranceSeconds) {
    return false;
  }

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
    new TextEncoder().encode(`${parsedHeader.timestampSeconds}.${rawBody}`),
  );
  const expectedSignatureHex = bytesToHex(new Uint8Array(signatureBytes));
  return timingSafeEqualStrings(expectedSignatureHex, parsedHeader.signatureHex);
}

/**
 * Decrypt a webhook request body (the JSON envelope) into the typed payload.
 * Throws on malformed envelopes and on AES-GCM authentication failure
 * (tampered or wrongly-keyed ciphertext).
 */
export async function decryptCoucouWebhookEnvelope({
  rawBody,
  encryptionSecretBase64,
}: {
  rawBody: string;
  encryptionSecretBase64: string;
}): Promise<CoucouWebhookPayload> {
  let envelope: CoucouWebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    throw new Error("Webhook body is not valid JSON");
  }
  if (envelope.encryption !== "aes-256-gcm" || !envelope.iv || !envelope.ciphertext) {
    throw new Error("Webhook body is not a coucou webhook envelope");
  }

  const aesKey = await globalThis.crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(encryptionSecretBase64),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(envelope.iv) },
    aesKey,
    base64UrlToBytes(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as CoucouWebhookPayload;
}
