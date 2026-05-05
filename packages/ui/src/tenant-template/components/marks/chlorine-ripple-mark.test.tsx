import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { ChlorineLanding } from "../chlorine-landing";
import { ChlorineRippleMark } from "./chlorine-ripple-mark";

type MockFunction = ReturnType<typeof mock>;

interface TestWebGlContext extends WebGLRenderingContext {
  uniform1i: MockFunction;
  uniform1f: MockFunction;
  uniform2f: MockFunction;
  uniform3fv: MockFunction;
}

let canvasWidth = 800;
let canvasHeight = 600;
let scheduledAnimationFrame: FrameRequestCallback | null = null;
let animationFrameTimestampMs = 0;
let performanceNowMs = 0;
let webGlContext: TestWebGlContext;
let canvasGetContext: MockFunction;
let originalImage: typeof Image;
let originalWindowImage: typeof Image;
let originalGetContext: HTMLCanvasElement["getContext"];
let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;

function create2dContext() {
  return {
    clearRect: mock(),
    beginPath: mock(),
    clip: mock(),
    drawImage: mock(),
    fillRect: mock(),
    fillStyle: "",
    globalCompositeOperation: "source-over",
    rect: mock(),
    restore: mock(),
    save: mock(),
  } as unknown as CanvasRenderingContext2D;
}

function createWebGlContext(): TestWebGlContext {
  return {
    ARRAY_BUFFER: 0x8892,
    CLAMP_TO_EDGE: 0x812f,
    COLOR_ATTACHMENT0: 0x8ce0,
    COLOR_BUFFER_BIT: 0x4000,
    COMPILE_STATUS: 0x8b81,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    FRAMEBUFFER: 0x8d40,
    LINEAR: 0x2601,
    LINK_STATUS: 0x8b82,
    RGBA: 0x1908,
    STATIC_DRAW: 0x88e4,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TRIANGLES: 0x0004,
    UNSIGNED_BYTE: 0x1401,
    VERTEX_SHADER: 0x8b31,
    activeTexture: mock(),
    attachShader: mock(),
    bindBuffer: mock(),
    bindFramebuffer: mock(),
    bindTexture: mock(),
    bufferData: mock(),
    clear: mock(),
    clearColor: mock(),
    compileShader: mock(),
    createBuffer: mock(() => ({})),
    createFramebuffer: mock(() => ({})),
    createProgram: mock(() => ({})),
    createShader: mock(() => ({})),
    createTexture: mock(() => ({})),
    deleteBuffer: mock(),
    deleteFramebuffer: mock(),
    deleteProgram: mock(),
    deleteShader: mock(),
    deleteTexture: mock(),
    drawArrays: mock(),
    enableVertexAttribArray: mock(),
    framebufferTexture2D: mock(),
    getAttribLocation: mock(() => 0),
    getExtension: mock(() => ({})),
    getProgramInfoLog: mock(() => ""),
    getProgramParameter: mock(() => true),
    getShaderInfoLog: mock(() => ""),
    getShaderParameter: mock(() => true),
    getUniformLocation: mock((_program: WebGLProgram, name: string) => ({
      name,
    })),
    linkProgram: mock(),
    shaderSource: mock(),
    texImage2D: mock(),
    texParameteri: mock(),
    uniform1f: mock(),
    uniform1i: mock(),
    uniform2f: mock(),
    uniform3fv: mock(),
    useProgram: mock(),
    vertexAttribPointer: mock(),
    viewport: mock(),
  } as unknown as TestWebGlContext;
}

function installCanvasMocks({
  webGlAvailable = true,
  reducedMotion = false,
}: {
  webGlAvailable?: boolean;
  reducedMotion?: boolean;
} = {}) {
  webGlContext = createWebGlContext();
  canvasGetContext = mock((contextId: string) => {
    if (contextId === "webgl") {
      return webGlAvailable ? webGlContext : null;
    }

    if (contextId === "2d") {
      return create2dContext();
    }

    return null;
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: canvasGetContext,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return canvasWidth;
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return canvasHeight;
    },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: reducedMotion,
      media: query,
      onchange: null,
      addListener: mock(),
      removeListener: mock(),
      addEventListener: mock(),
      removeEventListener: mock(),
      dispatchEvent: mock(),
    }),
  });
}

class TestImage {
  complete = false;
  decoding: "async" | "sync" | "auto" = "async";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private source = "";

  get src() {
    return this.source;
  }

  set src(nextSource: string) {
    this.source = nextSource;
    queueMicrotask(() => {
      this.complete = true;
      this.onload?.();
    });
  }
}

function installBrowserMocks() {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 1,
  });
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => performanceNowMs,
  });
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: TestImage as unknown as typeof Image,
  });
  Object.defineProperty(window, "Image", {
    configurable: true,
    value: TestImage as unknown as typeof Image,
  });
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: mock((callback: FrameRequestCallback) => {
      scheduledAnimationFrame = callback;
      return 1;
    }),
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: mock(),
  });
}

function getUniform1iCalls(uniformName: string) {
  return webGlContext.uniform1i.mock.calls.filter(
    ([location]) =>
      (location as { name?: string } | null)?.name === uniformName,
  );
}

async function settleImageLoading() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advanceAnimationFrameBy(deltaMs: number) {
  animationFrameTimestampMs += deltaMs;
  performanceNowMs += deltaMs;

  await act(async () => {
    scheduledAnimationFrame?.(animationFrameTimestampMs);
    await Promise.resolve();
  });
}

describe("ChlorineRippleMark", () => {
  beforeAll(() => {
    GlobalRegistrator.register({ url: "http://localhost:3000" });
    originalImage = globalThis.Image;
    originalWindowImage = window.Image;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
  });

  beforeEach(() => {
    canvasWidth = 800;
    canvasHeight = 600;
    scheduledAnimationFrame = null;
    animationFrameTimestampMs = 0;
    performanceNowMs = 0;
    installBrowserMocks();
    installCanvasMocks();
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: originalGetContext,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: originalImage,
    });
    Object.defineProperty(window, "Image", {
      configurable: true,
      value: originalWindowImage,
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: originalRequestAnimationFrame,
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: originalCancelAnimationFrame,
    });
    GlobalRegistrator.unregister();
  });

  it("keeps the static SVG mask fallback when WebGL is unavailable", async () => {
    installCanvasMocks({ webGlAvailable: false });

    const { container, getByRole } = render(<ChlorineRippleMark size={120} />);

    expect(getByRole("img", { name: "Club Chlorine" })).toBeTruthy();
    expect(
      container.querySelector('[data-chlorine-ripple-canvas="true"]'),
    ).toBeTruthy();
    expect(
      canvasGetContext.mock.calls.some(([contextId]) => contextId === "webgl"),
    ).toBe(true);
  });

  it("does not start WebGL when reduced motion is requested", () => {
    installCanvasMocks({ reducedMotion: true });

    render(<ChlorineRippleMark size={120} />);

    expect(
      canvasGetContext.mock.calls.some(([contextId]) => contextId === "webgl"),
    ).toBe(false);
  });

  it("queues the TNM click ripple pass after a click", async () => {
    render(<ChlorineRippleMark size={120} />);
    await settleImageLoading();

    window.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: 120,
        clientY: 80,
      }),
    );
    await advanceAnimationFrameBy(1000 / 60);

    expect(
      getUniform1iCalls("u_clickOnly").some(([, value]) => value === 1),
    ).toBe(true);
  });

  it("keeps the landing RSVP link clickable below the transparent ripple canvas", () => {
    installCanvasMocks({ webGlAvailable: false });

    const { container, getByRole } = render(
      <ChlorineLanding
        skipAnimation
        events={[
          {
            id: "event-1",
            date: "FRI 05.08",
            lineup: ["Pool Night"],
            rsvpHref: "/events/event-1/rsvp",
          },
        ]}
      />,
    );

    const rsvpLink = getByRole("link", { name: "RSVP" });
    expect(rsvpLink.getAttribute("href")).toBe("/events/event-1/rsvp");

    const rippleCanvas = container.querySelector<HTMLCanvasElement>(
      '[data-chlorine-ripple-canvas="true"]',
    );
    expect(rippleCanvas?.style.pointerEvents).toBe("none");
  });

  it("starts the landing ripple surface before the logo reaches its final phase", async () => {
    render(<ChlorineLanding events={[]} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      canvasGetContext.mock.calls.some(([contextId]) => contextId === "webgl"),
    ).toBe(true);
  });
});
