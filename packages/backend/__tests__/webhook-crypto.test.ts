import { describe, expect, it } from "bun:test";
import {
  buildWebhookEnvelope,
  buildWebhookSignatureHeader,
  decryptWebhookEnvelope,
  generateWebhookEndpointSecrets,
  parseWebhookSignatureHeader,
  verifyWebhookSignatureHeader,
} from "../convex/lib/webhookCrypto";

const SAMPLE_PAYLOAD_JSON = JSON.stringify({
  eventType: "rsvp.created",
  data: { identity: { phone: "+15551234567" } },
});

describe("webhook payload encryption", () => {
  it("round-trips a payload through encrypt and decrypt", async () => {
    const { encryptionSecretBase64 } = generateWebhookEndpointSecrets();
    const envelope = await buildWebhookEnvelope(SAMPLE_PAYLOAD_JSON, encryptionSecretBase64, 1);

    expect(envelope.encryption).toBe("aes-256-gcm");
    expect(envelope.keyGeneration).toBe(1);
    expect(envelope.ciphertext).not.toContain("+15551234567");

    const decryptedJson = await decryptWebhookEnvelope(envelope, encryptionSecretBase64);
    expect(decryptedJson).toBe(SAMPLE_PAYLOAD_JSON);
  });

  it("uses a fresh IV per envelope", async () => {
    const { encryptionSecretBase64 } = generateWebhookEndpointSecrets();
    const firstEnvelope = await buildWebhookEnvelope(
      SAMPLE_PAYLOAD_JSON,
      encryptionSecretBase64,
      1,
    );
    const secondEnvelope = await buildWebhookEnvelope(
      SAMPLE_PAYLOAD_JSON,
      encryptionSecretBase64,
      1,
    );
    expect(firstEnvelope.iv).not.toBe(secondEnvelope.iv);
    expect(firstEnvelope.ciphertext).not.toBe(secondEnvelope.ciphertext);
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const { encryptionSecretBase64 } = generateWebhookEndpointSecrets();
    const envelope = await buildWebhookEnvelope(SAMPLE_PAYLOAD_JSON, encryptionSecretBase64, 1);

    const firstCharacter = envelope.ciphertext[0] === "A" ? "B" : "A";
    const tamperedEnvelope = {
      ...envelope,
      ciphertext: firstCharacter + envelope.ciphertext.slice(1),
    };

    await expect(
      decryptWebhookEnvelope(tamperedEnvelope, encryptionSecretBase64),
    ).rejects.toThrow();
  });

  it("fails to decrypt with the wrong secret", async () => {
    const { encryptionSecretBase64 } = generateWebhookEndpointSecrets();
    const otherSecrets = generateWebhookEndpointSecrets();
    const envelope = await buildWebhookEnvelope(SAMPLE_PAYLOAD_JSON, encryptionSecretBase64, 1);
    await expect(
      decryptWebhookEnvelope(envelope, otherSecrets.encryptionSecretBase64),
    ).rejects.toThrow();
  });
});

describe("webhook signature", () => {
  it("builds a parseable Stripe-style header and verifies it", async () => {
    const { signingSecretBase64 } = generateWebhookEndpointSecrets();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const rawBody = '{"hello":"world"}';

    const signatureHeader = await buildWebhookSignatureHeader(
      rawBody,
      signingSecretBase64,
      nowSeconds,
    );
    expect(parseWebhookSignatureHeader(signatureHeader)).toEqual({
      timestampSeconds: nowSeconds,
      signatureHex: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    expect(
      await verifyWebhookSignatureHeader({
        rawBody,
        signatureHeader,
        signingSecretBase64,
        nowSeconds,
        toleranceSeconds: 300,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body and a wrong secret", async () => {
    const { signingSecretBase64 } = generateWebhookEndpointSecrets();
    const otherSecrets = generateWebhookEndpointSecrets();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const rawBody = '{"hello":"world"}';
    const signatureHeader = await buildWebhookSignatureHeader(
      rawBody,
      signingSecretBase64,
      nowSeconds,
    );

    expect(
      await verifyWebhookSignatureHeader({
        rawBody: '{"hello":"tampered"}',
        signatureHeader,
        signingSecretBase64,
        nowSeconds,
        toleranceSeconds: 300,
      }),
    ).toBe(false);

    expect(
      await verifyWebhookSignatureHeader({
        rawBody,
        signatureHeader,
        signingSecretBase64: otherSecrets.signingSecretBase64,
        nowSeconds,
        toleranceSeconds: 300,
      }),
    ).toBe(false);
  });

  it("rejects timestamps outside the tolerance window", async () => {
    const { signingSecretBase64 } = generateWebhookEndpointSecrets();
    const signedAtSeconds = Math.floor(Date.now() / 1000) - 1000;
    const rawBody = '{"hello":"world"}';
    const signatureHeader = await buildWebhookSignatureHeader(
      rawBody,
      signingSecretBase64,
      signedAtSeconds,
    );

    expect(
      await verifyWebhookSignatureHeader({
        rawBody,
        signatureHeader,
        signingSecretBase64,
        nowSeconds: signedAtSeconds + 1000,
        toleranceSeconds: 300,
      }),
    ).toBe(false);
  });

  it("rejects malformed headers", () => {
    expect(parseWebhookSignatureHeader("not-a-header")).toBeNull();
    expect(parseWebhookSignatureHeader("t=abc,v1=")).toBeNull();
  });
});
