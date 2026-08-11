import { describe, expect, it } from "vitest";
import { evaluateCameraPath } from "../src/polyviewer/camera/CameraPathEvaluator";
import type { CameraKeyframe } from "../src/polyviewer/camera/CameraKeyframeStore";
import type { CinematicCameraState } from "../src/polyviewer/camera/FreeCameraController";
import { quaternionFromYawPitchRoll, rotateVector } from "../src/polyviewer/math/quaternion";

function state(x: number, yaw = 0): CinematicCameraState {
  const orientation = quaternionFromYawPitchRoll(yaw, 0, 0);
  return {
    mode: "free",
    position: { x, y: 0, z: 0 },
    orientation,
    fov: 60 + x,
    targetReplayId: "main",
    followOffset: { x, y: 2, z: -5 },
    attachedOffset: { x, y: 1, z: 0 },
    attachedOrientation: orientation,
  };
}

function point(id: string, timeMicroseconds: number, value: CinematicCameraState): CameraKeyframe {
  return { id, timeMicroseconds, state: value, interpolation: "smooth" };
}

describe("evaluateCameraPath", () => {
  it("creates a smooth deterministic midpoint between two camera points", () => {
    const result = evaluateCameraPath([
      point("a", 0, state(0)),
      point("b", 10_000_000, state(10)),
    ], 5_000_000);
    expect(result?.position.x).toBeCloseTo(5, 10);
    expect(result?.fov).toBeCloseTo(65, 10);
    expect(result?.mode).toBe("fixed");
  });

  it("uses shortest-path quaternion interpolation without a 360 degree spin", () => {
    const start = state(0, Math.PI - 0.1);
    const end = state(10, -Math.PI + 0.1);
    const result = evaluateCameraPath([
      point("a", 0, start),
      point("b", 1_000_000, end),
    ], 500_000)!;
    const forward = rotateVector({ x: 0, y: 0, z: -1 }, result.orientation);
    expect(forward.z).toBeGreaterThan(0.99);
  });

  it("holds the first and last states outside the edited range", () => {
    const points = [point("a", 1_000_000, state(2)), point("b", 2_000_000, state(4))];
    expect(evaluateCameraPath(points, 0)?.position.x).toBe(2);
    expect(evaluateCameraPath(points, 3_000_000)?.position.x).toBe(4);
  });
});
