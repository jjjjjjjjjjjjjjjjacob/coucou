import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PhoneAuthFlow } from "./phone-auth-flow";

GlobalRegistrator.register({ url: "http://localhost:3000" });

type AuthenticationMode = "signin" | "signup";

let authenticationMode: AuthenticationMode = "signin";
let isSignedIn = false;
const signInSetActiveCalls: string[] = [];
const signUpSetActiveCalls: string[] = [];
const signUpCreateCalls: Array<Record<string, unknown>> = [];
const signUpUpdateCalls: Array<Record<string, unknown>> = [];

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

mock.module("@clerk/nextjs", () => ({
  useUser: () => ({
    isSignedIn,
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: async () => {
        if (authenticationMode === "signup") {
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
        return { status: "missing_requirements" };
      },
      preparePhoneNumberVerification: async () => ({
        status: "missing_requirements",
      }),
      attemptPhoneNumberVerification: async () => ({
        status: "missing_requirements",
        createdSessionId: null,
        missingFields: ["legal_accepted"],
        unverifiedFields: [],
      }),
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
    signUpCreateCalls.length = 0;
    signUpUpdateCalls.length = 0;
    mockOnSuccess.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
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
