import { describe, expect, it } from "bun:test";
import {
  buildApprovalMessageBackfillPatch,
  getDefaultApprovalMessage,
  resolveApprovalMessageText,
} from "@coucou/sdk/shared/approval-messages";

describe("approval message helpers", () => {
  it("prefers the list approval message over deprecated event-level copy", () => {
    const approvalMessage = resolveApprovalMessageText({
      eventName: "Spring Gala",
      listApprovalMessage: "VIP guests are approved.",
      eventApprovalMessage: "Legacy event approval copy.",
    });

    expect(approvalMessage).toBe("VIP guests are approved.");
  });

  it("falls back to deprecated event-level copy when the list message is blank", () => {
    const approvalMessage = resolveApprovalMessageText({
      eventName: "Spring Gala",
      listApprovalMessage: "   ",
      eventApprovalMessage: "Legacy event approval copy.",
    });

    expect(approvalMessage).toBe("Legacy event approval copy.");
  });

  it("falls back to the default approval message when both custom values are blank", () => {
    const approvalMessage = resolveApprovalMessageText({
      eventName: "Spring Gala",
      listApprovalMessage: "",
      eventApprovalMessage: "   ",
    });

    expect(approvalMessage).toBe(getDefaultApprovalMessage("Spring Gala"));
  });

  it("builds a migration patch only when the credential is missing its own approval message", () => {
    const patch = buildApprovalMessageBackfillPatch({
      credentialApprovalMessage: "",
      eventApprovalMessage: "Copied from event",
    });

    expect(patch).toEqual({ approvalMessage: "Copied from event" });
    expect(Object.keys(patch ?? {})).toEqual(["approvalMessage"]);
  });

  it("does not backfill when the credential already has an approval message", () => {
    const patch = buildApprovalMessageBackfillPatch({
      credentialApprovalMessage: "Already customized",
      eventApprovalMessage: "Copied from event",
    });

    expect(patch).toBeUndefined();
  });

  it("does not backfill when the event has no usable approval message", () => {
    const patch = buildApprovalMessageBackfillPatch({
      credentialApprovalMessage: undefined,
      eventApprovalMessage: "   ",
    });

    expect(patch).toBeUndefined();
  });
});
