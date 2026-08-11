import { describe, expect, it } from "vitest";
import {
  resolveCameraModeTransitionPose,
  resolveCameraSnapshotPose,
  type CameraModeTransition,
  type CameraPose,
  type CameraStateSnapshot,
  type CameraTargetPose,
} from "../src/polyviewer/camera/FreeCameraController";
import { rotateVector } from "../src/polyviewer/math/quaternion";

const identity = { x: 0, y: 0, z: 0, w: 1 };

function snapshot(mode: CameraStateSnapshot["mode"]): CameraStateSnapshot {
  return {
    mode,
    position: { x: 0, y: 4, z: 0 },
    orientation: identity,
    fov: 70,
    targetReplayId: "main",
    followOffset: { x: 0, y: 2, z: -6 },
    attachedOffset: { x: 1, y: 1, z: 0 },
    attachedOrientation: identity,
    lookAtOffset: identity,
    normalPositionOffset: { x: 0, y: 1, z: -5 },
    normalOrientationOffset: identity,
  };
}

describe("camera mode world-space transitions", () => {
  it("crossfades Normal to Look At using both live virtual camera poses", () => {
    const normal = snapshot("normal");
    const lookAt = snapshot("lookAt");
    const native: CameraPose = {
      position: { x: 10, y: 2, z: 0 },
      orientation: identity,
    };
    const target: CameraTargetPose = {
      position: { x: 10, y: 0, z: 0 },
      orientation: identity,
    };
    const transition: CameraModeTransition = {
      from: "normal",
      to: "lookAt",
      amount: 0.5,
      fromState: normal,
      toState: lookAt,
    };

    const pose = resolveCameraModeTransitionPose(
      transition,
      () => target,
      () => native,
    );

    expect(pose.position).toEqual({ x: 5, y: 3.5, z: -2.5 });
    const forward = rotateVector({ x: 0, y: 0, z: -1 }, pose.orientation);
    expect(Math.hypot(forward.x, forward.y, forward.z)).toBeCloseTo(1, 10);
    expect(forward.x).toBeGreaterThan(0);
  });

  it("is continuous at both ends even when the car moved after keyframe creation", () => {
    const normal = snapshot("normal");
    const lookAt = snapshot("lookAt");
    const native: CameraPose = {
      position: { x: 30, y: 3, z: 8 },
      orientation: identity,
    };
    const target: CameraTargetPose = {
      position: { x: 36, y: 1, z: -4 },
      orientation: identity,
    };
    const getTarget = () => target;
    const getNative = () => native;
    const start = resolveCameraSnapshotPose(normal, target, native);
    const end = resolveCameraSnapshotPose(lookAt, target, native);

    expect(resolveCameraModeTransitionPose({
      from: "normal", to: "lookAt", amount: 0, fromState: normal, toState: lookAt,
    }, getTarget, getNative)).toEqual(start);
    expect(resolveCameraModeTransitionPose({
      from: "normal", to: "lookAt", amount: 1, fromState: normal, toState: lookAt,
    }, getTarget, getNative)).toEqual(end);
  });

  it("resolves each endpoint against its own replay target", () => {
    const follow = { ...snapshot("follow"), targetReplayId: "run-a" };
    const attached = { ...snapshot("attached"), targetReplayId: "run-b" };
    const targets: Record<string, CameraTargetPose> = {
      "run-a": { position: { x: 10, y: 0, z: 0 }, orientation: identity },
      "run-b": { position: { x: 30, y: 0, z: 0 }, orientation: identity },
    };
    const pose = resolveCameraModeTransitionPose({
      from: "follow",
      to: "attached",
      amount: 0.5,
      fromState: follow,
      toState: attached,
    }, (id) => targets[id] ?? null, () => null);

    expect(pose.position).toEqual({ x: 20.5, y: 1.5, z: -3 });
  });
});
