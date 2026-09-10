import { describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SmsOptInPrompt } from "@/components/sms-opt-in-prompt";

describe("SMS opt-in prompt", () => {
  it("hides the entire SMS section when consent is enabled", () => {
    const { container } = render(
      <SmsOptInPrompt
        isSmsConsentEnabled
        isUpdatingSmsPreference={false}
        isUpdateDisabled={false}
        onEnableSms={mock(() => {})}
        smsSenderDisplayName="Dojo Pomodoro"
        textColor="#ff0000"
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/SMS from Dojo Pomodoro enabled/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SMS On/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Dojo Pomodoro may send/i)).not.toBeInTheDocument();
  });

  it("keeps the SMS enable prompt and disclosure when consent is disabled", () => {
    render(
      <SmsOptInPrompt
        isSmsConsentEnabled={false}
        isUpdatingSmsPreference={false}
        isUpdateDisabled={false}
        onEnableSms={mock(() => {})}
        smsSenderDisplayName="Dojo Pomodoro"
        textColor="#ff0000"
      />,
    );

    expect(screen.getByText("SMS from Dojo Pomodoro disabled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable SMS Updates" })).toBeInTheDocument();
    expect(screen.getByText(/Dojo Pomodoro may send/i)).toBeInTheDocument();
  });
});
