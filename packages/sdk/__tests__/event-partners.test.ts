import { describe, expect, it } from "bun:test";
import { EventPartnerValidationError, sanitizeEventPartners } from "../src/shared/event-partners";

describe("event partner metadata", () => {
  it("trims labels and optional HTTP links while preserving entry order", () => {
    expect(
      sanitizeEventPartners([
        { label: " The Market ", logoStorageId: "market", url: " https://themarket.nyc " },
        { label: "Nothing Radio", logoStorageId: "radio" },
      ]),
    ).toEqual([
      { label: "The Market", logoStorageId: "market", url: "https://themarket.nyc/" },
      { label: "Nothing Radio", logoStorageId: "radio" },
    ]);
  });

  it("normalizes empty arrays for optional legacy fields", () => {
    expect(sanitizeEventPartners(undefined)).toBeUndefined();
    expect(sanitizeEventPartners([])).toBeUndefined();
  });

  it("requires labels and logos", () => {
    expect(() => sanitizeEventPartners([{ label: " ", logoStorageId: "market" }])).toThrow(
      EventPartnerValidationError,
    );
    expect(() => sanitizeEventPartners([{ label: "The Market", logoStorageId: "" }])).toThrow(
      "The Market logo is required",
    );
  });

  it("rejects non-HTTP links", () => {
    expect(() =>
      sanitizeEventPartners([
        { label: "The Market", logoStorageId: "market", url: "mailto:hello@example.com" },
      ]),
    ).toThrow("The Market link must use http or https");
  });
});
