import { describe, expect, it } from "vitest";
import {
  createCameraMoveDocument,
  parseCameraMoveDocument,
  remapCameraMovePoints,
  suggestCameraMoveMappings,
} from "../src/polyviewer/camera/CameraMoveFile";
import type { CameraKeyframe } from "../src/polyviewer/camera/CameraKeyframeStore";
import type { CinematicCameraState } from "../src/polyviewer/camera/FreeCameraController";

const baseState: CinematicCameraState = {
  mode: "normal",
  position: { x: 1, y: 2, z: 3 },
  orientation: { x: 0, y: 0, z: 0, w: 1 },
  fov: 62,
  targetReplayId: "main",
  followOffset: { x: 0, y: 2, z: -5 },
  attachedOffset: { x: 1, y: 0, z: 0 },
  attachedOrientation: { x: 0, y: 0, z: 0, w: 1 },
  lookAtOffset: { x: 0, y: 0, z: 0, w: 1 },
  normalPositionOffset: { x: 0, y: 1, z: -2 },
  normalOrientationOffset: { x: 0, y: 0, z: 0, w: 1 },
  normalFovOffset: 3,
};

function point(id: string, timeMicroseconds: number, state = baseState): CameraKeyframe {
  return { id, timeMicroseconds, state: structuredClone(state), interpolation: "smooth" };
}

describe("Camera Move files", () => {
  it("round-trips every deterministic camera field without changing values", () => {
    const points = [
      point("a", 1_000_000),
      point("b", 4_500_000, {
        ...baseState,
        mode: "attached",
        targetReplayId: "ghost-1",
        attachedOffset: { x: -0.4, y: 0.25, z: 1.1 },
      }),
    ];
    const document = createCameraMoveDocument("Wheel Shot", points, [
      { id: "main", name: "Main Replay", visible: true, opacity: 1, nameTagVisible: false, removable: false },
      { id: "ghost-1", name: "World Record", visible: true, opacity: 0.7, nameTagVisible: false, removable: true },
    ]);
    const parsed = parseCameraMoveDocument(JSON.stringify(document));

    expect(parsed.points).toEqual(points);
    expect(parsed.compatibility).toEqual({
      usesWorldSpace: false,
      usesWorldOrientation: false,
      mapPolicy: "replay-relative",
    });
    expect(parsed.targetReferences.map((target) => target.sourceName)).toEqual(["Main Replay", "World Record"]);
  });

  it("marks Fixed and Look At paths as map-bound", () => {
    const document = createCameraMoveDocument("Corner", [
      point("fixed", 0, { ...baseState, mode: "lookAt" }),
    ], [{ id: "main", name: "Main", visible: true, opacity: 1, nameTagVisible: false, removable: false }]);
    expect(document.compatibility).toEqual({
      usesWorldSpace: true,
      usesWorldOrientation: false,
      mapPolicy: "same-map-for-exact-world-shots",
    });
  });

  it("marks Follow as portable while preserving its world-oriented composition", () => {
    const document = createCameraMoveDocument("Side Follow", [
      point("follow", 0, { ...baseState, mode: "follow" }),
    ], [{ id: "main", name: "Main", visible: true, opacity: 1, nameTagVisible: false, removable: false }]);
    expect(document.compatibility).toEqual({
      usesWorldSpace: false,
      usesWorldOrientation: true,
      mapPolicy: "portable-world-oriented-follow",
    });
  });

  it("maps Main Replay and unique names in a new project, then rewrites all targets", () => {
    const document = createCameraMoveDocument("Comparison", [
      point("a", 0),
      point("b", 1_000_000, { ...baseState, targetReplayId: "old-wr" }),
    ], [
      { id: "main", name: "Old Main", visible: true, opacity: 1, nameTagVisible: false, removable: false },
      { id: "old-wr", name: "World Record", visible: true, opacity: 1, nameTagVisible: false, removable: true },
    ]);
    const destination = [
      { id: "main", name: "New Main", visible: true, opacity: 1, nameTagVisible: false, removable: false },
      { id: "new-wr", name: "World Record", visible: true, opacity: 1, nameTagVisible: false, removable: true },
    ];
    const suggestions = suggestCameraMoveMappings(document, destination);
    expect(suggestions).toEqual({ main: "main", "old-wr": "new-wr" });
    expect(remapCameraMovePoints(document, suggestions as Record<string, string>)
      .map((entry) => entry.state.targetReplayId)).toEqual(["main", "new-wr"]);
  });

  it("does not trust recycled replay IDs when the player name changed", () => {
    const document = createCameraMoveDocument("Targeted", [
      point("a", 0, { ...baseState, targetReplayId: "replay-1" }),
    ], [{ id: "replay-1", name: "Original Driver", visible: true, opacity: 1, nameTagVisible: false, removable: true }]);
    expect(suggestCameraMoveMappings(document, [
      { id: "replay-1", name: "Different Driver", visible: true, opacity: 1, nameTagVisible: false, removable: true },
    ])).toEqual({ "replay-1": null });
  });

  it("rejects corrupt rotations and incomplete target mappings", () => {
    const document = createCameraMoveDocument("Safe", [point("a", 0)], [
      { id: "main", name: "Main", visible: true, opacity: 1, nameTagVisible: false, removable: false },
    ]);
    const corrupt = structuredClone(document);
    corrupt.points[0]!.state.orientation.w = 0;
    expect(() => parseCameraMoveDocument(JSON.stringify(corrupt))).toThrow("broken camera rotation");
    expect(() => remapCameraMovePoints(document, {})).toThrow("Choose a target");
  });
});
