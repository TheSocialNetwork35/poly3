import { describe, expect, it } from "vitest";
import {
  invertQuaternion,
  multiplyQuaternions,
  quaternionFromYawPitchRoll,
  rotateVector,
  yawPitchFromQuaternion,
  yawPitchRollFromQuaternion,
} from "../src/polyviewer/math/quaternion";

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

  it("round-trips roll for attached camera local orientation", () => {
    const result = yawPitchRollFromQuaternion(quaternionFromYawPitchRoll(0.7, -0.25, 0.4));
    expect(result.yaw).toBeCloseTo(0.7, 8);
    expect(result.pitch).toBeCloseTo(-0.25, 8);
    expect(result.roll).toBeCloseTo(0.4, 8);
  });

  it("inverts vehicle orientation for attached camera offsets", () => {
    const orientation = quaternionFromYawPitchRoll(1.1, 0.2, -0.1);
    const identity = multiplyQuaternions(orientation, invertQuaternion(orientation));
    expect(identity.x).toBeCloseTo(0, 10);
    expect(identity.y).toBeCloseTo(0, 10);
    expect(identity.z).toBeCloseTo(0, 10);
    expect(identity.w).toBeCloseTo(1, 10);
  });
});
