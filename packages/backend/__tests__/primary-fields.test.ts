import { describe, expect, it } from "bun:test";
import {
  dedupeSocialPlatformConfigs,
  detectSocialPlatformKeyFromCustomField,
  isInvitedByCustomField,
  normalizeSocialHandleInput,
  normalizeSocialPlatformKey,
  parseInvitedBySocialReference,
} from "@coucou/sdk/shared/primary-fields";
import {
  collectRequiredPrimaryFieldErrors,
  sanitizePrimaryFieldConfig,
  sanitizeSubmittedSocialProfiles,
} from "../convex/lib/primaryFields";

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

  it("maps twitter/x and linkedin fields to canonical primary social fields", () => {
    expect(normalizeSocialPlatformKey("twitter")).toBe("x");
    expect(
      detectSocialPlatformKeyFromCustomField({
        key: "twitter",
        label: "Twitter Handle",
      }),
    ).toBe("x");
    expect(
      detectSocialPlatformKeyFromCustomField({
        key: "linkedin_profile",
        label: "LinkedIn Profile",
      }),
    ).toBe("linkedin");
  });

  it("does not match short social aliases inside unrelated words", () => {
    expect(
      detectSocialPlatformKeyFromCustomField({
        key: "experience",
        label: "Experience",
      }),
    ).toBeNull();
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
    expect(
      normalizeSocialHandleInput("https://twitter.com/coucou_nyc", "twitter"),
    ).toBe("coucou_nyc");
    expect(
      normalizeSocialHandleInput(
        "https://www.linkedin.com/in/coucou-events/",
        "linkedin",
      ),
    ).toBe("coucou-events");
    expect(parseInvitedBySocialReference("invited by @coucou.nyc")).toEqual({
      platformKey: "instagram",
      handle: "coucou.nyc",
    });
  });

  it("preserves required primary-field config flags while sanitizing", () => {
    expect(
      dedupeSocialPlatformConfigs([
        {
          platformKey: "instagram",
          label: "Instagram",
          required: true,
        },
      ]),
    ).toEqual([
      {
        platformKey: "instagram",
        label: "Instagram",
        placeholder: undefined,
        profileUrlPrefix: undefined,
        required: true,
      },
    ]);

    expect(
      sanitizePrimaryFieldConfig({
        socialPlatforms: [
          {
            platformKey: "instagram",
            label: "Instagram",
            required: true,
          },
        ],
        invitedBy: {
          enabled: true,
          label: "Invited by",
          required: true,
        },
      }),
    ).toEqual({
      socialPlatforms: [
        {
          platformKey: "instagram",
          label: "Instagram",
          placeholder: undefined,
          profileUrlPrefix: undefined,
          required: true,
        },
      ],
      invitedBy: {
        enabled: true,
        label: "Invited by",
        placeholder: undefined,
        required: true,
      },
    });
  });

  it("reports missing required primary fields for RSVP submission", () => {
    const primaryFieldConfig = {
      socialPlatforms: [
        {
          platformKey: "instagram",
          label: "Instagram",
          required: true,
        },
      ],
      invitedBy: {
        enabled: true,
        label: "Invited by",
        required: true,
      },
    };

    expect(
      collectRequiredPrimaryFieldErrors({
        primaryFieldConfig,
        submittedProfiles: [],
        invitedByName: "",
      }),
    ).toEqual(["Instagram is required", "Invited by is required"]);

    const submittedProfiles = sanitizeSubmittedSocialProfiles(
      [{ platformKey: "instagram", handle: "@coucou.nyc" }],
      primaryFieldConfig,
    );

    expect(
      collectRequiredPrimaryFieldErrors({
        primaryFieldConfig,
        submittedProfiles,
        invitedByName: "Coucou",
      }),
    ).toEqual([]);
  });
});
