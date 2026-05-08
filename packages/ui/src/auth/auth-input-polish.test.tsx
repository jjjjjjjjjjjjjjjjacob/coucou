import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CountrySelector } from "./country-selector";
import type { shouldShowOtpFakeCaret } from "./otp-input";
import type { PhoneInput } from "./phone-input";

GlobalRegistrator.register({ url: "http://localhost:3000" });

let LoadedCountrySelector: typeof CountrySelector;
let LoadedPhoneInput: typeof PhoneInput;
let loadedShouldShowOtpFakeCaret: typeof shouldShowOtpFakeCaret;

describe("auth input polish", () => {
  beforeAll(async () => {
    const countrySelectorModule = await import("./country-selector");
    const otpInputModule = await import("./otp-input");
    const phoneInputModule = await import("./phone-input");
    LoadedCountrySelector = countrySelectorModule.CountrySelector;
    LoadedPhoneInput = phoneInputModule.PhoneInput;
    loadedShouldShowOtpFakeCaret = otpInputModule.shouldShowOtpFakeCaret;
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    GlobalRegistrator.unregister();
  });

  it("uses 16px text for phone and country search inputs on mobile", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const { container } = render(
      <LoadedPhoneInput
        value=""
        countryCode="+1"
        onValueChange={() => {}}
        onCountryCodeChange={() => {}}
        onSubmit={() => {}}
      />,
    );

    const phoneInput = container.querySelector("#phone-auth-phone-number");
    expect(phoneInput?.className).toContain("text-[16px]");
    expect(phoneInput?.className).toContain("sm:text-[15px]");

    cleanup();
    const countrySelectorRender = render(<LoadedCountrySelector value="+1" onChange={() => {}} />);
    await user.click(countrySelectorRender.getByRole("button"));

    const searchInput = countrySelectorRender.getByPlaceholderText("Search countries…");
    expect(searchInput.className).toContain("text-[16px]");
    expect(searchInput.className).toContain("sm:text-sm");
  });

  it("hides the OTP fake caret while disabled", () => {
    expect(loadedShouldShowOtpFakeCaret({ hasFakeCaret: true })).toBe(true);
    expect(loadedShouldShowOtpFakeCaret({ hasFakeCaret: true, disabled: true })).toBe(false);
    expect(loadedShouldShowOtpFakeCaret({ hasFakeCaret: false, disabled: true })).toBe(false);
  });
});
