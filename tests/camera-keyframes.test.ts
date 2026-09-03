import { describe, expect, it, vi } from "vitest";
import { CameraKeyframeStore } from "../src/polyviewer/camera/CameraKeyframeStore";
import type { CinematicCameraState } from "../src/polyviewer/camera/FreeCameraController";

const cameraState: CinematicCameraState = {
  mode: "free",
  position: { x: 1, y: 2, z: 3 },
  orientation: { x: 0, y: 0, z: 0, w: 1 },
  fov: 70,
  targetReplayId: "main",
  followOffset: { x: 0, y: 2, z: -5 },
  attachedOffset: { x: 0, y: 1, z: 0 },
  attachedOrientation: { x: 0, y: 0, z: 0, w: 1 },
};

describe("CameraKeyframeStore", () => {
  it("keeps stable camera points sorted on the integer master timeline", () => {
    const store = new CameraKeyframeStore();
    const later = store.add(5_000_000, cameraState);
    const earlier = store.add(2_000_000, cameraState);
    expect(store.points.map((point) => point.id)).toEqual([earlier.id, later.id]);
    expect(store.points[0]?.state).not.toBe(cameraState);
    expect(store.points[0]?.state.mode).toBe("fixed");
  });

  it("supports update, move, duplicate, remove, and subscriptions", () => {
    const store = new CameraKeyframeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const original = store.add(1_000_000, cameraState);
    const copy = store.duplicate(original.id);
    expect(copy.id).not.toBe(original.id);
    expect(store.get(copy.id)).toBe(copy);
    store.move(copy.id, 2_000_000);
    store.update(original.id, 500_000, { ...cameraState, fov: 55 });
    expect(store.points.map((point) => point.timeMicroseconds)).toEqual([500_000, 2_000_000]);
    expect(store.points[0]?.state.fov).toBe(55);
    store.remove(copy.id);
    expect(store.points).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(6);
  });

  it("rejects non-deterministic timeline times", () => {
    const store = new CameraKeyframeStore();
    expect(() => store.add(-1, cameraState)).toThrow(RangeError);
    expect(() => store.add(1.5, cameraState)).toThrow(RangeError);
  });

  it("updates an accidental same-time point without creating an ambiguous duplicate", () => {
    const store = new CameraKeyframeStore();
    const original = store.addOrUpdateAtTime(1_000_000, cameraState);
    const updated = store.addOrUpdateAtTime(1_000_000, { ...cameraState, fov: 45 });
    expect(updated.id).toBe(original.id);
    expect(store.points).toHaveLength(1);
    expect(store.points[0]?.state.fov).toBe(45);
  });

  it("replaces atomically and appends a reusable move at the playhead", () => {
    const store = new CameraKeyframeStore();
    store.add(99, cameraState);
    const imported = [
      { id: "saved-a", timeMicroseconds: 2_000_000, state: cameraState, interpolation: "smooth" as const },
      { id: "saved-b", timeMicroseconds: 5_000_000, state: { ...cameraState, fov: 50 }, interpolation: "smooth" as const },
    ];
    store.replaceAll(imported);
    expect(store.points.map((point) => point.id)).toEqual(["saved-a", "saved-b"]);

    const appended = store.appendAll(imported, 10_000_000);
    expect(appended.map((point) => point.timeMicroseconds)).toEqual([10_000_000, 13_000_000]);
    expect(appended[0]!.id).not.toBe("saved-a");
    expect(store.points).toHaveLength(4);
  });
});
