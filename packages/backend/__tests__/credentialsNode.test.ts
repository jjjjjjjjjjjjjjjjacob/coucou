import { describe, expect, it } from "vitest";
import { normalizeCredentialPassword } from "../convex/lib/credentialPasswords";

describe("Credentials Node - plaintext event passwords", () => {
  describe("Password resolution data", () => {
    it("stores event passwords with a normalized lookup value", () => {
      const password = "EventPass";
      const credential = {
        listKey: "vip",
        password,
        passwordNormalized: normalizeCredentialPassword(password),
      };

      expect(credential.password).toBe("EventPass");
      expect(credential.passwordNormalized).toBe("eventpass");
    });

    it("resolves list credentials case-insensitively", () => {
      const credentials = [
        {
          listKey: "vip",
          passwordNormalized: normalizeCredentialPassword("VIP"),
        },
        {
          listKey: "general",
          passwordNormalized: normalizeCredentialPassword("general"),
        },
      ];

      const inputPassword = normalizeCredentialPassword("vip");
      const matchingCredential = credentials.find(
        (credential) => credential.passwordNormalized === inputPassword,
      );

      expect(matchingCredential?.listKey).toBe("vip");
    });
  });

  describe("Duplicate password detection", () => {
    it("detects duplicate list passwords regardless of case", () => {
      const passwords = ["eventpass", "EVENTPASS", "EventPass"];
      const normalizedPasswords = passwords.map(normalizeCredentialPassword);
      const uniquePasswords = new Set(normalizedPasswords);

      expect(uniquePasswords.size).toBe(1);
    });

    it("allows different list passwords", () => {
      const passwords = ["vip", "general", "backstage"];
      const normalizedPasswords = passwords.map(normalizeCredentialPassword);
      const uniquePasswords = new Set(normalizedPasswords);

      expect(uniquePasswords.size).toBe(passwords.length);
    });
  });
});
