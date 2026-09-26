import { Zip, strToU8 } from "fflate";
import { ReleasingZipDeflate } from "./ReleasingZipDeflate";
import type { Scene, PerspectiveCamera } from "three";
import { snapshotCarLights } from "./CarLights";
import { jsonChunks } from "./JsonChunks";
import { SceneArchive } from "./SceneArchive";
import importer from "./import_scene.py?raw";
import macLauncher from "./Import-Blender.command?raw";
import windowsLauncher from "./Import-Blender.cmd?raw";
import type { DeterministicFrameRenderer, FrameRenderSettings } from "../render/DeterministicFrameRenderer";
import type { ReplayBridge } from "../replay/ReplayBridge";
import type { CameraKeyframe } from "../camera/CameraKeyframeStore";

export async function exportBlender(
  bridge: PolyTrackBridge,
  renderer: DeterministicFrameRenderer,
  replay: ReplayBridge,
  cameraPoints: readonly CameraKeyframe[],
  settings: FrameRenderSettings,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
  onPreparationProgress: (completed: number, total: number) => void,
): Promise<Blob> {
  const resourceFiles = { geometries: {} as Record<string, string>, materials: {} as Record<string, string>, textures: {} as Record<string, string> };
  let resourceIndex = 0;
  const archive = new SceneArchive((kind, key, data) => {
    const path = `resources/${kind}/${resourceIndex++}.json`;
    add(path, jsonChunks(data));
    resourceFiles[kind][key] = path;
  });
  const chunks: BlobPart[] = [];
  let bytes = 0;
  let sourceBytes = 0;
  let frames = 0;
  let previousObjects = new Map<string, string>();
  // Bound memory instead of silently crashing the tab on huge baked effects.
  const limit = 512 * 1024 * 1024;
  const zip = new Zip((error, data) => {
    if (error) throw error;
    bytes += data.byteLength;
    if (bytes > limit) throw new Error("Blender archive exceeds 512 MiB. Export a shorter range.");
    chunks.push(new Blob([new Uint8Array(data).buffer]));
  });
  function add(name: string, parts: string | Iterable<string>, executable = false) {
    signal.throwIfAborted();
    const file = new ReleasingZipDeflate(name);
    if (executable) { file.os = 3; file.attrs = 0o100755 * 65536; }
    zip.add(file);
    for (const part of typeof parts === "string" ? [parts] : parts) {
      signal.throwIfAborted();
      const data = strToU8(part);
      sourceBytes += data.byteLength;
      if (sourceBytes > limit) throw new Error("Blender export exceeds the 512 MiB safety budget. Reduce the range or disable smoke/tire marks, then retry.");
      file.push(data, false);
    }
    file.push(new Uint8Array(), true);
  }
  try {
    await replay.prepareAllForRender(settings, signal, onPreparationProgress);
    await renderer.render({ ...settings, cinematic: false }, {
      signal, captureImage: false, onProgress,
      onFrame(frame) {
        const snapshot = archive.snapshot(bridge.scene as unknown as Scene, bridge.camera as unknown as PerspectiveCamera);
        const nextObjects = new Map<string, string>();
        const objects = snapshot.objects.filter(object => {
          const serialized = JSON.stringify(object);
          nextObjects.set(object.id, serialized);
          return previousObjects.get(object.id) !== serialized;
        });
        const removed = [...previousObjects.keys()].filter(id => !nextObjects.has(id));
        add(`frames/${String(frame.index).padStart(6, "0")}.json`, jsonChunks({ ...snapshot, objects, removed, cars: snapshotCarLights(bridge.replay) }));
        previousObjects = nextObjects;
        frames++;
      },
    });
    add("scene.json", jsonChunks({
      version: 1, carLightsVersion: 2, deltaFrames: true, fps: settings.fps, width: settings.width, height: settings.height,
      startMicroseconds: settings.startMicroseconds, frameCount: frames,
      cameraPoints, resourceFiles, warnings: [...archive.warnings],
    }));
    add("import_scene.py", importer);
    add("Import-Blender.command", macLauncher, true);
    add("Import-Blender.cmd", windowsLauncher.replace(/\r?\n/g, "\r\n"));
    add("README.txt", `PolyViewer Blender scene\n\n1. Extract the entire ZIP into a folder.\n2. Install Blender 4.2+. Double-click Import-Blender.command on macOS or Import-Blender.cmd on Windows. Blender opens and imports automatically. If macOS reports a permission error, open Terminal, type bash followed by a space, drag Import-Blender.command into the window and press Return. If the OS blocks the downloaded script, you can instead open import_scene.py in Blender > Scripting and Run Script.\n3. A NEW scene is created; save the result as .blend. Textures are packed.\n\nTransforms and camera FOV are baked at ${settings.fps} FPS. Between sampled frames Blender interpolates linearly. Camera-point source data is stored on the scene.\nKeep the resources/ folder beside scene.json and frames/. PolyTrack projected shadow meshes are omitted; Blender lights produce real shadows.\nLighting: World Properties > PolyViewer World > Background > Strength starts at 0. Scene sun is in PolyViewer Lighting. Vehicle lamps are in PolyViewer Car Lights: two Headlights and one Brake Light per car. Brake energy is keyed from the recorded brake input. Use Rendered shading, or enable Scene Lights and Scene World in Material Preview. Edit powers near the top of import_scene.py before running.\nCustom game shaders cannot render identically in Cycles. This is not a fluid/volume simulation export.\n\n${[...archive.warnings].join("\n")}\n`);
    zip.end();
    return new Blob(chunks, { type: "application/zip" });
  } finally {
    zip.terminate();
    replay.releaseRenderPreparation();
  }
}
