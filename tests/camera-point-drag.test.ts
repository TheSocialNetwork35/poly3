import { describe, expect, it } from "vitest";
import { calculateDraggedCameraPointTime } from "../src/polyviewer/ui/ReplayTimeline";

describe("camera point timeline dragging", () => {
  it("maps pixels to exact integer microseconds without changing the point identity", () => {
    expect(calculateDraggedCameraPointTime(2_000_000, 250, 1_000, 10_000_000))
      .toBe(4_500_000);
  });

  it("clamps movement to the replay duration", () => {
    expect(calculateDraggedCameraPointTime(1_000_000, -500, 100, 10_000_000)).toBe(0);
    expect(calculateDraggedCameraPointTime(9_000_000, 500, 100, 10_000_000))
      .toBe(10_000_000);
  });

  it("does not move when the timeline has no measurable width", () => {
    expect(calculateDraggedCameraPointTime(3_000_000, 10, 0, 8_000_000)).toBe(3_000_000);
  });
});
