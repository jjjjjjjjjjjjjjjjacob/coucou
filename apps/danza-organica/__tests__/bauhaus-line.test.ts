import { describe, expect, it } from "vitest";
import {
  BAUHAUS_CAMERA_FIELD_OF_VIEW,
  BAUHAUS_DEFAULT_CAMERA_POSITION,
  BAUHAUS_DEFAULT_CAMERA_TARGET,
  BAUHAUS_FAR_DEPTH,
  BAUHAUS_FIXED_CAMERA_POSITION,
  BAUHAUS_MAXIMUM_PARTICLES_PER_ROW,
  BAUHAUS_MAXIMUM_PERSPECTIVE_STRENGTH,
  BAUHAUS_MAXIMUM_ROW_COUNT,
  BAUHAUS_NEAR_DEPTH,
  calculateBauhausCameraPosition,
  calculateBauhausGridDimensions,
  calculateBauhausLineEndpoints,
  calculateBauhausPerspectiveDepths,
  calculateBauhausRowPhaseOffset,
  calculateBauhausRowSpeedMultiplier,
  calculateResponsiveBauhausPerspectiveStrength,
  DEFAULT_BAUHAUS_LINE_ENDPOINTS,
  interpolateBauhausLinePosition,
  resolveBauhausLineProgress,
} from "@/lib/bauhaus-line";

describe("Bauhaus line prototype", () => {
  it("places the far end upper-left and the near end lower-right", () => {
    const endpoints = calculateBauhausLineEndpoints(1280, 720);

    expect(endpoints.farPosition.horizontalPosition).toBeLessThan(
      endpoints.nearPosition.horizontalPosition,
    );
    expect(endpoints.farPosition.verticalPosition).toBeGreaterThan(
      endpoints.nearPosition.verticalPosition,
    );
    expect(endpoints.farPosition.depthPosition).toBeLessThan(endpoints.nearPosition.depthPosition);
  });

  it("keeps particle spawn and disappearance endpoints outside the viewport", () => {
    const viewportWidth = 1280;
    const viewportHeight = 720;
    const endpoints = calculateBauhausLineEndpoints(viewportWidth, viewportHeight);
    const aspectRatio = viewportWidth / viewportHeight;
    const projectionTangent = Math.tan((BAUHAUS_CAMERA_FIELD_OF_VIEW * Math.PI) / 360);
    const projectToNormalizedScreen = (position: typeof endpoints.farPosition) => {
      const cameraDistance = BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - position.depthPosition;
      const verticalProjectionScale = cameraDistance * projectionTangent;
      return {
        horizontalPosition: position.horizontalPosition / (verticalProjectionScale * aspectRatio),
        verticalPosition: position.verticalPosition / verticalProjectionScale,
      };
    };
    const farScreenPosition = projectToNormalizedScreen(endpoints.farPosition);
    const nearScreenPosition = projectToNormalizedScreen(endpoints.nearPosition);

    expect(farScreenPosition.horizontalPosition).toBeLessThan(-1);
    expect(farScreenPosition.verticalPosition).toBeGreaterThan(1);
    expect(nearScreenPosition.horizontalPosition).toBeGreaterThan(1);
    expect(nearScreenPosition.verticalPosition).toBeLessThan(-1);
  });

  it("interpolates through actual world-space depth", () => {
    const midpoint = interpolateBauhausLinePosition(0.5);
    const aspectRatio = 1280 / 720;
    const projectToNormalizedScreen = (position: typeof midpoint) => {
      const cameraDistance = BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - position.depthPosition;
      const verticalProjectionScale =
        cameraDistance * Math.tan((BAUHAUS_CAMERA_FIELD_OF_VIEW * Math.PI) / 360);
      return {
        horizontalPosition: position.horizontalPosition / (verticalProjectionScale * aspectRatio),
        verticalPosition: position.verticalPosition / verticalProjectionScale,
      };
    };
    const farScreenPosition = projectToNormalizedScreen(DEFAULT_BAUHAUS_LINE_ENDPOINTS.farPosition);
    const nearScreenPosition = projectToNormalizedScreen(
      DEFAULT_BAUHAUS_LINE_ENDPOINTS.nearPosition,
    );
    const midpointScreenPosition = projectToNormalizedScreen(midpoint);

    expect(midpointScreenPosition.horizontalPosition).toBeCloseTo(
      (farScreenPosition.horizontalPosition + nearScreenPosition.horizontalPosition) / 2,
    );
    expect(midpointScreenPosition.verticalPosition).toBeCloseTo(
      (farScreenPosition.verticalPosition + nearScreenPosition.verticalPosition) / 2,
    );
    expect(midpoint.depthPosition).toBeCloseTo(-7.05);
  });

  it("holds visible particles near the perspective extremes", () => {
    const linearQuarterDepth =
      DEFAULT_BAUHAUS_LINE_ENDPOINTS.farPosition.depthPosition +
      (DEFAULT_BAUHAUS_LINE_ENDPOINTS.nearPosition.depthPosition -
        DEFAULT_BAUHAUS_LINE_ENDPOINTS.farPosition.depthPosition) *
        0.25;
    const linearThreeQuarterDepth =
      DEFAULT_BAUHAUS_LINE_ENDPOINTS.farPosition.depthPosition +
      (DEFAULT_BAUHAUS_LINE_ENDPOINTS.nearPosition.depthPosition -
        DEFAULT_BAUHAUS_LINE_ENDPOINTS.farPosition.depthPosition) *
        0.75;

    expect(interpolateBauhausLinePosition(0.25).depthPosition).toBeLessThan(linearQuarterDepth);
    expect(interpolateBauhausLinePosition(0.75).depthPosition).toBeGreaterThan(
      linearThreeQuarterDepth,
    );
  });

  it("changes the physical depth ratio with the perspective control", () => {
    const shallowPerspective = calculateBauhausPerspectiveDepths(0.55);
    const extremePerspective = calculateBauhausPerspectiveDepths(1.55);

    expect(extremePerspective.farDepth).toBeLessThan(shallowPerspective.farDepth);
    expect(extremePerspective.nearDepth).toBeGreaterThan(shallowPerspective.nearDepth);
  });

  it("supports a dramatic far-to-near particle scale contrast", () => {
    const extremePerspective = calculateBauhausPerspectiveDepths(
      BAUHAUS_MAXIMUM_PERSPECTIVE_STRENGTH,
    );
    const farCameraDistance =
      BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - extremePerspective.farDepth;
    const nearCameraDistance =
      BAUHAUS_FIXED_CAMERA_POSITION.depthPosition - extremePerspective.nearDepth;

    expect(farCameraDistance / nearCameraDistance).toBeGreaterThan(450);
  });

  it("keeps the approved camera capture as the prototype default", () => {
    expect(BAUHAUS_DEFAULT_CAMERA_POSITION).toEqual({
      horizontalPosition: 0.97,
      verticalPosition: -0.59,
      depthPosition: 8.01,
    });
    expect(BAUHAUS_DEFAULT_CAMERA_TARGET).toEqual({
      horizontalPosition: 5.46,
      verticalPosition: -5.56,
      depthPosition: 2.66,
    });
  });

  it("orbits the camera across independent pitch and yaw axes", () => {
    const defaultCameraPosition = calculateBauhausCameraPosition(0, 0);
    const pitchedCameraPosition = calculateBauhausCameraPosition(12, 0);
    const yawedCameraPosition = calculateBauhausCameraPosition(0, 12);

    expect(defaultCameraPosition).toEqual(BAUHAUS_FIXED_CAMERA_POSITION);
    expect(pitchedCameraPosition.verticalPosition).toBeGreaterThan(0);
    expect(pitchedCameraPosition.horizontalPosition).toBeCloseTo(0);
    expect(yawedCameraPosition.horizontalPosition).toBeGreaterThan(0);
    expect(yawedCameraPosition.verticalPosition).toBeCloseTo(0);
  });

  it("orbits from the captured default camera without changing its focus target", () => {
    const capturedDefaultPosition = calculateBauhausCameraPosition(
      0,
      0,
      BAUHAUS_DEFAULT_CAMERA_POSITION,
      BAUHAUS_DEFAULT_CAMERA_TARGET,
    );
    const adjustedPosition = calculateBauhausCameraPosition(
      5,
      -7,
      BAUHAUS_DEFAULT_CAMERA_POSITION,
      BAUHAUS_DEFAULT_CAMERA_TARGET,
    );

    expect(capturedDefaultPosition.horizontalPosition).toBeCloseTo(
      BAUHAUS_DEFAULT_CAMERA_POSITION.horizontalPosition,
    );
    expect(capturedDefaultPosition.verticalPosition).toBeCloseTo(
      BAUHAUS_DEFAULT_CAMERA_POSITION.verticalPosition,
    );
    expect(capturedDefaultPosition.depthPosition).toBeCloseTo(
      BAUHAUS_DEFAULT_CAMERA_POSITION.depthPosition,
    );
    expect(adjustedPosition).not.toEqual(capturedDefaultPosition);
  });

  it("moves every particle forward and wraps the line continuously", () => {
    expect(resolveBauhausLineProgress(0, 10, 0)).toBe(0);
    expect(resolveBauhausLineProgress(9, 10, 5, 0.04)).toBeCloseTo(0.1);
  });

  it("scatters deterministic row phases across the full lane length", () => {
    const firstRowPhase = calculateBauhausRowPhaseOffset(0, 24);
    const secondRowPhase = calculateBauhausRowPhaseOffset(1, 24);
    const thirdRowPhase = calculateBauhausRowPhaseOffset(2, 24);

    expect(calculateBauhausRowPhaseOffset(0, 24)).toBe(firstRowPhase);
    expect(firstRowPhase).toBeGreaterThanOrEqual(0);
    expect(firstRowPhase).toBeLessThan(24);
    expect(secondRowPhase).not.toBeCloseTo(firstRowPhase);
    expect(secondRowPhase - firstRowPhase).not.toBeCloseTo(thirdRowPhase - secondRowPhase);
  });

  it("keeps deterministic row speeds close while preventing cross-row lockstep", () => {
    const firstRowSpeed = calculateBauhausRowSpeedMultiplier(0);
    const secondRowSpeed = calculateBauhausRowSpeedMultiplier(1);

    expect(calculateBauhausRowSpeedMultiplier(0)).toBe(firstRowSpeed);
    expect(firstRowSpeed).toBeGreaterThanOrEqual(0.88);
    expect(firstRowSpeed).toBeLessThanOrEqual(1.12);
    expect(secondRowSpeed).not.toBeCloseTo(firstRowSpeed);
  });

  it("reprojects the perspective path when the screen aspect ratio changes", () => {
    const wideEndpoints = calculateBauhausLineEndpoints(1600, 800);
    const squareEndpoints = calculateBauhausLineEndpoints(800, 800);

    expect(Math.abs(wideEndpoints.farPosition.horizontalPosition)).toBeGreaterThan(
      Math.abs(squareEndpoints.farPosition.horizontalPosition),
    );
    expect(wideEndpoints.farPosition.verticalPosition).toBeCloseTo(
      squareEndpoints.farPosition.verticalPosition,
    );
  });

  it("tempers perspective contrast on short wide screens", () => {
    const standardPerspective = calculateResponsiveBauhausPerspectiveStrength(1280, 720, 6);
    const shortWidePerspective = calculateResponsiveBauhausPerspectiveStrength(2048, 490, 6);

    expect(standardPerspective).toBe(6);
    expect(shortWidePerspective).toBeLessThan(standardPerspective);
    expect(shortWidePerspective).toBeGreaterThanOrEqual(2.7);
  });

  it("uses the size controls to recalculate rows and particles", () => {
    const compactGrid = calculateBauhausGridDimensions({
      viewportWidth: 1280,
      viewportHeight: 720,
      particleRadius: 0.28,
      rowSpacing: 1.5,
    });
    const spaciousGrid = calculateBauhausGridDimensions({
      viewportWidth: 1280,
      viewportHeight: 720,
      particleRadius: 0.72,
      rowSpacing: 5,
    });

    expect(compactGrid.rowCount).toBeGreaterThan(spaciousGrid.rowCount);
    expect(compactGrid.particlesPerRow).toBeGreaterThan(spaciousGrid.particlesPerRow);
    expect(compactGrid.totalParticleCount).toBe(compactGrid.rowCount * compactGrid.particlesPerRow);
  });

  it("keeps particles denser within travel lanes than across them", () => {
    const defaultGrid = calculateBauhausGridDimensions({
      viewportWidth: 1280,
      viewportHeight: 720,
      particleRadius: 0.28,
      rowSpacing: 1.1,
      perspectiveStrength: 0.58,
      cameraRollDegrees: 2,
    });

    expect(defaultGrid.particlesPerRow).toBeGreaterThan(defaultGrid.rowCount);
  });

  it("recalculates the responsive field for perspective and camera angle controls", () => {
    const adjustedGrid = calculateBauhausGridDimensions({
      viewportWidth: 1280,
      viewportHeight: 720,
      particleRadius: 0.28,
      rowSpacing: 2.4,
      perspectiveStrength: 1.35,
      cameraRollDegrees: 18,
    });

    expect(adjustedGrid.rowCount).toBeGreaterThan(0);
    expect(adjustedGrid.particlesPerRow).toBeGreaterThan(0);
    expect(adjustedGrid.farPosition.depthPosition).toBeLessThan(BAUHAUS_FAR_DEPTH);
    expect(adjustedGrid.nearPosition.depthPosition).toBeGreaterThan(BAUHAUS_NEAR_DEPTH);
  });

  it("caps responsive density to the allocated WebGL instance budget", () => {
    const maximumDensityGrid = calculateBauhausGridDimensions({
      viewportWidth: 3200,
      viewportHeight: 900,
      particleRadius: 0.05,
      rowSpacing: 0.25,
    });

    expect(maximumDensityGrid.rowCount).toBeLessThanOrEqual(BAUHAUS_MAXIMUM_ROW_COUNT);
    expect(maximumDensityGrid.particlesPerRow).toBeLessThanOrEqual(
      BAUHAUS_MAXIMUM_PARTICLES_PER_ROW,
    );
    expect(maximumDensityGrid.totalParticleCount).toBeLessThanOrEqual(
      BAUHAUS_MAXIMUM_ROW_COUNT * BAUHAUS_MAXIMUM_PARTICLES_PER_ROW,
    );
  });
});
