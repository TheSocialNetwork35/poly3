import { describe, expect, it } from "vitest";
import { frameCountForRange, frameTimeMicroseconds } from "../src/polyviewer/render/FrameSchedule";

describe("deterministic frame schedule", () => {
  it("maps ten seconds to exactly 600 drift-free 60 FPS frames", () => {
    expect(frameCountForRange(0, 10_000_000, 60)).toBe(600);
    expect(frameTimeMicroseconds(0, 0, 60)).toBe(0);
    expect(frameTimeMicroseconds(1, 0, 60)).toBe(16_667);
    expect(frameTimeMicroseconds(599, 0, 60)).toBe(9_983_333);
    expect(frameTimeMicroseconds(600, 0, 60)).toBe(10_000_000);
  });

  it("does not accumulate floating-point error at 120 FPS with an offset", () => {
    expect(frameTimeMicroseconds(12_000, 3_000_000, 120)).toBe(103_000_000);
    expect(frameCountForRange(3_000_000, 103_000_000, 120)).toBe(12_000);
  });
});
