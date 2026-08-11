import { describe, expect, it, vi } from "vitest";
import type { CameraKeyframe } from "../src/polyviewer/camera/CameraKeyframeStore";
import type { CinematicCameraState } from "../src/polyviewer/camera/FreeCameraController";
import { SceneEvaluator } from "../src/polyviewer/scene/SceneEvaluator";

const state = (x: number): CinematicCameraState => ({
  mode: "fixed",
  position: { x, y: 2, z: 3 },
  orientation: { x: 0, y: 0, z: 0, w: 1 },
  fov: 70,
  targetReplayId: "main",
  followOffset: { x: 0, y: 0, z: 0 },
  attachedOffset: { x: 0, y: 0, z: 0 },
  attachedOrientation: { x: 0, y: 0, z: 0, w: 1 },
});

describe("SceneEvaluator", () => {
  it("uses exactly one camera path implementation for preview and render", () => {
    const points: CameraKeyframe[] = [
      { id: "a", timeMicroseconds: 0, state: state(0), interpolation: "smooth" },
      { id: "b", timeMicroseconds: 1_000_000, state: state(10), interpolation: "smooth" },
    ];
    const replay = createReplay();
    const camera = { applyState: vi.fn() };
    const evaluator = new SceneEvaluator(() => points, replay, camera);

    const preview = evaluator.evaluatePreview(500_000);
    const render = evaluator.evaluateRenderFrame(500_000, true);
    expect(render).toEqual(preview);
    expect(render?.position.x).toBe(5);
    expect(replay.evaluateExactFrame).toHaveBeenCalledWith(500_000, true);
    expect(camera.applyState).toHaveBeenNthCalledWith(1, preview);
    expect(camera.applyState).toHaveBeenNthCalledWith(2, render);
  });

  it("evaluates exact keyframe timestamps without advancing visual history", () => {
    const point: CameraKeyframe = {
      id: "exact", timeMicroseconds: 2_000_000, state: state(7), interpolation: "smooth",
    };
    const replay = createReplay();
    const evaluator = new SceneEvaluator(() => [point], replay, { applyState: vi.fn() });

    expect(evaluator.evaluateRenderFrame(2_000_000, false)).toMatchObject(point.state);
    expect(replay.evaluateExactFrame).toHaveBeenCalledWith(2_000_000, false);
  });
});

function createReplay() {
  return {
    evaluateExactFrame: vi.fn(),
    captureEditorState: vi.fn(() => ({ timeMicroseconds: 0, playing: false })),
    restoreEditorState: vi.fn(),
  };
}
