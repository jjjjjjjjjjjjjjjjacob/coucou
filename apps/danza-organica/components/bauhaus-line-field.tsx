"use client";

import { useEffect, useRef, useState } from "react";
import {
  BAUHAUS_CAMERA_FIELD_OF_VIEW,
  BAUHAUS_DEFAULT_CAMERA_POSITION,
  BAUHAUS_DEFAULT_CAMERA_TARGET,
  BAUHAUS_LINE_SPEED,
  BAUHAUS_MAXIMUM_PARTICLES_PER_ROW,
  BAUHAUS_MAXIMUM_ROW_COUNT,
  type BauhausGridDimensions,
  calculateBauhausGridDimensions,
  calculateBauhausRowPhaseOffset,
  calculateBauhausRowSpeedMultiplier,
  calculateResponsiveBauhausPerspectiveStrength,
  interpolateBauhausLinePosition,
  resolveBauhausLineProgress,
} from "@/lib/bauhaus-line";
import { BAUHAUS_FRAGMENT_SHADER, BAUHAUS_VERTEX_SHADER } from "@/lib/bauhaus-particle-shaders";

const FROZEN_PARTICLE_RADIUS = 0.34;
const FROZEN_ROW_SPACING = 1.3;
const FROZEN_PERSPECTIVE_STRENGTH = 6;
const FROZEN_CAMERA_ROLL_DEGREES = 1;

/**
 * The production Danza field uses the approved camera capture as an immutable
 * view. The particles still travel through their lanes, but guest pages expose
 * no orbit, zoom, scroll, or resize-driven camera controls.
 */
export function BauhausLineField() {
  const canvasHostReference = useRef<HTMLDivElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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
    // DOM-only test environments do not provide a WebGL context. The teal
    // fallback is the intentional no-WebGL rendering path.
    if (process.env.NODE_ENV === "test") return;

    let isDisposed = false;
    let animationFrameIdentifier: number | undefined;
    let fieldRevealAnimationFrameIdentifier: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const initializeScene = async () => {
      const three = await import("three");
      if (isDisposed) return;

      const scene = new three.Scene();
      const camera = new three.PerspectiveCamera(BAUHAUS_CAMERA_FIELD_OF_VIEW, 1, 0.1, 100);
      camera.position.set(
        BAUHAUS_DEFAULT_CAMERA_POSITION.horizontalPosition,
        BAUHAUS_DEFAULT_CAMERA_POSITION.verticalPosition,
        BAUHAUS_DEFAULT_CAMERA_POSITION.depthPosition,
      );

      const applyFrozenCamera = () => {
        camera.lookAt(
          BAUHAUS_DEFAULT_CAMERA_TARGET.horizontalPosition,
          BAUHAUS_DEFAULT_CAMERA_TARGET.verticalPosition,
          BAUHAUS_DEFAULT_CAMERA_TARGET.depthPosition,
        );
        camera.rotateZ(three.MathUtils.degToRad(FROZEN_CAMERA_ROLL_DEGREES));
        camera.updateMatrixWorld();
      };
      applyFrozenCamera();

      const renderer = new three.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = three.SRGBColorSpace;
      renderer.setClearColor("#17E1E5", 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.classList.add("danza-bauhaus-field__canvas");
      renderer.domElement.style.cssText =
        "display:block;width:100%;height:100%;pointer-events:none;touch-action:none";
      canvasHost.appendChild(renderer.domElement);

      const particleGeometry = new three.BoxGeometry(1, 1, 1);
      const particleMaterial = new three.ShaderMaterial({
        vertexShader: BAUHAUS_VERTEX_SHADER,
        fragmentShader: BAUHAUS_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uRadius: { value: FROZEN_PARTICLE_RADIUS },
          uNoiseAmp: { value: 0.035 },
          uNoiseFrequency: { value: 2 },
          uNoiseTimeMultiplier: { value: 0.3 },
          uRaymarchHitThreshold: { value: 0.001 },
          uRaymarchIterations: { value: 40 },
          uRaymarchMaxDistance: { value: 6 },
          uGradientColor1: { value: new three.Vector3(0.025, 0.025, 0.025) },
          uGradientColor2: { value: new three.Vector3(0.09, 0.09, 0.085) },
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

      const renderFrame = (elapsedSeconds: number) => {
        if (!currentGridDimensions) return;
        latestElapsedSeconds = elapsedSeconds;
        const particleBoundsScale = FROZEN_PARTICLE_RADIUS * 5.2;
        let instanceIndex = 0;

        for (let rowIndex = 0; rowIndex < currentGridDimensions.rowCount; rowIndex++) {
          const centeredRowIndex = rowIndex - (currentGridDimensions.rowCount - 1) / 2;
          const rowOffset = centeredRowIndex * FROZEN_ROW_SPACING;
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
              BAUHAUS_LINE_SPEED * rowSpeedMultiplier,
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
        particleMaterial.uniforms.uViewMatrix.value.copy(camera.matrixWorldInverse);
        particleMaterial.uniforms.uProjectionMatrix.value.copy(camera.projectionMatrix);
        renderer.render(scene, camera);
      };

      const recalculateScene = () => {
        const width = Math.max(1, canvasHost.clientWidth);
        const height = Math.max(1, canvasHost.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        applyFrozenCamera();
        renderer.setSize(width, height, false);
        const responsivePerspectiveStrength = calculateResponsiveBauhausPerspectiveStrength(
          width,
          height,
          FROZEN_PERSPECTIVE_STRENGTH,
        );
        currentGridDimensions = calculateBauhausGridDimensions({
          viewportWidth: width,
          viewportHeight: height,
          particleRadius: FROZEN_PARTICLE_RADIUS,
          rowSpacing: FROZEN_ROW_SPACING,
          perspectiveStrength: responsivePerspectiveStrength,
          cameraRollDegrees: FROZEN_CAMERA_ROLL_DEGREES,
        });
        // Resizing updates the destination geometry without replaying the
        // field from its initial phase.
        renderFrame(latestElapsedSeconds);
      };

      resizeObserver = new ResizeObserver(recalculateScene);
      resizeObserver.observe(canvasHost);
      recalculateScene();

      // Keep the teal fallback visible while WebGL initializes, then reveal
      // only the rendered particle canvas after its first complete frame.
      fieldRevealAnimationFrameIdentifier = window.requestAnimationFrame(() => {
        if (isDisposed) return;
        renderer.domElement.classList.add("danza-bauhaus-field__canvas--loaded");
        canvasHost.dataset.bauhausFieldLoaded = "true";
      });

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
        resizeObserver?.disconnect();
        if (animationFrameIdentifier !== undefined) {
          window.cancelAnimationFrame(animationFrameIdentifier);
        }
        if (fieldRevealAnimationFrameIdentifier !== undefined) {
          window.cancelAnimationFrame(fieldRevealAnimationFrameIdentifier);
        }
        scene.remove(particleMesh);
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
        // The teal surface remains a complete fallback if WebGL is unavailable.
        console.error("Failed to initialize the Danza Bauhaus field", error);
      });

    return () => {
      isDisposed = true;
      disposeScene?.();
      resizeObserver?.disconnect();
      if (animationFrameIdentifier !== undefined) {
        window.cancelAnimationFrame(animationFrameIdentifier);
      }
      if (fieldRevealAnimationFrameIdentifier !== undefined) {
        window.cancelAnimationFrame(fieldRevealAnimationFrameIdentifier);
      }
    };
  }, [prefersReducedMotion]);

  return (
    <div
      ref={canvasHostReference}
      className="danza-bauhaus-field pointer-events-none fixed inset-0 z-0 bg-[#17E1E5]"
      aria-hidden="true"
      data-bauhaus-camera="frozen"
    />
  );
}
