import { describe, expect, it } from "bun:test";
import {
  normalizeCredentialPassword,
  passwordMatchesCredential,
} from "../convex/lib/credentialPasswords";

describe("Credential password helpers", () => {
  describe("normalizeCredentialPassword", () => {
    it("normalizes case and trims surrounding whitespace", () => {
      expect(normalizeCredentialPassword("  CouCou  ")).toBe("coucou");
      expect(normalizeCredentialPassword("VIP-LIST")).toBe("vip-list");
    });

    it("preserves internal spaces and punctuation", () => {
      expect(normalizeCredentialPassword("Back Stage! 123")).toBe(
        "back stage! 123",
      );
    });
  });

  describe("passwordMatchesCredential", () => {
    it("matches stored event passwords case-insensitively", () => {
      expect(passwordMatchesCredential("couCOU", "Coucou")).toBe(true);
      expect(passwordMatchesCredential("  VIP  ", "vip")).toBe(true);
    });

    it("rejects different passwords and missing stored values", () => {
      expect(passwordMatchesCredential("general", "vip")).toBe(false);
      expect(passwordMatchesCredential("general", undefined)).toBe(false);
    });
  });
});
