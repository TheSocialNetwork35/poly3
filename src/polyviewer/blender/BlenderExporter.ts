import { Zip, ZipDeflate, strToU8 } from "fflate";
import type { Scene, PerspectiveCamera } from "three";
import { SceneArchive } from "./SceneArchive";
import importer from "./import_scene.py?raw";
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
  const archive = new SceneArchive();
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
    chunks.push(new Uint8Array(data).buffer);
  });
  function add(name: string, text: string) {
    signal.throwIfAborted();
    const data = strToU8(text);
    sourceBytes += data.byteLength;
    if (sourceBytes > limit) throw new Error("Baked scene exceeds 512 MiB. Export a shorter range or fewer cars.");
    const file = new ZipDeflate(name, { level: 3 });
    zip.add(file);
    file.push(data, true);
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
        add(`frames/${String(frame.index).padStart(6, "0")}.json`, JSON.stringify({ ...snapshot, objects, removed }));
        previousObjects = nextObjects;
        frames++;
      },
    });
    add("scene.json", JSON.stringify({
      version: 1, deltaFrames: true, fps: settings.fps, width: settings.width, height: settings.height,
      startMicroseconds: settings.startMicroseconds, frameCount: frames,
      cameraPoints, geometries: archive.geometries, materials: archive.materials,
      textures: archive.textures, warnings: [...archive.warnings],
    }));
    add("import_scene.py", importer);
    add("README.txt", `PolyViewer Blender scene\n\n1. Extract the entire ZIP into a folder.\n2. In Blender (4.2+), open Scripting, open import_scene.py, then Run Script.\n3. A NEW scene is created; save the result as .blend. Textures are packed.\n\nTransforms and camera FOV are baked at ${settings.fps} FPS. Between sampled frames Blender interpolates linearly. Camera-point source data is stored on the scene.\nCustom game shaders cannot render identically in Cycles. This is not a fluid/volume simulation export.\n\n${[...archive.warnings].join("\n")}\n`);
    zip.end();
    return new Blob(chunks, { type: "application/zip" });
  } finally {
    zip.terminate();
    replay.releaseRenderPreparation();
  }
}
