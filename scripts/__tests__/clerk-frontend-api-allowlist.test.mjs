import { describe, expect, it } from "bun:test";
import {
  buildClerkFrontendApiAllowlist,
  buildClerkFrontendApiUrlFromSiteDomain,
  parseJsonArrayFromConvexRunOutput,
} from "../clerk-frontend-api-allowlist.mjs";

describe("Clerk Frontend API allowlist generator", () => {
  it("includes the Coucou primary Clerk Frontend API URL", () => {
    expect(
      buildClerkFrontendApiAllowlist({
        primaryClerkFrontendApiUrl: "https://clerk.coucou.events",
      }),
    ).toEqual(["https://clerk.coucou.events"]);
  });

  it("includes verified enabled workspace-site satellite URLs", () => {
    expect(
      buildClerkFrontendApiAllowlist({
        primaryClerkFrontendApiUrl: "https://clerk.coucou.events",
        workspaceSites: [
          {
            siteKey: "dojo",
            clerkFrontendApiUrl: "https://clerk.dojopomodoro.club",
            clerkSatelliteVerificationStatus: "verified",
            clerkSatelliteAuthEnabled: true,
          },
          {
            siteKey: "club-chlorine",
            clerkFrontendApiUrl: "https://clerk.clubchlorine.party",
            clerkSatelliteVerificationStatus: "verified",
            clerkSatelliteAuthEnabled: true,
          },
        ],
      }),
    ).toEqual([
      "https://clerk.coucou.events",
      "https://clerk.dojopomodoro.club",
      "https://clerk.clubchlorine.party",
    ]);
  });

  it("excludes disabled and unverified workspace-site satellite URLs", () => {
    expect(
      buildClerkFrontendApiAllowlist({
        primaryClerkFrontendApiUrl: "https://clerk.coucou.events",
        workspaceSites: [
          {
            siteKey: "disabled",
            clerkFrontendApiUrl: "https://clerk.disabled.example",
            clerkSatelliteVerificationStatus: "verified",
            clerkSatelliteAuthEnabled: false,
          },
          {
            siteKey: "pending",
            clerkFrontendApiUrl: "https://clerk.pending.example",
            clerkSatelliteVerificationStatus: "pending",
            clerkSatelliteAuthEnabled: true,
          },
          {
            siteKey: "missing-url",
            clerkSatelliteVerificationStatus: "verified",
            clerkSatelliteAuthEnabled: true,
          },
        ],
      }),
    ).toEqual(["https://clerk.coucou.events"]);
  });

  it("dedupes generated values after normalizing trailing slashes", () => {
    expect(
      buildClerkFrontendApiAllowlist({
        primaryClerkFrontendApiUrl: "https://clerk.coucou.events/",
        workspaceSites: [
          {
            siteKey: "dojo",
            clerkFrontendApiUrl: "https://clerk.dojopomodoro.club/",
            clerkSatelliteVerificationStatus: "verified",
            clerkSatelliteAuthEnabled: true,
          },
        ],
        verifiedWorkspaceSiteClerkFrontendApiUrls: ["https://clerk.dojopomodoro.club"],
        staticSiteConfigurations: [
          {
            appKind: "client",
            domain: "https://dojopomodoro.club",
          },
        ],
      }),
    ).toEqual(["https://clerk.coucou.events", "https://clerk.dojopomodoro.club"]);
  });

  it("builds static bootstrap fallback values from known client site config", () => {
    expect(
      buildClerkFrontendApiAllowlist({
        primaryClerkFrontendApiUrl: "https://clerk.coucou.events",
        staticSiteConfigurations: [
          {
            appKind: "client",
            domain: "https://dojopomodoro.club",
          },
          {
            appKind: "admin",
            domain: "https://coucou.events",
          },
        ],
      }),
    ).toEqual(["https://clerk.coucou.events", "https://clerk.dojopomodoro.club"]);
  });

  it("validates production HTTPS URLs", () => {
    expect(() =>
      buildClerkFrontendApiAllowlist({
        primaryClerkFrontendApiUrl: "http://clerk.coucou.events",
      }),
    ).toThrow("CLERK_FRONTEND_API_URL must be a production HTTPS URL");

    expect(() =>
      buildClerkFrontendApiAllowlist({
        workspaceSites: [
          {
            siteKey: "local",
            clerkFrontendApiUrl: "https://localhost:3000",
            clerkSatelliteVerificationStatus: "verified",
            clerkSatelliteAuthEnabled: true,
          },
        ],
      }),
    ).toThrow("Workspace site local Clerk Frontend API URL");

    expect(() => buildClerkFrontendApiUrlFromSiteDomain("http://dojopomodoro.club")).toThrow(
      "Static site domain must use HTTPS",
    );
  });

  it("parses Convex run JSON array output", () => {
    expect(
      parseJsonArrayFromConvexRunOutput(
        'Function returned:\n["https://clerk.dojopomodoro.club"]\n',
      ),
    ).toEqual(["https://clerk.dojopomodoro.club"]);
  });
});
