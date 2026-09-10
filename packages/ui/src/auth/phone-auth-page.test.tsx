import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { siteAuthConfigurations } from "@coucou/sdk/site-config";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { PhoneAuthPage } from "./phone-auth-page";

GlobalRegistrator.register({ url: "http://localhost:3000/admin/login" });

const routerReplaceCalls: string[] = [];
const documentReplaceCalls: string[] = [];
let isSignedIn = true;
let authenticationMode: "signin" | "signup-captcha" = "signin";
let LoadedPhoneAuthPage: typeof PhoneAuthPage;

function waitForReactScheduler(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function buildIdentifierNotFoundError() {
  return {
    errors: [
      {
        code: "form_identifier_not_found",
        message: "Identifier not found.",
      },
    ],
  };
}

function buildBotProtectionError() {
  return {
    errors: [
      {
        code: "captcha_missing_token",
        message: "Bot protection challenge is required.",
      },
    ],
  };
}

mock.module("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn,
  }),
  useUser: () => ({
    isSignedIn,
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: async () => {
        if (authenticationMode === "signup-captcha") {
          throw buildIdentifierNotFoundError();
        }
        return { status: "needs_first_factor" };
      },
      attemptFirstFactor: async () => ({
        status: "complete",
        createdSessionId: "session_signin",
      }),
    },
    setActive: async () => {},
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: async () => {
        if (authenticationMode === "signup-captcha") {
          throw buildBotProtectionError();
        }
        return { status: "missing_requirements" };
      },
      preparePhoneNumberVerification: async () => ({ status: "missing_requirements" }),
      attemptPhoneNumberVerification: async () => ({
        status: "complete",
        createdSessionId: "session_signup",
      }),
    },
    setActive: async () => {},
  }),
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({
    replace: (href: string) => {
      routerReplaceCalls.push(href);
    },
  }),
}));

describe("PhoneAuthPage", () => {
  beforeAll(async () => {
    const module = await import("./phone-auth-page");
    LoadedPhoneAuthPage = module.PhoneAuthPage;
  });

  beforeEach(() => {
    sessionStorage.clear();
    isSignedIn = true;
    authenticationMode = "signin";
    routerReplaceCalls.length = 0;
    documentReplaceCalls.length = 0;
    Object.defineProperty(window.location, "replace", {
      configurable: true,
      value: (href: string) => {
        documentReplaceCalls.push(href);
      },
    });
  });

  afterEach(async () => {
    cleanup();
    await waitForReactScheduler();
  });

  afterAll(async () => {
    await waitForReactScheduler();
    GlobalRegistrator.unregister();
  });

  it("uses a document replace for admin post-auth navigation", async () => {
    render(
      <LoadedPhoneAuthPage
        preset="coucou"
        siteAuthConfiguration={siteAuthConfigurations.coucou}
        redirectUrl="/admin"
        postAuthNavigation="document-replace"
      />,
    );

    await waitFor(() => {
      expect(documentReplaceCalls).toEqual(["/admin"]);
    });
    expect(routerReplaceCalls).toEqual([]);
  });

  it("uses the app router by default", async () => {
    render(
      <LoadedPhoneAuthPage
        preset="coucou"
        siteAuthConfiguration={siteAuthConfigurations.coucou}
        redirectUrl="/dashboard"
      />,
    );

    await waitFor(() => {
      expect(routerReplaceCalls).toEqual(["/dashboard"]);
    });
    expect(documentReplaceCalls).toEqual([]);
  });

  it("renders a custom brand mark slot when provided", async () => {
    const { getByTestId } = render(
      <LoadedPhoneAuthPage
        preset="coucou"
        siteAuthConfiguration={siteAuthConfigurations.coucou}
        redirectUrl="/dashboard"
        brandMarkSlot={<div data-testid="custom-brand-mark" />}
      />,
    );

    expect(getByTestId("custom-brand-mark")).toBeTruthy();
    await waitFor(() => {
      expect(routerReplaceCalls).toEqual(["/dashboard"]);
    });
  });

  it("hides subcopy on the phone entry step", () => {
    isSignedIn = false;

    const renderResult = render(
      <LoadedPhoneAuthPage
        preset="coucou"
        siteAuthConfiguration={siteAuthConfigurations.coucou}
        redirectUrl="/dashboard"
      />,
    );

    expect(
      renderResult.getByRole("heading", { name: siteAuthConfigurations.coucou.heading }),
    ).toBeTruthy();
    expect(renderResult.queryByText(siteAuthConfigurations.coucou.description)).toBeNull();
  });

  it("uses verification copy without subcopy on the OTP step", async () => {
    isSignedIn = false;

    const renderResult = render(
      <LoadedPhoneAuthPage
        preset="coucou"
        siteAuthConfiguration={siteAuthConfigurations.coucou}
        redirectUrl="/dashboard"
        initialPhoneNumber="+15555555555"
        autoSendInitialCode
      />,
    );

    await waitFor(() => {
      expect(
        renderResult.getByRole("heading", { name: "Enter your verification code" }),
      ).toBeTruthy();
    });
    expect(renderResult.queryByText(siteAuthConfigurations.coucou.description)).toBeNull();
  });

  it("keeps the phone heading when a security error has no visible challenge", async () => {
    isSignedIn = false;
    authenticationMode = "signup-captcha";

    const renderResult = render(
      <LoadedPhoneAuthPage
        preset="coucou"
        siteAuthConfiguration={siteAuthConfigurations.coucou}
        redirectUrl="/dashboard"
        initialPhoneNumber="+15555555555"
        autoSendInitialCode
      />,
    );

    await renderResult.findByText(
      "The security check didn't finish. Please try sending the code again.",
    );
    expect(Boolean(renderResult.queryByRole("heading", { name: "Captcha verification" }))).toBe(
      false,
    );
    expect(
      Boolean(renderResult.queryByRole("heading", { name: siteAuthConfigurations.coucou.heading })),
    ).toBe(true);
    expect(renderResult.queryByText(siteAuthConfigurations.coucou.description)).toBeNull();
  });
});
