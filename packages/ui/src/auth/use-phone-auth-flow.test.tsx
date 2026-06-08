import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PhoneAuthFlow } from "./phone-auth-flow";

GlobalRegistrator.register({ url: "http://localhost:3000" });

type AuthenticationMode =
  | "signin"
  | "signup"
  | "signup-captcha"
  | "signup-captcha-pending"
  | "signup-verify-captcha";

let authenticationMode: AuthenticationMode = "signin";
let isSignedIn = false;
const signInSetActiveCalls: string[] = [];
const signUpSetActiveCalls: string[] = [];
const signInCreateCalls: Array<Record<string, unknown>> = [];
const signUpCreateCalls: Array<Record<string, unknown>> = [];
const signUpUpdateCalls: Array<Record<string, unknown>> = [];

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

function shouldUseSignUpFlow(mode: AuthenticationMode): boolean {
  return mode.startsWith("signup");
}

mock.module("@clerk/nextjs", () => ({
  useUser: () => ({
    isSignedIn,
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: async (createParams: Record<string, unknown>) => {
        signInCreateCalls.push(createParams);
        if (shouldUseSignUpFlow(authenticationMode)) {
          throw buildIdentifierNotFoundError();
        }
        return { status: "needs_first_factor" };
      },
      attemptFirstFactor: async () => ({
        status: "complete",
        createdSessionId: "session_signin",
      }),
    },
    setActive: async ({ session: sessionId }: { session: string }) => {
      signInSetActiveCalls.push(sessionId);
    },
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: async (createParams: Record<string, unknown>) => {
        signUpCreateCalls.push(createParams);
        if (authenticationMode === "signup-captcha") {
          throw buildBotProtectionError();
        }
        if (authenticationMode === "signup-captcha-pending") {
          const captchaElement = document.getElementById("clerk-captcha");
          const captchaChallengeElement = document.createElement("div");
          captchaChallengeElement.setAttribute("data-testid", "clerk-captcha-challenge");
          captchaElement?.appendChild(captchaChallengeElement);
          await new Promise(() => {});
        }
        return { status: "missing_requirements" };
      },
      preparePhoneNumberVerification: async () => ({
        status: "missing_requirements",
      }),
      attemptPhoneNumberVerification: async () => {
        if (authenticationMode === "signup-verify-captcha") {
          throw buildBotProtectionError();
        }

        return {
          status: "missing_requirements",
          createdSessionId: null,
          missingFields: ["legal_accepted"],
          unverifiedFields: [],
        };
      },
      update: async (updateParams: Record<string, unknown>) => {
        signUpUpdateCalls.push(updateParams);
        return {
          status: "complete",
          createdSessionId: "session_signup",
          missingFields: [],
          unverifiedFields: [],
        };
      },
    },
    setActive: async ({ session: sessionId }: { session: string }) => {
      signUpSetActiveCalls.push(sessionId);
    },
  }),
}));

let LoadedPhoneAuthFlow: typeof PhoneAuthFlow;

async function submitPhoneAndCode() {
  const user = userEvent.setup({ document: globalThis.document });
  const renderResult = render(<LoadedPhoneAuthFlow onSuccess={mockOnSuccess} />);

  await user.type(renderResult.getByLabelText("Phone number"), "3104996272");
  await user.click(renderResult.getByRole("button", { name: "Text me a code" }));
  await renderResult.findByText(/Sent to/);

  const oneTimePasscodeInput = renderResult.container.querySelector("input");
  expect(oneTimePasscodeInput).toBeTruthy();
  await user.type(oneTimePasscodeInput as HTMLInputElement, "123456");
}

const mockOnSuccess = mock(() => {});

describe("usePhoneAuthFlow", () => {
  beforeAll(async () => {
    const module = await import("./phone-auth-flow");
    LoadedPhoneAuthFlow = module.PhoneAuthFlow;
  });

  beforeEach(() => {
    authenticationMode = "signin";
    isSignedIn = false;
    signInSetActiveCalls.length = 0;
    signUpSetActiveCalls.length = 0;
    signInCreateCalls.length = 0;
    signUpCreateCalls.length = 0;
    signUpUpdateCalls.length = 0;
    mockOnSuccess.mockClear();
  });

  afterEach(async () => {
    cleanup();
    await waitForReactScheduler();
  });

  afterAll(async () => {
    await waitForReactScheduler();
    GlobalRegistrator.unregister();
  });

  it("finishes sign-in after setActive resolves even if useUser lags", async () => {
    await submitPhoneAndCode();

    await waitFor(
      () => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      },
      { timeout: 2500 },
    );
    expect(signInSetActiveCalls).toEqual(["session_signin"]);
  });

  it("auto-sends OTP for an initial handoff phone without phone re-entry", async () => {
    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );

    expect(renderResult.queryByLabelText("Phone number")).toBeNull();
    await renderResult.findByText("Sent to +1 310 499 6272");
    expect(signInCreateCalls[0]).toEqual({
      strategy: "phone_code",
      identifier: "+13104996272",
    });
  });

  it("shows a captcha step when new-user handoff needs bot protection", async () => {
    authenticationMode = "signup-captcha";

    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );

    expect(await renderResult.findByText("For +1 310 499 6272")).toBeTruthy();
    expect(renderResult.queryByLabelText("Phone number")).toBeNull();
    expect(renderResult.getByRole("button", { name: /captcha not showing up/i })).toBeTruthy();
    expect(renderResult.queryByText(/human check/i)).toBeNull();
    expect(signInCreateCalls).toEqual([
      {
        strategy: "phone_code",
        identifier: "+13104996272",
      },
    ]);
    expect(signUpCreateCalls).toEqual([
      {
        phoneNumber: "+13104996272",
        legalAccepted: true,
      },
    ]);
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it("keeps auto-send on the captcha step when Clerk renders a challenge", async () => {
    authenticationMode = "signup-captcha-pending";

    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );

    expect(
      await renderResult.findByText("For +1 310 499 6272", {}, { timeout: 2500 }),
    ).toBeTruthy();

    expect(renderResult.queryByLabelText("Phone number", {})).toBeNull();
    expect(renderResult.queryByText(/human check/i)).toBeNull();
    expect(renderResult.getByTestId("clerk-captcha-challenge")).toBeTruthy();
    expect(renderResult.getByRole("button", { name: /captcha not showing up/i })).toBeTruthy();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it("returns from the captcha step to the prefilled phone form when editing", async () => {
    authenticationMode = "signup-captcha";
    const user = userEvent.setup({ document: globalThis.document });

    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );

    expect(await renderResult.findByText("For +1 310 499 6272")).toBeTruthy();

    await user.click(renderResult.getByRole("button", { name: "edit" }));

    const phoneNumberInput = await renderResult.findByLabelText("Phone number", {});

    expect(phoneNumberInput).toBeTruthy();
    expect((phoneNumberInput as HTMLInputElement).value).toBe("310 499 6272");
  });

  it("returns from the captcha fallback button without retrying the same request", async () => {
    authenticationMode = "signup-captcha";
    const user = userEvent.setup({ document: globalThis.document });

    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );

    expect(await renderResult.findByText("For +1 310 499 6272")).toBeTruthy();
    expect(signInCreateCalls).toHaveLength(1);
    expect(signUpCreateCalls).toHaveLength(1);

    await user.click(renderResult.getByRole("button", { name: /captcha not showing up/i }));

    const phoneNumberInput = await renderResult.findByLabelText("Phone number", {});

    expect(phoneNumberInput).toBeTruthy();
    expect((phoneNumberInput as HTMLInputElement).value).toBe("310 499 6272");
    expect(signInCreateCalls).toHaveLength(1);
    expect(signUpCreateCalls).toHaveLength(1);
  });

  it("returns to captcha instead of showing a captcha-required OTP error", async () => {
    authenticationMode = "signup-verify-captcha";
    const user = userEvent.setup({ document: globalThis.document });
    const renderResult = render(<LoadedPhoneAuthFlow onSuccess={mockOnSuccess} />);

    await user.type(renderResult.getByLabelText("Phone number"), "3104996272");
    await user.click(renderResult.getByRole("button", { name: "Text me a code" }));

    await renderResult.findByText("Sent to +1 310 499 6272");
    const oneTimePasscodeInput = renderResult.container.querySelector("input");
    expect(oneTimePasscodeInput).toBeTruthy();

    await user.type(oneTimePasscodeInput as HTMLInputElement, "123456");

    expect(await renderResult.findByText("For +1 310 499 6272")).toBeTruthy();
    expect(renderResult.queryByText("Captcha required.")).toBeNull();
    expect(renderResult.queryByText("Sent to +1 310 499 6272")).toBeNull();
    expect(renderResult.container.querySelector("input")).toBeNull();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it("accepts legal terms and finishes sign-up when Clerk only needs legal acceptance", async () => {
    authenticationMode = "signup";

    await submitPhoneAndCode();

    await waitFor(
      () => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      },
      { timeout: 2500 },
    );
    expect(signUpCreateCalls).toEqual([
      {
        phoneNumber: "+13104996272",
        legalAccepted: true,
      },
    ]);
    expect(signUpUpdateCalls).toEqual([{ legalAccepted: true }]);
    expect(signUpSetActiveCalls).toEqual(["session_signup"]);
  });
});
