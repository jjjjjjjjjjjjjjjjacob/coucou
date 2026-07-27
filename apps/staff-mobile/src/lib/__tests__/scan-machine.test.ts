import {
  scanMachineReducer,
  SCAN_DUPLICATE_COOLDOWN_MILLISECONDS,
  shouldSuppressDuplicateScan,
} from "../scan-machine";

describe("scan machine", () => {
  it("moves from ready through submission and feedback", () => {
    const submittingState = scanMachineReducer(
      { status: "ready" },
      { type: "SUBMIT", code: "AB12CD34" },
    );
    const feedbackState = scanMachineReducer(submittingState, {
      type: "RESOLVE",
      code: "AB12CD34",
      outcome: {
        outcome: "invalid",
        message: "Not recognized",
      },
      receivedAt: 100,
    });
    expect(feedbackState.status).toBe("feedback");
    expect(scanMachineReducer(feedbackState, { type: "REARM" })).toEqual({
      status: "ready",
    });
  });

  it("suppresses only matching codes inside the cooldown", () => {
    expect(
      shouldSuppressDuplicateScan(
        "AB12CD34",
        100,
        "AB12CD34",
        100 + SCAN_DUPLICATE_COOLDOWN_MILLISECONDS - 1,
      ),
    ).toBe(true);
    expect(
      shouldSuppressDuplicateScan(
        "AB12CD34",
        100,
        "ZX98YU76",
        101,
      ),
    ).toBe(false);
  });
});
