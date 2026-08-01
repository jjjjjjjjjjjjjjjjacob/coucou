import { describe, expect, it } from "vitest";
import {
  API_CLIENT_KEY_DISPLAY_PREFIX_LENGTH,
  API_CLIENT_KEY_PREFIX,
  API_CLIENT_SCOPES,
  generateApiClientKey,
  hashApiClientKey,
  isApiClientScope,
} from "../convex/lib/apiKeys";

describe("generateApiClientKey", () => {
  it("produces keys with the coucou_sk_ prefix", () => {
    const { plaintextKey } = generateApiClientKey();
    expect(plaintextKey.startsWith(API_CLIENT_KEY_PREFIX)).toBe(true);
  });

  it("produces a display prefix that matches the start of the key", () => {
    const { plaintextKey, keyPrefix } = generateApiClientKey();
    expect(keyPrefix).toBe(plaintextKey.slice(0, API_CLIENT_KEY_DISPLAY_PREFIX_LENGTH));
    expect(keyPrefix.length).toBe(API_CLIENT_KEY_DISPLAY_PREFIX_LENGTH);
  });

  it("produces url-safe key material with sufficient entropy", () => {
    const { plaintextKey } = generateApiClientKey();
    const keyMaterial = plaintextKey.slice(API_CLIENT_KEY_PREFIX.length);
    expect(keyMaterial).toMatch(/^[A-Za-z0-9_-]+$/);
    // 30 random bytes → 40 base64url characters
    expect(keyMaterial.length).toBe(40);
  });

  it("produces unique keys", () => {
    const generatedKeys = new Set(
      Array.from({ length: 50 }, () => generateApiClientKey().plaintextKey),
    );
    expect(generatedKeys.size).toBe(50);
  });
});

describe("hashApiClientKey", () => {
  it("is deterministic and hex-encoded", async () => {
    const { plaintextKey } = generateApiClientKey();
    const firstHash = await hashApiClientKey(plaintextKey);
    const secondHash = await hashApiClientKey(plaintextKey);
    expect(firstHash).toBe(secondHash);
    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different keys", async () => {
    const firstHash = await hashApiClientKey(generateApiClientKey().plaintextKey);
    const secondHash = await hashApiClientKey(generateApiClientKey().plaintextKey);
    expect(firstHash).not.toBe(secondHash);
  });
});

describe("isApiClientScope", () => {
  it("accepts every declared scope", () => {
    for (const scope of API_CLIENT_SCOPES) {
      expect(isApiClientScope(scope)).toBe(true);
    }
  });

  it("rejects unknown scopes", () => {
    expect(isApiClientScope("events:delete")).toBe(false);
    expect(isApiClientScope("admin")).toBe(false);
    expect(isApiClientScope("")).toBe(false);
  });
});
