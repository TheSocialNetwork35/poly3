import { describe, expect, it } from "vitest";
import {
  cameraModeAllowsManualRotation,
  evaluateNativeCameraOffset,
  resolveCameraModeTransitionFov,
  resolveCameraSnapshotFov,
} from "../src/polyviewer/camera/FreeCameraController";
import { quaternionFromYawPitchRoll, rotateVector } from "../src/polyviewer/math/quaternion";

describe("native Normal camera offsets", () => {
  it("locks manual direction only in Look At mode", () => {
    expect(cameraModeAllowsManualRotation("lookAt")).toBe(false);
    expect(cameraModeAllowsManualRotation("fixed")).toBe(true);
    expect(cameraModeAllowsManualRotation("normal")).toBe(true);
    expect(cameraModeAllowsManualRotation("follow")).toBe(true);
    expect(cameraModeAllowsManualRotation("attached")).toBe(true);
  });
  it("applies cinematic position in the real replay camera local space", () => {
    const nativeOrientation = quaternionFromYawPitchRoll(Math.PI / 2, 0, 0);
    const result = evaluateNativeCameraOffset(
      { position: { x: 10, y: 2, z: 5 }, orientation: nativeOrientation },
      { x: 0, y: 1, z: -2 },
      { x: 0, y: 0, z: 0, w: 1 },
    );
    const expectedOffset = rotateVector({ x: 0, y: 1, z: -2 }, nativeOrientation);
    expect(result.position.x).toBeCloseTo(10 + expectedOffset.x, 10);
    expect(result.position.y).toBeCloseTo(2 + expectedOffset.y, 10);
    expect(result.position.z).toBeCloseTo(5 + expectedOffset.z, 10);
  });

  it("is a pure deterministic composition for preview/render parity", () => {
    const native = {
      position: { x: 1, y: 2, z: 3 },
      orientation: quaternionFromYawPitchRoll(0.4, -0.1, 0.05),
    };
    const positionOffset = { x: 0.5, y: 1, z: -3 };
    const orientationOffset = quaternionFromYawPitchRoll(0.1, 0.05, 0);
    expect(evaluateNativeCameraOffset(native, positionOffset, orientationOffset))
      .toEqual(evaluateNativeCameraOffset(native, positionOffset, orientationOffset));
  });

  it("uses PolyTrack's live native FOV so speed zooms out instead of in", () => {
    const state = {
      mode: "normal" as const,
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      fov: 70,
      targetReplayId: "main",
      followOffset: { x: 0, y: 0, z: 0 },
      attachedOffset: { x: 0, y: 0, z: 0 },
      attachedOrientation: { x: 0, y: 0, z: 0, w: 1 },
      normalFovOffset: 0,
    };
    const stopped = resolveCameraSnapshotFov(state, {
      position: state.position,
      orientation: state.orientation,
      fov: 70,
    });
    const fast = resolveCameraSnapshotFov(state, {
      position: state.position,
      orientation: state.orientation,
      fov: 96,
    });

    expect(stopped).toBe(70);
    expect(fast).toBe(96);
    expect(fast).toBeGreaterThan(stopped);
  });

  it("preserves native FOV during a smooth Normal-to-Fixed transition", () => {
    const base = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      targetReplayId: "main",
      followOffset: { x: 0, y: 0, z: 0 },
      attachedOffset: { x: 0, y: 0, z: 0 },
      attachedOrientation: { x: 0, y: 0, z: 0, w: 1 },
    };
    const fov = resolveCameraModeTransitionFov({
      from: "normal",
      to: "fixed",
      amount: 0.5,
      fromState: { ...base, mode: "normal", fov: 70, normalFovOffset: 2 },
      toState: { ...base, mode: "fixed", fov: 60 },
    }, () => ({ ...base, fov: 98 }));

    expect(fov).toBe(80);
  });
});
