import { beforeEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MESSAGE_TEMPLATE_VARIABLES } from "@/lib/text-blast-message";

const informationToast = mock(() => undefined);

mock.module("sonner", () => ({
  toast: { info: informationToast },
}));

const { MessageTemplateVariableButtons } = await import(
  "@/components/message-template-variable-buttons"
);

describe("MessageTemplateVariableButtons", () => {
  beforeEach(() => {
    informationToast.mockClear();
  });

  it("inserts an editable sign-in CTA after the default confirmation copy", () => {
    const onMessageChange = mock(() => undefined);
    render(
      <MessageTemplateVariableButtons
        message=""
        onMessageChange={onMessageChange}
        statusCtaDefaultMessage="Your request is pending approval."
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Insert sign-in CTA" }));
    expect(onMessageChange).toHaveBeenCalledWith(
      "Your request is pending approval.\n\nWant to view your RSVP status? Sign in here: {{eventStatusUrl}}",
    );
  });

  it("keeps unavailable variables visible and explains why they cannot be inserted", () => {
    const onMessageChange = mock(() => undefined);
    const disabledReason = "Choose a message event to use event details.";

    render(
      <MessageTemplateVariableButtons
        message="Hello"
        onMessageChange={onMessageChange}
        disabledVariableNames={[
          "eventName",
          "eventDate",
          "eventLocation",
          "qrCodeUrl",
          "eventStatusUrl",
        ]}
        disabledVariableReason={disabledReason}
      />,
    );

    for (const variableName of MESSAGE_TEMPLATE_VARIABLES) {
      expect(screen.getByRole("button", { name: `{{${variableName}}}` })).toBeTruthy();
    }

    const eventNameButton = screen.getByRole("button", { name: "{{eventName}}" });
    expect(eventNameButton.getAttribute("aria-disabled")).toBe("true");
    expect(eventNameButton.getAttribute("title")).toBe(disabledReason);
    fireEvent.click(eventNameButton);
    expect(informationToast).toHaveBeenCalledWith(disabledReason);
    expect(onMessageChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "{{firstName}}" }));
    expect(onMessageChange).toHaveBeenCalledWith("Hello {{firstName}}");
  });
});
