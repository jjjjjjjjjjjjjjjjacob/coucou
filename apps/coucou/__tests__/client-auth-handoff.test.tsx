import { describe, expect, it, mock } from "bun:test";
import { type FunctionReference, getFunctionName } from "convex/server";

mock.module("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null }) }));
mock.module("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:5680" }),
}));
mock.module("convex/nextjs", () => ({
  fetchQuery: async (reference: FunctionReference<"query">) =>
    getFunctionName(reference) === "rsvps:resolveGuestRsvpHandoff"
      ? { phoneNumber: "+15555550123", expiresAt: Date.now() + 60_000, canAutoSendCode: true }
      : null,
}));
mock.module("../app/sign-in/[[...sign-in]]/sign-in-client", () => ({ SignInClient: () => null }));
mock.module("../app/clients/[siteKey]/sign-in/club-chlorine-login-client", () => ({
  ClubChlorineLoginClient: () => null,
}));
const { default: ClientAuthSignInPage } = await import("../app/clients/[siteKey]/sign-in/page");

describe("Dojo RSVP verification handoff", () => {
  it("opens code verification for a supplied RSVP phone and keeps the local return route", async () => {
    const redirectUrl =
      "http://localhost:5678/events/night/status?password=FANCY&ref=friend&__clerk_synced=false";
    const page = await ClientAuthSignInPage({
      params: Promise.resolve({ siteKey: "dojo" }),
      searchParams: Promise.resolve({ redirect_url: redirectUrl, rsvp_handoff: "valid_handoff" }),
    });
    expect(page.props.authBranding.heading).toBe("Verify your number to RSVP");
    expect(page.props.initialPhoneNumber).toBe("+15555550123");
    expect(page.props.autoSendInitialCode).toBe(true);
    expect(page.props.siteAuthConfiguration.siteKey).toBe("dojo");
    expect(page.props.redirectUrl).toBe(redirectUrl);
    expect(page.props.allowedRedirectOrigins).toContain("http://localhost:5678");
  });
  it("keeps manual phone entry for sign-ins without an RSVP handoff", async () => {
    const page = await ClientAuthSignInPage({ params: Promise.resolve({ siteKey: "dojo" }) });
    expect(page.props.authBranding.heading).toBe("Sign in to Dojo Pomodoro");
    expect(page.props.initialPhoneNumber).toBeNull();
    expect(page.props.autoSendInitialCode).toBe(false);
  });
});
