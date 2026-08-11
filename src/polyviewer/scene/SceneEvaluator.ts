import type { CameraKeyframe } from "../camera/CameraKeyframeStore";
import { evaluateCameraPath } from "../camera/CameraPathEvaluator";
import type { CinematicCameraState } from "../camera/FreeCameraController";

export interface SceneReplayEvaluator {
  evaluateExactFrame(timeMicroseconds: number, advanceVisuals: boolean): void;
}

export interface SceneCameraTarget {
  applyState(state: CinematicCameraState): void;
}

export class SceneEvaluator {
  #getCameraPoints: () => readonly CameraKeyframe[];
  #replay: SceneReplayEvaluator;
  #camera: SceneCameraTarget;

  constructor(
    getCameraPoints: () => readonly CameraKeyframe[],
    replay: SceneReplayEvaluator,
    camera: SceneCameraTarget,
  ) {
    this.#getCameraPoints = getCameraPoints;
    this.#replay = replay;
    this.#camera = camera;
  }

  evaluatePreview(timeMicroseconds: number): CinematicCameraState | null {
    return this.#evaluateCamera(timeMicroseconds);
  }

  evaluateRenderFrame(
    timeMicroseconds: number,
    advanceVisuals: boolean,
  ): CinematicCameraState | null {
    this.#replay.evaluateExactFrame(timeMicroseconds, advanceVisuals);
    return this.#evaluateCamera(timeMicroseconds);
  }

  #evaluateCamera(timeMicroseconds: number): CinematicCameraState | null {
    const state = evaluateCameraPath(this.#getCameraPoints(), timeMicroseconds);
    if (state) this.#camera.applyState(state);
    return state;
  }
}
