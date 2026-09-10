import { describe, expect, it } from "bun:test";
import {
  buildClientAuthAllowedRedirectOrigins,
  resolveSatelliteHomeUrl,
} from "../lib/client-auth-origins";

describe("client auth origins", () => {
  for (const [requestOrigin, satelliteOrigin] of [
    ["http://localhost:5680", "http://localhost:5678"],
    ["https://dev.coucou.events", "https://dev.dojopomodoro.club"],
    ["https://coucou-preview.vercel.app", "https://dojo-preview.vercel.app"],
    ["https://coucou.events", "https://dojopomodoro.club"],
  ]) {
    it(`keeps the Dojo return origin in the ${requestOrigin} context`, () => {
      const context = {
        requestOrigin,
        candidateOrigins: [`${satelliteOrigin}/events/night/status?ref=friend`],
      };
      expect(buildClientAuthAllowedRedirectOrigins("dojo", context)).toContain(satelliteOrigin);
      expect(resolveSatelliteHomeUrl("dojo", context)).toBe(`${satelliteOrigin}/`);
    });
  }
  it("allows Club Chlorine primary and backup production origins", () => {
    const allowedRedirectOrigins = buildClientAuthAllowedRedirectOrigins("club-chlorine");

    expect(allowedRedirectOrigins).toContain("https://clubchlorine.party");
    expect(allowedRedirectOrigins).toContain("https://clubchlorine.club");
  });

  it("uses the Club Chlorine backup origin when the redirect came from it", () => {
    expect(
      resolveSatelliteHomeUrl("club-chlorine", {
        candidateOrigins: ["https://clubchlorine.club/events/sample?__clerk_synced=false"],
      }),
    ).toBe("https://clubchlorine.club/");
  });

  it("allows the Danza Organica production origin", () => {
    const allowedRedirectOrigins = buildClientAuthAllowedRedirectOrigins("danza-organica");

    expect(allowedRedirectOrigins).toContain("https://danzaorganica.coucou.events");
  });

  it("resolves the Danza Organica satellite home from its production origin", () => {
    expect(
      resolveSatelliteHomeUrl("danza-organica", {
        candidateOrigins: [
          "https://danzaorganica.coucou.events/events/sample?__clerk_synced=false",
        ],
      }),
    ).toBe("https://danzaorganica.coucou.events/");
  });
});
