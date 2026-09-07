import { CaptureGuard } from "./CaptureGuard";
import type { SceneEvaluator } from "../scene/SceneEvaluator";
import { frameCountForRange, frameTimeMicroseconds } from "./FrameSchedule";

export interface FrameRenderSettings {
  width: number;
  height: number;
  fps: number;
  startMicroseconds: number;
  endMicroseconds: number;
  /** Render PolyTrack's native vehicle shadows. Defaults to true. */
  carShadows?: boolean;
  /** Render PolyTrack's native dust/smoke particle systems. Defaults to true. */
  particles?: boolean;
  /** Build PolyTrack's persistent tire/skid mark geometry. Defaults to true. */
  skidmarks?: boolean;
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
    const guard = new CaptureGuard(this.#renderer.canvas, options.signal);
    try {
      guard.check();
      this.#renderer.polyviewerBeginCapture(settings.width, settings.height, {
        particles: settings.particles !== false,
        skidmarks: settings.skidmarks !== false,
      });
      let lastYield = performance.now();
      if (options.signal?.aborted) throw new DOMException("Rendering cancelled.", "AbortError");
      this.#sceneEvaluator.evaluateRenderFrame(0, false);
      if (settings.startMicroseconds > 0) {
        // Rebuild stateful visuals at the selected output cadence. Each call
        // still visits every exact worker state internally, while the expensive
        // native Car.update runs once per would-be video frame just like normal
        // forward playback. This preserves skid/particle history without doing
        // one complete visual update for every replay millisecond.
        for (let preRollIndex = 1; ; preRollIndex += 1) {
          if (options.signal?.aborted) throw new DOMException("Rendering cancelled.", "AbortError");
          const preRollTimestamp = frameTimeMicroseconds(preRollIndex, 0, settings.fps);
          if (preRollTimestamp >= settings.startMicroseconds) break;
          this.#sceneEvaluator.evaluateRenderFrame(preRollTimestamp, true);
          if (performance.now() - lastYield > 50) {
            await guard.wait(new Promise<void>(resolve => setTimeout(resolve, 0)));
            lastYield = performance.now();
          }
        }
        this.#sceneEvaluator.evaluateRenderFrame(settings.startMicroseconds, true);
      }
      for (let index = 0; index < total; index += 1) {
        if (options.signal?.aborted) throw new DOMException("Rendering cancelled.", "AbortError");
        const timestamp = frameTimeMicroseconds(index, settings.startMicroseconds, settings.fps);
        const nextTimestamp = frameTimeMicroseconds(index + 1, settings.startMicroseconds, settings.fps);
        if (index > 0) this.#sceneEvaluator.evaluateRenderFrame(timestamp, true);
        guard.check();
        this.#renderer.polyviewerRenderFrame(settings.carShadows !== false);
        guard.check();
        const image = options.captureImage === false
          ? undefined
          : await guard.wait(canvasToBlob(this.#renderer.canvas));
        await guard.wait(Promise.resolve(options.onFrame({
          index,
          total,
          timestampMicroseconds: timestamp,
          durationMicroseconds: Math.min(nextTimestamp, settings.endMicroseconds) - timestamp,
          image,
        })));
        await guard.wait(new Promise<void>(resolve => setTimeout(resolve, 0)));
        options.onProgress?.(index + 1, total);
      }
    } finally {
      guard.dispose();
      try {
        this.#renderer.polyviewerEndCapture();
      } finally {
        this.#sceneEvaluator.restoreEditorState(editorState);
      }
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
