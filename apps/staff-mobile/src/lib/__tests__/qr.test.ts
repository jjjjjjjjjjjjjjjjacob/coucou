import { parseRedemptionPayload } from "../qr";

describe("parseRedemptionPayload", () => {
  it("accepts and normalizes a raw eight-character code", () => {
    expect(parseRedemptionPayload(" ab12cd34 ")).toEqual({
      valid: true,
      code: "AB12CD34",
    });
  });

  it("accepts a Coucou redemption URL", () => {
    expect(parseRedemptionPayload("https://events.coucou.events/dojo/redeem/ab12cd34")).toEqual({
      valid: true,
      code: "AB12CD34",
    });
  });

  it("rejects unsupported payloads", () => {
    expect(parseRedemptionPayload("not-a-ticket")).toEqual({
      valid: false,
      reason: "unsupported",
    });
  });
});
