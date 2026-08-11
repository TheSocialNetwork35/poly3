import type { ReplayBridgeStatus } from "../replay/ReplayBridge";
import type { CameraKeyframe } from "../camera/CameraKeyframeStore";

interface ReplayTimelineActions {
  onTogglePlayback: () => void;
  onRestart: () => void;
  onStep: (deltaMicroseconds: number) => void;
  onSeek: (timeMicroseconds: number) => void;
}

const MICROSECONDS_PER_FRAME = 1_000;

export class ReplayTimeline {
  readonly element: HTMLElement;
  #playButton: HTMLButtonElement;
  #scrubber: HTMLInputElement;
  #time: HTMLElement;
  #loadStatus: HTMLElement;
  #markers: HTMLElement;
  #dragging = false;
  #durationMicroseconds = 0;

  constructor(actions: ReplayTimelineActions) {
    this.element = document.createElement("section");
    this.element.className = "polyviewer-timeline";
    this.element.setAttribute("aria-label", "PolyViewer replay timeline");
    this.element.innerHTML = `
      <div class="polyviewer-transport">
        <button type="button" data-action="restart" title="Restart replay">↺</button>
        <button type="button" data-action="step-back" title="Step backward">‹</button>
        <button class="polyviewer-play" type="button" data-action="play" title="Play replay">▶</button>
        <button type="button" data-action="step-forward" title="Step forward">›</button>
      </div>
      <div class="polyviewer-time">00:00.000 / 00:00.000</div>
      <div class="polyviewer-scrubber-wrap">
        <input class="polyviewer-scrubber" type="range" min="0" max="0" step="1" value="0" aria-label="Replay time">
        <div class="polyviewer-keyframe-track" aria-label="Camera points"></div>
      </div>
      <div class="polyviewer-load-status">Open a replay, then press F6</div>
    `;
    const playButton = this.element.querySelector<HTMLButtonElement>('[data-action="play"]');
    const scrubber = this.element.querySelector<HTMLInputElement>(".polyviewer-scrubber");
    const time = this.element.querySelector<HTMLElement>(".polyviewer-time");
    const loadStatus = this.element.querySelector<HTMLElement>(".polyviewer-load-status");
    const markers = this.element.querySelector<HTMLElement>(".polyviewer-keyframe-track");
    if (!playButton || !scrubber || !time || !loadStatus || !markers) {
      throw new Error("Failed to construct the PolyViewer replay timeline.");
    }
    this.#playButton = playButton;
    this.#scrubber = scrubber;
    this.#time = time;
    this.#loadStatus = loadStatus;
    this.#markers = markers;

    this.element.querySelector('[data-action="restart"]')?.addEventListener("click", actions.onRestart);
    this.element.querySelector('[data-action="step-back"]')?.addEventListener("click", () => actions.onStep(-16_000));
    playButton.addEventListener("click", actions.onTogglePlayback);
    this.element.querySelector('[data-action="step-forward"]')?.addEventListener("click", () => actions.onStep(16_000));
    scrubber.addEventListener("pointerdown", () => { this.#dragging = true; });
    scrubber.addEventListener("pointerup", () => { this.#dragging = false; });
    scrubber.addEventListener("input", () => {
      actions.onSeek(Number.parseInt(scrubber.value, 10) * MICROSECONDS_PER_FRAME);
    });
    document.body.append(this.element);
  }

  update(status: ReplayBridgeStatus): void {
    this.element.classList.toggle("is-visible", status.active);
    this.element.classList.toggle("is-connected", status.connected);
    this.#playButton.textContent = status.playing ? "Ⅱ" : "▶";
    this.#playButton.title = status.playing ? "Pause replay" : "Play replay";

    const durationFrames = Math.round(status.durationMicroseconds / MICROSECONDS_PER_FRAME);
    this.#durationMicroseconds = status.durationMicroseconds;
    const timeFrames = Math.round(status.timeMicroseconds / MICROSECONDS_PER_FRAME);
    this.#scrubber.max = Math.max(0, durationFrames).toString();
    if (!this.#dragging) this.#scrubber.value = Math.min(timeFrames, durationFrames).toString();
    this.#scrubber.disabled = !status.connected;
    this.#time.textContent = `${formatTime(status.timeMicroseconds)} / ${formatTime(status.durationMicroseconds)}`;

    if (!status.connected) {
      this.#loadStatus.textContent = "Open a finished run with Watch to edit its real replay";
    } else if (status.loadedMicroseconds < status.durationMicroseconds) {
      const percent = status.durationMicroseconds === 0
        ? 0
        : Math.floor(status.loadedMicroseconds / status.durationMicroseconds * 100);
      this.#loadStatus.textContent = `Preparing real replay ${Math.max(0, Math.min(100, percent))}%`;
    } else {
      this.#loadStatus.textContent = "Real PolyTrack replay connected";
    }
  }

  setCameraPoints(points: readonly CameraKeyframe[]): void {
    this.#markers.replaceChildren(...points.map((point) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "polyviewer-keyframe-marker";
      marker.title = `Camera point at ${formatTime(point.timeMicroseconds)}`;
      const duration = Math.max(1, this.#durationMicroseconds);
      marker.style.left = `${Math.max(0, Math.min(100, point.timeMicroseconds / duration * 100))}%`;
      marker.dataset.cameraPointId = point.id;
      return marker;
    }));
  }
}

function formatTime(microseconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(microseconds / 1_000));
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const seconds = Math.floor(totalMilliseconds / 1_000) % 60;
  const milliseconds = totalMilliseconds % 1_000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}
