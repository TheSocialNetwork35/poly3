import { slerpQuaternions, type VectorValue } from "../math/quaternion";
import type { CameraKeyframe } from "./CameraKeyframeStore";
import type { CinematicCameraState } from "./FreeCameraController";

export function evaluateCameraPath(
  points: readonly CameraKeyframe[],
  timeMicroseconds: number,
): CinematicCameraState | null {
  if (points.length === 0) return null;
  if (points.length === 1 || timeMicroseconds <= points[0]!.timeMicroseconds) {
    return structuredClone(points[0]!.state);
  }
  const last = points[points.length - 1]!;
  if (timeMicroseconds >= last.timeMicroseconds) return structuredClone(last.state);

  const endIndex = points.findIndex((point) => point.timeMicroseconds >= timeMicroseconds);
  const start = points[endIndex - 1]!;
  const end = points[endIndex]!;
  const span = end.timeMicroseconds - start.timeMicroseconds;
  const linear = span === 0 ? 1 : (timeMicroseconds - start.timeMicroseconds) / span;
  const amount = linear * linear * (3 - 2 * linear);
  const sameMode = start.state.mode === end.state.mode;
  return {
    mode: sameMode ? start.state.mode : "free",
    position: lerpVector(start.state.position, end.state.position, amount),
    orientation: slerpQuaternions(start.state.orientation, end.state.orientation, amount),
    fov: lerp(start.state.fov, end.state.fov, amount),
    targetReplayId: start.state.targetReplayId,
    followOffset: lerpVector(start.state.followOffset, end.state.followOffset, amount),
    attachedOffset: lerpVector(start.state.attachedOffset, end.state.attachedOffset, amount),
    attachedOrientation: slerpQuaternions(
      start.state.attachedOrientation,
      end.state.attachedOrientation,
      amount,
    ),
  };
}

function lerpVector(a: VectorValue, b: VectorValue, amount: number): VectorValue {
  return {
    x: lerp(a.x, b.x, amount),
    y: lerp(a.y, b.y, amount),
    z: lerp(a.z, b.z, amount),
  };
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}
