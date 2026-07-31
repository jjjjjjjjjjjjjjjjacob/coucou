import { beforeEach, describe, expect, it } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { SignInClient } from "../app/sign-in/[[...sign-in]]/sign-in-client";

const internalClerkCopyPattern = new RegExp(["shared", "clerk"].join(" "), "i");
const developerAuthCopyPattern = new RegExp(["branded", "sign-in"].join(" "), "i");

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

  it("renders the dojo phone sign-in page", () => {
    render(<SignInClient redirectUrl="/events/sample" />);

    expect(screen.getByRole("heading", { name: "Sign in to Dojo Pomodoro" })).toBeTruthy();
    expect(screen.getByLabelText("Phone number")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Text me a code" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms" })).toBeTruthy();
    expect(screen.queryByText(internalClerkCopyPattern)).toBeNull();
    expect(screen.queryByText(developerAuthCopyPattern)).toBeNull();
    expect(screen.queryByRole("button", { name: "Email" })).toBeNull();
  });

  it("redirects signed-in users to the authenticated destination", async () => {
    setClerkSignedIn(true);

    render(<SignInClient redirectUrl="/events/sample/ticket?source=sign-in#ticket" />);

    await waitFor(() => {
      expect(getRouterReplaceCalls()).toEqual(["/events/sample/ticket?source=sign-in#ticket"]);
    });
    expect(screen.queryByLabelText("Phone number")).toBeNull();
  });
});
