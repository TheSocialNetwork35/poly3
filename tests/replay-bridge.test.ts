import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayBridge } from "../src/polyviewer/replay/ReplayBridge";
import { MasterTimeline } from "../src/polyviewer/timeline/MasterTimeline";

class FakeWindow extends EventTarget {}

describe("ReplayBridge", () => {
  beforeEach(() => {
    vi.stubGlobal("window", new FakeWindow());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets MasterTimeline drive exact native replay frames", () => {
    let driver: PolyTrackReplayDriver | null = null;
    let nativePaused = false;
    const runtimeReplay = {
      owner: {},
      driver: null,
      durationFrames: 2_000,
      loadedFrames: 2_000,
      timeFrames: 0,
      primaryCar: {},
      setDriver(value: PolyTrackReplayDriver | null) { driver = value; },
      setNativePaused(value: boolean) { nativePaused = value; },
      seekFrame() {},
    } satisfies PolyTrackReplayRuntimeBridge;
    const runtime = { replay: runtimeReplay } as unknown as PolyTrackBridge;
    const timeline = new MasterTimeline();
    const replay = new ReplayBridge(runtime, timeline);

    replay.setActive(true);
    replay.play();
    expect(nativePaused).toBe(true);
    expect(driver).not.toBeNull();
    const activeDriver = driver as PolyTrackReplayDriver | null;
    expect(activeDriver?.(0.5, 2_000, 2_000)).toEqual({ frame: 500, advanceVisuals: true });
    expect(timeline.timeMicroseconds).toBe(500_000);

    replay.dispose();
    expect(driver).toBeNull();
  });

  it("never seeks beyond frames produced by the real simulation worker", () => {
    const runtimeReplay = {
      owner: {},
      driver: null,
      durationFrames: 5_000,
      loadedFrames: 1_250,
      timeFrames: 0,
      primaryCar: {},
      setDriver(value: PolyTrackReplayDriver | null) { this.driver = value; },
      setNativePaused() {},
      seekFrame() {},
    } satisfies PolyTrackReplayRuntimeBridge;
    const runtime = { replay: runtimeReplay } as unknown as PolyTrackBridge;
    const timeline = new MasterTimeline();
    const replay = new ReplayBridge(runtime, timeline);

    replay.setActive(true);
    replay.seekMicroseconds(4_000_000);
    expect(timeline.timeMicroseconds).toBe(1_250_000);
    replay.play();
    const bufferedDriver = runtimeReplay.driver as PolyTrackReplayDriver | null;
    expect(bufferedDriver?.(0.5, 5_000, 1_250)).toEqual({
      frame: 1_250,
      advanceVisuals: false,
    });
    replay.dispose();
  });
});
