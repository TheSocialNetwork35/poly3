import { describe, expect, it } from "vitest";
import { MasterTimeline } from "../src/polyviewer/timeline/MasterTimeline";

describe("MasterTimeline", () => {
  it("maps output frames to stable integer microseconds", () => {
    const timeline = new MasterTimeline();
    timeline.setDurationMicroseconds(10_000_000);
    timeline.seekFrame(60, 60);
    expect(timeline.timeMicroseconds).toBe(1_000_000);
  });

  it("clamps time and pauses at the end", () => {
    const timeline = new MasterTimeline();
    timeline.setDurationMicroseconds(1_000_000);
    timeline.play();
    timeline.update(2);
    expect(timeline.timeMicroseconds).toBe(1_000_000);
    expect(timeline.playing).toBe(false);
  });

  it("rejects invalid deterministic time values", () => {
    const timeline = new MasterTimeline();
    expect(() => timeline.setDurationMicroseconds(-1)).toThrow(RangeError);
    expect(() => timeline.seekFrame(1, 59.94)).toThrow(RangeError);
  });

  it("supports deterministic restart and signed stepping", () => {
    const timeline = new MasterTimeline();
    timeline.setDurationMicroseconds(2_000_000);
    timeline.seekMicroseconds(1_000_000);
    timeline.stepMicroseconds(-16_000);
    expect(timeline.timeMicroseconds).toBe(984_000);
    timeline.stepMicroseconds(4_000_000);
    expect(timeline.timeMicroseconds).toBe(2_000_000);
    timeline.restart();
    expect(timeline.timeMicroseconds).toBe(0);
  });
});
