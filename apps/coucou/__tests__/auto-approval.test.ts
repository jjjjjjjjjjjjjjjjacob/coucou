import { describe, expect, it } from "vitest";
import {
  formatAutoApproveDelay,
  parseAutoApproveDelayInput,
  splitAutoApproveDelayMinutes,
} from "@/lib/auto-approval";

describe("auto-approval delay helpers", () => {
  it("normalizes supported delay units to minutes", () => {
    expect(parseAutoApproveDelayInput("15", "minutes")).toBe(15);
    expect(parseAutoApproveDelayInput("2", "hours")).toBe(120);
    expect(parseAutoApproveDelayInput("3", "days")).toBe(4_320);
    expect(parseAutoApproveDelayInput("", "hours")).toBeUndefined();
  });

  it("rejects non-positive and fractional delay values", () => {
    expect(() => parseAutoApproveDelayInput("0", "minutes")).toThrow();
    expect(() => parseAutoApproveDelayInput("1.5", "hours")).toThrow();
  });

  it("uses the largest exact unit when hydrating a saved delay", () => {
    expect(splitAutoApproveDelayMinutes(2_880)).toEqual({ value: "2", unit: "days" });
    expect(splitAutoApproveDelayMinutes(120)).toEqual({ value: "2", unit: "hours" });
    expect(splitAutoApproveDelayMinutes(90)).toEqual({ value: "90", unit: "minutes" });
    expect(splitAutoApproveDelayMinutes(undefined)).toEqual({ value: "", unit: "hours" });
  });

  it("formats review copy with singular and immediate states", () => {
    expect(formatAutoApproveDelay("", "hours")).toBe("immediately");
    expect(formatAutoApproveDelay("1", "hours")).toBe("after 1 hour");
    expect(formatAutoApproveDelay("2", "days")).toBe("after 2 days");
  });
});
