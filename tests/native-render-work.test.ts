import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const patch = readFileSync(new URL("../scripts/prepare-runtime.mjs", import.meta.url), "utf8");
function constant(name: string): string {
  const expression = patch.split(`const ${name} =`)[1]!.split(";\n")[0]!;
  return new Function(`return (${expression.trim()})`)();
}

describe("native export work", () => {
  it("suspends background game updates during capture and resumes without a time jump", () => {
    let loop: (time: number) => void = () => {};
    const renderer = { polyviewerCaptureState: null as object | null, setAnimationLoop: (callback: typeof loop) => { loop = callback; } };
    const game = { update: vi.fn() };
    const audio = { update: vi.fn() };
    new Function("window", "d", "$", "M", `let unused=0${constant("bridge")}`)({}, renderer, game, audio);
    loop(1000);
    renderer.polyviewerCaptureState = {};
    for (let time = 1016; time <= 10_000; time += 16) loop(time);
    expect(game.update).toHaveBeenCalledOnce();
    expect(audio.update.mock.calls.length).toBeGreaterThan(500);
    renderer.polyviewerCaptureState = null;
    loop(10_016);
    expect(game.update).toHaveBeenCalledTimes(2);
    expect(game.update.mock.calls[1]![0]).toBeLessThanOrEqual(0.032);
  });

  it("uses 4,000 instead of 34,000 lookups for one sampled frame of 2,000 cars", () => {
    const getFrame = vi.fn((frame: number) => ({ frames: frame >= 17 ? 17 : 0 }));
    const entries = Array.from({ length: 2000 }, (_, index) => {
      let time = 0;
      return {
        polyviewerId: `car-${index}`, polyviewerPreviewVisible: true,
        replay: { getFrame, getLastFrame: () => ({ numberOfFrames: 10_000 }), forEachFrameNumber: (_first: number, _last: number, visit: (frame: number) => void) => { visit(0); visit(17); } },
        car: { getTime: () => ({ numberOfFrames: time }), setCarState: vi.fn((state) => { time = state.frames; }), update: vi.fn(), updateCameras: vi.fn() },
      };
    });
    const owner = { jp: entries, Yp: { isPaused: true } };
    const replay: any = { timeFrames: 0, durationFrames: 10_000, loadedFrames: 10_000, priorityReplayId: "car-1", getNativeCameraPose: () => null };
    new Function("pvOwner", "pvReplay", "R", "jp", "qp", "Kp", "Yp", constant("replayEvaluationBridge"))(
      owner, replay, { gn: (o: any, key: string) => o[key], GG: (o: any, key: string, value: unknown) => { o[key] = value; } }, "jp", "qp", "Kp", "Yp",
    );
    replay.evaluateFrame(17, true);
    expect(getFrame).toHaveBeenCalledTimes(4000);
    for (const entry of entries) {
      expect(entry.car.setCarState).toHaveBeenCalledExactlyOnceWith({ frames: 17 }, true);
      expect(entry.car.update).toHaveBeenCalledExactlyOnceWith(0.017);
    }
    expect(entries[1]!.car.updateCameras).toHaveBeenCalledOnce();
    expect(entries[0]!.car.updateCameras).not.toHaveBeenCalled();
  });
});

class Vector {
  constructor(public x = 0, public y = 0, public z = 0) {}
  clone() { return new Vector(this.x, this.y, this.z); }
  applyQuaternion() { return this; }
  addScaledVector(v: Vector, scale: number) { this.x += v.x * scale; this.y += v.y * scale; this.z += v.z * scale; return this; }
  copy(v: Vector) { Object.assign(this, v); return this; }
}
function nameTagCar() {
  const replacement = constant("carVisibilityReplacement");
  const methods = replacement.slice(replacement.indexOf("polyviewerSetNameTagEnabled("), replacement.indexOf("getCarState(){"));
  const rebuild = vi.fn();
  const Car = new Function("l", "c", "ve", "ge", "D", "Fe", `return class {${methods}}`)(
    { gn: (o: any, key: string, kind: string) => kind === "m" ? rebuild : o[key] }, { Pq0: Vector }, "ve", "ge", "D", "Fe",
  );
  const car = new Car();
  car.ve = { position: new Vector(), visible: false, lookAt: vi.fn(), updateMatrixWorld: vi.fn() };
  car.ge = { camera: { position: new Vector() } };
  car.getPosition = () => new Vector(0, 0, 0);
  car.getQuaternion = () => ({});
  car.polyviewerVisible = true;
  return { car, rebuild };
}

describe("replay name tags", () => {
  it("shows enabled labels at frame zero and near/far cameras, and respects hiding", () => {
    const { car, rebuild } = nameTagCar();
    car.polyviewerSetNameTagEnabled(true);
    expect(rebuild).toHaveBeenCalledOnce();
    for (const distance of [0, 1, 49, 51, 500]) {
      car.ge.camera.position.z = distance;
      car.polyviewerRefreshNameTag();
      expect(car.ve.visible).toBe(true);
      expect(car.ve.lookAt).toHaveBeenLastCalledWith(car.ge.camera.position);
      expect(car.ve.position.y).toBe(1.75);
      expect(car.ve.updateMatrixWorld).toHaveBeenLastCalledWith(true);
    }
    car.polyviewerVisible = false;
    car.polyviewerRefreshNameTag();
    expect(car.ve.visible).toBe(false);
    car.polyviewerVisible = true;
    car.polyviewerSetNameTagEnabled(false);
    expect(car.ve.visible).toBe(false);
  });

  it("uses the same visibility rule in native updates", () => {
    const expression = constant("nameTagVisibilityReplacement").slice(".visible=".length, -1);
    const check = new Function(`return ${expression}`);
    expect(check.call({ polyviewerVisible: true, polyviewerNameTagEnabled: true })).toBe(true);
    expect(check.call({ polyviewerVisible: false, polyviewerNameTagEnabled: true })).toBe(false);
    expect(check.call({ polyviewerVisible: true, polyviewerNameTagEnabled: false })).toBe(false);
  });

  it("allocates labels only when enabled and refreshes renamed/recreated labels immediately", () => {
    let bundle = readFileSync(new URL("../vendor/polytrack-0.6.2/main.bundle.js", import.meta.url), "utf8");
    const resourceExpression = patch.split("const resourcePatches =")[1]!.split(";\n")[0]!;
    const resources = new Function(`return (${resourceExpression.trim()})`)() as string[][];
    for (const [anchor, replacement] of resources.slice(0, 2)) bundle = bundle.replace(anchor!, replacement!);
    const body = bundle.split("Fe=function")[1]!.split(",Oe=function")[0]!;
    const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => ({ measureText: () => ({ width: 100 }), fillRect() {}, fillText() {} }) }));
    class Texture { dispose = vi.fn(); }
    class Geometry { dispose = vi.fn(); }
    class Material { map: Texture; dispose = vi.fn(); constructor(options: { map: Texture }) { this.map = options.map; } }
    class Mesh { constructor(public geometry: Geometry, public material: Material) {} }
    const rebuild = new Function("l", "c", "ve", "Ae", "ge", "document", `return function${body}`)(
      { gn: (o: any, key: string) => o[key], GG: (o: any, key: string, value: unknown) => { o[key] = value; } },
      { gPd: Texture, bdM: Geometry, V9B: Material, eaF: Mesh }, "ve", "Ae", "ge", { createElement },
    );
    const car: any = { ve: null, Ae: { name: "Car", countryCode: null }, ge: { scene: { add: vi.fn(), remove: vi.fn() } }, polyviewerNameTagEnabled: false, polyviewerRefreshNameTag: vi.fn() };
    rebuild.call(car);
    expect(createElement).not.toHaveBeenCalled();
    car.polyviewerNameTagEnabled = true;
    rebuild.call(car);
    expect(createElement).toHaveBeenCalledOnce();
    expect(car.polyviewerRefreshNameTag).toHaveBeenCalledOnce();
    const previous = car.ve;
    car.Ae.name = "Renamed";
    rebuild.call(car);
    expect(previous.geometry.dispose).toHaveBeenCalledOnce();
    expect(previous.material.map.dispose).toHaveBeenCalledOnce();
    expect(previous.material.dispose).toHaveBeenCalledOnce();
    expect(car.polyviewerRefreshNameTag).toHaveBeenCalledTimes(2);
    const renamed = car.ve;
    car.polyviewerNameTagEnabled = false;
    rebuild.call(car);
    expect(car.ve).toBeNull();
    expect(renamed.geometry.dispose).toHaveBeenCalledOnce();
    expect(createElement).toHaveBeenCalledTimes(2);
  });

  it("refreshes enabled runtime cars directly without catalog searches", () => {
    const entries = Array.from({ length: 2000 }, () => ({ polyviewerNameTagVisible: false, polyviewerName: "Car", car: { setNameTag: vi.fn(), polyviewerRefreshNameTag: vi.fn(), polyviewerNameTagEnabled: false } }));
    const replay: any = { listReplays: vi.fn(() => { throw new Error("Unexpected catalog allocation"); }), getCar: vi.fn(() => { throw new Error("Unexpected linear search"); }) };
    new Function("pvOwner", "pvReplay", "R", "jp", constant("replayOverlayBridge"))({ entries }, replay, { gn: (o: any) => o.entries }, "entries");
    entries[0]!.car.polyviewerNameTagEnabled = true;
    entries[1999]!.car.polyviewerNameTagEnabled = true;
    replay.refreshOverlays();
    expect(entries[0]!.car.polyviewerRefreshNameTag).toHaveBeenCalledOnce();
    expect(entries[1999]!.car.polyviewerRefreshNameTag).toHaveBeenCalledOnce();
    expect(entries[1]!.car.polyviewerRefreshNameTag).not.toHaveBeenCalled();
  });
});
