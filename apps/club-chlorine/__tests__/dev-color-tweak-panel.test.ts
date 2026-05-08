import { describe, expect, it } from "bun:test";
import { shouldExpandDevColorTweakPanelInitially } from "../components/dev-color-tweak-panel";

describe("dev color tweak panel", () => {
  it("starts collapsed by default on local development routes", () => {
    expect(shouldExpandDevColorTweakPanelInitially("")).toBe(false);
    expect(shouldExpandDevColorTweakPanelInitially("?password=pool")).toBe(false);
  });

  it("starts expanded for explicit tweak share URLs", () => {
    expect(shouldExpandDevColorTweakPanelInitially("?tweak=1")).toBe(true);
    expect(shouldExpandDevColorTweakPanelInitially("?bg=FFFFFF")).toBe(true);
    expect(shouldExpandDevColorTweakPanelInitially("?fg=1E3CFF")).toBe(true);
  });
});
