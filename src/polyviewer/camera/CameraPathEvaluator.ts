import { slerpQuaternions, type VectorValue } from "../math/quaternion";
import type { CameraKeyframe } from "./CameraKeyframeStore";
import {
  normalizeCameraMode,
  type CinematicCameraState,
} from "./FreeCameraController";

export function evaluateCameraPath(
  points: readonly CameraKeyframe[],
  timeMicroseconds: number,
): CinematicCameraState | null {
  const timeline = collapseCoincidentPoints(points);
  if (timeline.length === 0) return null;
  if (timeline.length === 1 || timeMicroseconds <= timeline[0]!.timeMicroseconds) {
    return normalizeState(timeline[0]!.state);
  }
  const last = timeline[timeline.length - 1]!;
  if (timeMicroseconds >= last.timeMicroseconds) return normalizeState(last.state);

  const endIndex = timeline.findIndex((point) => point.timeMicroseconds >= timeMicroseconds);
  const start = timeline[endIndex - 1]!;
  const end = timeline[endIndex]!;
  const span = end.timeMicroseconds - start.timeMicroseconds;
  const linear = span === 0 ? 1 : (timeMicroseconds - start.timeMicroseconds) / span;
  const amount = linear * linear * (3 - 2 * linear);
  const startMode = normalizeCameraMode(start.state.mode);
  const endMode = normalizeCameraMode(end.state.mode);
  const sameMode = startMode === endMode;
  return {
    mode: sameMode ? startMode : "fixed",
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
    lookAtOffset: slerpQuaternions(
      start.state.lookAtOffset ?? { x: 0, y: 0, z: 0, w: 1 },
      end.state.lookAtOffset ?? { x: 0, y: 0, z: 0, w: 1 },
      amount,
    ),
    normalPositionOffset: lerpVector(
      start.state.normalPositionOffset ?? { x: 0, y: 0, z: 0 },
      end.state.normalPositionOffset ?? { x: 0, y: 0, z: 0 },
      amount,
    ),
    normalOrientationOffset: slerpQuaternions(
      start.state.normalOrientationOffset ?? { x: 0, y: 0, z: 0, w: 1 },
      end.state.normalOrientationOffset ?? { x: 0, y: 0, z: 0, w: 1 },
      amount,
    ),
    modeTransition: sameMode ? undefined : {
      from: startMode,
      to: endMode,
      amount,
    },
  };
}

function collapseCoincidentPoints(points: readonly CameraKeyframe[]): CameraKeyframe[] {
  const result: CameraKeyframe[] = [];
  for (const point of points) {
    if (result.at(-1)?.timeMicroseconds === point.timeMicroseconds) result[result.length - 1] = point;
    else result.push(point);
  }
  return result;
}

function normalizeState(state: CinematicCameraState): CinematicCameraState {
  const result = structuredClone(state);
  result.mode = normalizeCameraMode(result.mode);
  result.lookAtOffset ??= { x: 0, y: 0, z: 0, w: 1 };
  result.normalPositionOffset ??= { x: 0, y: 0, z: 0 };
  result.normalOrientationOffset ??= { x: 0, y: 0, z: 0, w: 1 };
  result.modeTransition = undefined;
  return result;
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
