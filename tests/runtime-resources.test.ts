import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Build-time JS is serialized unchanged into the native runtime.
import { CarPatternCache, ReplayWorkerPool } from "../scripts/runtime-resources.mjs";

afterEach(() => vi.unstubAllGlobals());

describe("native car pattern ownership", () => {
  it("shares 1,900 equal patterns and frees only the last owner's texture", () => {
    const cache = new CarPatternCache();
    const renderer = {};
    const texture = { dispose: vi.fn() };
    const create = vi.fn(() => texture);
    const cars = Array.from({ length: 1900 }, () => cache.acquire(renderer, 3, create));
    expect(create).toHaveBeenCalledOnce();
    cars.slice(1).forEach(car => cache.release(car));
    expect(texture.dispose).not.toHaveBeenCalled();
    cache.release(cars[0]);
    expect(texture.dispose).toHaveBeenCalledOnce();
    cache.acquire(renderer, 3, create);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps renderer and pattern identities separate during style changes", () => {
    const cache = new CarPatternCache();
    const renderer = {};
    const create = () => ({ dispose: vi.fn() });
    const first = cache.acquire(renderer, 0, create);
    const other = cache.acquire(renderer, 1, create);
    const anotherRenderer = cache.acquire({}, 0, create);
    expect(first).not.toBe(other);
    expect(first).not.toBe(anotherRenderer);
    cache.release(first);
    expect(other.dispose).not.toHaveBeenCalled();
    expect(anotherRenderer.dispose).not.toHaveBeenCalled();
  });
});

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { super(); FakeWorker.instances.push(this); }
}
function pool(realtime = false, cores = 8) {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("navigator", { hardwareConcurrency: cores });
  const pool = new ReplayWorkerPool("simulation_worker.bundle.js");
  pool.postMessage({ messageType: 0, isRealtime: realtime, trackParts: ["native"] });
  return pool;
}

describe("native replay worker routing", () => {
  it("bounds parallel workers and routes each car's lifecycle to its owner", () => {
    const p = pool();
    for (let id = 0; id < 20; id++) p.postMessage({ messageType: 3, carId: id });
    expect(FakeWorker.instances).toHaveLength(4);
    for (const worker of FakeWorker.instances) {
      expect(worker.postMessage.mock.calls[0]![0].messageType).toBe(0);
      const ids = worker.postMessage.mock.calls.filter(([m]) => m.messageType === 3).map(([m]) => m.carId);
      expect(ids).toHaveLength(5);
      for (const id of ids) {
        for (const type of [5, 6, 7, 4]) {
          p.postMessage({ messageType: type, carId: id });
          expect(worker.postMessage).toHaveBeenLastCalledWith({ messageType: type, carId: id });
        }
      }
    }
    p.terminate();
    for (const worker of FakeWorker.instances) expect(worker.terminate).toHaveBeenCalledOnce();
    expect(() => p.postMessage({ messageType: 3, carId: 99 })).toThrow(/disposed/);
  });

  it.each([[true, 8], [false, 1]])("uses one worker for realtime=%s, cores=%s", (realtime, cores) => {
    const p = pool(realtime, cores);
    for (let id = 0; id < 20; id++) p.postMessage({ messageType: 3, carId: id });
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("forwards native result buffers unchanged and exposes worker failure", () => {
    const p = pool();
    const onMessage = vi.fn();
    p.addEventListener("message", onMessage);
    const data = { messageType: 10, carStateBuffers: [new ArrayBuffer(12)] };
    FakeWorker.instances[0]!.dispatchEvent(new MessageEvent("message", { data }));
    expect(onMessage.mock.calls[0]![0].data).toBe(data);
    FakeWorker.instances[0]!.dispatchEvent(new Event("messageerror"));
    expect(p.failure.message).toMatch(/unreadable/);
    expect(() => p.postMessage({ messageType: 3, carId: 1 })).toThrow(/unreadable/);
  });
});
