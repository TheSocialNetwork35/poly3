import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Runtime helpers are serialized into the verified vendor bundle.
import { createReplayRenderPlan } from "../scripts/runtime-resources.mjs";
import { frameTimeMicroseconds } from "../src/polyviewer/render/FrameSchedule";

const settings = { fps: 60, startMicroseconds: 0, endMicroseconds: 11_000_000, simulationWorkers: 8 };
const patch = readFileSync(new URL("../scripts/prepare-runtime.mjs", import.meta.url), "utf8");
const bridge = patch.split("const replayManagementBridge = `")[1]!.split("`;\n")[0]!;
afterEach(() => vi.useRealTimers());

describe("bounded preparation schedule", () => {
  it("ends an 11-second export at 11 seconds even on a 60-second replay", () => {
    const plan = createReplayRenderPlan(settings, 60_000);
    expect(plan.targetFrame).toBe(11_000);
    expect(Math.max(...plan.sampleFrames)).toBe(11_000);
    expect(plan.sampleFrames.has(60_000)).toBe(false);
  });

  it.each([30, 60, 144])("matches exact render/pre-roll rounding at %s FPS", fps => {
    const start = 500_499;
    const end = 1_005_001;
    const plan = createReplayRenderPlan({ fps, startMicroseconds: start, endMicroseconds: end }, 60_000);
    const expected = new Set([0, 1006]);
    for (let index = 1; frameTimeMicroseconds(index, 0, fps) < start; index++) {
      expected.add(Math.round(frameTimeMicroseconds(index, 0, fps) / 1000));
    }
    for (let index = 0; frameTimeMicroseconds(index, start, fps) < end; index++) {
      expected.add(Math.round(frameTimeMicroseconds(index, start, fps) / 1000));
    }
    expect(plan.sampleFrames).toEqual(expected);
  });

  it("rejects invalid ranges instead of launching physics", () => {
    for (const values of [{ endMicroseconds: 0 }, { endMicroseconds: 61_000_000 }, { fps: 0 }, { startMicroseconds: -1 }]) {
      expect(() => createReplayRenderPlan({ ...settings, ...values }, 60_000)).toThrow(/range/);
    }
  });
});

// Execute the actual injected management bridge with a deterministic worker
// transport. This checks readiness, endpoint messages and cancellation together.
function setup() {
  vi.useFakeTimers();
  const callbacks = new Map<number, (bytes: Uint8Array) => void>();
  let nextId = 0;
  const worker = {
    polyviewerSetSimulationWorkers: vi.fn((count: number) => count || 4),
    createCar: vi.fn((_start, _vertices, _offset, _track, _recording, callback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return { id, carState: { frames: 0 } };
    }),
    startCar: vi.fn(),
    deleteCar: vi.fn((id: number) => callbacks.delete(id)),
  };
  class Car {
    setCarStyle() {} setNameTag() {} setOpacity() {} setVisible() {} dispose() {}
    getRecording() { return { constructor: { deserialize: () => ({}) } }; }
    getCarStyle() { return {}; }
  }
  class Time { constructor(public numberOfFrames: number) {} }
  const main = { car: new Car(), settings: {}, replay: { getLastFrame: () => new Time(60_000), getFrame: () => ({ frames: 0 }) } };
  const owner = {
    jp: [main], Ip: worker, Lp: { getStartTransform: () => ({}) },
    Dp: { getMountainVertices: () => [], getMountainOffset: () => ({}) },
  };
  const replay: any = { durationFrames: 60_000, priorityReplayId: "main" };
  const window = {
    __POLYVIEWER_CREATE_RENDER_PLAN__: createReplayRenderPlan,
    __POLYVIEWER_CREATE_PACKED_REPLAY_STORE__: () => {
      let lastFrame = 0;
      return {
        packedBytes: 0, get lastFrame() { return lastFrame; },
        push: (state: { frames: number }) => { lastFrame = state.frames; },
        pushPacked: (bytes: Uint8Array) => { lastFrame = bytes[0]! | bytes[1]! << 8 | bytes[2]! << 16; },
        getFrame: (frames: number) => ({ frames }),
      };
    },
  };
  const keys = ["jp", "Ip", "Lp", "Dp", "Gp", "Fp", "Np", "Wp"];
  new Function("window", "pvOwner", "pvReplay", "R", "U", "bt", ...keys, bridge)(
    window, owner, replay, { gn: (object: any, key: string) => object[key] }, { A: Car }, { A: Time }, ...keys,
  );
  replay.previewLimit = 1;
  const finish = (id: number, frame: number) => callbacks.get(id)?.(new Uint8Array([frame & 255, frame >> 8 & 255, frame >> 16 & 255]));
  return { replay, worker, callbacks, finish };
}

describe("native preparation lifecycle", () => {
  it("prepares 1,900 cars only to the export endpoint, with a bounded queue", async () => {
    const { replay, worker, callbacks, finish } = setup();
    replay.beginReplayBatch();
    for (let i = 0; i < 1899; i++) replay.addReplay("recording", `Car ${i}`);
    replay.endReplayBatch();
    const progress = vi.fn();
    const pending = replay.prepareRender(settings, undefined, progress);
    expect(worker.polyviewerSetSimulationWorkers).toHaveBeenCalledWith(8);
    while (!replay.renderPrepared) {
      expect(callbacks.size).toBeLessThanOrEqual(16);
      for (const id of [...callbacks.keys()]) finish(id, 11_000);
      await vi.advanceTimersByTimeAsync(50);
    }
    await pending;
    expect(worker.startCar).toHaveBeenCalledTimes(1899);
    expect(worker.startCar.mock.calls.every(([, time]) => time.numberOfFrames === 11_000)).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(1900, 1900);
    expect(replay.durationFrames).toBe(60_000);
    expect(() => replay.setRenderMode(true)).not.toThrow();
    replay.releaseRenderPreparation();
    expect(callbacks.size).toBe(0);
    expect(replay.getCar("replay-1")).toBeNull();
  });

  it("rebuilds sparse states for a longer range or different FPS", async () => {
    const { replay, worker, callbacks, finish } = setup();
    replay.addReplay("recording", "Car");
    for (const next of [settings, { ...settings, endMicroseconds: 12_000_000 }, { ...settings, fps: 30 }]) {
      const pending = replay.prepareRender(next);
      const target = Math.ceil(next.endMicroseconds / 1000);
      for (const id of [...callbacks.keys()]) finish(id, target);
      await vi.advanceTimersByTimeAsync(50);
      await pending;
      expect(replay.getPerformanceStatus().renderReady).toBe(true);
    }
    // 60-FPS samples cover the 30-FPS subset, so that third pass can reuse them.
    expect(worker.createCar).toHaveBeenCalledTimes(2);
    const changed = replay.prepareRender({ ...settings, fps: 144 });
    for (const id of [...callbacks.keys()]) finish(id, 11_000);
    await vi.advanceTimersByTimeAsync(50);
    await changed;
    expect(worker.createCar).toHaveBeenCalledTimes(3);
  });

  it("retargets in-flight preview physics and restores full preview after export", async () => {
    const { replay, worker, callbacks, finish } = setup();
    replay.previewLimit = 2;
    replay.addReplay("recording", "Car");
    const id = [...callbacks.keys()][0]!;
    finish(id, 1000);
    const pending = replay.prepareRender(settings);
    expect(worker.createCar).toHaveBeenCalledOnce();
    expect(worker.startCar).toHaveBeenLastCalledWith(id, expect.objectContaining({ numberOfFrames: 11_000 }));
    finish(id, 11_000);
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    replay.releaseRenderPreparation();
    expect(worker.startCar).toHaveBeenLastCalledWith(expect.any(Number), expect.objectContaining({ numberOfFrames: 60_000 }));
    expect(replay.getPerformanceStatus().renderReady).toBe(false);
  });

  it("cleans cancellation and permits a new range afterward", async () => {
    const { replay, callbacks, finish } = setup();
    replay.addReplay("recording", "Car");
    const controller = new AbortController();
    const pending = replay.prepareRender(settings, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    const retry = replay.prepareRender({ ...settings, endMicroseconds: 500_000 });
    for (const id of [...callbacks.keys()]) finish(id, 500);
    await vi.advanceTimersByTimeAsync(50);
    await retry;
    expect(replay.renderPrepared).toBe(true);
  });
});
