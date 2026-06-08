import { describe, expect, it } from "bun:test";
import {
  CHLORINE_COLLAPSED_SHELL_FALLBACK_VIEWPORT_DIMENSIONS,
  resolveLandingViewportDimensions,
  resolveStableLandingViewportDimensions,
} from "./chlorine-split-frame";

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

  it("supports a mobile-first collapsed shell fallback before viewport measurement", () => {
    expect(
      resolveLandingViewportDimensions({
        elementWidth: 0,
        elementHeight: 0,
        fallbackViewportDimensions: CHLORINE_COLLAPSED_SHELL_FALLBACK_VIEWPORT_DIMENSIONS,
      }),
    ).toEqual({
      width: 390,
      height: 852,
    });
  });

  it("keeps mobile height stable during scroll-only viewport height changes", () => {
    expect(
      resolveStableLandingViewportDimensions({
        elementWidth: 390,
        elementHeight: 780,
        viewportWidth: 390,
        viewportHeight: 720,
        previousViewport: {
          width: 390,
          height: 640,
          hasMeasuredViewport: true,
        },
      }),
    ).toEqual({
      width: 390,
      height: 640,
    });
  });

  it("updates mobile measurement when viewport width changes", () => {
    expect(
      resolveStableLandingViewportDimensions({
        elementWidth: 640,
        elementHeight: 360,
        viewportWidth: 640,
        viewportHeight: 360,
        previousViewport: {
          width: 390,
          height: 640,
          hasMeasuredViewport: true,
        },
      }),
    ).toEqual({
      width: 640,
      height: 360,
    });
  });

  it("allows desktop height-only viewport changes", () => {
    expect(
      resolveStableLandingViewportDimensions({
        elementWidth: 1024,
        elementHeight: 768,
        viewportWidth: 1024,
        viewportHeight: 700,
        previousViewport: {
          width: 1024,
          height: 768,
          hasMeasuredViewport: true,
        },
      }),
    ).toEqual({
      width: 1024,
      height: 700,
    });
  });
});
