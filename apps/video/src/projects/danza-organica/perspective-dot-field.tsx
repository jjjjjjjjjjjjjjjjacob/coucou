import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  DynamicDrawUsage,
  type InstancedMesh,
  Matrix4,
  Object3D,
  type ShaderMaterial,
  Vector3,
} from "three";
import {
  BAUHAUS_CAMERA_FIELD_OF_VIEW,
  BAUHAUS_DEFAULT_CAMERA_POSITION,
  BAUHAUS_DEFAULT_CAMERA_TARGET,
  BAUHAUS_LINE_SPEED,
  BAUHAUS_MAXIMUM_PARTICLES_PER_ROW,
  BAUHAUS_MAXIMUM_ROW_COUNT,
  calculateBauhausGridDimensions,
  calculateBauhausRowPhaseOffset,
  calculateBauhausRowSpeedMultiplier,
  calculateResponsiveBauhausPerspectiveStrength,
  interpolateBauhausLinePosition,
  resolveBauhausLineProgress,
} from "../../../../danza-organica/lib/bauhaus-line";
import {
  BAUHAUS_FRAGMENT_SHADER,
  BAUHAUS_VERTEX_SHADER,
} from "../../../../danza-organica/lib/bauhaus-particle-shaders";
import { COLORS } from "./constants";

const PARTICLE_RADIUS = 0.34;
const ROW_SPACING = 1.3;
const PERSPECTIVE_STRENGTH = 6;
const CAMERA_ROLL_DEGREES = 1;
const PARTICLE_BOUNDS_SCALE = PARTICLE_RADIUS * 5.2;
const MAXIMUM_PARTICLE_COUNT = BAUHAUS_MAXIMUM_ROW_COUNT * BAUHAUS_MAXIMUM_PARTICLES_PER_ROW;

interface ParticleFieldProps {
  readonly width: number;
  readonly height: number;
}

function ParticleField({ width, height }: ParticleFieldProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { camera } = useThree();
  const particleMeshReference = useRef<InstancedMesh>(null);
  const particleMaterialReference = useRef<ShaderMaterial>(null);
  const particleTransform = useMemo(() => new Object3D(), []);
  const responsivePerspectiveStrength = calculateResponsiveBauhausPerspectiveStrength(
    width,
    height,
    PERSPECTIVE_STRENGTH,
  );
  const gridDimensions = useMemo(
    () =>
      calculateBauhausGridDimensions({
        viewportWidth: width,
        viewportHeight: height,
        particleRadius: PARTICLE_RADIUS,
        rowSpacing: ROW_SPACING,
        perspectiveStrength: responsivePerspectiveStrength,
        cameraRollDegrees: CAMERA_ROLL_DEGREES,
      }),
    [height, responsivePerspectiveStrength, width],
  );
  const materialUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRadius: { value: PARTICLE_RADIUS },
      uNoiseAmp: { value: 0.035 },
      uNoiseFrequency: { value: 2 },
      uNoiseTimeMultiplier: { value: 0.3 },
      uRaymarchHitThreshold: { value: 0.001 },
      uRaymarchIterations: { value: 40 },
      uRaymarchMaxDistance: { value: 6 },
      uGradientColor1: { value: new Vector3(0.025, 0.025, 0.025) },
      uGradientColor2: { value: new Vector3(0.09, 0.09, 0.085) },
      uLightingStrength: { value: 1 },
      uViewMatrix: { value: new Matrix4() },
      uProjectionMatrix: { value: new Matrix4() },
      uNormalPrecision: { value: 0.0008 },
    }),
    [],
  );

  useLayoutEffect(() => {
    const particleMesh = particleMeshReference.current;
    const particleMaterial = particleMaterialReference.current;
    if (!particleMesh || !particleMaterial) return;

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
    camera.rotateZ((CAMERA_ROLL_DEGREES * Math.PI) / 180);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const elapsedSeconds = frame / fps;
    let instanceIndex = 0;

    for (let rowIndex = 0; rowIndex < gridDimensions.rowCount; rowIndex += 1) {
      const centeredRowIndex = rowIndex - (gridDimensions.rowCount - 1) / 2;
      const rowOffset = centeredRowIndex * ROW_SPACING;
      const rowPhaseOffset = calculateBauhausRowPhaseOffset(
        rowIndex,
        gridDimensions.particlesPerRow,
      );
      const rowSpeedMultiplier = calculateBauhausRowSpeedMultiplier(rowIndex);

      for (
        let particleIndex = 0;
        particleIndex < gridDimensions.particlesPerRow;
        particleIndex += 1
      ) {
        const progress = resolveBauhausLineProgress(
          particleIndex + rowPhaseOffset,
          gridDimensions.particlesPerRow,
          elapsedSeconds,
          BAUHAUS_LINE_SPEED * rowSpeedMultiplier,
        );
        const position = interpolateBauhausLinePosition(progress, gridDimensions);
        particleTransform.position.set(
          position.horizontalPosition + gridDimensions.perpendicularHorizontalDirection * rowOffset,
          position.verticalPosition + gridDimensions.perpendicularVerticalDirection * rowOffset,
          position.depthPosition,
        );
        particleTransform.scale.setScalar(PARTICLE_BOUNDS_SCALE);
        particleTransform.updateMatrix();
        particleMesh.setMatrixAt(instanceIndex, particleTransform.matrix);
        instanceIndex += 1;
      }
    }

    particleMesh.count = instanceIndex;
    particleMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    particleMesh.instanceMatrix.needsUpdate = true;
    materialUniforms.uTime.value = elapsedSeconds;
    materialUniforms.uViewMatrix.value.copy(camera.matrixWorldInverse);
    materialUniforms.uProjectionMatrix.value.copy(camera.projectionMatrix);
    particleMaterial.needsUpdate = true;
  }, [camera, fps, frame, gridDimensions, materialUniforms, particleTransform]);

  return (
    <instancedMesh
      ref={particleMeshReference}
      args={[undefined, undefined, MAXIMUM_PARTICLE_COUNT]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <shaderMaterial
        ref={particleMaterialReference}
        vertexShader={BAUHAUS_VERTEX_SHADER}
        fragmentShader={BAUHAUS_FRAGMENT_SHADER}
        uniforms={materialUniforms}
        depthTest
        depthWrite
      />
    </instancedMesh>
  );
}

export function PerspectiveDotField() {
  const { width, height } = useVideoConfig();

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: BAUHAUS_CAMERA_FIELD_OF_VIEW, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
    >
      <color attach="background" args={[COLORS.turquoise]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[-0.5, 0.8, 1]} intensity={0.8} />
      <ParticleField width={width} height={height} />
    </ThreeCanvas>
  );
}
