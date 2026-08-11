import type { FrameRenderSettings } from "../render/DeterministicFrameRenderer";
import type { VideoExportResult } from "../render/VideoExporter";

interface RenderPanelOptions {
  onRender: (
    settings: FrameRenderSettings,
    signal: AbortSignal,
    onProgress: (completed: number, total: number) => void,
    onAudioProgress: (elapsedMicroseconds: number, durationMicroseconds: number) => void,
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

  constructor(options: RenderPanelOptions) {
    this.element = document.createElement("dialog");
    this.element.className = "polyviewer-render-dialog";
    this.element.innerHTML = `
      <form method="dialog">
        <strong>Render Video</strong>
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
        <p class="polyviewer-render-status" aria-live="polite">Ready to render.</p>
        <progress max="1" value="0"></progress>
        <div>
          <button type="button" data-render-cancel>Cancel</button>
          <button type="submit" data-render-submit>Render Video</button>
        </div>
      </form>
    `;
    const status = this.element.querySelector<HTMLElement>(".polyviewer-render-status");
    const submit = this.element.querySelector<HTMLButtonElement>("[data-render-submit]");
    if (!status || !submit) throw new Error("Failed to construct Render panel.");
    this.#status = status;
    this.#submit = submit;
    this.element.querySelector("[data-render-cancel]")?.addEventListener("click", () => {
      if (this.#controller) this.#controller.abort();
      else this.element.close();
    });
    this.element.querySelector("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#start(options);
    });
    document.body.append(this.element);
  }

  open(durationMicroseconds: number): void {
    if (this.#controller) return;
    this.#durationMicroseconds = durationMicroseconds;
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
    if (!resolution || (fps !== 30 && fps !== 60)) {
      this.#status.textContent = "Choose a valid resolution and FPS.";
      return;
    }
    this.#controller = new AbortController();
    this.#submit.disabled = true;
    try {
      const result = await options.onRender({
        width: resolution[0],
        height: resolution[1],
        fps,
        startMicroseconds: 0,
        endMicroseconds: this.#durationMicroseconds,
      }, this.#controller.signal,
      (completed, total) => this.#progress(completed, total),
      (elapsed, duration) => {
        this.#status.textContent = `Recording real PolyTrack sound at 1.0× · ${Math.round(elapsed / 1_000_000)} / ${Math.round(duration / 1_000_000)}s`;
      });
      downloadVideo(result);
      this.#status.textContent = `Video ready · ${result.codec.toUpperCase()} MP4 · ${result.hasAudio ? "with PolyTrack sound" : "video only (audio unavailable)"}`;
    } catch (error) {
      this.#status.textContent = error instanceof DOMException && error.name === "AbortError"
        ? "Rendering cancelled."
        : error instanceof Error ? error.message : "Video rendering failed.";
    } finally {
      this.#controller = null;
      this.#submit.disabled = false;
    }
  }

  #progress(completed: number, total: number): void {
    const progress = this.element.querySelector<HTMLProgressElement>("progress");
    if (progress) {
      progress.max = Math.max(1, total);
      progress.value = completed;
    }
    if (completed > 0) {
      this.#status.textContent = `Rendering ${completed} / ${total} · ${Math.round(completed / total * 100)}%`;
    }
  }
}

function downloadVideo(result: VideoExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `polyviewer-${stamp}.${result.extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
