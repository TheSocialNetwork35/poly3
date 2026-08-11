import { describe, expect, it } from "vitest";
import { evaluateNativeCameraOffset } from "../src/polyviewer/camera/FreeCameraController";
import { quaternionFromYawPitchRoll, rotateVector } from "../src/polyviewer/math/quaternion";

describe("native Normal camera offsets", () => {
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
});
