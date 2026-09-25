import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, PerspectiveCamera, InstancedMesh, Matrix4, Group, BufferGeometry, Float32BufferAttribute } from "three";
import { SceneArchive } from "../src/polyviewer/blender/SceneArchive";

describe("Blender scene baking", () => {
  it("bakes hierarchy and instances without changing source objects and shares geometry", () => {
    const scene = new Scene();
    const parent = new Group(); parent.position.set(10, 20, 30); scene.add(parent);
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 2);
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(1, 0, 0));
    mesh.setMatrixAt(1, new Matrix4().makeTranslation(2, 0, 0)); parent.add(mesh);
    const archive = new SceneArchive();
    const frame = archive.snapshot(scene, new PerspectiveCamera()) as any;
    expect(frame.objects.map((o: any) => o.matrix.slice(12,15))).toEqual([[11,20,30],[12,20,30]]);
    archive.snapshot(scene, new PerspectiveCamera());
    expect(Object.keys(archive.geometries)).toHaveLength(1);
    expect(mesh.count).toBe(2);
    expect(mesh.parent).toBe(parent);
  });

  it("records changed geometry and draw ranges while excluding hidden parents", () => {
    const scene = new Scene();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0,0,0,1,0,0,0,1,0,1,1,0],3));
    geometry.setIndex([0,1,2,1,3,2]); geometry.setDrawRange(0,3);
    const mesh = new Mesh(geometry, new MeshStandardMaterial()); scene.add(mesh);
    const archive = new SceneArchive();
    archive.snapshot(scene,new PerspectiveCamera());
    geometry.setDrawRange(0,6);
    archive.snapshot(scene,new PerspectiveCamera());
    geometry.getAttribute("position").setX(0,4); geometry.getAttribute("position").needsUpdate = true;
    archive.snapshot(scene,new PerspectiveCamera());
    const entries = Object.values(archive.geometries) as any[];
    expect(entries.map(g => g.indices.length)).toEqual([3,6,6]);
    expect(entries[0].position[0]).toBe(0);
    expect(entries[2].position[0]).toBe(4);
    mesh.visible = false;
    expect(archive.snapshot(scene,new PerspectiveCamera()).objects).toEqual([]);
  });

  it("preserves FOV and animated material opacity at sampled frames", () => {
    const scene = new Scene();
    const material = new MeshStandardMaterial({ opacity: .4 });
    scene.add(new Mesh(new BoxGeometry(),material));
    const camera = new PerspectiveCamera(47); camera.position.set(0,3,4);
    const archive = new SceneArchive();
    expect(archive.snapshot(scene,camera).camera.fov).toBe(47);
    material.opacity = .8;
    archive.snapshot(scene,camera);
    expect(Object.values(archive.materials).map((m: any) => m.opacity)).toEqual([.4,.8]);
  });
  it("bakes suspension morphs independently for cars sharing geometry", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
    geometry.morphAttributes.position = [new Float32BufferAttribute([0,0,2,1,0,2,0,1,2],3)];
    const first = new Mesh(geometry,new MeshStandardMaterial());
    const second = new Mesh(geometry,first.material);
    first.morphTargetInfluences![0] = .25;
    second.morphTargetInfluences![0] = .75;
    const scene = new Scene(); scene.add(first,second);
    const archive = new SceneArchive();
    archive.snapshot(scene,new PerspectiveCamera());
    expect(Object.values(archive.geometries).map((g: any) => g.position[2])).toEqual([.5,1.5]);
    expect(geometry.getAttribute("position").getZ(0)).toBe(0);
  });

  it("bakes projected native shadow matrices without TRS decomposition loss", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
    const mesh = new Mesh(geometry,new MeshStandardMaterial());
    mesh.matrixAutoUpdate = false;
    mesh.matrix.set(1,.4,0,2, 0,1,0,3, 0,0,0,0, 0,0,0,.5);
    const scene = new Scene();scene.add(mesh);
    const archive = new SceneArchive();
    const frame = archive.snapshot(scene,new PerspectiveCamera());
    const exported = frame.objects[0]!;
    expect(exported.matrix).toEqual(new Matrix4().toArray());
    expect((archive.geometries[exported.geometry] as any).position).toEqual([4,6,0,6,6,0,4.8,8,0]);
  });

});
