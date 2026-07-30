import type { StaffScanOutcome } from "@/types";

export const SCAN_DUPLICATE_COOLDOWN_MILLISECONDS = 2_000;
export const SCAN_UNDO_WINDOW_MILLISECONDS = 10_000;

export type ScanMachineState =
  | { status: "ready" }
  | { status: "submitting"; code: string }
  | {
      status: "feedback";
      code: string;
      outcome: StaffScanOutcome;
      receivedAt: number;
    };

export type ScanMachineAction =
  | { type: "SUBMIT"; code: string }
  | {
      type: "RESOLVE";
      code: string;
      outcome: StaffScanOutcome;
      receivedAt: number;
    }
  | { type: "REARM" };

export function scanMachineReducer(
  state: ScanMachineState,
  action: ScanMachineAction,
): ScanMachineState {
  switch (action.type) {
    case "SUBMIT":
      return state.status === "ready" ? { status: "submitting", code: action.code } : state;
    case "RESOLVE":
      return state.status === "submitting" && state.code === action.code
        ? {
            status: "feedback",
            code: action.code,
            outcome: action.outcome,
            receivedAt: action.receivedAt,
          }
        : state;
    case "REARM":
      return { status: "ready" };
  }
}

export function shouldSuppressDuplicateScan(
  lastCode: string | undefined,
  lastReadAt: number | undefined,
  nextCode: string,
  now: number,
): boolean {
  return (
    lastCode === nextCode &&
    lastReadAt !== undefined &&
    now - lastReadAt < SCAN_DUPLICATE_COOLDOWN_MILLISECONDS
  );
}
