import { describe, expect, it } from "bun:test";
import {
  detectSocialPlatformKeyFromCustomField,
  isInvitedByCustomField,
  normalizeSocialHandleInput,
  parseInvitedBySocialReference,
} from "@coucou/sdk/shared/primary-fields";

describe("primary field migration helpers", () => {
  it("maps instagram and ig custom fields to the instagram primary social field", () => {
    expect(
      detectSocialPlatformKeyFromCustomField({
        key: "instagram",
        label: "Instagram",
      }),
    ).toBe("instagram");
    expect(
      detectSocialPlatformKeyFromCustomField({
        key: "ig",
        label: "IG Handle",
      }),
    ).toBe("instagram");
  });

  it("maps invited-by aliases to the invited-by primary field", () => {
    expect(
      isInvitedByCustomField({
        key: "invited_by",
        label: "Invited by",
      }),
    ).toBe(true);
    expect(
      isInvitedByCustomField({
        key: "referrer",
        label: "Referred By",
      }),
    ).toBe(true);
  });

  it("normalizes social handles and extracts invited-by instagram references", () => {
    expect(
      normalizeSocialHandleInput("https://instagram.com/coucou.nyc", "instagram"),
    ).toBe("coucou.nyc");
    expect(parseInvitedBySocialReference("invited by @coucou.nyc")).toEqual({
      platformKey: "instagram",
      handle: "coucou.nyc",
    });
  });
});
