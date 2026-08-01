import { describe, expect, it } from "vitest";
import {
  formatApprovalMessage,
  formatDeferredApprovalMessage,
  resolveSendQrOnApproval,
} from "../convex/notifications";

// Resolution precedence (top wins):
//   1. List `sendQrOnApproval`
//   2. Event `sendQrOnApproval`
//   3. Legacy: list/event `defersQrDelivery === false` (explicit immediate-send)
//   4. Default `false`

describe("resolveSendQrOnApproval", () => {
  it("returns false when both event and list are undefined", () => {
    expect(resolveSendQrOnApproval(undefined, undefined)).toBe(false);
    expect(resolveSendQrOnApproval({}, {})).toBe(false);
  });

  it("honors list-level explicit override above event level", () => {
    expect(resolveSendQrOnApproval({ sendQrOnApproval: false }, { sendQrOnApproval: true })).toBe(
      true,
    );
    expect(resolveSendQrOnApproval({ sendQrOnApproval: true }, { sendQrOnApproval: false })).toBe(
      false,
    );
  });

  it("falls through to event-level when list does not override", () => {
    expect(resolveSendQrOnApproval({ sendQrOnApproval: true }, {})).toBe(true);
    expect(resolveSendQrOnApproval({ sendQrOnApproval: false }, {})).toBe(false);
  });

  it("treats legacy defersQrDelivery=false as an explicit opt-in to send", () => {
    expect(resolveSendQrOnApproval({ defersQrDelivery: false }, {})).toBe(true);
    expect(resolveSendQrOnApproval({}, { defersQrDelivery: false })).toBe(true);
  });

  it("treats legacy defersQrDelivery=true as the default off (don't send)", () => {
    expect(resolveSendQrOnApproval({ defersQrDelivery: true }, {})).toBe(false);
    expect(resolveSendQrOnApproval({}, { defersQrDelivery: true })).toBe(false);
  });

  it("prefers the new field over the legacy field at both levels", () => {
    expect(resolveSendQrOnApproval({ sendQrOnApproval: false, defersQrDelivery: false }, {})).toBe(
      false,
    );
    expect(resolveSendQrOnApproval({}, { sendQrOnApproval: true, defersQrDelivery: true })).toBe(
      true,
    );
  });
});

describe("approval SMS template variables", () => {
  const event = {
    name: "Spring Gala",
    secondaryTitle: "After Dark",
    productionCompany: "Coucou",
    location: "Main Room",
    eventDate: Date.UTC(2030, 4, 1, 16),
    eventTimezone: "America/New_York",
  };
  const recipient = { firstName: "Riley", lastName: "Stone" };

  it("renders the same variables used by text blasts in approval copy", () => {
    const message = formatApprovalMessage(
      event,
      recipient,
      "ticket-code",
      "https://dojo.test",
      "Hi {{ firstName }} for {{eventName}} at {{eventLocation}} on {{eventDate}}: {{ qrCodeUrl }}",
    );

    expect(message).toBe(
      "COUCOU:\n\nHi Riley for Spring Gala: After Dark at Main Room on 05.01.2030: https://dojo.test/redeem/ticket-code",
    );
  });

  it("omits both the ticket variable and automatic ticket footer when disabled", () => {
    const message = formatApprovalMessage(
      event,
      recipient,
      "ticket-code",
      "https://dojo.test",
      "Hi {{firstName}}, you are approved. Ticket: {{qrCodeUrl}}",
      false,
    );

    expect(message).toBe("COUCOU:\n\nHi Riley, you are approved. Ticket: ");
    expect(message).not.toContain("/redeem/ticket-code");
  });

  it("keeps the automatic ticket footer enabled by default for legacy callers", () => {
    const message = formatApprovalMessage(
      event,
      recipient,
      "ticket-code",
      "https://dojo.test",
      "Hi {{firstName}}, you are approved.",
    );

    expect(message).toContain(
      "Hi Riley, you are approved.\n\nView your ticket here: https://dojo.test/redeem/ticket-code",
    );
  });

  it("uses custom deferred confirmation copy without exposing the QR URL", () => {
    const message = formatDeferredApprovalMessage(
      event,
      recipient,
      "Hi {{firstName}}, approved for {{eventName}}. Ticket arrives later: {{qrCodeUrl}}",
    );

    expect(message).toBe(
      "COUCOU:\n\nHi Riley, approved for Spring Gala: After Dark. Ticket arrives later: ",
    );
  });

  it("uses the fixed Club Chlorine sender and opt-out reminder for Club Chlorine events", () => {
    const message = formatApprovalMessage(
      { ...event, siteKey: "club-chlorine" },
      recipient,
      "ticket-code",
      "https://clubchlorine.party",
      "You are approved for {{eventName}}. {{qrCodeUrl}}",
    );

    expect(message).toBe(
      "CLUB CHLORINE:\n\nYou are approved for Spring Gala: After Dark. https://clubchlorine.party/redeem/ticket-code\n\nReply STOP to opt out.",
    );
  });
});
