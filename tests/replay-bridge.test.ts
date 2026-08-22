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
      nameTagVisible: false, removable: false,
    }],
    getCar: () => fakeCar,
    getNativeCameraPose: () => null,
    addReplay: (
      recordingString: string,
      name?: string,
      _metadata?: PolyViewerReplayImportMetadata,
    ) => ({
      id: `imported-${recordingString}`,
      name: name ?? "Replay 2",
      visible: true,
      opacity: 1,
      nameTagVisible: false,
      removable: true,
    }),
    setReplayName() {},
    setReplayVisible() {},
    setReplayOpacity() {},
    setReplayNameTagVisible() {},
    refreshOverlays() {},
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
    const evaluateFrame = vi.spyOn(runtimeReplay, "evaluateFrame");
    replay.seekMicroseconds(4_000_000);
    expect(timeline.timeMicroseconds).toBe(1_250_000);
    expect(evaluateFrame).toHaveBeenCalledWith(1_250, false);
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
    expect(addReplay).toHaveBeenCalledWith("REAL-RECORDING", "World Record", {
      recording: "REAL-RECORDING",
    });
    replay.dispose();
  });

  it("does not crash when Cloudflare briefly serves the older single-replay runtime", () => {
    const runtimeReplay = {
      owner: {}, driver: null, durationFrames: 1_000, loadedFrames: 1_000, timeFrames: 0,
      primaryCar: fakeCar, nativeCameraPose: null,
      setDriver() {}, setNativePaused() {}, seekFrame() {}, evaluateFrame() {},
    } as unknown as PolyTrackReplayRuntimeBridge;
    const timeline = new MasterTimeline();
    const changes: unknown[] = [];
    const replay = new ReplayBridge(
      { replay: runtimeReplay } as unknown as PolyTrackBridge,
      timeline,
      { onChange: (status) => changes.push(status) },
    );

    expect(replay.replays).toEqual([expect.objectContaining({ id: "main" })]);
    expect(replay.getCar("main")).toBe(fakeCar);
    expect(changes.length).toBeGreaterThan(0);
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
    const setNameTag = vi.spyOn(runtimeReplay, "setReplayNameTagVisible");
    const replay = new ReplayBridge(
      { replay: runtimeReplay } as unknown as PolyTrackBridge,
      new MasterTimeline(),
    );

    expect(replay.getCar("main")).toBe(fakeCar);
    replay.setReplayOpacity("main", 0.7);
    replay.setReplayNameTagVisible("main", true);
    expect(setOpacity).toHaveBeenCalledWith("main", 0.7);
    expect(setNameTag).toHaveBeenCalledWith("main", true);
    replay.dispose();
  });

  it("sets every current car opacity once while preserving later individual overrides", () => {
    const methods = replayManagementMethods();
    const summaries = [
      { id: "main", name: "Main", visible: true, opacity: 1, nameTagVisible: false, removable: false },
      { id: "replay-1", name: "Ghost", visible: false, opacity: 0.2, nameTagVisible: true, removable: true },
    ];
    const runtimeReplay = {
      owner: {}, driver: null, durationFrames: 2_000, loadedFrames: 2_000, timeFrames: 0,
      primaryCar: fakeCar, nativeCameraPose: null,
      ...methods,
      listReplays: () => summaries,
      setDriver() {}, setNativePaused() {}, seekFrame() {},
    } satisfies PolyTrackReplayRuntimeBridge;
    const setOpacity = vi.spyOn(runtimeReplay, "setReplayOpacity");
    const replay = new ReplayBridge(
      { replay: runtimeReplay } as unknown as PolyTrackBridge,
      new MasterTimeline(),
    );

    replay.setAllReplayOpacity(0.5);
    replay.setReplayOpacity("main", 1);

    expect(setOpacity.mock.calls).toEqual([
      ["main", 0.5],
      ["replay-1", 0.5],
      ["main", 1],
    ]);
    expect(summaries[1]!.visible).toBe(false);
    replay.dispose();
  });

  it("adds a validated replay array with leaderboard names", () => {
    const runtimeReplay = {
      owner: {}, driver: null, durationFrames: 20_000, loadedFrames: 20_000, timeFrames: 0,
      primaryCar: fakeCar, nativeCameraPose: null,
      ...replayManagementMethods(),
      setDriver() {}, setNativePaused() {}, seekFrame() {},
    } satisfies PolyTrackReplayRuntimeBridge;
    const addReplay = vi.spyOn(runtimeReplay, "addReplay");
    const replay = new ReplayBridge(
      { replay: runtimeReplay } as unknown as PolyTrackBridge,
      new MasterTimeline(),
    );
    replay.addReplays(JSON.stringify([
      { recording: "one", frames: 100, carStyle: "red" },
      { recording: "two", frames: 200, carStyle: "blue" },
    ]), JSON.stringify({ entries: [
      { nickname: "Blue", frames: 200, carStyle: "blue" },
      { nickname: "Red", frames: 100, carStyle: "red" },
    ] }));
    expect(addReplay.mock.calls.map((call) => call[1])).toEqual(["Red", "Blue"]);
    expect(addReplay.mock.calls.map((call) => call[2])).toEqual([
      { recording: "one", carStyle: "red" },
      { recording: "two", carStyle: "blue" },
    ]);
    expect(replay.timeline.durationMicroseconds).toBe(20_000_000);
    replay.dispose();
  });

  it("never forwards leaderboard frame counts as runtime shot duration metadata", () => {
    const runtimeReplay = {
      owner: {}, driver: null, durationFrames: 30_000, loadedFrames: 30_000, timeFrames: 0,
      primaryCar: fakeCar, nativeCameraPose: null,
      ...replayManagementMethods(),
      setDriver() {}, setNativePaused() {}, seekFrame() {},
    } satisfies PolyTrackReplayRuntimeBridge;
    const addReplay = vi.spyOn(runtimeReplay, "addReplay");
    const replay = new ReplayBridge(
      { replay: runtimeReplay } as unknown as PolyTrackBridge,
      new MasterTimeline(),
    );
    replay.addReplay(JSON.stringify({ recording: "run", frames: 9_999, carStyle: "style" }));
    expect(addReplay).toHaveBeenCalledWith("run", undefined, {
      recording: "run",
      carStyle: "style",
    });
    expect(replay.timeline.durationMicroseconds).toBe(30_000_000);
    replay.dispose();
  });
});
