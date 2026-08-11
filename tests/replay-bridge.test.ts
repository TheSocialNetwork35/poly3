import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayBridge } from "../src/polyviewer/replay/ReplayBridge";
import { MasterTimeline } from "../src/polyviewer/timeline/MasterTimeline";

class FakeWindow extends EventTarget {}

const fakeCar: PolyTrackCarTarget = {
  getPosition: () => ({ x: 0, y: 0, z: 0 }),
  getQuaternion: () => ({ x: 0, y: 0, z: 0, w: 1 }),
};

function replayManagementMethods() {
  return {
    listReplays: () => [{
      id: "main", name: "Main Run", visible: true, opacity: 1,
      offsetMilliseconds: 0, removable: false,
    }],
    getCar: () => fakeCar,
    getNativeCameraPose: () => null,
    addReplay: (recordingString: string, name?: string) => ({
      id: `imported-${recordingString}`,
      name: name ?? "Replay 2",
      visible: true,
      opacity: 1,
      offsetMilliseconds: 0,
      removable: true,
    }),
    setReplayName() {},
    setReplayVisible() {},
    setReplayOpacity() {},
    setReplayOffset() {},
    removeReplay() {},
    evaluateFrame() {},
  };
}

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
      primaryCar: fakeCar,
      nativeCameraPose: null,
      ...replayManagementMethods(),
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
      primaryCar: fakeCar,
      nativeCameraPose: null,
      ...replayManagementMethods(),
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

  it("passes recording strings to the native replay runtime without inventing a format", () => {
    const runtimeReplay = {
      owner: {}, driver: null, durationFrames: 1_000, loadedFrames: 1_000, timeFrames: 0,
      primaryCar: fakeCar, nativeCameraPose: null,
      ...replayManagementMethods(),
      setDriver() {}, setNativePaused() {}, seekFrame() {},
    } satisfies PolyTrackReplayRuntimeBridge;
    const addReplay = vi.spyOn(runtimeReplay, "addReplay");
    const replay = new ReplayBridge(
      { replay: runtimeReplay } as unknown as PolyTrackBridge,
      new MasterTimeline(),
    );

    expect(replay.addReplay("REAL-RECORDING", "World Record")).toMatchObject({
      id: "imported-REAL-RECORDING",
      name: "World Record",
    });
    expect(addReplay).toHaveBeenCalledWith("REAL-RECORDING", "World Record");
    replay.dispose();
  });

  it("routes replay settings and target lookup to stable native replay IDs", () => {
    const methods = replayManagementMethods();
    const runtimeReplay = {
      owner: {}, driver: null, durationFrames: 2_000, loadedFrames: 2_000, timeFrames: 0,
      primaryCar: fakeCar, nativeCameraPose: null,
      ...methods,
      setDriver() {}, setNativePaused() {}, seekFrame() {},
    } satisfies PolyTrackReplayRuntimeBridge;
    const setOpacity = vi.spyOn(runtimeReplay, "setReplayOpacity");
    const setOffset = vi.spyOn(runtimeReplay, "setReplayOffset");
    const replay = new ReplayBridge(
      { replay: runtimeReplay } as unknown as PolyTrackBridge,
      new MasterTimeline(),
    );

    expect(replay.getCar("main")).toBe(fakeCar);
    replay.setReplayOpacity("main", 0.7);
    replay.setReplayOffset("main", 9_000);
    expect(setOpacity).toHaveBeenCalledWith("main", 0.7);
    expect(setOffset).toHaveBeenCalledWith("main", 2_000);
    replay.dispose();
  });
});
