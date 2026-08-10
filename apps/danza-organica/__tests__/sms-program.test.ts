import { describe, expect, it } from "bun:test";
import { danzaOrganicaSmsProgram } from "@/lib/sms-program";

describe("Danza Organica SMS program", () => {
  it("uses the concise guest-facing consent label", () => {
    expect(danzaOrganicaSmsProgram.consentLabel).toBe(
      "I agree to receive recurring SMS messages from Coucou about Danza Organica events.",
    );
  });
});
