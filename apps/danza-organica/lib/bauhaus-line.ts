export interface BauhausLinePosition {
  horizontalPosition: number;
  verticalPosition: number;
  depthPosition: number;
}

export interface BauhausLineEndpoints {
  farPosition: BauhausLinePosition;
  nearPosition: BauhausLinePosition;
}

export interface BauhausGridDimensions extends BauhausLineEndpoints {
  rowCount: number;
  particlesPerRow: number;
  totalParticleCount: number;
  perpendicularHorizontalDirection: number;
  perpendicularVerticalDirection: number;
}

export interface BauhausGridCalculationInput {
  viewportWidth: number;
  viewportHeight: number;
  particleRadius: number;
  rowSpacing: number;
  perspectiveStrength?: number;
  cameraRollDegrees?: number;
}

export interface BauhausPerspectiveDepths {
  farDepth: number;
  nearDepth: number;
}

export const BAUHAUS_FIXED_CAMERA_POSITION = {
  horizontalPosition: 0,
  verticalPosition: 0,
  depthPosition: 12,
} as const;

export const BAUHAUS_CAMERA_TARGET = {
  horizontalPosition: 0,
  verticalPosition: 0,
  depthPosition: -3,
} as const;

export const BAUHAUS_DEFAULT_CAMERA_POSITION = {
  horizontalPosition: 0.97,
  verticalPosition: -0.59,
  depthPosition: 8.01,
} as const;

export const BAUHAUS_DEFAULT_CAMERA_TARGET = {
  horizontalPosition: 5.46,
  verticalPosition: -5.56,
  depthPosition: 2.66,
} as const;

export const BAUHAUS_CAMERA_FIELD_OF_VIEW = 42;
export const BAUHAUS_FAR_DEPTH = -22;
export const BAUHAUS_NEAR_DEPTH = 7.9;
export const BAUHAUS_MAXIMUM_ROW_COUNT = 48;
export const BAUHAUS_MAXIMUM_PARTICLES_PER_ROW = 56;
export const BAUHAUS_LINE_SPEED = 0.005;
export const BAUHAUS_MINIMUM_PERSPECTIVE_STRENGTH = 0.45;
export const BAUHAUS_MAXIMUM_PERSPECTIVE_STRENGTH = 8;

const FALLBACK_VIEWPORT_WIDTH = 1280;
const FALLBACK_VIEWPORT_HEIGHT = 720;
// Both endpoints sit well outside the frustum. Their screen-space slope is
// intentionally steeper than a corner-to-corner diagonal on a widescreen canvas.
const FAR_SCREEN_HORIZONTAL_POSITION = -1.45;
const FAR_SCREEN_VERTICAL_POSITION = 2.39;
const NEAR_SCREEN_HORIZONTAL_POSITION = 1.35;
const NEAR_SCREEN_VERTICAL_POSITION = -2.23;
// Particle centers are deliberately tighter inside a travel lane than the
// default distance between lanes. This makes the moving diagonal lanes read
// as the formation instead of the orthogonal cross-lane alignments.
const PARTICLE_SPACING_RADIUS_MULTIPLIER = 2.8;
const RESPONSIVE_PERSPECTIVE_REFERENCE_ASPECT_RATIO = 16 / 9;
const RESPONSIVE_PERSPECTIVE_MINIMUM_MULTIPLIER = 0.45;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function wrapUnitProgress(progress: number): number {
  return ((progress % 1) + 1) % 1;
}

function easePerspectiveDepth(progress: number): number {
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

export function calculateResponsiveBauhausPerspectiveStrength(
  viewportWidth: number,
  viewportHeight: number,
  basePerspectiveStrength: number,
): number {
  const normalizedAspectRatio = Math.max(1, viewportWidth) / Math.max(1, viewportHeight);
  if (normalizedAspectRatio <= RESPONSIVE_PERSPECTIVE_REFERENCE_ASPECT_RATIO) {
    return basePerspectiveStrength;
  }

  const aspectRatioCompensation = Math.pow(
    RESPONSIVE_PERSPECTIVE_REFERENCE_ASPECT_RATIO / normalizedAspectRatio,
    0.8,
  );
  return clamp(
    basePerspectiveStrength * aspectRatioCompensation,
    basePerspectiveStrength * RESPONSIVE_PERSPECTIVE_MINIMUM_MULTIPLIER,
    basePerspectiveStrength,
  );
}

export function calculateBauhausPerspectiveDepths(
  perspectiveStrength: number,
): BauhausPerspectiveDepths {
  const normalizedStrength = clamp(
    perspectiveStrength,
    BAUHAUS_MINIMUM_PERSPECTIVE_STRENGTH,
    BAUHAUS_MAXIMUM_PERSPECTIVE_STRENGTH,
  );
  const defaultFarCameraDistance = BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - BAUHAUS_FAR_DEPTH;
  const defaultNearCameraDistance =
    BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - BAUHAUS_NEAR_DEPTH;

  return {
    farDepth:
      BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - defaultFarCameraDistance * normalizedStrength,
    nearDepth:
      BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - defaultNearCameraDistance / normalizedStrength,
  };
}

export function calculateBauhausCameraPosition(
  pitchDegrees: number,
  yawDegrees: number,
  baseCameraPosition: BauhausLinePosition = BAUHAUS_FIXED_CAMERA_POSITION,
  cameraTarget: BauhausLinePosition = BAUHAUS_CAMERA_TARGET,
): BauhausLinePosition {
  const baseHorizontalOffset =
    baseCameraPosition.horizontalPosition - cameraTarget.horizontalPosition;
  const baseVerticalOffset = baseCameraPosition.verticalPosition - cameraTarget.verticalPosition;
  const baseDepthOffset = baseCameraPosition.depthPosition - cameraTarget.depthPosition;
  const orbitDistance = Math.hypot(baseHorizontalOffset, baseVerticalOffset, baseDepthOffset);
  const basePitchRadians = Math.asin(baseVerticalOffset / orbitDistance);
  const baseYawRadians = Math.atan2(baseHorizontalOffset, baseDepthOffset);
  const pitchRadians = clamp(
    basePitchRadians + (pitchDegrees * Math.PI) / 180,
    -Math.PI / 2 + 0.001,
    Math.PI / 2 - 0.001,
  );
  const yawRadians = baseYawRadians + (yawDegrees * Math.PI) / 180;
  const horizontalOrbitScale = Math.cos(pitchRadians) * orbitDistance;

  return {
    horizontalPosition:
      cameraTarget.horizontalPosition + Math.sin(yawRadians) * horizontalOrbitScale,
    verticalPosition: cameraTarget.verticalPosition + Math.sin(pitchRadians) * orbitDistance,
    depthPosition: cameraTarget.depthPosition + Math.cos(yawRadians) * horizontalOrbitScale,
  };
}

function calculateWorldPositionAtDepth(
  normalizedHorizontalPosition: number,
  normalizedVerticalPosition: number,
  depthPosition: number,
  aspectRatio: number,
): BauhausLinePosition {
  const cameraDistance = BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - depthPosition;
  const verticalProjectionScale =
    cameraDistance * Math.tan((BAUHAUS_CAMERA_FIELD_OF_VIEW * Math.PI) / 360);
  return {
    horizontalPosition: normalizedHorizontalPosition * verticalProjectionScale * aspectRatio,
    verticalPosition: normalizedVerticalPosition * verticalProjectionScale,
    depthPosition,
  };
}

function calculateEndpointAspectRatio(endpoints: BauhausLineEndpoints): number {
  const farCameraDistance =
    BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - endpoints.farPosition.depthPosition;
  const farVerticalProjectionScale =
    farCameraDistance * Math.tan((BAUHAUS_CAMERA_FIELD_OF_VIEW * Math.PI) / 360);
  const inferredAspectRatio =
    endpoints.farPosition.horizontalPosition /
    (FAR_SCREEN_HORIZONTAL_POSITION * farVerticalProjectionScale);

  return Number.isFinite(inferredAspectRatio) && inferredAspectRatio > 0
    ? inferredAspectRatio
    : FALLBACK_VIEWPORT_WIDTH / FALLBACK_VIEWPORT_HEIGHT;
}

export function calculateBauhausLineEndpoints(
  viewportWidth: number,
  viewportHeight: number,
  perspectiveStrength = 1,
): BauhausLineEndpoints {
  const normalizedWidth = Math.max(1, viewportWidth);
  const normalizedHeight = Math.max(1, viewportHeight);
  const aspectRatio = normalizedWidth / normalizedHeight;
  const perspectiveDepths = calculateBauhausPerspectiveDepths(perspectiveStrength);
  return {
    farPosition: calculateWorldPositionAtDepth(
      FAR_SCREEN_HORIZONTAL_POSITION,
      FAR_SCREEN_VERTICAL_POSITION,
      perspectiveDepths.farDepth,
      aspectRatio,
    ),
    nearPosition: calculateWorldPositionAtDepth(
      NEAR_SCREEN_HORIZONTAL_POSITION,
      NEAR_SCREEN_VERTICAL_POSITION,
      perspectiveDepths.nearDepth,
      aspectRatio,
    ),
  };
}

export const DEFAULT_BAUHAUS_LINE_ENDPOINTS = calculateBauhausLineEndpoints(
  FALLBACK_VIEWPORT_WIDTH,
  FALLBACK_VIEWPORT_HEIGHT,
);

export function calculateBauhausGridDimensions({
  viewportWidth,
  viewportHeight,
  particleRadius,
  rowSpacing,
  perspectiveStrength = 1,
  cameraRollDegrees = 0,
}: BauhausGridCalculationInput): BauhausGridDimensions {
  const normalizedWidth = Math.max(1, viewportWidth);
  const normalizedHeight = Math.max(1, viewportHeight);
  const normalizedRadius = Math.max(0.05, particleRadius);
  const normalizedRowSpacing = Math.max(0.25, rowSpacing);
  const aspectRatio = normalizedWidth / normalizedHeight;
  const endpoints = calculateBauhausLineEndpoints(
    normalizedWidth,
    normalizedHeight,
    perspectiveStrength,
  );
  const horizontalDistance =
    endpoints.nearPosition.horizontalPosition - endpoints.farPosition.horizontalPosition;
  const verticalDistance =
    endpoints.nearPosition.verticalPosition - endpoints.farPosition.verticalPosition;
  const depthDistance = endpoints.nearPosition.depthPosition - endpoints.farPosition.depthPosition;
  const screenPlaneDirectionLength = Math.hypot(horizontalDistance, verticalDistance);
  const horizontalDirection = horizontalDistance / screenPlaneDirectionLength;
  const verticalDirection = verticalDistance / screenPlaneDirectionLength;
  const perpendicularHorizontalDirection = -verticalDirection;
  const perpendicularVerticalDirection = horizontalDirection;
  const farCameraDistance =
    BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - endpoints.farPosition.depthPosition;
  const visibleFarHeight =
    2 * Math.tan((BAUHAUS_CAMERA_FIELD_OF_VIEW * Math.PI) / 360) * farCameraDistance;
  const visibleFarWidth = visibleFarHeight * aspectRatio;
  const cameraAngleRadians = (cameraRollDegrees * Math.PI) / 180;
  const cameraHorizontalPerpendicularDirection =
    perpendicularHorizontalDirection * Math.cos(cameraAngleRadians) +
    perpendicularVerticalDirection * Math.sin(cameraAngleRadians);
  const cameraVerticalPerpendicularDirection =
    -perpendicularHorizontalDirection * Math.sin(cameraAngleRadians) +
    perpendicularVerticalDirection * Math.cos(cameraAngleRadians);
  const requiredPerpendicularSpan =
    visibleFarWidth * Math.abs(cameraHorizontalPerpendicularDirection) +
    visibleFarHeight * Math.abs(cameraVerticalPerpendicularDirection);
  const threeDimensionalPathLength = Math.hypot(
    horizontalDistance,
    verticalDistance,
    depthDistance,
  );
  const particleSpacing = normalizedRadius * PARTICLE_SPACING_RADIUS_MULTIPLIER;
  const rowCount = clamp(
    Math.ceil((requiredPerpendicularSpan * 1.12) / normalizedRowSpacing),
    3,
    BAUHAUS_MAXIMUM_ROW_COUNT,
  );
  const particlesPerRow = clamp(
    Math.ceil(threeDimensionalPathLength / particleSpacing),
    8,
    BAUHAUS_MAXIMUM_PARTICLES_PER_ROW,
  );

  return {
    ...endpoints,
    rowCount,
    particlesPerRow,
    totalParticleCount: rowCount * particlesPerRow,
    perpendicularHorizontalDirection,
    perpendicularVerticalDirection,
  };
}

export function resolveBauhausLineProgress(
  particleIndex: number,
  particleCount: number,
  elapsedSeconds: number,
  speed = BAUHAUS_LINE_SPEED,
): number {
  if (particleCount <= 0) return 0;
  return wrapUnitProgress(particleIndex / particleCount + elapsedSeconds * speed);
}

export function calculateBauhausRowPhaseOffset(rowIndex: number, particleCount: number): number {
  if (particleCount <= 0) return 0;
  const deterministicNoise = Math.sin((rowIndex + 1) * 12.9898) * 43758.5453;
  return (deterministicNoise - Math.floor(deterministicNoise)) * particleCount;
}

export function calculateBauhausRowSpeedMultiplier(rowIndex: number): number {
  const deterministicNoise = Math.sin((rowIndex + 1) * 78.233) * 43758.5453;
  const normalizedNoise = deterministicNoise - Math.floor(deterministicNoise);
  return 0.88 + normalizedNoise * 0.24;
}

export function interpolateBauhausLinePosition(
  progress: number,
  endpoints: BauhausLineEndpoints = DEFAULT_BAUHAUS_LINE_ENDPOINTS,
): BauhausLinePosition {
  const normalizedProgress = wrapUnitProgress(progress);
  const depthProgress = easePerspectiveDepth(normalizedProgress);
  const depthPosition =
    endpoints.farPosition.depthPosition +
    (endpoints.nearPosition.depthPosition - endpoints.farPosition.depthPosition) * depthProgress;
  const normalizedHorizontalPosition =
    FAR_SCREEN_HORIZONTAL_POSITION +
    (NEAR_SCREEN_HORIZONTAL_POSITION - FAR_SCREEN_HORIZONTAL_POSITION) * normalizedProgress;
  const normalizedVerticalPosition =
    FAR_SCREEN_VERTICAL_POSITION +
    (NEAR_SCREEN_VERTICAL_POSITION - FAR_SCREEN_VERTICAL_POSITION) * normalizedProgress;

  return calculateWorldPositionAtDepth(
    normalizedHorizontalPosition,
    normalizedVerticalPosition,
    depthPosition,
    calculateEndpointAspectRatio(endpoints),
  );
}
