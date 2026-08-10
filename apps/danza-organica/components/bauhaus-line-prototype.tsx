"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import {
  BAUHAUS_CAMERA_FIELD_OF_VIEW,
  BAUHAUS_DEFAULT_CAMERA_POSITION,
  BAUHAUS_DEFAULT_CAMERA_TARGET,
  BAUHAUS_LINE_SPEED,
  BAUHAUS_MAXIMUM_PARTICLES_PER_ROW,
  BAUHAUS_MAXIMUM_PERSPECTIVE_STRENGTH,
  BAUHAUS_MAXIMUM_ROW_COUNT,
  BAUHAUS_MINIMUM_PERSPECTIVE_STRENGTH,
  type BauhausGridDimensions,
  type BauhausLinePosition,
  calculateBauhausCameraPosition,
  calculateBauhausGridDimensions,
  calculateBauhausRowPhaseOffset,
  calculateBauhausRowSpeedMultiplier,
  interpolateBauhausLinePosition,
  resolveBauhausLineProgress,
} from "@/lib/bauhaus-line";
import { BAUHAUS_FRAGMENT_SHADER, BAUHAUS_VERTEX_SHADER } from "@/lib/bauhaus-particle-shaders";

interface BauhausPrototypeSettings {
  particleRadius: number;
  rowSpacing: number;
  speed: number;
  perspectiveStrength: number;
  cameraPitchDegrees: number;
  cameraYawDegrees: number;
  cameraRollDegrees: number;
}

interface BauhausGridStatistics {
  rowCount: number;
  particlesPerRow: number;
  totalParticleCount: number;
}

interface BauhausCameraViewCoordinates {
  position: BauhausLinePosition;
  target: BauhausLinePosition;
}

type ControlPanelMode = "field" | "text";
type EventTextHighlightMode = "page" | "black" | "none";
type EventTextColor = "black" | "white";
type EventTextAlignment = "left" | "center";

interface EventTextSettings {
  highlightMode: EventTextHighlightMode;
  textColor: EventTextColor;
  alignment: EventTextAlignment;
  scale: number;
  width: number;
  horizontalPosition: number;
  verticalPosition: number;
  highlightPadding: number;
}

interface RangeControlProps {
  label: string;
  minimum: number;
  maximum: number;
  step: number;
  value: number;
  displayValue: string;
  minimumLabel?: string;
  maximumLabel?: string;
  onChange: (value: number) => void;
}

interface SegmentedControlOption<ControlValue extends string> {
  label: string;
  value: ControlValue;
}

interface SegmentedControlProps<ControlValue extends string> {
  label: string;
  value: ControlValue;
  options: readonly SegmentedControlOption<ControlValue>[];
  onChange: (value: ControlValue) => void;
}

interface HighlightedEventTextProps {
  children: ReactNode;
  className?: string;
  style: CSSProperties;
}

const DEFAULT_SETTINGS: BauhausPrototypeSettings = {
  particleRadius: 0.34,
  rowSpacing: 1.3,
  speed: BAUHAUS_LINE_SPEED,
  perspectiveStrength: 6,
  cameraPitchDegrees: -3,
  cameraYawDegrees: 0,
  cameraRollDegrees: 1,
};

const DEFAULT_EVENT_TEXT_SETTINGS: EventTextSettings = {
  highlightMode: "page",
  textColor: "black",
  alignment: "left",
  scale: 1,
  width: 54,
  horizontalPosition: 6,
  verticalPosition: 49,
  highlightPadding: 5,
};

const HIGHLIGHT_MODE_OPTIONS: readonly SegmentedControlOption<EventTextHighlightMode>[] = [
  { label: "Teal", value: "page" },
  { label: "Black", value: "black" },
  { label: "None", value: "none" },
];

const TEXT_COLOR_OPTIONS: readonly SegmentedControlOption<EventTextColor>[] = [
  { label: "Black", value: "black" },
  { label: "White", value: "white" },
];

const TEXT_ALIGNMENT_OPTIONS: readonly SegmentedControlOption<EventTextAlignment>[] = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
];

const EMPTY_GRID_STATISTICS: BauhausGridStatistics = {
  rowCount: 0,
  particlesPerRow: 0,
  totalParticleCount: 0,
};

const DEFAULT_CAMERA_VIEW_COORDINATES: BauhausCameraViewCoordinates = {
  position: { ...BAUHAUS_DEFAULT_CAMERA_POSITION },
  target: { ...BAUHAUS_DEFAULT_CAMERA_TARGET },
};

function formatCoordinate(value: number): string {
  return Math.abs(value) < 0.005 ? "0.00" : value.toFixed(2);
}

function RangeControl({
  label,
  minimum,
  maximum,
  step,
  value,
  displayValue,
  minimumLabel,
  maximumLabel,
  onChange,
}: RangeControlProps) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline justify-between gap-4 text-[10px] font-bold tracking-[0.14em] uppercase">
        <span>{label}</span>
        <span className="font-mono text-[#FC7243] tabular-nums">{displayValue}</span>
      </span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
        className="h-4 w-full cursor-pointer accent-[#FC7243]"
      />
      {minimumLabel && maximumLabel && (
        <span className="flex justify-between font-mono text-[8px] tracking-[0.12em] text-white/35 uppercase">
          <span>{minimumLabel}</span>
          <span>{maximumLabel}</span>
        </span>
      )}
    </label>
  );
}

function SegmentedControl<ControlValue extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<ControlValue>) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-[10px] font-bold tracking-[0.14em] uppercase">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col border border-white/20 p-0.5">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
              className={`min-w-0 px-2 py-1.5 text-[9px] font-bold tracking-[0.11em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FC7243] ${
                isSelected
                  ? "bg-[#FC7243] text-black"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function HighlightedEventText({ children, className = "", style }: HighlightedEventTextProps) {
  return (
    <span className={`inline-block max-w-full ${className}`} style={style}>
      {children}
    </span>
  );
}

function EventTextPreview({ settings }: { settings: EventTextSettings }) {
  const textColor = settings.textColor === "white" ? "#FFFFFF" : "#0A0A0A";
  const backgroundColor =
    settings.highlightMode === "page"
      ? "#17E1E5"
      : settings.highlightMode === "black"
        ? "#0A0A0A"
        : "transparent";
  const highlightPadding = settings.highlightMode === "none" ? 0 : settings.highlightPadding;
  const highlightedTextStyle: CSSProperties = {
    backgroundColor,
    color: textColor,
    padding: `${highlightPadding}px ${highlightPadding * 1.45}px`,
  };
  const alignmentClassName = settings.alignment === "center" ? "items-center" : "items-start";

  return (
    <section
      aria-label="Danza Organica event text preview"
      className={`pointer-events-none absolute z-[5] flex flex-col ${alignmentClassName}`}
      style={{
        left: `${settings.horizontalPosition}%`,
        top: `${settings.verticalPosition}%`,
        width: `min(${settings.width}vw, calc(100vw - 2rem))`,
        textAlign: settings.alignment,
        transform: `translateY(-50%) scale(${settings.scale})`,
        transformOrigin: settings.alignment === "center" ? "center center" : "left center",
      }}
    >
      <h1 className="m-0 flex flex-col text-[clamp(3.4rem,7.1vw,8rem)] leading-[0.78] font-black tracking-[-0.07em] uppercase">
        <span>
          <HighlightedEventText style={highlightedTextStyle}>Danza</HighlightedEventText>
        </span>
        <span>
          <HighlightedEventText style={highlightedTextStyle}>Organica</HighlightedEventText>
        </span>
      </h1>

      <div className="mt-[clamp(0.8rem,1.6vw,1.5rem)] flex max-w-full flex-col gap-[clamp(0.35rem,0.7vw,0.7rem)] text-[clamp(0.62rem,1.05vw,1.05rem)] leading-tight font-bold tracking-[0.08em] uppercase">
        <p className="m-0">
          <HighlightedEventText style={highlightedTextStyle} className="tracking-[0.18em]">
            Vol. 4
          </HighlightedEventText>
        </p>
        <p className="m-0">
          <HighlightedEventText style={highlightedTextStyle}>
            Featuring · Nothing Radio
          </HighlightedEventText>
        </p>
        <p className="m-0 max-w-full">
          <HighlightedEventText style={highlightedTextStyle}>
            Hosted by · Toma Shade · Luis V · Alegra · Kelsey · Elsb3th · Gio · Carter H
          </HighlightedEventText>
        </p>
        <p className="m-0">
          <HighlightedEventText style={highlightedTextStyle}>
            Sponsored by · The Market
          </HighlightedEventText>
        </p>
        <p className="m-0 mt-[clamp(0.25rem,0.6vw,0.55rem)]">
          <HighlightedEventText style={highlightedTextStyle}>
            Friday 08.21.26 · 9:00 PM · Laissez-Faire
          </HighlightedEventText>
        </p>
        <p className="m-0 mt-[clamp(0.1rem,0.35vw,0.35rem)]">
          <HighlightedEventText
            style={{ ...highlightedTextStyle, backgroundColor: "#FC7243", color: "#0A0A0A" }}
            className="tracking-[0.18em]"
          >
            RSVP
          </HighlightedEventText>
        </p>
      </div>
    </section>
  );
}

export function BauhausLinePrototype() {
  const canvasHostReference = useRef<HTMLDivElement>(null);
  const settingsReference = useRef<BauhausPrototypeSettings>(DEFAULT_SETTINGS);
  const recalculateSceneReference = useRef<(() => void) | null>(null);
  const resetCameraViewReference = useRef<(() => void) | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [renderingError, setRenderingError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("Copy view");
  const [controlPanelMode, setControlPanelMode] = useState<ControlPanelMode>("field");
  const [settings, setSettings] = useState<BauhausPrototypeSettings>(DEFAULT_SETTINGS);
  const [eventTextSettings, setEventTextSettings] = useState<EventTextSettings>(
    DEFAULT_EVENT_TEXT_SETTINGS,
  );
  const [cameraViewCoordinates, setCameraViewCoordinates] = useState<BauhausCameraViewCoordinates>(
    DEFAULT_CAMERA_VIEW_COORDINATES,
  );
  const [gridStatistics, setGridStatistics] =
    useState<BauhausGridStatistics>(EMPTY_GRID_STATISTICS);

  useEffect(() => {
    settingsReference.current = settings;
    recalculateSceneReference.current?.();
  }, [settings]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotionPreference = () => {
      setPrefersReducedMotion(reducedMotionMediaQuery.matches);
    };
    updateReducedMotionPreference();
    reducedMotionMediaQuery.addEventListener?.("change", updateReducedMotionPreference);
    return () => {
      reducedMotionMediaQuery.removeEventListener?.("change", updateReducedMotionPreference);
    };
  }, []);

  useEffect(() => {
    const canvasHost = canvasHostReference.current;
    if (!canvasHost) return;

    let isDisposed = false;
    let animationFrameIdentifier: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const initializeScene = async () => {
      const three = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (isDisposed) return;

      const scene = new three.Scene();
      const camera = new three.PerspectiveCamera(BAUHAUS_CAMERA_FIELD_OF_VIEW, 1, 0.1, 100);
      camera.position.set(
        BAUHAUS_DEFAULT_CAMERA_POSITION.horizontalPosition,
        BAUHAUS_DEFAULT_CAMERA_POSITION.verticalPosition,
        BAUHAUS_DEFAULT_CAMERA_POSITION.depthPosition,
      );
      camera.lookAt(
        BAUHAUS_DEFAULT_CAMERA_TARGET.horizontalPosition,
        BAUHAUS_DEFAULT_CAMERA_TARGET.verticalPosition,
        BAUHAUS_DEFAULT_CAMERA_TARGET.depthPosition,
      );
      camera.updateMatrixWorld();

      const renderer = new three.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = three.SRGBColorSpace;
      renderer.setClearColor("#17E1E5", 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.cssText =
        "display:block;width:100%;height:100%;pointer-events:auto;cursor:grab;touch-action:none";
      canvasHost.appendChild(renderer.domElement);

      const orbitControls = new OrbitControls(camera, renderer.domElement);
      orbitControls.target.set(
        BAUHAUS_DEFAULT_CAMERA_TARGET.horizontalPosition,
        BAUHAUS_DEFAULT_CAMERA_TARGET.verticalPosition,
        BAUHAUS_DEFAULT_CAMERA_TARGET.depthPosition,
      );
      orbitControls.enableDamping = false;
      orbitControls.enablePan = true;
      orbitControls.enableRotate = true;
      orbitControls.enableZoom = true;
      orbitControls.minDistance = 1.25;
      orbitControls.maxDistance = 80;
      orbitControls.update();

      const particleGeometry = new three.BoxGeometry(1, 1, 1);
      const particleMaterial = new three.ShaderMaterial({
        vertexShader: BAUHAUS_VERTEX_SHADER,
        fragmentShader: BAUHAUS_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uRadius: { value: settingsReference.current.particleRadius },
          uNoiseAmp: { value: 0.035 },
          uNoiseFrequency: { value: 2 },
          uNoiseTimeMultiplier: { value: 0.3 },
          uRaymarchHitThreshold: { value: 0.001 },
          uRaymarchIterations: { value: 40 },
          uRaymarchMaxDistance: { value: 6 },
          uGradientColor1: { value: new three.Vector3(0.025, 0.025, 0.025) },
          uGradientColor2: { value: new three.Vector3(0.09, 0.09, 0.085) },
          uLightingStrength: { value: 1 },
          uViewMatrix: { value: camera.matrixWorldInverse.clone() },
          uProjectionMatrix: { value: camera.projectionMatrix.clone() },
          uNormalPrecision: { value: 0.0008 },
        },
        depthTest: true,
        depthWrite: true,
      });
      const particleMesh = new three.InstancedMesh(
        particleGeometry,
        particleMaterial,
        BAUHAUS_MAXIMUM_ROW_COUNT * BAUHAUS_MAXIMUM_PARTICLES_PER_ROW,
      );
      particleMesh.frustumCulled = false;
      particleMesh.instanceMatrix.setUsage(three.DynamicDrawUsage);
      scene.add(particleMesh);

      const particleTransform = new three.Object3D();
      let currentGridDimensions: BauhausGridDimensions | undefined;
      let latestElapsedSeconds = 0;
      let appliedCameraPitchDegrees = DEFAULT_SETTINGS.cameraPitchDegrees;
      let appliedCameraYawDegrees = DEFAULT_SETTINGS.cameraYawDegrees;

      const renderFrame = (elapsedSeconds: number) => {
        if (!currentGridDimensions) return;
        latestElapsedSeconds = elapsedSeconds;
        const currentSettings = settingsReference.current;
        const particleBoundsScale = currentSettings.particleRadius * 5.2;
        let instanceIndex = 0;

        for (let rowIndex = 0; rowIndex < currentGridDimensions.rowCount; rowIndex++) {
          const centeredRowIndex = rowIndex - (currentGridDimensions.rowCount - 1) / 2;
          const rowOffset = centeredRowIndex * currentSettings.rowSpacing;
          const rowPhaseOffset = calculateBauhausRowPhaseOffset(
            rowIndex,
            currentGridDimensions.particlesPerRow,
          );
          const rowSpeedMultiplier = calculateBauhausRowSpeedMultiplier(rowIndex);

          for (
            let particleIndex = 0;
            particleIndex < currentGridDimensions.particlesPerRow;
            particleIndex++
          ) {
            const progress = resolveBauhausLineProgress(
              particleIndex + rowPhaseOffset,
              currentGridDimensions.particlesPerRow,
              elapsedSeconds,
              currentSettings.speed * rowSpeedMultiplier,
            );
            const position = interpolateBauhausLinePosition(progress, currentGridDimensions);
            particleTransform.position.set(
              position.horizontalPosition +
                currentGridDimensions.perpendicularHorizontalDirection * rowOffset,
              position.verticalPosition +
                currentGridDimensions.perpendicularVerticalDirection * rowOffset,
              position.depthPosition,
            );
            particleTransform.scale.setScalar(particleBoundsScale);
            particleTransform.updateMatrix();
            particleMesh.setMatrixAt(instanceIndex, particleTransform.matrix);
            instanceIndex++;
          }
        }
        particleMesh.count = instanceIndex;
        particleMesh.instanceMatrix.needsUpdate = true;
        particleMaterial.uniforms.uTime.value = elapsedSeconds;
        particleMaterial.uniforms.uRadius.value = currentSettings.particleRadius;
        particleMaterial.uniforms.uViewMatrix.value.copy(camera.matrixWorldInverse);
        particleMaterial.uniforms.uProjectionMatrix.value.copy(camera.projectionMatrix);
        renderer.render(scene, camera);
      };

      const applyCameraRoll = () => {
        camera.lookAt(orbitControls.target);
        camera.rotateZ(three.MathUtils.degToRad(settingsReference.current.cameraRollDegrees));
        camera.updateMatrixWorld();
      };

      const updateCameraViewCoordinates = () => {
        if (isDisposed) return;
        setCameraViewCoordinates({
          position: {
            horizontalPosition: camera.position.x,
            verticalPosition: camera.position.y,
            depthPosition: camera.position.z,
          },
          target: {
            horizontalPosition: orbitControls.target.x,
            verticalPosition: orbitControls.target.y,
            depthPosition: orbitControls.target.z,
          },
        });
      };

      const handleOrbitChange = () => {
        applyCameraRoll();
        updateCameraViewCoordinates();
        renderFrame(latestElapsedSeconds);
      };
      const handleOrbitStart = () => {
        renderer.domElement.style.cursor = "grabbing";
      };
      const handleOrbitEnd = () => {
        renderer.domElement.style.cursor = "grab";
      };
      orbitControls.addEventListener("change", handleOrbitChange);
      orbitControls.addEventListener("start", handleOrbitStart);
      orbitControls.addEventListener("end", handleOrbitEnd);

      const recalculateScene = () => {
        const width = Math.max(1, canvasHost.clientWidth);
        const height = Math.max(1, canvasHost.clientHeight);
        const currentSettings = settingsReference.current;
        camera.aspect = width / height;
        if (
          currentSettings.cameraPitchDegrees !== appliedCameraPitchDegrees ||
          currentSettings.cameraYawDegrees !== appliedCameraYawDegrees
        ) {
          const cameraPosition = calculateBauhausCameraPosition(
            currentSettings.cameraPitchDegrees - DEFAULT_SETTINGS.cameraPitchDegrees,
            currentSettings.cameraYawDegrees - DEFAULT_SETTINGS.cameraYawDegrees,
            BAUHAUS_DEFAULT_CAMERA_POSITION,
            BAUHAUS_DEFAULT_CAMERA_TARGET,
          );
          orbitControls.target.set(
            BAUHAUS_DEFAULT_CAMERA_TARGET.horizontalPosition,
            BAUHAUS_DEFAULT_CAMERA_TARGET.verticalPosition,
            BAUHAUS_DEFAULT_CAMERA_TARGET.depthPosition,
          );
          camera.position.set(
            cameraPosition.horizontalPosition,
            cameraPosition.verticalPosition,
            cameraPosition.depthPosition,
          );
          appliedCameraPitchDegrees = currentSettings.cameraPitchDegrees;
          appliedCameraYawDegrees = currentSettings.cameraYawDegrees;
          orbitControls.update();
        }
        applyCameraRoll();
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        renderer.setSize(width, height, false);
        currentGridDimensions = calculateBauhausGridDimensions({
          viewportWidth: width,
          viewportHeight: height,
          particleRadius: currentSettings.particleRadius,
          rowSpacing: currentSettings.rowSpacing,
          perspectiveStrength: currentSettings.perspectiveStrength,
          cameraRollDegrees: currentSettings.cameraRollDegrees,
        });
        setGridStatistics({
          rowCount: currentGridDimensions.rowCount,
          particlesPerRow: currentGridDimensions.particlesPerRow,
          totalParticleCount: currentGridDimensions.totalParticleCount,
        });
        updateCameraViewCoordinates();
        // A resize changes the projection and grid, but it must not restart the
        // animation phase. Resetting to zero here made the field alternate
        // between its live and initial positions throughout a window resize.
        renderFrame(latestElapsedSeconds);
      };
      recalculateSceneReference.current = recalculateScene;
      resetCameraViewReference.current = () => {
        orbitControls.target.set(
          BAUHAUS_DEFAULT_CAMERA_TARGET.horizontalPosition,
          BAUHAUS_DEFAULT_CAMERA_TARGET.verticalPosition,
          BAUHAUS_DEFAULT_CAMERA_TARGET.depthPosition,
        );
        camera.position.set(
          BAUHAUS_DEFAULT_CAMERA_POSITION.horizontalPosition,
          BAUHAUS_DEFAULT_CAMERA_POSITION.verticalPosition,
          BAUHAUS_DEFAULT_CAMERA_POSITION.depthPosition,
        );
        appliedCameraPitchDegrees = DEFAULT_SETTINGS.cameraPitchDegrees;
        appliedCameraYawDegrees = DEFAULT_SETTINGS.cameraYawDegrees;
        orbitControls.update();
        applyCameraRoll();
        updateCameraViewCoordinates();
        renderFrame(latestElapsedSeconds);
      };
      resizeObserver = new ResizeObserver(recalculateScene);
      resizeObserver.observe(canvasHost);
      recalculateScene();

      const animationStartTime = performance.now();
      const animate = (timestamp: number) => {
        if (isDisposed) return;
        renderFrame((timestamp - animationStartTime) / 1000);
        animationFrameIdentifier = window.requestAnimationFrame(animate);
      };
      if (!prefersReducedMotion) {
        animationFrameIdentifier = window.requestAnimationFrame(animate);
      }

      return () => {
        if (recalculateSceneReference.current === recalculateScene) {
          recalculateSceneReference.current = null;
        }
        resetCameraViewReference.current = null;
        resizeObserver?.disconnect();
        if (animationFrameIdentifier !== undefined) {
          window.cancelAnimationFrame(animationFrameIdentifier);
        }
        scene.remove(particleMesh);
        orbitControls.removeEventListener("change", handleOrbitChange);
        orbitControls.removeEventListener("start", handleOrbitStart);
        orbitControls.removeEventListener("end", handleOrbitEnd);
        orbitControls.dispose();
        particleGeometry.dispose();
        particleMaterial.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    let disposeScene: (() => void) | undefined;
    void initializeScene()
      .then((disposeInitializedScene) => {
        if (isDisposed) {
          disposeInitializedScene?.();
          return;
        }
        disposeScene = disposeInitializedScene;
      })
      .catch((error: unknown) => {
        if (isDisposed) return;
        setRenderingError(error instanceof Error ? error.message : "WebGL failed to initialize");
      });

    return () => {
      isDisposed = true;
      disposeScene?.();
      resizeObserver?.disconnect();
      if (animationFrameIdentifier !== undefined) {
        window.cancelAnimationFrame(animationFrameIdentifier);
      }
    };
  }, [prefersReducedMotion]);

  const updateSetting = (settingName: keyof BauhausPrototypeSettings, settingValue: number) => {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [settingName]: settingValue,
    }));
  };

  const updateEventTextSetting = <SettingName extends keyof EventTextSettings>(
    settingName: SettingName,
    settingValue: EventTextSettings[SettingName],
  ) => {
    setEventTextSettings((currentSettings) => ({
      ...currentSettings,
      [settingName]: settingValue,
    }));
  };

  const resetPrototype = () => {
    setSettings(DEFAULT_SETTINGS);
    setEventTextSettings(DEFAULT_EVENT_TEXT_SETTINGS);
    setCopyStatus("Copy view");
    resetCameraViewReference.current?.();
  };

  const copyCameraView = async () => {
    const cameraViewPayload = {
      cameraPosition: cameraViewCoordinates.position,
      cameraTarget: cameraViewCoordinates.target,
      cameraRollDegrees: settings.cameraRollDegrees,
      perspectiveStrength: settings.perspectiveStrength,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(cameraViewPayload, null, 2));
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] isolate overflow-hidden bg-[#17E1E5] text-[#0A0A0A]">
      <div ref={canvasHostReference} className="absolute inset-0" />
      <EventTextPreview settings={eventTextSettings} />

      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <p className="absolute top-6 left-6 m-0 font-mono text-[10px] font-bold tracking-[0.18em] uppercase sm:top-8 sm:left-8">
          Far / upper-left
        </p>
        <p className="absolute right-6 bottom-6 m-0 text-right font-mono text-[10px] font-bold tracking-[0.18em] uppercase sm:right-8 sm:bottom-8">
          Near / lower-right
        </p>
      </div>

      <aside className="absolute top-5 right-5 z-10 max-h-[calc(100dvh-2.5rem)] w-[min(19rem,calc(100vw-2.5rem))] overflow-y-auto border border-white/20 bg-[#0A0A0A]/95 p-4 text-white shadow-2xl backdrop-blur-sm sm:top-8 sm:right-8 sm:max-h-[calc(100dvh-4rem)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="m-0 text-[10px] font-black tracking-[0.2em] text-[#FC7243] uppercase">
              {controlPanelMode === "field" ? "Field controls" : "Text tweaks"}
            </p>
            <p className="m-0 mt-1 font-mono text-[11px] text-white/55 tabular-nums">
              {controlPanelMode === "field"
                ? `${gridStatistics.rowCount} rows × ${gridStatistics.particlesPerRow} · ${gridStatistics.totalParticleCount} particles`
                : "Live event composition"}
            </p>
          </div>
          <button
            type="button"
            onClick={resetPrototype}
            className="border border-white/30 px-2 py-1 text-[9px] font-bold tracking-[0.14em] uppercase transition-colors hover:border-[#FC7243] hover:text-[#FC7243] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FC7243]"
          >
            Reset
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 border border-white/20 p-0.5">
          {(["field", "text"] as const).map((panelMode) => {
            const isSelected = panelMode === controlPanelMode;
            return (
              <button
                key={panelMode}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setControlPanelMode(panelMode)}
                className={`px-3 py-2 text-[9px] font-bold tracking-[0.14em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FC7243] ${
                  isSelected
                    ? "bg-white text-black"
                    : "text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {panelMode === "field" ? "Field" : "Event text"}
              </button>
            );
          })}
        </div>

        {controlPanelMode === "field" ? (
          <>
            <div className="mb-5 border-y border-white/15 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="m-0 text-[9px] font-bold tracking-[0.14em] text-white/65 uppercase">
                  Live camera view
                </p>
                <button
                  type="button"
                  onClick={() => void copyCameraView()}
                  className="text-[8px] font-bold tracking-[0.12em] text-[#FC7243] uppercase hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FC7243]"
                >
                  {copyStatus}
                </button>
              </div>
              <div className="grid grid-cols-[3rem_1fr] gap-x-2 gap-y-1 font-mono text-[9px] tabular-nums">
                <span className="text-white/40 uppercase">Camera</span>
                <span>
                  {formatCoordinate(cameraViewCoordinates.position.horizontalPosition)},{" "}
                  {formatCoordinate(cameraViewCoordinates.position.verticalPosition)},{" "}
                  {formatCoordinate(cameraViewCoordinates.position.depthPosition)}
                </span>
                <span className="text-white/40 uppercase">Target</span>
                <span>
                  {formatCoordinate(cameraViewCoordinates.target.horizontalPosition)},{" "}
                  {formatCoordinate(cameraViewCoordinates.target.verticalPosition)},{" "}
                  {formatCoordinate(cameraViewCoordinates.target.depthPosition)}
                </span>
              </div>
              <p className="m-0 mt-2 text-[8px] leading-relaxed text-white/35">
                Drag to orbit · Shift/right-drag to move focus · wheel to zoom
              </p>
            </div>

            <div className="grid gap-4">
              <RangeControl
                label="Particle size"
                minimum={0.22}
                maximum={0.8}
                step={0.01}
                value={settings.particleRadius}
                displayValue={settings.particleRadius.toFixed(2)}
                onChange={(value) => updateSetting("particleRadius", value)}
              />
              <RangeControl
                label="Row spacing"
                minimum={0.55}
                maximum={4.5}
                step={0.05}
                value={settings.rowSpacing}
                displayValue={settings.rowSpacing.toFixed(2)}
                onChange={(value) => updateSetting("rowSpacing", value)}
              />
              <RangeControl
                label="Perspective contrast"
                minimum={BAUHAUS_MINIMUM_PERSPECTIVE_STRENGTH}
                maximum={BAUHAUS_MAXIMUM_PERSPECTIVE_STRENGTH}
                step={0.01}
                value={settings.perspectiveStrength}
                displayValue={`${settings.perspectiveStrength.toFixed(2)}×`}
                minimumLabel="Subtle"
                maximumLabel="Extreme"
                onChange={(value) => updateSetting("perspectiveStrength", value)}
              />
              <RangeControl
                label="Camera pitch"
                minimum={-20}
                maximum={20}
                step={1}
                value={settings.cameraPitchDegrees}
                displayValue={`${settings.cameraPitchDegrees.toFixed(0)}°`}
                onChange={(value) => updateSetting("cameraPitchDegrees", value)}
              />
              <RangeControl
                label="Camera yaw"
                minimum={-20}
                maximum={20}
                step={1}
                value={settings.cameraYawDegrees}
                displayValue={`${settings.cameraYawDegrees.toFixed(0)}°`}
                onChange={(value) => updateSetting("cameraYawDegrees", value)}
              />
              <RangeControl
                label="Camera roll"
                minimum={-25}
                maximum={25}
                step={1}
                value={settings.cameraRollDegrees}
                displayValue={`${settings.cameraRollDegrees.toFixed(0)}°`}
                onChange={(value) => updateSetting("cameraRollDegrees", value)}
              />
              <RangeControl
                label="Speed"
                minimum={0.005}
                maximum={0.08}
                step={0.001}
                value={settings.speed}
                displayValue={settings.speed.toFixed(3)}
                onChange={(value) => updateSetting("speed", value)}
              />
            </div>

            <p className="m-0 mt-5 border-t border-white/15 pt-3 text-[10px] leading-relaxed text-white/45">
              Single camera · direct orbit, focus, roll, and depth control
            </p>
          </>
        ) : (
          <div className="grid gap-4">
            <SegmentedControl
              label="Text background"
              value={eventTextSettings.highlightMode}
              options={HIGHLIGHT_MODE_OPTIONS}
              onChange={(value) => updateEventTextSetting("highlightMode", value)}
            />
            <SegmentedControl
              label="Text color"
              value={eventTextSettings.textColor}
              options={TEXT_COLOR_OPTIONS}
              onChange={(value) => updateEventTextSetting("textColor", value)}
            />
            <SegmentedControl
              label="Alignment"
              value={eventTextSettings.alignment}
              options={TEXT_ALIGNMENT_OPTIONS}
              onChange={(value) => updateEventTextSetting("alignment", value)}
            />
            <RangeControl
              label="Text scale"
              minimum={0.65}
              maximum={1.4}
              step={0.01}
              value={eventTextSettings.scale}
              displayValue={`${eventTextSettings.scale.toFixed(2)}×`}
              onChange={(value) => updateEventTextSetting("scale", value)}
            />
            <RangeControl
              label="Composition width"
              minimum={32}
              maximum={72}
              step={1}
              value={eventTextSettings.width}
              displayValue={`${eventTextSettings.width.toFixed(0)}vw`}
              onChange={(value) => updateEventTextSetting("width", value)}
            />
            <RangeControl
              label="Horizontal position"
              minimum={2}
              maximum={62}
              step={1}
              value={eventTextSettings.horizontalPosition}
              displayValue={`${eventTextSettings.horizontalPosition.toFixed(0)}%`}
              onChange={(value) => updateEventTextSetting("horizontalPosition", value)}
            />
            <RangeControl
              label="Vertical position"
              minimum={15}
              maximum={85}
              step={1}
              value={eventTextSettings.verticalPosition}
              displayValue={`${eventTextSettings.verticalPosition.toFixed(0)}%`}
              onChange={(value) => updateEventTextSetting("verticalPosition", value)}
            />
            <RangeControl
              label="Highlight padding"
              minimum={0}
              maximum={16}
              step={1}
              value={eventTextSettings.highlightPadding}
              displayValue={`${eventTextSettings.highlightPadding.toFixed(0)}px`}
              onChange={(value) => updateEventTextSetting("highlightPadding", value)}
            />
            <p className="m-0 border-t border-white/15 pt-3 text-[10px] leading-relaxed text-white/45">
              Highlights apply line by line so the particle field can remain visible between blocks.
            </p>
          </div>
        )}
      </aside>

      <div className="absolute bottom-6 left-6 max-w-[23rem] border-l-2 border-[#FC7243] pl-3 sm:bottom-8 sm:left-8">
        <p className="m-0 text-[10px] font-black tracking-[0.2em] uppercase">3D Bauhaus study</p>
        <p className="m-0 mt-1 text-xs leading-snug text-black/60">
          Responsive parallel rows. Single camera. No scroll interpolation.
        </p>
        {prefersReducedMotion && (
          <p className="m-0 mt-1 text-xs font-semibold">Motion paused by system settings.</p>
        )}
        {renderingError && (
          <p role="alert" className="m-0 mt-1 text-xs font-semibold text-red-800">
            {renderingError}
          </p>
        )}
      </div>
    </div>
  );
}
