import type { SceneEvaluator } from "../scene/SceneEvaluator";
import { frameCountForRange, frameTimeMicroseconds } from "./FrameSchedule";

export interface FrameRenderSettings {
  width: number;
  height: number;
  fps: number;
  startMicroseconds: number;
  endMicroseconds: number;
}

export interface RenderedFrame {
  index: number;
  total: number;
  timestampMicroseconds: number;
  durationMicroseconds: number;
  image?: Blob;
}

export interface FrameRenderOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  onFrame: (frame: RenderedFrame) => void | Promise<void>;
  captureImage?: boolean;
}

export class DeterministicFrameRenderer {
  #renderer: PolyTrackRenderer;
  #sceneEvaluator: SceneEvaluator;

  constructor(renderer: PolyTrackRenderer, sceneEvaluator: SceneEvaluator) {
    this.#renderer = renderer;
    this.#sceneEvaluator = sceneEvaluator;
  }

  async render(settings: FrameRenderSettings, options: FrameRenderOptions): Promise<void> {
    validateSettings(settings);
    const total = frameCountForRange(
      settings.startMicroseconds,
      settings.endMicroseconds,
      settings.fps,
    );
    const editorState = this.#sceneEvaluator.captureEditorState();
    this.#renderer.polyviewerBeginCapture(settings.width, settings.height);
    try {
      if (options.signal?.aborted) throw new DOMException("Rendering cancelled.", "AbortError");
      this.#sceneEvaluator.evaluateRenderFrame(0, false);
      if (settings.startMicroseconds > 0) {
        this.#sceneEvaluator.evaluateRenderFrame(settings.startMicroseconds, true);
      }
      for (let index = 0; index < total; index += 1) {
        if (options.signal?.aborted) throw new DOMException("Rendering cancelled.", "AbortError");
        const timestamp = frameTimeMicroseconds(index, settings.startMicroseconds, settings.fps);
        const nextTimestamp = frameTimeMicroseconds(index + 1, settings.startMicroseconds, settings.fps);
        if (index > 0) this.#sceneEvaluator.evaluateRenderFrame(timestamp, true);
        this.#renderer.polyviewerRenderFrame();
        const image = options.captureImage === false
          ? undefined
          : await canvasToBlob(this.#renderer.canvas);
        await options.onFrame({
          index,
          total,
          timestampMicroseconds: timestamp,
          durationMicroseconds: Math.min(nextTimestamp, settings.endMicroseconds) - timestamp,
          image,
        });
        options.onProgress?.(index + 1, total);
      }
    } finally {
      this.#renderer.polyviewerEndCapture();
      this.#sceneEvaluator.restoreEditorState(editorState);
    }
  }
}

function validateSettings(settings: FrameRenderSettings): void {
  if (!Number.isSafeInteger(settings.width) || !Number.isSafeInteger(settings.height)
    || settings.width <= 0 || settings.height <= 0) {
    throw new RangeError("Render dimensions must be positive safe integers.");
  }
  frameCountForRange(settings.startMicroseconds, settings.endMicroseconds, settings.fps);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PolyTrack canvas frame capture failed."));
    }, "image/png");
  });
}
