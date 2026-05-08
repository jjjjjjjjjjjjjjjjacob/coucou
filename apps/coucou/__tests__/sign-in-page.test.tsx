import { beforeEach, describe, expect, it } from "bun:test";
import { siteConfigurations } from "@coucou/sdk";
import type { SiteAuthConfiguration } from "@coucou/sdk/site-config";
import { render, screen, waitFor } from "@testing-library/react";
import { ClubChlorineLoginClient } from "../app/clients/[siteKey]/sign-in/club-chlorine-login-client";
import { SignInClient } from "../app/sign-in/[[...sign-in]]/sign-in-client";

const internalClerkCopyPattern = new RegExp(["shared", "clerk"].join(" "), "i");
const developerAuthCopyPattern = new RegExp(["auth", "shell"].join(" "), "i");

interface SignInTestGlobal {
  __setClerkTestState?: (nextState: {
    isLoaded?: boolean;
    isSignedIn?: boolean;
    userId?: string | null;
  }) => void;
  __clearRouterReplaceCalls?: () => void;
  __getRouterReplaceCalls?: () => string[];
  __clearLocationReplaceCalls?: () => void;
  __getLocationReplaceCalls?: () => string[];
}

function getSignInTestGlobal(): typeof globalThis & SignInTestGlobal {
  return globalThis as typeof globalThis & SignInTestGlobal;
}

function setClerkSignedIn(isSignedIn: boolean) {
  getSignInTestGlobal().__setClerkTestState?.({
    isLoaded: true,
    isSignedIn,
    userId: isSignedIn ? "user_123" : null,
  });
}

function getRouterReplaceCalls(): string[] {
  return getSignInTestGlobal().__getRouterReplaceCalls?.() ?? [];
}

function getLocationReplaceCalls(): string[] {
  return getSignInTestGlobal().__getLocationReplaceCalls?.() ?? [];
}

describe("SignInClient", () => {
  beforeEach(() => {
    setClerkSignedIn(false);
    getSignInTestGlobal().__clearRouterReplaceCalls?.();
    getSignInTestGlobal().__clearLocationReplaceCalls?.();
  });

  it("renders the coucou phone-auth sign-in page", () => {
    render(<SignInClient redirectUrl="/admin" />);

    expect(screen.getByRole("heading", { name: "Sign in to Coucou" })).toBeTruthy();
    expect(
      screen.getByText("Access your workspaces, event operations, and organizer tools."),
    ).toBeTruthy();
    // Phone-only flow: country chip + phone input + submit button.
    expect(screen.getByLabelText("Phone number")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Text me a code" })).toBeTruthy();
    // Footer legal links must remain.
    expect(screen.getByRole("link", { name: "Cookies" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeTruthy();
    // No leftover developer/shell copy or shared-Clerk wording exposed.
    expect(screen.queryByText(internalClerkCopyPattern)).toBeNull();
    expect(screen.queryByText(developerAuthCopyPattern)).toBeNull();
  });

  it("renders the dedicated coucou admin sign-in copy", () => {
    render(
      <SignInClient
        redirectUrl="/admin"
        authBranding={{
          heading: "Sign in to Coucou admin",
          sub: "Use the Coucou organization to open platform-wide tenant operations.",
          eyebrow: "Super-admin",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Sign in to Coucou admin" })).toBeTruthy();
    expect(screen.getByText("Super-admin")).toBeTruthy();
    expect(
      screen.getByText("Use the Coucou organization to open platform-wide tenant operations."),
    ).toBeTruthy();
  });

  it("renders tenant organization sign-in copy", () => {
    const tenantAuthConfiguration = {
      siteKey: "coucou",
      brandName: "Dojo Pomodoro",
      accentMark: "DP",
      heading: "Sign in to Dojo Pomodoro",
      description: "Use your organization account to open tenant dashboard operations.",
      allowedMethods: ["phone", "email"],
      defaultMethod: "phone",
      signInRedirectPath: "/workspaces/dojo-pomodoro/dashboard",
      verificationDescription: "Enter the verification code we sent to continue.",
    } satisfies SiteAuthConfiguration;

    render(
      <SignInClient
        redirectUrl="/workspaces/dojo-pomodoro/dashboard"
        siteAuthConfiguration={tenantAuthConfiguration}
        authBranding={{
          eyebrow: "Organization login",
          showCoucouAttribution: true,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Sign in to Dojo Pomodoro" })).toBeTruthy();
    expect(screen.getByText("DP")).toBeTruthy();
    expect(screen.getByText("Organization login")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Powered by Coucou" })).toBeTruthy();
  });

  it("renders a Dojo-branded satellite login surface", () => {
    render(
      <SignInClient
        redirectUrl="https://dojopomodoro.club/events/sample/ticket?__clerk_synced=false"
        preset={siteConfigurations.dojo.preset}
        siteAuthConfiguration={siteConfigurations.dojo.auth}
        eventThemeBackgroundColor="#f7efe2"
        eventThemeTextColor="#191713"
        authBranding={{
          eyebrow: "Event login",
          showCoucouAttribution: true,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Sign in to Dojo Pomodoro" })).toBeTruthy();
    expect(screen.getByText("Event login")).toBeTruthy();
    expect(document.querySelector('[data-preset="dojo"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: "Powered by Coucou" })).toBeTruthy();
  });

  it("renders the redirected Club Chlorine login inside the chlorine shell", () => {
    const clubChlorineSiteConfiguration = siteConfigurations["club-chlorine"];

    render(
      <ClubChlorineLoginClient
        redirectUrl="https://clubchlorine.party/events/sample/ticket?__clerk_synced=false"
        tenantBaseUrl={clubChlorineSiteConfiguration.domain}
        preset={clubChlorineSiteConfiguration.preset}
        siteAuthConfiguration={clubChlorineSiteConfiguration.auth}
        authBranding={{
          heading: clubChlorineSiteConfiguration.auth.heading,
          sub: clubChlorineSiteConfiguration.auth.description,
        }}
      />,
    );

    expect(document.querySelector('[data-preset="chlorine"]')).toBeTruthy();
    // The new copy frames the surface as a text-update opt-in, not a
    // sign-in card. The heading and subtitle live in site-config.ts.
    expect(
      screen.getByRole("heading", {
        name: clubChlorineSiteConfiguration.auth.heading,
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Phone number")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "https://clubchlorine.party/terms",
    );
  });

  it("redirects signed-in users to the dashboard fallback", async () => {
    setClerkSignedIn(true);

    render(<SignInClient redirectUrl="" />);

    await waitFor(() => {
      expect(getRouterReplaceCalls()).toEqual(["/dashboard"]);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Redirecting...");
    expect(screen.queryByLabelText("Phone number")).toBeNull();
  });

  it("redirects signed-in satellite users back to an allowed tenant origin", async () => {
    setClerkSignedIn(true);

    render(
      <SignInClient redirectUrl="https://dojopomodoro.club/events/sample/ticket?__clerk_synced=false" />,
    );

    await waitFor(() => {
      expect(getLocationReplaceCalls()).toEqual([
        "https://dojopomodoro.club/events/sample/ticket?__clerk_synced=false",
      ]);
    });
    expect(getRouterReplaceCalls()).toEqual([]);
  });
});
