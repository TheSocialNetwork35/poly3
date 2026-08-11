import { describe, expect, it } from "vitest";
import { quaternionFromYawPitchRoll, rotateVector, yawPitchFromQuaternion } from "../src/polyviewer/math/quaternion";

describe("cinematic camera quaternion math", () => {
  it("keeps the default camera facing negative Z", () => {
    const quaternion = quaternionFromYawPitchRoll(0, 0, 0);
    expect(rotateVector({ x: 0, y: 0, z: -1 }, quaternion)).toEqual({ x: 0, y: 0, z: -1 });
  });

  it("round-trips yaw and pitch without Euler wrap snapping", () => {
    const quaternion = quaternionFromYawPitchRoll(0.8, -0.35, 0);
    const result = yawPitchFromQuaternion(quaternion);
    expect(result.yaw).toBeCloseTo(0.8, 8);
    expect(result.pitch).toBeCloseTo(-0.35, 8);
  });

  it("returns a normalized quaternion when roll is present", () => {
    const quaternion = quaternionFromYawPitchRoll(-1.2, 0.4, 0.9);
    expect(Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w)).toBeCloseTo(1, 10);
  });
});
