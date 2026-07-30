import { describe, expect, it } from "bun:test";
// The producer implementation — sdk consumer helpers must stay byte-compatible.
import {
  buildWebhookEnvelope,
  buildWebhookSignatureHeader,
  generateWebhookEndpointSecrets,
} from "../../backend/convex/lib/webhookCrypto";
import { API_VERSION } from "../src/api-v1/constants";
import {
  decryptCoucouWebhookEnvelope,
  parseCoucouSignatureHeader,
  verifyCoucouWebhookSignature,
} from "../src/api-v1/webhook-consumer";

const SAMPLE_PAYLOAD = {
  apiVersion: API_VERSION,
  eventType: "rsvp.created",
  deliveryId: "delivery_123",
  occurredAt: 1752700000000,
  workspaceSlug: "club-chlorine",
  data: {
    event: { id: "evt_1", name: "Test Event" },
    identity: { phone: "+15551234567", isGuest: true },
    origin: { type: "app" },
  },
};

async function buildSignedDelivery() {
  const secrets = generateWebhookEndpointSecrets();
  const envelope = await buildWebhookEnvelope(
    JSON.stringify(SAMPLE_PAYLOAD),
    secrets.encryptionSecretBase64,
    1,
  );
  const rawBody = JSON.stringify(envelope);
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const signatureHeader = await buildWebhookSignatureHeader(
    rawBody,
    secrets.signingSecretBase64,
    timestampSeconds,
  );
  return { secrets, rawBody, signatureHeader, timestampSeconds };
}

describe("coucou webhook consumer helpers", () => {
  it("verifies and decrypts a producer-built delivery end to end", async () => {
    const { secrets, rawBody, signatureHeader } = await buildSignedDelivery();

    expect(
      await verifyCoucouWebhookSignature({
        rawBody,
        signatureHeader,
        signingSecretBase64: secrets.signingSecretBase64,
      }),
    ).toBe(true);

    const payload = await decryptCoucouWebhookEnvelope({
      rawBody,
      encryptionSecretBase64: secrets.encryptionSecretBase64,
    });
    expect(payload).toEqual(SAMPLE_PAYLOAD);
    expect(payload.apiVersion).toBe(API_VERSION);
  });

  it("rejects tampered bodies", async () => {
    const { secrets, rawBody, signatureHeader } = await buildSignedDelivery();
    const tamperedBody = rawBody.replace('"keyGeneration":1', '"keyGeneration":2');

    expect(
      await verifyCoucouWebhookSignature({
        rawBody: tamperedBody,
        signatureHeader,
        signingSecretBase64: secrets.signingSecretBase64,
      }),
    ).toBe(false);
  });

  it("rejects expired signatures", async () => {
    const { secrets, rawBody, signatureHeader, timestampSeconds } = await buildSignedDelivery();

    expect(
      await verifyCoucouWebhookSignature({
        rawBody,
        signatureHeader,
        signingSecretBase64: secrets.signingSecretBase64,
        nowSeconds: timestampSeconds + 301,
      }),
    ).toBe(false);

    expect(
      await verifyCoucouWebhookSignature({
        rawBody,
        signatureHeader,
        signingSecretBase64: secrets.signingSecretBase64,
        nowSeconds: timestampSeconds + 299,
      }),
    ).toBe(true);
  });

  it("throws on tampered ciphertext and wrong encryption secrets", async () => {
    const { secrets, rawBody } = await buildSignedDelivery();
    const envelope = JSON.parse(rawBody);
    const flippedCharacter = envelope.ciphertext[0] === "A" ? "B" : "A";
    const tamperedEnvelope = {
      ...envelope,
      ciphertext: flippedCharacter + envelope.ciphertext.slice(1),
    };

    await expect(
      decryptCoucouWebhookEnvelope({
        rawBody: JSON.stringify(tamperedEnvelope),
        encryptionSecretBase64: secrets.encryptionSecretBase64,
      }),
    ).rejects.toThrow();

    const otherSecrets = generateWebhookEndpointSecrets();
    await expect(
      decryptCoucouWebhookEnvelope({
        rawBody,
        encryptionSecretBase64: otherSecrets.encryptionSecretBase64,
      }),
    ).rejects.toThrow();
  });

  it("parses and rejects signature headers", () => {
    expect(parseCoucouSignatureHeader("t=1752700000,v1=abc123")).toEqual({
      timestampSeconds: 1752700000,
      signatureHex: "abc123",
    });
    expect(parseCoucouSignatureHeader("garbage")).toBeNull();
    expect(parseCoucouSignatureHeader("t=notanumber,v1=abc")).toBeNull();
  });
});
