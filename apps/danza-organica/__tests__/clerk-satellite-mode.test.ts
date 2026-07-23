import { describe, expect, it } from "bun:test";
import { shouldUseClerkSatelliteModeForHost } from "../lib/site";

const PRODUCTION_PRIMARY_BASE_URL = "https://coucou.events";
const LOCAL_PRIMARY_BASE_URL = "http://localhost:5680";

describe("shouldUseClerkSatelliteModeForHost", () => {
  it("disables satellite mode on subdomains of the primary Clerk domain", () => {
    expect(
      shouldUseClerkSatelliteModeForHost(
        "danzaorganica.coucou.events",
        PRODUCTION_PRIMARY_BASE_URL,
      ),
    ).toBe(false);
    expect(shouldUseClerkSatelliteModeForHost("coucou.events", PRODUCTION_PRIMARY_BASE_URL)).toBe(
      false,
    );
  });

  it("keeps satellite mode for hosts outside the primary domain", () => {
    expect(shouldUseClerkSatelliteModeForHost("localhost:5677", LOCAL_PRIMARY_BASE_URL)).toBe(true);
    expect(
      shouldUseClerkSatelliteModeForHost(
        "danza-organica-abc123.vercel.app",
        PRODUCTION_PRIMARY_BASE_URL,
      ),
    ).toBe(true);
  });

  it("does not treat lookalike domains as primary subdomains", () => {
    expect(
      shouldUseClerkSatelliteModeForHost("danzacoucou.events", PRODUCTION_PRIMARY_BASE_URL),
    ).toBe(true);
  });
});
