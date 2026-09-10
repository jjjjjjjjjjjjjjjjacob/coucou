import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import type { PhoneAuthFlow } from "./phone-auth-flow";

GlobalRegistrator.register({ url: "http://localhost:3000" });

type AuthenticationMode =
  | "signin"
  | "signin-rate-limit"
  | "signup"
  | "signup-captcha"
  | "signup-captcha-pending"
  | "signup-captcha-invisible"
  | "signup-verify-captcha";

let authenticationMode: AuthenticationMode = "signin";
let isSignedIn = false;
interface PendingVerification {
  strategy: string;
  status: string;
  expireAt: Date | null;
}
let existingSignIn:
  | { status: string; identifier: string; firstFactorVerification: PendingVerification }
  | undefined;
let existingSignUp:
  | { status: string; phoneNumber: string; verifications: { phoneNumber: PendingVerification } }
  | undefined;
const signInCodeAttempts: Array<{ strategy: string; code: string }> = [];
const signUpCodeAttempts: Array<{ code: string }> = [];
const signInResendCalls: Array<{ strategy: string; phoneNumberId: string }> = [];
const signInSetActiveCalls: string[] = [];
const signUpSetActiveCalls: string[] = [];
const signInCreateCalls: Array<Record<string, unknown>> = [];
const signUpCreateCalls: Array<Record<string, unknown>> = [];
let finishCaptchaChallenge: (() => void) | undefined;
let verificationPreparationCount = 0;
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
      ...existingSignIn,
      supportedFirstFactors: [{ strategy: "phone_code", phoneNumberId: "phone_test" }],
      prepareFirstFactor: async (argumentsValue: { strategy: string; phoneNumberId: string }) => {
        signInResendCalls.push(argumentsValue);
        return { status: "needs_first_factor" };
      },
      create: async (createParams: Record<string, unknown>) => {
        signInCreateCalls.push(createParams);
        if (authenticationMode === "signin-rate-limit")
          throw {
            retryAfter: 90,
            errors: [{ code: "too_many_requests", message: "Too many verification requests." }],
          };
        if (shouldUseSignUpFlow(authenticationMode)) {
          throw buildIdentifierNotFoundError();
        }
        return { status: "needs_first_factor" };
      },
      attemptFirstFactor: async (argumentsValue: { strategy: string; code: string }) => {
        signInCodeAttempts.push(argumentsValue);
        return { status: "complete", createdSessionId: "session_signin" };
      },
    },
    setActive: async ({ session: sessionId }: { session: string }) => {
      signInSetActiveCalls.push(sessionId);
    },
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      ...existingSignUp,
      create: async (createParams: Record<string, unknown>) => {
        signUpCreateCalls.push(createParams);
        if (authenticationMode === "signup-captcha") {
          throw buildBotProtectionError();
        }
        if (
          authenticationMode === "signup-captcha-pending" ||
          authenticationMode === "signup-captcha-invisible"
        ) {
          const captchaElement = document.getElementById("clerk-captcha");
          const captchaChallengeElement = document.createElement("div");
          captchaChallengeElement.setAttribute("data-testid", "clerk-captcha-challenge");
          if (authenticationMode === "signup-captcha-pending") {
            captchaChallengeElement.getBoundingClientRect = () => ({
              width: 300,
              height: 65,
              top: 0,
              bottom: 65,
              left: 0,
              right: 300,
              x: 0,
              y: 0,
              toJSON: () => ({}),
            });
          }
          captchaElement?.appendChild(captchaChallengeElement);
          await new Promise<void>((resolve) => {
            finishCaptchaChallenge = resolve;
          });
        }
        return { status: "missing_requirements" };
      },
      preparePhoneNumberVerification: async () => {
        verificationPreparationCount += 1;
        return { status: "missing_requirements" };
      },
      attemptPhoneNumberVerification: async (argumentsValue: { code: string }) => {
        signUpCodeAttempts.push(argumentsValue);
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
  return renderResult;
}

const mockOnSuccess = mock(() => {});

describe("usePhoneAuthFlow", () => {
  beforeAll(async () => {
    const module = await import("./phone-auth-flow");
    LoadedPhoneAuthFlow = module.PhoneAuthFlow;
  });

  beforeEach(() => {
    sessionStorage.clear();
    existingSignIn = undefined;
    existingSignUp = undefined;
    signInCodeAttempts.length = 0;
    signUpCodeAttempts.length = 0;
    signInResendCalls.length = 0;
    authenticationMode = "signin";
    isSignedIn = false;
    signInSetActiveCalls.length = 0;
    signUpSetActiveCalls.length = 0;
    signInCreateCalls.length = 0;
    signUpCreateCalls.length = 0;
    signUpUpdateCalls.length = 0;
    mockOnSuccess.mockClear();
    finishCaptchaChallenge = undefined;
    verificationPreparationCount = 0;
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

  for (const mode of ["signin", "signup"] as const) {
    it(`clears a completed ${mode} cooldown before signing out and starting a new sign-in`, async () => {
      authenticationMode = mode;
      const firstFlow = await submitPhoneAndCode();
      await waitFor(() =>
        expect(mode === "signin" ? signInSetActiveCalls.length : signUpSetActiveCalls.length).toBe(
          1,
        ),
      );
      expect(sessionStorage.getItem("phone-auth-code-request-cooldown")).toBeNull();
      expect(mode === "signin" ? signInCodeAttempts : signUpCodeAttempts).toEqual([
        mode === "signin" ? { strategy: "phone_code", code: "123456" } : { code: "123456" },
      ]);
      firstFlow.unmount();
      authenticationMode = "signin";
      const nextFlow = render(
        <LoadedPhoneAuthFlow
          onSuccess={mockOnSuccess}
          initialPhoneNumber="+13104996272"
          autoSendInitialCode
        />,
      );
      await nextFlow.findByText("Sent to +1 310 499 6272");
      expect(signInCreateCalls).toHaveLength(2);
    });

    it(`resumes an unexpired ${mode} code for the RSVP phone without requesting another code`, async () => {
      const verification = {
        strategy: "phone_code",
        status: "unverified",
        expireAt: new Date(Date.now() + 600000),
      };
      if (mode === "signin")
        existingSignIn = {
          status: "needs_first_factor",
          identifier: "+13104996272",
          firstFactorVerification: verification,
        };
      else
        existingSignUp = {
          status: "missing_requirements",
          phoneNumber: "+13104996272",
          verifications: { phoneNumber: verification },
        };
      sessionStorage.setItem("phone-auth-code-request-cooldown", String(Date.now() + 30000));
      const flow = render(
        <LoadedPhoneAuthFlow
          onSuccess={mockOnSuccess}
          initialPhoneNumber="+13104996272"
          autoSendInitialCode
        />,
      );
      await flow.findByText("Sent to +1 310 499 6272");
      expect(signInCreateCalls).toHaveLength(0);
      expect(signUpCreateCalls).toHaveLength(0);
      expect(verificationPreparationCount).toBe(0);
      const user = userEvent.setup({ document: globalThis.document });
      const codeInput = flow.container.querySelector("input");
      await user.type(codeInput as HTMLInputElement, "123456");
      await waitFor(() =>
        expect(mode === "signin" ? signInSetActiveCalls.length : signUpSetActiveCalls.length).toBe(
          1,
        ),
      );
      expect(sessionStorage.getItem("phone-auth-code-request-cooldown")).toBeNull();
    });
  }

  it("does not reuse a completed, expired, or different-number verification", async () => {
    for (const scenario of ["completed", "expired", "different-number"] as const) {
      sessionStorage.clear();
      existingSignIn = {
        status: scenario === "completed" ? "complete" : "needs_first_factor",
        identifier: scenario === "different-number" ? "+12025550123" : "+13104996272",
        firstFactorVerification: {
          strategy: "phone_code",
          status: scenario === "completed" ? "verified" : "unverified",
          expireAt: new Date(Date.now() + (scenario === "expired" ? -1 : 600000)),
        },
      };
      const flow = render(
        <LoadedPhoneAuthFlow
          onSuccess={mockOnSuccess}
          initialPhoneNumber="+13104996272"
          autoSendInitialCode
        />,
      );
      await flow.findByText("Sent to +1 310 499 6272");
      flow.unmount();
    }
    expect(signInCreateCalls).toHaveLength(3);
  });

  it("resends against the current sign-in verification instead of creating another sign-in", async () => {
    existingSignIn = {
      status: "needs_first_factor",
      identifier: "+13104996272",
      firstFactorVerification: {
        strategy: "phone_code",
        status: "unverified",
        expireAt: new Date(Date.now() + 600000),
      },
    };
    const flow = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );
    await flow.findByText("Sent to +1 310 499 6272");
    const user = userEvent.setup({ document: globalThis.document });
    await user.click(flow.getByRole("button", { name: "Resend code" }));
    expect(signInResendCalls).toEqual([{ strategy: "phone_code", phoneNumberId: "phone_test" }]);
    expect(signInCreateCalls).toHaveLength(0);
    expect(Boolean(flow.queryByText("Resend in 30s"))).toBe(true);
  });

  it("auto-sends OTP for an initial handoff phone without phone re-entry", async () => {
    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );

    expect((renderResult.getByLabelText("Phone number") as HTMLInputElement).value).toBe(
      "310 499 6272",
    );
    await renderResult.findByText("Sent to +1 310 499 6272");
    expect(signInCreateCalls[0]).toEqual({
      strategy: "phone_code",
      identifier: "+13104996272",
    });
  });

  it("honors Clerk's longer retry interval without showing CAPTCHA guidance", async () => {
    authenticationMode = "signin-rate-limit";
    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );
    await renderResult.findByRole("button", { name: "Resend in 90s" });
    expect(
      renderResult.getByRole("button", { name: "Resend in 90s" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(Boolean(renderResult.queryByText(/Sent to/))).toBe(false);
    expect(Boolean(renderResult.queryByText(/security check/))).toBe(false);
    expect(signInCreateCalls).toHaveLength(1);
  });

  it("auto-sends only once in React Strict Mode", async () => {
    const renderResult = render(
      <StrictMode>
        <LoadedPhoneAuthFlow
          onSuccess={mockOnSuccess}
          initialPhoneNumber="+13104996272"
          autoSendInitialCode
        />
      </StrictMode>,
    );
    await renderResult.findByText("Sent to +1 310 499 6272");
    expect(signInCreateCalls).toHaveLength(1);
  });

  it("keeps the prefilled phone form retryable when CAPTCHA fails without sending a code", async () => {
    authenticationMode = "signup-captcha";
    const user = userEvent.setup({ document: globalThis.document });
    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );
    await renderResult.findByText(
      "The security check didn't finish. Please try sending the code again.",
    );
    expect((renderResult.getByLabelText("Phone number") as HTMLInputElement).value).toBe(
      "310 499 6272",
    );
    expect(Boolean(renderResult.queryByText(/Sent to/))).toBe(false);
    expect(verificationPreparationCount).toBe(0);
    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(
      renderResult.getByRole("button", { name: "Resend in 30s" }).hasAttribute("disabled"),
    ).toBe(true);
    const originalNow = Date.now();
    const clockMock = spyOn(Date, "now").mockReturnValue(originalNow + 31000);
    await renderResult.findByRole("button", { name: "Text me a code" }, { timeout: 2000 });
    clockMock.mockRestore();
    // Advance the saved cooldown too: the next request uses the same wall clock.
    const retryClock = spyOn(Date, "now").mockReturnValue(originalNow + 31000);
    authenticationMode = "signup";
    await user.click(renderResult.getByRole("button", { name: "Text me a code" }));
    await renderResult.findByText("Sent to +1 310 499 6272");
    expect(verificationPreparationCount).toBe(1);
    expect(Boolean(renderResult.queryByRole("alert"))).toBe(false);
    retryClock.mockRestore();
  });

  it("waits for a visible CAPTCHA to finish before showing OTP and clears its error state", async () => {
    authenticationMode = "signup-captcha-pending";
    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );
    await renderResult.findByText(
      "Complete the security check to receive your code.",
      {},
      { timeout: 2500 },
    );
    expect((renderResult.getByLabelText("Phone number") as HTMLInputElement).value).toBe(
      "310 499 6272",
    );
    expect(Boolean(renderResult.queryByText(/Sent to/))).toBe(false);
    expect(Boolean(renderResult.queryByTestId("clerk-captcha-challenge"))).toBe(true);
    expect(verificationPreparationCount).toBe(0);
    expect(signUpCreateCalls).toHaveLength(1);
    finishCaptchaChallenge?.();
    await renderResult.findByText("Sent to +1 310 499 6272");
    expect(verificationPreparationCount).toBe(1);
    expect(Boolean(renderResult.queryByRole("alert"))).toBe(false);
    expect(Boolean(renderResult.queryByLabelText("Phone number"))).toBe(false);
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it("does not show CAPTCHA guidance for an invisible widget", async () => {
    authenticationMode = "signup-captcha-invisible";
    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );
    await renderResult.findByTestId("clerk-captcha-challenge");
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(Boolean(renderResult.queryByText(/Complete the security check/))).toBe(false);
    expect(Boolean(renderResult.queryByText(/Captcha not showing up/))).toBe(false);
    expect(Boolean(renderResult.queryByText(/Sent to/))).toBe(false);
    finishCaptchaChallenge?.();
    await renderResult.findByText("Sent to +1 310 499 6272");
  });

  it("preserves the resend cooldown after editing and remounting the phone form", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );
    await renderResult.findByText("Sent to +1 310 499 6272");
    await user.click(renderResult.getByRole("button", { name: "edit" }));
    expect(
      renderResult.getByRole("button", { name: "Resend in 30s" }).hasAttribute("disabled"),
    ).toBe(true);
    expect((renderResult.getByLabelText("Phone number") as HTMLInputElement).value).toBe(
      "310 499 6272",
    );
    renderResult.unmount();
    const reloaded = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );
    await reloaded.findByRole("button", { name: "Resend in 30s" });
    expect(signInCreateCalls).toHaveLength(1);
    expect(Boolean(reloaded.queryByText(/Sent to/))).toBe(false);
  });

  it("ignores the old challenge result after editing the phone number", async () => {
    authenticationMode = "signup-captcha-pending";
    const user = userEvent.setup({ document: globalThis.document });
    const renderResult = render(
      <LoadedPhoneAuthFlow
        onSuccess={mockOnSuccess}
        initialPhoneNumber="+13104996272"
        autoSendInitialCode
      />,
    );
    await renderResult.findByRole("button", { name: "Edit phone number" }, { timeout: 2500 });
    await user.click(renderResult.getByRole("button", { name: "Edit phone number" }));
    finishCaptchaChallenge?.();
    await waitForReactScheduler();
    expect((renderResult.getByLabelText("Phone number") as HTMLInputElement).value).toBe(
      "310 499 6272",
    );
    expect(verificationPreparationCount).toBe(0);
    expect(Boolean(renderResult.queryByText(/Sent to/))).toBe(false);
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

    await renderResult.findByText(
      "The security check didn't finish. Please try sending the code again.",
    );
    expect(renderResult.queryByText("Captcha required.")).toBeNull();
    expect(renderResult.queryByText("Sent to +1 310 499 6272")).toBeNull();
    expect((renderResult.getByLabelText("Phone number") as HTMLInputElement).value).toBe(
      "310 499 6272",
    );
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
