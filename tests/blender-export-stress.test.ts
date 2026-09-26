import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from "three";
import { unzipSync, strFromU8 } from "fflate";
import { exportBlender } from "../src/polyviewer/blender/BlenderExporter";

describe("20-car Blender ZIP export regression", () => {
  it("exports 312 moving frames with camera/FOV changes, sparse buffers and independent brake inputs", async () => {
    const scene = new Scene(), camera = new PerspectiveCamera();
    const body = new BoxGeometry(), material = new MeshStandardMaterial();
    const cars = Array.from({ length: 20 }, (_, i) => {
      const mesh = new Mesh(body, material); mesh.name = `Car ${i}`; scene.add(mesh);
      const shadow = new Mesh(body, material); Object.assign(shadow, { meshMatrix: mesh.matrixWorld }); scene.add(shadow);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(30_000), 3));
      geometry.setDrawRange(0, 3);
      scene.add(new Mesh(geometry, material));
      return { mesh, geometry };
    });
    let current = 0;
    const summaries = cars.map((_, i) => ({ id: String(i), name: `Car ${i}`, visible: true, opacity: 1 }));
    const runtime = {
      listReplays: () => summaries,
      getCar: (id: string) => ({ polyviewerGetExportCar: () => ({ matrix: cars[Number(id)]!.mesh.matrixWorld.toArray(), visible: true, braking: (current + Number(id)) % 5 === 0 }) }),
    };
    const renderer = { render: async (_settings: unknown, options: any) => {
      for (current = 0; current < 312; current++) {
        for (const [index, car] of cars.entries()) {
          car.mesh.position.set(index, current / 60, current / 10); car.mesh.rotation.z = current / 200;
          const p = car.geometry.getAttribute("position");
          p.setXYZ(0,index,0,current/100);p.setXYZ(1,index+1,0,current/100);p.setXYZ(2,index,0,current/100+1);p.needsUpdate=true;
        }
        camera.position.set(current / 10, 8, current % 30);camera.fov=30+current%90;camera.updateProjectionMatrix();
        await options.onFrame({ index: current });
      }
    } };
    const replay = { prepareAllForRender: vi.fn(), releaseRenderPreparation: vi.fn() };
    const blob = await exportBlender({ scene, camera, replay: runtime } as never, renderer as never, replay as never, [],
      { width:3840,height:2160,fps:60,startMicroseconds:41_200_000,endMicroseconds:46_400_000 },new AbortController().signal,()=>{},()=>{});
    const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const read=(name: string)=>JSON.parse(strFromU8(files[name]!));
    const manifest=read("scene.json");
    expect(strFromU8(files["Import-Blender.command"]!)).toContain("#!/bin/bash");
    expect(strFromU8(files["Import-Blender.cmd"]!)).toContain("--python-exit-code 1");
    const zipBytes = Buffer.from(await blob.arrayBuffer());
    const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    let foundExecutable = false;
    for (let offset = zipBytes.indexOf(signature); offset >= 0; offset = zipBytes.indexOf(signature, offset + 4)) {
      const nameLength = zipBytes.readUInt16LE(offset + 28);
      if (zipBytes.subarray(offset + 46, offset + 46 + nameLength).toString() === "Import-Blender.command") {
        expect(zipBytes[offset + 5]).toBe(3);
        expect(zipBytes.readUInt32LE(offset + 38) >>> 16).toBe(0o100755);
        foundExecutable = true;
      }
    }
    expect(foundExecutable).toBe(true);
    expect(manifest.frameCount).toBe(312);
    expect(manifest.geometries).toBeUndefined();
    expect(files["scene.json"]!.byteLength).toBeLessThan(1_000_000);
    const last=read("frames/000311.json");
    expect(last.cars).toHaveLength(20);
    expect(last.objects).toHaveLength(40); // 20 cars + 20 marks; zero projected shadows.
    expect(last.camera.fov).toBe(71);
    expect(last.cars.filter((car: any)=>car.braking).map((car: any)=>car.id)).toEqual(["4","9","14","19"]);
    for (const path of Object.values(manifest.resourceFiles.geometries) as string[]) {
      expect(read(path).position.length).toBeLessThanOrEqual(72);
    }
    expect(replay.releaseRenderPreparation).toHaveBeenCalledOnce();
  },30_000);
});
