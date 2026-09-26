import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshBasicMaterial, Scene, PerspectiveCamera } from "three";
import { SceneArchive } from "../src/polyviewer/blender/SceneArchive";
import { jsonChunks } from "../src/polyviewer/blender/JsonChunks";
import { strFromU8, strToU8 } from "fflate";

describe("bounded Blender resource export", () => {
  it("streams bounded JSON chunks including unicode at byte boundaries", () => {
    const value = { "🚗": [1, undefined, NaN, -1.5, 'ä\\"🚘', { omitted: undefined, flag: true }] };
    const chunks = [...jsonChunks(value, 7)];
    expect(chunks.every(c => c.length <= 7)).toBe(true);
    expect(JSON.parse(chunks.map(c => strFromU8(strToU8(c))).join(""))).toEqual(JSON.parse(JSON.stringify(value)));
  });
  it("excludes projected shadow meshes before allocating any resources", () => {
    const mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
    Object.assign(mesh, { meshMatrix: new Matrix4() });
    const scene = new Scene(); scene.add(mesh);
    const resources: unknown[] = [];
    const archive = new SceneArchive((...args) => resources.push(args));
    expect(archive.snapshot(scene, new PerspectiveCamera()).objects).toEqual([]);
    expect(resources).toEqual([]);
  });
  it("exports only drawn vertices, preserving remapped attributes and releasing serialized history", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(300_000), 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(200_000), 2));
    geometry.getAttribute("position").setXYZ(9, 3, 4, 5);
    geometry.getAttribute("uv").setXY(9, .25, .75);
    geometry.setIndex([9, 4, 6, 6, 4, 8]); geometry.setDrawRange(0, 3);
    const scene = new Scene(); scene.add(new Mesh(geometry, new MeshBasicMaterial()));
    const saved: any[] = [];
    const archive = new SceneArchive((kind, _key, data) => { if (kind === "geometries") saved.push(data); });
    archive.snapshot(scene, new PerspectiveCamera());
    expect(saved[0].position).toHaveLength(9);
    expect(saved[0].position.slice(0,3)).toEqual([3,4,5]);
    expect(saved[0].uv.slice(0,2)).toEqual([.25,.75]);
    expect(saved[0].indices).toEqual([0,1,2]);
    geometry.setDrawRange(0,6);
    archive.snapshot(scene, new PerspectiveCamera());
    expect(saved[1].position).toHaveLength(12);
    expect(saved[1].indices).toEqual([0,1,2,2,1,3]);
    expect(archive.geometries).toEqual({});
    expect(archive.materials).toEqual({});
  });
  it("does not create new material variants when the native brake emissive changes", () => {
    const material = new MeshBasicMaterial(); material.name = "BrakeLight";
    Object.assign(material, { emissive: { toArray: () => [0,0,0] }, emissiveIntensity: 1 });
    const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
    const scene = new Scene();scene.add(new Mesh(geometry,material));
    const archive = new SceneArchive();
    const first = archive.snapshot(scene,new PerspectiveCamera());
    Object.assign(material, { emissive: { toArray: () => [1,.4,.3] } });
    expect(archive.snapshot(scene,new PerspectiveCamera()).objects[0]!.materials).toEqual(first.objects[0]!.materials);
  });
});
