import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "bun:test";
import type { SiteAuthConfiguration } from "@coucou/sdk/site-config";
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

describe("SignInClient", () => {
  beforeEach(() => {
    setClerkSignedIn(false);
    getSignInTestGlobal().__clearRouterReplaceCalls?.();
  });

  it("renders the coucou phone-auth sign-in page", () => {
    render(<SignInClient redirectUrl="/admin" />);

    expect(
      screen.getByRole("heading", { name: "Sign in to Coucou" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Access your workspaces, event operations, and organizer tools.",
      ),
    ).toBeTruthy();
    // Phone-only flow: country chip + phone input + submit button.
    expect(screen.getByLabelText("Phone number")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Text me a code" }),
    ).toBeTruthy();
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

    expect(
      screen.getByRole("heading", { name: "Sign in to Coucou admin" }),
    ).toBeTruthy();
    expect(screen.getByText("Super-admin")).toBeTruthy();
    expect(
      screen.getByText(
        "Use the Coucou organization to open platform-wide tenant operations.",
      ),
    ).toBeTruthy();
  });

  it("renders tenant organization sign-in copy", () => {
    const tenantAuthConfiguration = {
      siteKey: "coucou",
      brandName: "Dojo Pomodoro",
      accentMark: "DP",
      heading: "Sign in to Dojo Pomodoro",
      description:
        "Use your organization account to open tenant dashboard operations.",
      allowedMethods: ["phone", "email"],
      defaultMethod: "phone",
      signInRedirectPath: "/workspaces/dojo-pomodoro/dashboard",
      verificationDescription:
        "Enter the verification code we sent to continue.",
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

    expect(
      screen.getByRole("heading", { name: "Sign in to Dojo Pomodoro" }),
    ).toBeTruthy();
    expect(screen.getByText("DP")).toBeTruthy();
    expect(screen.getByText("Organization login")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Powered by Coucou" })).toBeTruthy();
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
});
