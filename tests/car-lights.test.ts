import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { snapshotCarLights } from "../src/polyviewer/blender/CarLights";
const matrix = [1,0,0,0,0,1,0,0,0,0,1,0,3,4,5,1];
const summary = (id: string, visible = true, opacity = 1) => ({ id, name: id, visible, opacity });

describe("Blender vehicle lighting metadata", () => {
  it("exports each visible car's independent chassis pose and brake input", () => {
    const getCar = vi.fn((id: string) => ({ polyviewerGetExportCar: () => ({ matrix, braking: id === "braking", visible: true }) }));
    const result = snapshotCarLights({ listReplays: () => [summary("braking"), summary("coasting", true, 0.5), summary("hidden", false), summary("transparent", true, 0)], getCar } as never);
    expect(result.map(c => [c.id, c.braking, c.opacity])).toEqual([["braking", true, 1], ["coasting", false, .5]]);
    expect(getCar).toHaveBeenCalledTimes(2);
    result[0]!.matrix[12] = 99;
    expect(matrix[12]).toBe(3);
  });
  it("fails clearly for an outdated runtime and invalid transforms", () => {
    const replay = { listReplays: () => [summary("main")], getCar: () => ({}) };
    expect(() => snapshotCarLights(replay as never)).toThrow("Reload");
    replay.getCar = () => ({ polyviewerGetExportCar: () => ({ matrix: [NaN], visible: true }) });
    expect(() => snapshotCarLights(replay as never)).toThrow("transform");
    expect(snapshotCarLights(null)).toEqual([]);
  });
  it("reads the native animated chassis and recorded brake key even when the physics brake flag differs", () => {
    const source = readFileSync(new URL("../scripts/prepare-runtime.mjs", import.meta.url), "utf8");
    const replacement = new Function(`return (${source.split("const carVisibilityReplacement =")[1]!.split(";\n")[0]!.trim()})`)() as string;
    const method = "polyviewerGetExportCar(){" + replacement.split("polyviewerGetExportCar(){")[1]!.split("getCarState(){")[0];
    const Car = new Function("l", "be", "me", "te", `return class { ${method} }`)({ gn: (o: any, key: string) => o[key] }, "body", "group", "state");
    const car = new Car();
    car.body = { matrixWorld: { toArray: () => [...matrix] } };
    car.group = { visible: true };
    car.state = { brakeLightEnabled: false, controls: { down: true } };
    expect(car.polyviewerGetExportCar()).toEqual({ matrix, braking: true, visible: true });
    car.state.brakeLightEnabled = true;
    car.state.controls.down = false;
    car.group.visible = false;
    expect(car.polyviewerGetExportCar()).toEqual({ matrix, braking: false, visible: false });
  });
});
