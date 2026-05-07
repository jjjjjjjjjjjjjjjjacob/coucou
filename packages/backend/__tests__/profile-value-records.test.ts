import { describe, expect, it } from "bun:test";
import {
  normalizeProfileFieldKey,
  socialPlatformKeyFromProfileFieldKey,
  socialProfileFieldKey,
} from "../convex/lib/profileValueRecords";

describe("profile value record helpers", () => {
  it("normalizes social profile field keys through canonical platform keys", () => {
    expect(socialProfileFieldKey("twitter")).toBe("social.x");
    expect(normalizeProfileFieldKey("social.Linked In")).toBe(
      "social.linkedin",
    );
    expect(socialPlatformKeyFromProfileFieldKey("social.twitter")).toBe("x");
  });

  it("preserves non-social field keys as core profile fields", () => {
    expect(normalizeProfileFieldKey("firstName")).toBe("firstName");
    expect(normalizeProfileFieldKey("email")).toBe("email");
  });
});

