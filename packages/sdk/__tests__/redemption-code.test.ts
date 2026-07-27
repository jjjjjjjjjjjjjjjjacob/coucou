import { describe, expect, it } from "bun:test";
import {
  normalizeRedemptionCode,
  parseRedemptionPayload,
} from "../src/shared/redemption-code";

describe("redemption code helpers", () => {
  it("normalizes manually entered codes", () => {
    expect(normalizeRedemptionCode(" ab12cd34 ")).toBe("AB12CD34");
  });

  it("parses raw codes and redeem URLs", () => {
    expect(parseRedemptionPayload("AB12CD34")).toEqual({
      valid: true,
      code: "AB12CD34",
    });
    expect(
      parseRedemptionPayload(
        "https://events.coucou.events/redeem/ab12cd34",
      ),
    ).toEqual({
      valid: true,
      code: "AB12CD34",
    });
  });

  it("rejects empty and unsupported payloads", () => {
    expect(parseRedemptionPayload(" ")).toEqual({
      valid: false,
      reason: "empty",
    });
    expect(parseRedemptionPayload("not-a-ticket")).toEqual({
      valid: false,
      reason: "unsupported",
    });
  });
});
