import { describe, expect, it } from "bun:test";
import {
  buildClientAuthAllowedRedirectOrigins,
  resolveSatelliteHomeUrl,
} from "../lib/client-auth-origins";

describe("client auth origins", () => {
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
