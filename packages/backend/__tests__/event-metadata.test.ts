import { describe, expect, it } from "vitest";

import {
  DEFAULT_SECRET_GUEST_DISPLAY_NAME,
  sanitizeOptionalEventActs,
  sanitizeOptionalEventDescription,
} from "../convex/lib/eventMetadata";

describe("event metadata helpers", () => {
  it("trims descriptions and removes empty descriptions", () => {
    expect(sanitizeOptionalEventDescription("  Pool hours  ")).toBe("Pool hours");
    expect(sanitizeOptionalEventDescription("   ")).toBeUndefined();
  });

  it("sanitizes act metadata for storage", () => {
    expect(
      sanitizeOptionalEventActs([
        {
          name: "  Malice K ",
          descriptorBadges: [" DJ ", "", "LIVE"],
          socialUrl: "https://example.com/malice ",
          isSecretGuest: false,
        },
        {
          name: "",
          descriptorBadges: ["DJ"],
          isSecretGuest: true,
          secretDisplayName: "",
        },
      ]),
    ).toEqual([
      {
        name: "Malice K",
        descriptorBadges: ["DJ", "LIVE"],
        socialUrl: "https://example.com/malice",
      },
      {
        name: "",
        descriptorBadges: ["DJ"],
        isSecretGuest: true,
        secretDisplayName: DEFAULT_SECRET_GUEST_DISPLAY_NAME,
      },
    ]);
  });

  it("rejects non-http act social links", () => {
    expect(() =>
      sanitizeOptionalEventActs([
        {
          name: "Malice K",
          socialUrl: "mailto:malice@example.com",
        },
      ]),
    ).toThrow("Act social link must use http or https");
  });
});
