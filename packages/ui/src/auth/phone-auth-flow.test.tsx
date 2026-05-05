import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PhoneAuthFlow } from "./phone-auth-flow";
import type { PhoneAuthState } from "./config/types";

GlobalRegistrator.register({ url: "http://localhost:3000" });

const resendCode = mock(async () => {});

const verificationState: PhoneAuthState = {
  step: "verification",
  phoneNumber: "555 555 5555",
  countryCode: "+1",
  isLoading: false,
  error: null,
  canResend: true,
  resendCooldown: 0,
  authMode: "signin",
};

mock.module("./hooks/use-phone-auth-flow", () => ({
  usePhoneAuthFlow: () => ({
    state: verificationState,
    setPhone: mock(() => {}),
    setCountryCode: mock(() => {}),
    sendVerificationCode: mock(async () => {}),
    verifyCode: mock(async () => {}),
    resendCode,
    goBack: mock(() => {}),
    clearError: mock(() => {}),
  }),
}));

let LoadedPhoneAuthFlow: typeof PhoneAuthFlow;

describe("PhoneAuthFlow", () => {
  beforeAll(async () => {
    const module = await import("./phone-auth-flow");
    LoadedPhoneAuthFlow = module.PhoneAuthFlow;
  });

  beforeEach(() => {
    resendCode.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    GlobalRegistrator.unregister();
  });

  it("clears the OTP input when resending a code", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const { container } = render(<LoadedPhoneAuthFlow onSuccess={() => {}} />);
    const otpInput = container.querySelector("input");

    expect(otpInput).toBeTruthy();
    await user.type(otpInput as HTMLInputElement, "123");
    expect((otpInput as HTMLInputElement).value).toBe("123");

    const resendButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Resend code",
    );
    expect(resendButton).toBeTruthy();
    await user.click(resendButton as HTMLButtonElement);

    expect(resendCode).toHaveBeenCalledTimes(1);
    expect((otpInput as HTMLInputElement).value).toBe("");
  });
});
