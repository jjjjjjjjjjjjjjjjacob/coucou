import { describe, expect, it } from "bun:test";
import { resolveSendQrOnApproval } from "../convex/notifications";

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
