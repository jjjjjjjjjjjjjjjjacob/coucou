"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type RefObject,
} from "react";

const SIMULATION_RESOLUTION = 512;
const SIMULATION_TIMESTEP_MS = 1000 / 60;
const MAX_SIMULATION_STEPS_PER_FRAME = 4;
const MAX_FRAME_DELTA_MS =
  SIMULATION_TIMESTEP_MS * MAX_SIMULATION_STEPS_PER_FRAME;
const IDLE_INTERVAL_MS = 2500;
const MAX_QUEUED_DROPS = 10;
const MINIMUM_MOVE_DISTANCE = 0.003;
const DEVICE_PIXEL_RATIO_CAP = 2;
const MAX_ACTIVE_RIPPLES = 4;
const DESKTOP_BASELINE_SHORT_EDGE = 800;
const MINIMUM_RADIUS_SCALE = 0.5;
const IDLE_DROP_STRENGTH = 0.08;
const SEED_DROP_STRENGTH = 0.1;

const DEFAULT_RIPPLE_SETTINGS = {
  dropRadius: 0.015,
  clickRadius: 0.14,
  refraction: 0.004,
  damping: 0.977,
  waveSpeed: 0.43,
  specular: 0,
  specPower: 1,
  dropStrengthMultiplier: 0.1,
  dropStrengthMaximum: 0.74,
  clickStrength: 0.2,
  clickRippleStrength: 0.13,
  clickRippleSpeed: 0.35,
  clickRippleWidth: 0.02,
  clickRippleDecay: 1.2,
  clickRippleMaximumRadius: 0.8,
  heightTint: 0.035,
  dropMomentum: 10,
  waveLength: 2.4,
};

type RippleSettings = typeof DEFAULT_RIPPLE_SETTINGS;

interface ViewportScale {
  radiusScale: number;
  strengthScale: number;
}

interface ViewportAspect {
  horizontal: number;
  vertical: number;
}

interface RippleFramebuffer {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

interface QueuedDrop {
  positionX: number;
  positionY: number;
  strength: number;
  radius: number;
  directionX: number;
  directionY: number;
}

interface ActiveRipple {
  positionX: number;
  positionY: number;
  startedAtMs: number;
}

interface RipplePieceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChlorineRippleSurfacePiece {
  source: string;
  elementRef?: RefObject<HTMLElement | null>;
  rect?: RipplePieceRect;
}

export interface ChlorineRippleSurfaceProps
  extends Omit<HTMLAttributes<HTMLCanvasElement>, "color"> {
  pieces: readonly ChlorineRippleSurfacePiece[];
  foregroundColor?: string;
  disabled?: boolean;
  refreshKey?: string | number;
  refreshDurationMs?: number;
  onReadyChange?: (isReady: boolean) => void;
}

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_textureCoordinate;
void main() {
  v_textureCoordinate = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const SIMULATION_FRAGMENT_SHADER_SOURCE = `
precision highp float;
#define MAX_RIPPLES 4
uniform sampler2D u_buffer;
uniform vec2 u_texel;
uniform float u_damping;
uniform float u_speed;
uniform float u_waveLength;
uniform vec2 u_dropPosition;
uniform float u_dropRadius;
uniform float u_dropStrength;
uniform vec2 u_dropDirection;
uniform float u_dropMomentum;
uniform vec2 u_viewportAspect;
uniform int u_rippleCount;
uniform vec3 u_ripples[MAX_RIPPLES];
uniform int u_clickOnly;
uniform float u_clickRippleStrength;
uniform float u_clickRippleSpeed;
uniform float u_clickRippleWidth;
uniform float u_clickRippleDecay;
varying vec2 v_textureCoordinate;

void main() {
  vec2 currentState = texture2D(u_buffer, v_textureCoordinate).rg;
  float height = currentState.r;
  float velocity = currentState.g;

  if (u_clickOnly == 0) {
    vec2 texel = u_texel * u_waveLength;
    float leftHeight = texture2D(u_buffer, v_textureCoordinate - vec2(texel.x, 0.0)).r;
    float rightHeight = texture2D(u_buffer, v_textureCoordinate + vec2(texel.x, 0.0)).r;
    float topHeight = texture2D(u_buffer, v_textureCoordinate + vec2(0.0, texel.y)).r;
    float bottomHeight = texture2D(u_buffer, v_textureCoordinate - vec2(0.0, texel.y)).r;

    float averageHeight = (leftHeight + rightHeight + topHeight + bottomHeight) * 0.25;
    velocity += (averageHeight - height) * u_speed;
    velocity *= u_damping;
    height += velocity;

    if (u_dropStrength > 0.0) {
      vec2 toFragment = (v_textureCoordinate - u_dropPosition) * u_viewportAspect;
      float distanceToDrop = length(toFragment);
      float gaussian = exp(-distanceToDrop * distanceToDrop / (2.0 * u_dropRadius * u_dropRadius));
      height += gaussian * u_dropStrength;
      float fragmentDistance = max(distanceToDrop, 0.001);
      float directionFactor = dot(u_dropDirection, toFragment / fragmentDistance);
      velocity += gaussian * directionFactor * u_dropMomentum * u_dropStrength;
    }
  }

  for (int rippleIndex = 0; rippleIndex < MAX_RIPPLES; rippleIndex++) {
    if (rippleIndex >= u_rippleCount) {
      continue;
    }

    vec3 ripple = u_ripples[rippleIndex];
    float age = ripple.z;
    float radius = age * u_clickRippleSpeed;
    float amplitude = u_clickRippleStrength * exp(-age * u_clickRippleDecay);
    vec2 toFragment = (v_textureCoordinate - ripple.xy) * u_viewportAspect;
    float distanceToRipple = length(toFragment);
    float rippleWidth = max(u_clickRippleWidth, 0.0001);
    float ringDistance = (distanceToRipple - radius) / rippleWidth;
    float crest = exp(-ringDistance * ringDistance);
    float innerWakeDistance = ringDistance + 1.15;
    float outerWakeDistance = ringDistance - 1.15;
    float innerWake = exp(-innerWakeDistance * innerWakeDistance) * 0.7;
    float outerWake = exp(-outerWakeDistance * outerWakeDistance) * 0.7;
    float edgeFade = smoothstep(0.0, rippleWidth, distanceToRipple);
    float ring = (crest - innerWake - outerWake) * edgeFade * amplitude;
    float radialForce =
      -ringDistance * crest * edgeFade * amplitude * (8.0 + u_clickRippleSpeed * 6.0);
    height += ring * 0.85;
    velocity += radialForce;
  }

  gl_FragColor = vec4(height, velocity, 0.0, 1.0);
}`;

const RENDER_FRAGMENT_SHADER_SOURCE = `
precision highp float;
uniform sampler2D u_buffer;
uniform sampler2D u_content;
uniform vec2 u_texel;
uniform float u_refraction;
uniform float u_specularStrength;
uniform float u_specularPower;
uniform float u_heightTint;
uniform float u_waveLength;
varying vec2 v_textureCoordinate;

void main() {
  vec2 texel = u_texel * u_waveLength;
  float leftHeight = texture2D(u_buffer, v_textureCoordinate - vec2(texel.x, 0.0)).r;
  float rightHeight = texture2D(u_buffer, v_textureCoordinate + vec2(texel.x, 0.0)).r;
  float topHeight = texture2D(u_buffer, v_textureCoordinate + vec2(0.0, texel.y)).r;
  float bottomHeight = texture2D(u_buffer, v_textureCoordinate - vec2(0.0, texel.y)).r;

  vec2 normal = vec2(leftHeight - rightHeight, topHeight - bottomHeight);
  vec2 refractedCoordinate = vec2(
    v_textureCoordinate.x + normal.x * u_refraction,
    1.0 - v_textureCoordinate.y - normal.y * u_refraction
  );
  vec4 color = texture2D(u_content, refractedCoordinate);

  float normalMagnitude = length(normal);
  float specular = pow(normalMagnitude * 10.0, u_specularPower) * u_specularStrength;
  color.rgb += vec3(0.96, 0.84, 0.6) * specular * color.a;

  float height = texture2D(u_buffer, v_textureCoordinate).r;
  float litHeight = clamp(height, -0.75, 0.18);
  color.rgb *= 1.0 + litHeight * u_heightTint;

  gl_FragColor = vec4(color.rgb, color.a);
}`;

const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getViewportScale(width: number, height: number): ViewportScale {
  const shortEdge = Math.min(width, height);
  const radiusScale = clamp(
    shortEdge / DESKTOP_BASELINE_SHORT_EDGE,
    MINIMUM_RADIUS_SCALE,
    1,
  );

  return {
    radiusScale,
    strengthScale: Math.sqrt(radiusScale),
  };
}

function getViewportAspect(width: number, height: number): ViewportAspect {
  const shortEdge = Math.max(Math.min(width, height), 1);

  return {
    horizontal: width / shortEdge,
    vertical: height / shortEdge,
  };
}

function getEffectiveSettings(
  settings: RippleSettings,
  scale: ViewportScale,
): RippleSettings {
  return {
    ...settings,
    dropRadius: settings.dropRadius * scale.radiusScale,
    clickRadius: settings.clickRadius * scale.radiusScale,
    refraction: settings.refraction * scale.strengthScale,
    dropStrengthMultiplier:
      settings.dropStrengthMultiplier * scale.strengthScale,
    dropStrengthMaximum: settings.dropStrengthMaximum * scale.strengthScale,
    clickStrength: settings.clickStrength * scale.strengthScale,
    clickRippleStrength: settings.clickRippleStrength * scale.strengthScale,
    clickRippleWidth: settings.clickRippleWidth * scale.radiusScale,
    dropMomentum: settings.dropMomentum * scale.strengthScale,
  };
}

function shouldReduceMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function compileShader(
  webGlContext: WebGLRenderingContext,
  shaderType: number,
  source: string,
) {
  const shader = webGlContext.createShader(shaderType);
  if (!shader) return null;
  webGlContext.shaderSource(shader, source);
  webGlContext.compileShader(shader);
  if (!webGlContext.getShaderParameter(shader, webGlContext.COMPILE_STATUS)) {
    webGlContext.deleteShader(shader);
    return null;
  }
  return shader;
}

function linkProgram(
  webGlContext: WebGLRenderingContext,
  vertexShaderSource: string,
  fragmentShaderSource: string,
) {
  const vertexShader = compileShader(
    webGlContext,
    webGlContext.VERTEX_SHADER,
    vertexShaderSource,
  );
  const fragmentShader = compileShader(
    webGlContext,
    webGlContext.FRAGMENT_SHADER,
    fragmentShaderSource,
  );
  if (!vertexShader || !fragmentShader) return null;

  const program = webGlContext.createProgram();
  if (!program) return null;
  webGlContext.attachShader(program, vertexShader);
  webGlContext.attachShader(program, fragmentShader);
  webGlContext.linkProgram(program);
  webGlContext.deleteShader(vertexShader);
  webGlContext.deleteShader(fragmentShader);
  if (!webGlContext.getProgramParameter(program, webGlContext.LINK_STATUS)) {
    webGlContext.deleteProgram(program);
    return null;
  }
  return program;
}

function makeFramebuffer(
  webGlContext: WebGLRenderingContext,
  width: number,
  height: number,
): RippleFramebuffer | null {
  const texture = webGlContext.createTexture();
  if (!texture) return null;
  webGlContext.bindTexture(webGlContext.TEXTURE_2D, texture);
  webGlContext.texImage2D(
    webGlContext.TEXTURE_2D,
    0,
    webGlContext.RGBA,
    width,
    height,
    0,
    webGlContext.RGBA,
    webGlContext.FLOAT,
    null,
  );
  webGlContext.texParameteri(
    webGlContext.TEXTURE_2D,
    webGlContext.TEXTURE_MIN_FILTER,
    webGlContext.LINEAR,
  );
  webGlContext.texParameteri(
    webGlContext.TEXTURE_2D,
    webGlContext.TEXTURE_MAG_FILTER,
    webGlContext.LINEAR,
  );
  webGlContext.texParameteri(
    webGlContext.TEXTURE_2D,
    webGlContext.TEXTURE_WRAP_S,
    webGlContext.CLAMP_TO_EDGE,
  );
  webGlContext.texParameteri(
    webGlContext.TEXTURE_2D,
    webGlContext.TEXTURE_WRAP_T,
    webGlContext.CLAMP_TO_EDGE,
  );

  const framebuffer = webGlContext.createFramebuffer();
  if (!framebuffer) {
    webGlContext.deleteTexture(texture);
    return null;
  }
  webGlContext.bindFramebuffer(webGlContext.FRAMEBUFFER, framebuffer);
  webGlContext.framebufferTexture2D(
    webGlContext.FRAMEBUFFER,
    webGlContext.COLOR_ATTACHMENT0,
    webGlContext.TEXTURE_2D,
    texture,
    0,
  );

  return { texture, framebuffer };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  const cachedPromise = imagePromiseCache.get(source);
  if (cachedPromise) return cachedPromise;

  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${source}`));
    image.src = source;
    if (image.complete) {
      resolve(image);
    }
  });

  imagePromiseCache.set(source, imagePromise);
  return imagePromise;
}

function resolveCssColor(
  colorProbe: HTMLSpanElement,
  colorValue: string,
): string {
  colorProbe.style.color = "";
  colorProbe.style.color = colorValue;
  return getComputedStyle(colorProbe).color || colorValue;
}

function isVisibleCssColor(colorValue: string) {
  return (
    colorValue.length > 0 &&
    colorValue !== "transparent" &&
    colorValue !== "rgba(0, 0, 0, 0)"
  );
}

function hasDocumentFonts(
  documentValue: Document,
): documentValue is Document & { fonts: { ready: Promise<unknown> } } {
  return "fonts" in documentValue;
}

export function ChlorineRippleSurface({
  pieces,
  foregroundColor = "currentColor",
  disabled = false,
  refreshKey,
  refreshDurationMs = 0,
  onReadyChange,
  style,
  ...canvasProps
}: ChlorineRippleSurfaceProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const foregroundColorRef = useRef(foregroundColor);
  const onReadyChangeRef = useRef(onReadyChange);
  const needsContentUploadRef = useRef(true);
  const contentRefreshDeadlineMsRef = useRef(0);

  foregroundColorRef.current = foregroundColor;
  onReadyChangeRef.current = onReadyChange;

  useEffect(() => {
    needsContentUploadRef.current = true;
    if (refreshDurationMs > 0) {
      contentRefreshDeadlineMsRef.current =
        performance.now() + refreshDurationMs;
    }
  }, [foregroundColor, refreshKey, refreshDurationMs]);

  useEffect(() => {
    const canvasElement = canvasElementRef.current;
    if (!canvasElement || disabled || shouldReduceMotion()) {
      onReadyChangeRef.current?.(false);
      return;
    }
    onReadyChangeRef.current?.(false);
    const canvas: HTMLCanvasElement = canvasElement;

    const maybeWebGlContext = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!maybeWebGlContext) {
      onReadyChangeRef.current?.(false);
      return;
    }
    const webGlContext: WebGLRenderingContext = maybeWebGlContext;
    if (!webGlContext.getExtension("OES_texture_float")) {
      onReadyChangeRef.current?.(false);
      return;
    }
    webGlContext.getExtension("OES_texture_float_linear");

    const maybeSimulationProgram = linkProgram(
      webGlContext,
      VERTEX_SHADER_SOURCE,
      SIMULATION_FRAGMENT_SHADER_SOURCE,
    );
    const maybeRenderProgram = linkProgram(
      webGlContext,
      VERTEX_SHADER_SOURCE,
      RENDER_FRAGMENT_SHADER_SOURCE,
    );
    if (!maybeSimulationProgram || !maybeRenderProgram) {
      onReadyChangeRef.current?.(false);
      return;
    }
    const simulationProgram: WebGLProgram = maybeSimulationProgram;
    const renderProgram: WebGLProgram = maybeRenderProgram;

    const simulationUniforms = {
      buffer: webGlContext.getUniformLocation(simulationProgram, "u_buffer"),
      texel: webGlContext.getUniformLocation(simulationProgram, "u_texel"),
      damping: webGlContext.getUniformLocation(
        simulationProgram,
        "u_damping",
      ),
      speed: webGlContext.getUniformLocation(simulationProgram, "u_speed"),
      waveLength: webGlContext.getUniformLocation(
        simulationProgram,
        "u_waveLength",
      ),
      dropPosition: webGlContext.getUniformLocation(
        simulationProgram,
        "u_dropPosition",
      ),
      dropRadius: webGlContext.getUniformLocation(
        simulationProgram,
        "u_dropRadius",
      ),
      dropStrength: webGlContext.getUniformLocation(
        simulationProgram,
        "u_dropStrength",
      ),
      dropDirection: webGlContext.getUniformLocation(
        simulationProgram,
        "u_dropDirection",
      ),
      dropMomentum: webGlContext.getUniformLocation(
        simulationProgram,
        "u_dropMomentum",
      ),
      viewportAspect: webGlContext.getUniformLocation(
        simulationProgram,
        "u_viewportAspect",
      ),
      rippleCount: webGlContext.getUniformLocation(
        simulationProgram,
        "u_rippleCount",
      ),
      ripples: webGlContext.getUniformLocation(
        simulationProgram,
        "u_ripples[0]",
      ),
      clickOnly: webGlContext.getUniformLocation(
        simulationProgram,
        "u_clickOnly",
      ),
      clickRippleStrength: webGlContext.getUniformLocation(
        simulationProgram,
        "u_clickRippleStrength",
      ),
      clickRippleSpeed: webGlContext.getUniformLocation(
        simulationProgram,
        "u_clickRippleSpeed",
      ),
      clickRippleWidth: webGlContext.getUniformLocation(
        simulationProgram,
        "u_clickRippleWidth",
      ),
      clickRippleDecay: webGlContext.getUniformLocation(
        simulationProgram,
        "u_clickRippleDecay",
      ),
    };
    const renderUniforms = {
      buffer: webGlContext.getUniformLocation(renderProgram, "u_buffer"),
      content: webGlContext.getUniformLocation(renderProgram, "u_content"),
      texel: webGlContext.getUniformLocation(renderProgram, "u_texel"),
      refraction: webGlContext.getUniformLocation(
        renderProgram,
        "u_refraction",
      ),
      specularStrength: webGlContext.getUniformLocation(
        renderProgram,
        "u_specularStrength",
      ),
      specularPower: webGlContext.getUniformLocation(
        renderProgram,
        "u_specularPower",
      ),
      heightTint: webGlContext.getUniformLocation(renderProgram, "u_heightTint"),
      waveLength: webGlContext.getUniformLocation(
        renderProgram,
        "u_waveLength",
      ),
    };

    const maybeVertexBuffer = webGlContext.createBuffer();
    if (!maybeVertexBuffer) {
      onReadyChangeRef.current?.(false);
      return;
    }
    const vertexBuffer: WebGLBuffer = maybeVertexBuffer;
    webGlContext.bindBuffer(webGlContext.ARRAY_BUFFER, vertexBuffer);
    webGlContext.bufferData(
      webGlContext.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      webGlContext.STATIC_DRAW,
    );
    const simulationAttribute = webGlContext.getAttribLocation(
      simulationProgram,
      "a_position",
    );
    const renderAttribute = webGlContext.getAttribLocation(
      renderProgram,
      "a_position",
    );

    const maybeFirstFramebuffer = makeFramebuffer(
      webGlContext,
      SIMULATION_RESOLUTION,
      SIMULATION_RESOLUTION,
    );
    const maybeSecondFramebuffer = makeFramebuffer(
      webGlContext,
      SIMULATION_RESOLUTION,
      SIMULATION_RESOLUTION,
    );
    if (!maybeFirstFramebuffer || !maybeSecondFramebuffer) {
      onReadyChangeRef.current?.(false);
      return;
    }
    const firstFramebuffer: RippleFramebuffer = maybeFirstFramebuffer;
    const secondFramebuffer: RippleFramebuffer = maybeSecondFramebuffer;

    const maybeContentTexture = webGlContext.createTexture();
    if (!maybeContentTexture) {
      onReadyChangeRef.current?.(false);
      return;
    }
    const contentTexture: WebGLTexture = maybeContentTexture;

    const offscreenCanvas = document.createElement("canvas");
    const maybeOffscreenContext = offscreenCanvas.getContext("2d");
    if (!maybeOffscreenContext) {
      onReadyChangeRef.current?.(false);
      return;
    }
    const offscreenContext: CanvasRenderingContext2D = maybeOffscreenContext;

    const colorProbe = document.createElement("span");
    colorProbe.setAttribute("aria-hidden", "true");
    colorProbe.style.position = "absolute";
    colorProbe.style.visibility = "hidden";
    colorProbe.style.pointerEvents = "none";
    colorProbe.style.inset = "0";
    (canvas.parentElement ?? document.body).appendChild(colorProbe);

    let animationFrameId = 0;
    let pingPongIndex = 0;
    let isDisposed = false;
    const queuedDrops: QueuedDrop[] = [];
    const activeRipples: ActiveRipple[] = [];
    const rippleUniformData = new Float32Array(MAX_ACTIVE_RIPPLES * 3);
    const viewportScaleRef = { current: getViewportScale(1, 1) };
    const viewportAspectRef = { current: getViewportAspect(1, 1) };
    const effectiveSettingsRef = {
      current: getEffectiveSettings(
        DEFAULT_RIPPLE_SETTINGS,
        viewportScaleRef.current,
      ),
    };
    let lastDropPosition = { x: -1, y: -1 };
    let lastDropTimeMs = 0;
    let lastInteractionTimeMs = 0;
    let lastIdleTimeMs = performance.now();
    let touchStartPosition = { x: -1, y: -1 };
    let touchMoved = false;
    let lastTouchTapAtMs = -Infinity;
    let lastTouchTapPosition = { x: -1, y: -1 };
    let simulationAccumulatorMs = SIMULATION_TIMESTEP_MS;
    let lastSimulationFrameTimestampMs: DOMHighResTimeStamp | null = null;
    let devicePixelRatio = 1;
    let loadedImages: HTMLImageElement[] = [];
    let hasUploadedContent = false;

    function drawTriangle(attribute: number) {
      webGlContext.bindBuffer(webGlContext.ARRAY_BUFFER, vertexBuffer);
      webGlContext.enableVertexAttribArray(attribute);
      webGlContext.vertexAttribPointer(
        attribute,
        2,
        webGlContext.FLOAT,
        false,
        0,
        0,
      );
      webGlContext.drawArrays(webGlContext.TRIANGLES, 0, 3);
    }

    function getIdleDropStrength() {
      return IDLE_DROP_STRENGTH * viewportScaleRef.current.strengthScale;
    }

    function getSeedDropStrength() {
      return SEED_DROP_STRENGTH * viewportScaleRef.current.strengthScale;
    }

    function queueDrop(
      normalizedX: number,
      normalizedY: number,
      strength: number,
      directionX: number,
      directionY: number,
      radius: number,
      priority = false,
    ) {
      const directionLength =
        Math.sqrt(directionX * directionX + directionY * directionY) || 1;
      const drop: QueuedDrop = {
        positionX: normalizedX,
        positionY: 1 - normalizedY,
        strength,
        radius,
        directionX: directionX / directionLength,
        directionY: -directionY / directionLength,
      };
      if (priority) {
        queuedDrops.unshift(drop);
      } else {
        queuedDrops.push(drop);
      }
      if (queuedDrops.length > MAX_QUEUED_DROPS) {
        if (priority) {
          queuedDrops.pop();
        } else {
          queuedDrops.shift();
        }
      }
    }

    function queueClickRipple(normalizedX: number, normalizedY: number) {
      const settings = effectiveSettingsRef.current;
      queueDrop(
        normalizedX,
        normalizedY,
        settings.clickStrength,
        0,
        0,
        settings.clickRadius,
        true,
      );
      activeRipples.push({
        positionX: normalizedX,
        positionY: 1 - normalizedY,
        startedAtMs: performance.now(),
      });
      if (activeRipples.length > MAX_ACTIVE_RIPPLES) {
        activeRipples.shift();
      }
    }

    function getPointerPosition(clientX: number, clientY: number) {
      const canvasRect = canvas.getBoundingClientRect();
      const canvasWidth = Math.max(
        canvasRect.width || canvas.clientWidth || window.innerWidth,
        1,
      );
      const canvasHeight = Math.max(
        canvasRect.height || canvas.clientHeight || window.innerHeight,
        1,
      );

      return {
        normalizedX: clamp((clientX - canvasRect.left) / canvasWidth, 0, 1),
        normalizedY: clamp((clientY - canvasRect.top) / canvasHeight, 0, 1),
      };
    }

    function toShortEdgeSpace(deltaX: number, deltaY: number) {
      const aspect = viewportAspectRef.current;

      return {
        x: deltaX * aspect.horizontal,
        y: deltaY * aspect.vertical,
      };
    }

    function measurePieceRect(piece: ChlorineRippleSurfacePiece) {
      const canvasRect = canvas.getBoundingClientRect();
      const element = piece.elementRef?.current;

      if (element) {
        const pieceRect = element.getBoundingClientRect();
        return {
          left: (pieceRect.left - canvasRect.left) * devicePixelRatio,
          top: (pieceRect.top - canvasRect.top) * devicePixelRatio,
          width: pieceRect.width * devicePixelRatio,
          height: pieceRect.height * devicePixelRatio,
        };
      }

      if (piece.rect) {
        return {
          left: piece.rect.left * devicePixelRatio,
          top: piece.rect.top * devicePixelRatio,
          width: piece.rect.width * devicePixelRatio,
          height: piece.rect.height * devicePixelRatio,
        };
      }

      return null;
    }

    function resolvePieceColor(piece: ChlorineRippleSurfacePiece) {
      const element = piece.elementRef?.current;
      if (element) {
        const computedBackgroundColor = getComputedStyle(element).backgroundColor;
        if (isVisibleCssColor(computedBackgroundColor)) {
          return computedBackgroundColor;
        }
      }

      return resolveCssColor(colorProbe, foregroundColorRef.current);
    }

    function uploadContent() {
      if (loadedImages.length !== pieces.length) return;

      const canvasWidth = Math.max(1, canvas.width);
      const canvasHeight = Math.max(1, canvas.height);
      if (
        offscreenCanvas.width !== canvasWidth ||
        offscreenCanvas.height !== canvasHeight
      ) {
        offscreenCanvas.width = canvasWidth;
        offscreenCanvas.height = canvasHeight;
      }

      offscreenContext.clearRect(0, 0, canvasWidth, canvasHeight);
      offscreenContext.globalCompositeOperation = "source-over";

      // Two-pass: union all piece alphas first, then color the result once.
      // Per-piece source-in fillRect would otherwise re-color overlapping
      // anti-aliased pixels piece-by-piece, leaving a visible seam where the
      // pieces' bounding boxes overlap (club ↔ chlorine, icon ↔ chlorine).
      for (const [pieceIndex, piece] of pieces.entries()) {
        const pieceRect = measurePieceRect(piece);
        const image = loadedImages[pieceIndex];
        if (!pieceRect || pieceRect.width <= 0 || pieceRect.height <= 0) {
          continue;
        }

        offscreenContext.drawImage(
          image,
          pieceRect.left,
          pieceRect.top,
          pieceRect.width,
          pieceRect.height,
        );
      }

      const resolvedFillColor =
        pieces.length > 0
          ? resolvePieceColor(pieces[0])
          : resolveCssColor(colorProbe, foregroundColorRef.current);
      offscreenContext.globalCompositeOperation = "source-in";
      offscreenContext.fillStyle = resolvedFillColor;
      offscreenContext.fillRect(0, 0, canvasWidth, canvasHeight);
      offscreenContext.globalCompositeOperation = "source-over";

      webGlContext.bindTexture(webGlContext.TEXTURE_2D, contentTexture);
      webGlContext.texImage2D(
        webGlContext.TEXTURE_2D,
        0,
        webGlContext.RGBA,
        webGlContext.RGBA,
        webGlContext.UNSIGNED_BYTE,
        offscreenCanvas,
      );
      webGlContext.texParameteri(
        webGlContext.TEXTURE_2D,
        webGlContext.TEXTURE_MIN_FILTER,
        webGlContext.LINEAR,
      );
      webGlContext.texParameteri(
        webGlContext.TEXTURE_2D,
        webGlContext.TEXTURE_MAG_FILTER,
        webGlContext.LINEAR,
      );
      webGlContext.texParameteri(
        webGlContext.TEXTURE_2D,
        webGlContext.TEXTURE_WRAP_S,
        webGlContext.CLAMP_TO_EDGE,
      );
      webGlContext.texParameteri(
        webGlContext.TEXTURE_2D,
        webGlContext.TEXTURE_WRAP_T,
        webGlContext.CLAMP_TO_EDGE,
      );

      hasUploadedContent = true;
      needsContentUploadRef.current = false;
    }

    function renderCurrentFrame() {
      if (!hasUploadedContent) return;
      const currentFramebuffer =
        pingPongIndex === 0 ? firstFramebuffer : secondFramebuffer;

      webGlContext.useProgram(renderProgram);
      webGlContext.bindFramebuffer(webGlContext.FRAMEBUFFER, null);
      webGlContext.viewport(0, 0, canvas.width, canvas.height);
      webGlContext.clearColor(0, 0, 0, 0);
      webGlContext.clear(webGlContext.COLOR_BUFFER_BIT);

      webGlContext.activeTexture(webGlContext.TEXTURE0);
      webGlContext.bindTexture(
        webGlContext.TEXTURE_2D,
        currentFramebuffer.texture,
      );
      webGlContext.uniform1i(renderUniforms.buffer, 0);

      webGlContext.activeTexture(webGlContext.TEXTURE1);
      webGlContext.bindTexture(webGlContext.TEXTURE_2D, contentTexture);
      webGlContext.uniform1i(renderUniforms.content, 1);

      const settings = effectiveSettingsRef.current;
      webGlContext.uniform2f(
        renderUniforms.texel,
        1 / SIMULATION_RESOLUTION,
        1 / SIMULATION_RESOLUTION,
      );
      webGlContext.uniform1f(renderUniforms.refraction, settings.refraction);
      webGlContext.uniform1f(
        renderUniforms.specularStrength,
        settings.specular,
      );
      webGlContext.uniform1f(renderUniforms.specularPower, settings.specPower);
      webGlContext.uniform1f(renderUniforms.heightTint, settings.heightTint);
      webGlContext.uniform1f(renderUniforms.waveLength, settings.waveLength);

      drawTriangle(renderAttribute);
    }

    function handleResize() {
      viewportAspectRef.current = getViewportAspect(
        canvas.clientWidth,
        canvas.clientHeight,
      );
      viewportScaleRef.current = getViewportScale(
        canvas.clientWidth,
        canvas.clientHeight,
      );
      effectiveSettingsRef.current = getEffectiveSettings(
        DEFAULT_RIPPLE_SETTINGS,
        viewportScaleRef.current,
      );

      devicePixelRatio = Math.min(
        window.devicePixelRatio || 1,
        DEVICE_PIXEL_RATIO_CAP,
      );
      const nextCanvasWidth = Math.max(
        1,
        Math.floor(canvas.clientWidth * devicePixelRatio),
      );
      const nextCanvasHeight = Math.max(
        1,
        Math.floor(canvas.clientHeight * devicePixelRatio),
      );

      if (
        canvas.width !== nextCanvasWidth ||
        canvas.height !== nextCanvasHeight
      ) {
        canvas.width = nextCanvasWidth;
        canvas.height = nextCanvasHeight;
      }
      needsContentUploadRef.current = true;
    }

    function runSimulationPass(settings: RippleSettings, drop?: QueuedDrop) {
      const readFramebuffer =
        pingPongIndex === 0 ? firstFramebuffer : secondFramebuffer;
      const writeFramebuffer =
        pingPongIndex === 0 ? secondFramebuffer : firstFramebuffer;

      webGlContext.useProgram(simulationProgram);
      webGlContext.bindFramebuffer(
        webGlContext.FRAMEBUFFER,
        writeFramebuffer.framebuffer,
      );
      webGlContext.viewport(
        0,
        0,
        SIMULATION_RESOLUTION,
        SIMULATION_RESOLUTION,
      );

      webGlContext.activeTexture(webGlContext.TEXTURE0);
      webGlContext.bindTexture(
        webGlContext.TEXTURE_2D,
        readFramebuffer.texture,
      );
      webGlContext.uniform1i(simulationUniforms.buffer, 0);
      webGlContext.uniform2f(
        simulationUniforms.texel,
        1 / SIMULATION_RESOLUTION,
        1 / SIMULATION_RESOLUTION,
      );
      webGlContext.uniform1f(simulationUniforms.damping, settings.damping);
      webGlContext.uniform1f(simulationUniforms.speed, settings.waveSpeed);
      webGlContext.uniform1f(
        simulationUniforms.waveLength,
        settings.waveLength,
      );
      webGlContext.uniform2f(
        simulationUniforms.viewportAspect,
        viewportAspectRef.current.horizontal,
        viewportAspectRef.current.vertical,
      );
      webGlContext.uniform1i(
        simulationUniforms.rippleCount,
        activeRipples.length,
      );
      webGlContext.uniform3fv(simulationUniforms.ripples, rippleUniformData);
      webGlContext.uniform1i(simulationUniforms.clickOnly, 0);
      webGlContext.uniform1f(
        simulationUniforms.clickRippleStrength,
        settings.clickRippleStrength,
      );
      webGlContext.uniform1f(
        simulationUniforms.clickRippleSpeed,
        settings.clickRippleSpeed,
      );
      webGlContext.uniform1f(
        simulationUniforms.clickRippleWidth,
        settings.clickRippleWidth,
      );
      webGlContext.uniform1f(
        simulationUniforms.clickRippleDecay,
        settings.clickRippleDecay,
      );

      if (drop) {
        webGlContext.uniform2f(
          simulationUniforms.dropPosition,
          drop.positionX,
          drop.positionY,
        );
        webGlContext.uniform1f(simulationUniforms.dropRadius, drop.radius);
        webGlContext.uniform1f(simulationUniforms.dropStrength, drop.strength);
        webGlContext.uniform2f(
          simulationUniforms.dropDirection,
          drop.directionX,
          drop.directionY,
        );
        webGlContext.uniform1f(
          simulationUniforms.dropMomentum,
          settings.dropMomentum,
        );
      } else {
        webGlContext.uniform1f(simulationUniforms.dropStrength, 0);
      }

      drawTriangle(simulationAttribute);
      pingPongIndex = 1 - pingPongIndex;
    }

    function runClickRipplePass(settings: RippleSettings) {
      const readFramebuffer =
        pingPongIndex === 0 ? firstFramebuffer : secondFramebuffer;
      const writeFramebuffer =
        pingPongIndex === 0 ? secondFramebuffer : firstFramebuffer;

      webGlContext.useProgram(simulationProgram);
      webGlContext.bindFramebuffer(
        webGlContext.FRAMEBUFFER,
        writeFramebuffer.framebuffer,
      );
      webGlContext.viewport(
        0,
        0,
        SIMULATION_RESOLUTION,
        SIMULATION_RESOLUTION,
      );

      webGlContext.activeTexture(webGlContext.TEXTURE0);
      webGlContext.bindTexture(
        webGlContext.TEXTURE_2D,
        readFramebuffer.texture,
      );
      webGlContext.uniform1i(simulationUniforms.buffer, 0);
      webGlContext.uniform2f(
        simulationUniforms.viewportAspect,
        viewportAspectRef.current.horizontal,
        viewportAspectRef.current.vertical,
      );
      webGlContext.uniform1i(
        simulationUniforms.rippleCount,
        activeRipples.length,
      );
      webGlContext.uniform3fv(simulationUniforms.ripples, rippleUniformData);
      webGlContext.uniform1i(simulationUniforms.clickOnly, 1);
      webGlContext.uniform1f(
        simulationUniforms.clickRippleStrength,
        settings.clickRippleStrength,
      );
      webGlContext.uniform1f(
        simulationUniforms.clickRippleSpeed,
        settings.clickRippleSpeed,
      );
      webGlContext.uniform1f(
        simulationUniforms.clickRippleWidth,
        settings.clickRippleWidth,
      );
      webGlContext.uniform1f(
        simulationUniforms.clickRippleDecay,
        settings.clickRippleDecay,
      );

      drawTriangle(simulationAttribute);
      pingPongIndex = 1 - pingPongIndex;
    }

    function runSimulationTick(settings: RippleSettings) {
      runSimulationPass(settings, queuedDrops.shift());
    }

    function frame(frameTimestampMs: DOMHighResTimeStamp) {
      animationFrameId = window.requestAnimationFrame(frame);
      const now = performance.now();
      const settings = effectiveSettingsRef.current;

      if (needsContentUploadRef.current || now < contentRefreshDeadlineMsRef.current) {
        uploadContent();
      }

      if (lastSimulationFrameTimestampMs !== null) {
        const frameDeltaMs = Math.min(
          Math.max(frameTimestampMs - lastSimulationFrameTimestampMs, 0),
          MAX_FRAME_DELTA_MS,
        );
        simulationAccumulatorMs += frameDeltaMs;
      }
      lastSimulationFrameTimestampMs = frameTimestampMs;

      if (now - lastInteractionTimeMs > 1000 && now - lastIdleTimeMs > IDLE_INTERVAL_MS) {
        queueDrop(
          0.2 + Math.random() * 0.6,
          0.2 + Math.random() * 0.6,
          getIdleDropStrength(),
          0,
          0,
          settings.dropRadius,
        );
        lastIdleTimeMs = now;
      }

      rippleUniformData.fill(0);
      for (let rippleIndex = activeRipples.length - 1; rippleIndex >= 0; rippleIndex -= 1) {
        const ageSeconds = (now - activeRipples[rippleIndex].startedAtMs) / 1000;
        const radius = ageSeconds * settings.clickRippleSpeed;
        const amplitude =
          settings.clickRippleStrength *
          Math.exp(-ageSeconds * settings.clickRippleDecay);
        if (
          radius > settings.clickRippleMaximumRadius ||
          amplitude < 0.0001
        ) {
          activeRipples.splice(rippleIndex, 1);
        }
      }
      for (const [rippleIndex, ripple] of activeRipples.entries()) {
        const uniformOffset = rippleIndex * 3;
        rippleUniformData[uniformOffset] = ripple.positionX;
        rippleUniformData[uniformOffset + 1] = ripple.positionY;
        rippleUniformData[uniformOffset + 2] =
          (now - ripple.startedAtMs) / 1000;
      }

      const simulationSteps = Math.min(
        Math.floor(simulationAccumulatorMs / SIMULATION_TIMESTEP_MS),
        MAX_SIMULATION_STEPS_PER_FRAME,
      );
      for (
        let simulationStep = 0;
        simulationStep < simulationSteps;
        simulationStep += 1
      ) {
        runSimulationTick(settings);
      }
      if (activeRipples.length > 0) {
        runClickRipplePass(settings);
      }
      simulationAccumulatorMs -= simulationSteps * SIMULATION_TIMESTEP_MS;

      renderCurrentFrame();
    }

    function resetSimulation() {
      const blankData = new Float32Array(
        SIMULATION_RESOLUTION * SIMULATION_RESOLUTION * 4,
      );
      for (const framebuffer of [firstFramebuffer, secondFramebuffer]) {
        webGlContext.bindTexture(webGlContext.TEXTURE_2D, framebuffer.texture);
        webGlContext.texImage2D(
          webGlContext.TEXTURE_2D,
          0,
          webGlContext.RGBA,
          SIMULATION_RESOLUTION,
          SIMULATION_RESOLUTION,
          0,
          webGlContext.RGBA,
          webGlContext.FLOAT,
          blankData,
        );
      }
      pingPongIndex = 0;
      queuedDrops.length = 0;
      activeRipples.length = 0;
      for (let dropIndex = 0; dropIndex < 5; dropIndex += 1) {
        queueDrop(
          0.2 + Math.random() * 0.6,
          0.2 + Math.random() * 0.6,
          getSeedDropStrength(),
          0,
          0,
          effectiveSettingsRef.current.dropRadius,
        );
      }
      simulationAccumulatorMs = Math.max(
        simulationAccumulatorMs,
        SIMULATION_TIMESTEP_MS,
      );
    }

    function onMouseMove(mouseEvent: MouseEvent) {
      const { normalizedX, normalizedY } = getPointerPosition(
        mouseEvent.clientX,
        mouseEvent.clientY,
      );
      const now = performance.now();
      lastInteractionTimeMs = now;

      const settings = effectiveSettingsRef.current;
      if (lastDropPosition.x >= 0) {
        const deltaX = normalizedX - lastDropPosition.x;
        const deltaY = normalizedY - lastDropPosition.y;
        const scaledDelta = toShortEdgeSpace(deltaX, deltaY);
        const distance = Math.hypot(scaledDelta.x, scaledDelta.y);
        if (distance > MINIMUM_MOVE_DISTANCE) {
          const velocity =
            (distance / Math.max(now - lastDropTimeMs, 1)) * 1000;
          const strength = Math.min(
            velocity * settings.dropStrengthMultiplier,
            settings.dropStrengthMaximum,
          );
          if (strength > 0.005) {
            queueDrop(
              normalizedX,
              normalizedY,
              strength,
              scaledDelta.x,
              scaledDelta.y,
              settings.dropRadius,
            );
          }
          lastDropPosition = { x: normalizedX, y: normalizedY };
          lastDropTimeMs = now;
        }
      } else {
        lastDropPosition = { x: normalizedX, y: normalizedY };
        lastDropTimeMs = now;
      }
    }

    function onTouchStart(touchEvent: TouchEvent) {
      const touch = touchEvent.touches[0];
      if (!touch) return;
      const { normalizedX, normalizedY } = getPointerPosition(
        touch.clientX,
        touch.clientY,
      );
      lastInteractionTimeMs = performance.now();
      lastDropPosition = { x: normalizedX, y: normalizedY };
      touchStartPosition = { x: normalizedX, y: normalizedY };
      touchMoved = false;
      lastDropTimeMs = performance.now();
    }

    function onTouchMove(touchEvent: TouchEvent) {
      const touch = touchEvent.touches[0];
      if (!touch) return;
      const { normalizedX, normalizedY } = getPointerPosition(
        touch.clientX,
        touch.clientY,
      );
      const now = performance.now();
      lastInteractionTimeMs = now;

      const settings = effectiveSettingsRef.current;
      if (lastDropPosition.x >= 0) {
        const deltaX = normalizedX - lastDropPosition.x;
        const deltaY = normalizedY - lastDropPosition.y;
        const scaledDelta = toShortEdgeSpace(deltaX, deltaY);
        const distance = Math.hypot(scaledDelta.x, scaledDelta.y);
        if (distance > MINIMUM_MOVE_DISTANCE) {
          touchMoved = true;
          const velocity =
            (distance / Math.max(now - lastDropTimeMs, 1)) * 1000;
          const strength = Math.min(
            velocity * settings.dropStrengthMultiplier,
            settings.dropStrengthMaximum,
          );
          if (strength > 0.005) {
            queueDrop(
              normalizedX,
              normalizedY,
              strength,
              scaledDelta.x,
              scaledDelta.y,
              settings.dropRadius,
            );
          }
          lastDropPosition = { x: normalizedX, y: normalizedY };
          lastDropTimeMs = now;
        }
      } else {
        lastDropPosition = { x: normalizedX, y: normalizedY };
        lastDropTimeMs = now;
      }
    }

    function onTouchEnd() {
      if (!touchMoved && touchStartPosition.x >= 0) {
        queueClickRipple(touchStartPosition.x, touchStartPosition.y);
        lastTouchTapAtMs = performance.now();
        lastTouchTapPosition = touchStartPosition;
      }

      lastDropPosition = { x: -1, y: -1 };
      touchStartPosition = { x: -1, y: -1 };
      touchMoved = false;
    }

    function onClick(mouseEvent: MouseEvent) {
      const { normalizedX, normalizedY } = getPointerPosition(
        mouseEvent.clientX,
        mouseEvent.clientY,
      );
      const now = performance.now();
      const touchTapDelta = toShortEdgeSpace(
        normalizedX - lastTouchTapPosition.x,
        normalizedY - lastTouchTapPosition.y,
      );
      const touchTapDistance = Math.hypot(touchTapDelta.x, touchTapDelta.y);
      if (now - lastTouchTapAtMs < 750 && touchTapDistance < 0.03) {
        return;
      }

      lastInteractionTimeMs = now;
      queueClickRipple(normalizedX, normalizedY);
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            handleResize();
            uploadContent();
            renderCurrentFrame();
          });
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("click", onClick);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    if (hasDocumentFonts(document)) {
      document.fonts.ready.then(() => {
        if (!isDisposed) {
          needsContentUploadRef.current = true;
        }
      });
    }

    handleResize();

    Promise.all(pieces.map((piece) => loadImage(piece.source)))
      .then((images) => {
        if (isDisposed) return;
        loadedImages = images;
        uploadContent();
        resetSimulation();
        renderCurrentFrame();
        onReadyChangeRef.current?.(true);
        animationFrameId = window.requestAnimationFrame(frame);
      })
      .catch(() => {
        if (!isDisposed) {
          onReadyChangeRef.current?.(false);
        }
      });

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      webGlContext.deleteTexture(firstFramebuffer.texture);
      webGlContext.deleteTexture(secondFramebuffer.texture);
      webGlContext.deleteFramebuffer(firstFramebuffer.framebuffer);
      webGlContext.deleteFramebuffer(secondFramebuffer.framebuffer);
      webGlContext.deleteTexture(contentTexture);
      webGlContext.deleteBuffer(vertexBuffer);
      webGlContext.deleteProgram(simulationProgram);
      webGlContext.deleteProgram(renderProgram);
      colorProbe.remove();
    };
  }, [disabled, pieces]);

  const canvasStyle: CSSProperties = {
    display: "block",
    ...style,
  };

  return (
    <canvas
      ref={canvasElementRef}
      aria-hidden="true"
      data-chlorine-ripple-canvas="true"
      {...canvasProps}
      style={canvasStyle}
    />
  );
}
