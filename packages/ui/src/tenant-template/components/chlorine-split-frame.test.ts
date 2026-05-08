import { describe, expect, it } from "bun:test";
import { resolveLandingViewportDimensions } from "./chlorine-split-frame";

describe("chlorine split frame viewport measurement", () => {
  it("uses the screen viewport height when shell content is taller than the viewport", () => {
    expect(
      resolveLandingViewportDimensions({
        elementWidth: 390,
        elementHeight: 1400,
        viewportWidth: 390,
        viewportHeight: 852,
      }),
    ).toEqual({
      width: 390,
      height: 852,
    });
  });

  it("falls back to the measured element height when viewport height is unavailable", () => {
    expect(
      resolveLandingViewportDimensions({
        elementWidth: 650,
        elementHeight: 720,
      }),
    ).toEqual({
      width: 650,
      height: 720,
    });
  });
});
