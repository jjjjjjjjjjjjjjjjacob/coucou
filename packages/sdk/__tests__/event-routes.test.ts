import { describe, expect, it } from "bun:test";
import { buildPublicEventUrl } from "../src/shared/event-routes";
import { siteConfigurations } from "../src/site-config";

describe("event route helpers", () => {
  it("uses the current Club Chlorine alias origin when no domain override is provided", () => {
    expect(
      buildPublicEventUrl({
        event: { _id: "event_123", shortId: "abc1234" },
        siteConfiguration: siteConfigurations["club-chlorine"],
        currentOrigin: "https://clubchlorine.club",
        vercelEnvironment: "production",
      }),
    ).toBe("https://clubchlorine.club/events/abc1234");
  });

  it("keeps explicit owner domains ahead of current origin aliases", () => {
    expect(
      buildPublicEventUrl({
        event: { _id: "event_123", shortId: "abc1234" },
        siteConfiguration: siteConfigurations["club-chlorine"],
        currentOrigin: "https://clubchlorine.club",
        domain: "clubchlorine.party",
        vercelEnvironment: "production",
      }),
    ).toBe("https://clubchlorine.party/events/abc1234");
  });
});
