import { describe, expect, it } from "vitest";
import {
  buildClerkAuthProviders,
  resolveClerkFrontendApiUrls,
} from "../convex/lib/clerkAuthConfig";

describe("Clerk Convex auth config", () => {
  it("uses the legacy single Frontend API URL when no multi-domain env is set", () => {
    expect(
      resolveClerkFrontendApiUrls({
        CLERK_FRONTEND_API_URL: "https://clerk.coucou.events",
      }),
    ).toEqual(["https://clerk.coucou.events"]);
  });

  it("combines single and comma-separated Frontend API URLs", () => {
    expect(
      resolveClerkFrontendApiUrls({
        CLERK_FRONTEND_API_URL: "https://curious-bee-44.clerk.accounts.dev",
        CLERK_FRONTEND_API_URLS:
          "https://clerk.coucou.events, https://clerk.dojopomodoro.club, https://clerk.coucou.events",
      }),
    ).toEqual([
      "https://curious-bee-44.clerk.accounts.dev",
      "https://clerk.coucou.events",
      "https://clerk.dojopomodoro.club",
    ]);
  });

  it("maps each Frontend API URL to a Convex auth provider", () => {
    expect(
      buildClerkAuthProviders({
        CLERK_FRONTEND_API_URLS: "https://clerk.coucou.events,https://clerk.dojopomodoro.club",
      }),
    ).toEqual([
      {
        domain: "https://clerk.coucou.events",
        applicationID: "convex",
      },
      {
        domain: "https://clerk.dojopomodoro.club",
        applicationID: "convex",
      },
    ]);
  });
});
