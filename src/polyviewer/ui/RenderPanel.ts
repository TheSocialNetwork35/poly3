import type { FrameRenderSettings } from "../render/DeterministicFrameRenderer";
import type { VideoExportResult } from "../render/VideoExporter";

export interface RenderPanelOptions {
  onStill?: (settings: FrameRenderSettings, signal: AbortSignal, onProgress: (completed: number, total: number) => void) => Promise<Blob>;
  onBlender?: (settings: FrameRenderSettings, signal: AbortSignal, onProgress: (completed: number, total: number) => void, onPreparationProgress: (completed: number, total: number) => void) => Promise<Blob>;
  onRender: (
    settings: FrameRenderSettings,
    signal: AbortSignal,
    includeAudio: boolean,
    onProgress: (completed: number, total: number) => void,
    onPreparationProgress: (completed: number, total: number) => void,
    onAudioProgress: (elapsedMicroseconds: number, durationMicroseconds: number) => void,
    onAudioWarning: (message: string) => void,
  ) => Promise<VideoExportResult>;
}

const RESOLUTIONS = {
  "1080p": [1920, 1080],
  "1440p": [2560, 1440],
  "4K": [3840, 2160],
} as const;

export class RenderPanel {
  readonly element: HTMLDialogElement;
  #durationMicroseconds = 0;
  #controller: AbortController | null = null;
  #status: HTMLElement;
  #submit: HTMLButtonElement;
  #preparationStartedAt = 0;
  #availableWorkers = Math.max(1, navigator.hardwareConcurrency || 2);

  constructor(options: RenderPanelOptions) {
    this.element = document.createElement("dialog");
    this.element.className = "polyviewer-render-dialog";
    this.element.innerHTML = `
      <form method="dialog">
        <strong>Capture & Export</strong>
        <label>Output<select name="output"><option value="video">Video (MP4)</option><option value="still">Still image (PNG)</option><option value="blender">Blender scene (ZIP + importer)</option></select></label>
        <label>Resolution
          <select name="resolution">
            <option value="1080p">1080p</option>
            <option value="1440p">1440p</option>
            <option value="4K">4K</option>
          </select>
        </label>
        <label>FPS
          <select name="fps"><option>30</option><option selected>60</option></select>
        </label>
        <label>Start time (seconds)<input name="start" type="number" min="0" step="0.001" required></label>
        <label data-render-end>End time (seconds)<input name="end" type="number" min="0" step="0.001" required></label>
        <label class="polyviewer-render-workers">CPU workers for preparation
          <select name="workers" aria-describedby="polyviewer-workers-help">
            <option value="0">Automatic (${Math.max(1, Math.min(4, this.#availableWorkers - 1))} workers)</option>
            ${Array.from({ length: this.#availableWorkers }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}
          </select>
        </label>
        <p id="polyviewer-workers-help" class="polyviewer-render-help">More workers can prepare cars faster, but use more memory. ${this.#availableWorkers} logical CPU cores reported by your browser.</p>
        <label class="polyviewer-render-option"><input name="cinematic" type="checkbox"> Cinematic shader · contact shadows, bloom, filmic light</label>
        <p class="polyviewer-render-help" data-output-help>Cinematic lighting applies only to exported PNGs and videos. Normal navigation stays unchanged.</p>
        <label class="polyviewer-render-option"><input name="shadows" type="checkbox" checked> Scene and car shadows</label>
        <label class="polyviewer-render-option"><input name="particles" type="checkbox" checked> Particles (dust and smoke)</label>
        <label class="polyviewer-render-option"><input name="skidmarks" type="checkbox" checked> Tire marks</label>
        <label class="polyviewer-render-option"><input name="audio" type="checkbox" checked> Include real PolyTrack sound (adds a 1.0× audio pass)</label>
        <p class="polyviewer-render-status" aria-live="polite">Ready to render.</p>
        <progress max="1" value="0"></progress>
        <div>
          <button type="button" data-render-cancel>Cancel</button>
          <button type="submit" data-render-submit>Capture / Export</button>
        </div>
      </form>
    `;
    const status = this.element.querySelector<HTMLElement>(".polyviewer-render-status");
    const submit = this.element.querySelector<HTMLButtonElement>("[data-render-submit]");
    if (!status || !submit) throw new Error("Failed to construct Render panel.");
    this.#status = status;
    this.#submit = submit;
    const workers = this.element.querySelector<HTMLSelectElement>('[name="workers"]');
    if (workers) {
      try {
        const saved = Number(localStorage.getItem("polyviewer.simulationWorkers") ?? 0);
        if (Number.isSafeInteger(saved) && saved >= 0 && saved <= this.#availableWorkers) workers.value = String(saved);
      } catch { /* Storage can be unavailable in private sessions. */ }
    }
    this.element.addEventListener("cancel", (event) => {
      if (this.#controller) { event.preventDefault(); this.#controller.abort(); }
    });
    this.element.querySelector("[data-render-cancel]")?.addEventListener("click", () => {
      if (this.#controller) this.#controller.abort();
      else this.element.close();
    });
    this.element.querySelector("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#start(options);
    });
    this.element.querySelector('[name="output"]')?.addEventListener("change", () => this.#updateOutput());
    this.#updateOutput();
    document.body.append(this.element);
  }

  open(durationMicroseconds: number): void {
    if (this.#controller) return;
    this.#durationMicroseconds = durationMicroseconds;
    const start = this.element.querySelector<HTMLInputElement>('[name="start"]');
    const end = this.element.querySelector<HTMLInputElement>('[name="end"]');
    if (start) start.value = "0.000";
    if (end) end.value = (durationMicroseconds / 1_000_000).toFixed(3);
    this.#status.textContent = "Ready to render.";
    this.#progress(0, 1);
    this.element.showModal();
  }

  async #start(options: RenderPanelOptions): Promise<void> {
    if (this.#controller) return;
    if (this.#durationMicroseconds <= 0) {
      this.#status.textContent = "Open a replay with a non-zero duration first.";
      return;
    }
    const form = this.element.querySelector("form") as HTMLFormElement;
    const data = new FormData(form);
    const resolutionName = String(data.get("resolution")) as keyof typeof RESOLUTIONS;
    const resolution = RESOLUTIONS[resolutionName];
    const fps = Number(data.get("fps"));
    const simulationWorkers = Number(data.get("workers"));
    const startMicroseconds = Math.round(Number(data.get("start")) * 1_000_000);
    const still = data.get("output") === "still";
    const endMicroseconds = still ? this.#durationMicroseconds : Math.round(Number(data.get("end")) * 1_000_000);
    const blender = data.get("output") === "blender";
    const cinematic = data.get("cinematic") === "on";
    const includeAudio = data.get("audio") === "on";
    const carShadows = data.get("shadows") === "on";
    const particles = data.get("particles") === "on";
    const skidmarks = data.get("skidmarks") === "on";
    if (!resolution || (fps !== 30 && fps !== 60)) {
      this.#status.textContent = "Choose a valid resolution and FPS.";
      return;
    }
    if (!Number.isSafeInteger(startMicroseconds) || !Number.isSafeInteger(endMicroseconds)
      || startMicroseconds < 0 || startMicroseconds >= endMicroseconds
      || endMicroseconds > this.#durationMicroseconds) {
      this.#status.textContent = "Choose a valid range inside the replay (Start must be before End).";
      return;
    }
    if (!Number.isSafeInteger(simulationWorkers) || simulationWorkers < 0 || simulationWorkers > this.#availableWorkers) {
      this.#status.textContent = "Choose a valid number of preparation workers.";
      return;
    }
    try { localStorage.setItem("polyviewer.simulationWorkers", String(simulationWorkers)); } catch { /* Optional preference. */ }
    this.#controller = new AbortController();
    this.#preparationStartedAt = performance.now();
    this.#submit.disabled = true;
    const inputs = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")];
    inputs.forEach(input => { input.disabled = true; });
    try {
      const settings: FrameRenderSettings = {
        width: resolution[0],
        height: resolution[1],
        fps,
        simulationWorkers,
        startMicroseconds,
        endMicroseconds,
        carShadows,
        particles,
        skidmarks,
        ...(cinematic ? { cinematic: true } : {}),
      };
      if (still) {
        if (!options.onStill) throw new Error("Still capture is unavailable.");
        const blob = await options.onStill(settings, this.#controller.signal,
          (completed, total) => this.#preparationProgress(completed, total));
        downloadBlob(blob, "png");
        this.#status.textContent = "Shot ready · PNG at the selected Start time.";
        return;
      }
      if (blender) {
        if (!options.onBlender) throw new Error("Blender export is unavailable.");
        const blob = await options.onBlender(settings, this.#controller.signal,
          (completed, total) => this.#progress(completed, total, "Baking Blender scene"),
          (completed, total) => this.#preparationProgress(completed, total));
        downloadBlob(blob, "zip");
        this.#status.textContent = "Blender archive ready. Extract ZIP, then run import_scene.py in Blender. See README.txt for fidelity notes.";
        return;
      }
      const result = await options.onRender(settings, this.#controller.signal, includeAudio,
      (completed, total) => this.#progress(completed, total),
      (completed, total) => {
        this.#preparationProgress(completed, total);
      },
      (elapsed, duration) => {
        this.#status.textContent = `Recording real PolyTrack sound at 1.0× · ${Math.round(elapsed / 1_000_000)} / ${Math.round(duration / 1_000_000)}s`;
      },
      (message) => {
        this.#status.textContent = `${message} Continuing with video only…`;
      });
      downloadVideo(result);
      this.#status.textContent = `Video ready · ${result.codec.toUpperCase()} MP4 · ${result.hasAudio ? "with PolyTrack sound" : "video only (audio unavailable)"}`;
    } catch (error) {
      this.#status.textContent = error instanceof DOMException && error.name === "AbortError"
        ? "Rendering cancelled."
        : error instanceof Error ? error.message : "Video rendering failed.";
    } finally {
      this.#controller = null;
      this.#preparationStartedAt = 0;
      this.#submit.disabled = false;
      inputs.forEach(input => { input.disabled = false; });
      this.#updateOutput();
    }
  }

  #updateOutput(): void {
    const output = this.element.querySelector<HTMLSelectElement>('[name="output"]')?.value;
    const audio = this.element.querySelector<HTMLInputElement>('[name="audio"]');
    const cinematic = this.element.querySelector<HTMLInputElement>('[name="cinematic"]');
    const help = this.element.querySelector<HTMLElement>('[data-output-help]');
    if (help) help.textContent = output === "blender"
      ? "Exports the scene and sampled animation. Extract the ZIP, then run import_scene.py in Blender. Materials, lighting and sky may look different. Smoke remains animated cards."
      : output === "still" ? "Captures the selected Start time as a PNG. Cinematic lighting applies only to the shot; normal navigation stays unchanged."
      : "Cinematic lighting applies only to the exported video. Normal navigation stays unchanged.";
    const end = this.element.querySelector<HTMLElement>('[data-render-end]');
    if (end) end.style.display = output === "still" ? "none" : "";
    const endInput = end?.querySelector<HTMLInputElement>("input");
    if (endInput) endInput.disabled = output === "still";
    if (audio) audio.disabled = output !== "video";
    if (cinematic) cinematic.disabled = output === "blender";
    this.#submit.textContent = output === "blender" ? "Export Blender scene" : output === "still" ? "Capture PNG" : "Render Video";
  }

  #progress(completed: number, total: number, label = "Rendering"): void {
    const progress = this.element.querySelector<HTMLProgressElement>("progress");
    if (progress) {
      progress.max = Math.max(1, total);
      progress.value = completed;
    }
    if (completed > 0 || label !== "Rendering") {
      this.#status.textContent = `${label} ${completed} / ${total} · ${Math.round(completed / total * 100)}%`;
    }
  }

  #preparationProgress(completed: number, total: number): void {
    this.#progress(completed, total, "Preparing replay cars");
    if (completed <= 0 || completed >= total || this.#preparationStartedAt <= 0) return;
    const elapsed = performance.now() - this.#preparationStartedAt;
    const remaining = elapsed / completed * (total - completed);
    this.#status.textContent += ` · about ${formatDuration(remaining)} left`;
  }
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function downloadVideo(result: VideoExportResult): void {
  downloadBlob(result.blob, result.extension);
}

function downloadBlob(blob: Blob, extension: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `polyviewer-${stamp}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
