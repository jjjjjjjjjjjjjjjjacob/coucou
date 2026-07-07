import { describe, expect, it } from "bun:test";
import {
  buildSatelliteReturnUrl,
  buildTenantSatelliteSignInUrl,
  CLERK_SATELLITE_SYNC_PARAM,
  getClientSiteRedirectOrigins,
  getSiteOrigins,
} from "../src/auth-domains";
import { siteConfigurations } from "../src/site-config";

describe("auth domain helpers", () => {
  it("lists configured client site redirect origins", () => {
    expect(getClientSiteRedirectOrigins()).toContain("https://dojopomodoro.club");
    expect(getClientSiteRedirectOrigins()).toContain("https://clubchlorine.party");
    expect(getClientSiteRedirectOrigins()).toContain("https://clubchlorine.club");
    expect(getClientSiteRedirectOrigins()).toContain("http://localhost:5678");
    expect(getClientSiteRedirectOrigins()).toContain("http://localhost:5679");
    expect(getClientSiteRedirectOrigins()).not.toContain("https://coucou.events");
  });

  it("lists configured aliases for a client site", () => {
    expect(getSiteOrigins(siteConfigurations["club-chlorine"])).toEqual([
      "https://clubchlorine.party",
      "https://clubchlorine.club",
    ]);
  });

  it("builds a satellite return URL that triggers Clerk session sync", () => {
    const returnUrl = new URL(
      buildSatelliteReturnUrl("https://dojopomodoro.club", "/events/event_123/ticket?source=menu"),
    );

    expect(returnUrl.origin).toBe("https://dojopomodoro.club");
    expect(returnUrl.pathname).toBe("/events/event_123/ticket");
    expect(returnUrl.searchParams.get("source")).toBe("menu");
    expect(returnUrl.searchParams.get(CLERK_SATELLITE_SYNC_PARAM)).toBe("false");
  });

  it("builds a tenant primary sign-in URL with a satellite redirect", () => {
    const signInUrl = new URL(
      buildTenantSatelliteSignInUrl({
        primaryBaseUrl: "https://coucou.events",
        siteConfiguration: siteConfigurations.dojo,
        redirectPath: "/events/event_123/ticket",
      }),
    );
    const redirectUrl = signInUrl.searchParams.get("redirect_url");

    expect(signInUrl.origin).toBe("https://coucou.events");
    expect(signInUrl.pathname).toBe("/clients/dojo/sign-in");
    expect(redirectUrl).toContain("https://dojopomodoro.club/events/event_123");
    expect(redirectUrl).toContain(`${CLERK_SATELLITE_SYNC_PARAM}=false`);
  });
});
