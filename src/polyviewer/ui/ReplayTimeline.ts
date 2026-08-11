import type { ReplayBridgeStatus } from "../replay/ReplayBridge";
import type { CameraKeyframe } from "../camera/CameraKeyframeStore";
import { normalizeCameraMode, type CameraMode } from "../camera/FreeCameraController";

interface ReplayTimelineActions {
  onTogglePlayback: () => void;
  onRestart: () => void;
  onStep: (deltaMicroseconds: number) => void;
  onSeek: (timeMicroseconds: number) => void;
  onSelectCameraPoint: (id: string) => void;
  onMoveCameraPoint: (id: string, timeMicroseconds: number) => void;
}

const MICROSECONDS_PER_FRAME = 1_000;

export class ReplayTimeline {
  readonly element: HTMLElement;
  #playButton: HTMLButtonElement;
  #scrubber: HTMLInputElement;
  #time: HTMLElement;
  #loadStatus: HTMLElement;
  #markers: HTMLElement;
  #segments: HTMLElement;
  #dragging = false;
  #durationMicroseconds = 0;
  #selectedCameraPointId: string | null = null;
  #pointElements = new Map<string, HTMLButtonElement>();
  #actions: ReplayTimelineActions;

  constructor(actions: ReplayTimelineActions) {
    this.#actions = actions;
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
        <div class="polyviewer-camera-segments" aria-hidden="true"></div>
        <div class="polyviewer-keyframe-track" aria-label="Camera points"></div>
      </div>
      <div class="polyviewer-load-status">Open a replay, then press F1</div>
    `;
    const playButton = this.element.querySelector<HTMLButtonElement>('[data-action="play"]');
    const scrubber = this.element.querySelector<HTMLInputElement>(".polyviewer-scrubber");
    const time = this.element.querySelector<HTMLElement>(".polyviewer-time");
    const loadStatus = this.element.querySelector<HTMLElement>(".polyviewer-load-status");
    const markers = this.element.querySelector<HTMLElement>(".polyviewer-keyframe-track");
    const segments = this.element.querySelector<HTMLElement>(".polyviewer-camera-segments");
    if (!playButton || !scrubber || !time || !loadStatus || !markers || !segments) {
      throw new Error("Failed to construct the PolyViewer replay timeline.");
    }
    this.#playButton = playButton;
    this.#scrubber = scrubber;
    this.#time = time;
    this.#loadStatus = loadStatus;
    this.#markers = markers;
    this.#segments = segments;

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
    this.#renderModeSegments(points);
    const liveIds = new Set(points.map((point) => point.id));
    for (const [id, marker] of this.#pointElements) {
      if (!liveIds.has(id)) {
        marker.remove();
        this.#pointElements.delete(id);
      }
    }
    for (const point of points) {
      let marker = this.#pointElements.get(point.id);
      if (!marker) {
        marker = this.#createCameraPointMarker(point.id, point.timeMicroseconds);
        this.#pointElements.set(point.id, marker);
        this.#markers.append(marker);
      }
      marker.title = `Camera point at ${formatTime(point.timeMicroseconds)}`;
      const duration = Math.max(1, this.#durationMicroseconds);
      marker.style.left = `${Math.max(0, Math.min(100, point.timeMicroseconds / duration * 100))}%`;
      marker.dataset.timeMicroseconds = point.timeMicroseconds.toString();
      const mode = normalizeCameraMode(point.state.mode);
      marker.dataset.cameraMode = mode;
      marker.style.setProperty("--pv-camera-color", cameraModeColor(mode));
      marker.setAttribute("aria-label", `${cameraModeLabel(mode)} camera point at ${formatTime(point.timeMicroseconds)}`);
      marker.classList.toggle("is-selected", point.id === this.#selectedCameraPointId);
    }
  }

  #renderModeSegments(points: readonly CameraKeyframe[]): void {
    const duration = Math.max(1, this.#durationMicroseconds);
    const segments: HTMLElement[] = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]!;
      const end = points[index + 1]!;
      const startMode = normalizeCameraMode(start.state.mode);
      const endMode = normalizeCameraMode(end.state.mode);
      const segment = document.createElement("span");
      segment.style.left = `${Math.max(0, Math.min(100, start.timeMicroseconds / duration * 100))}%`;
      segment.style.width = `${Math.max(0, (end.timeMicroseconds - start.timeMicroseconds) / duration * 100)}%`;
      segment.style.background = startMode === endMode
        ? cameraModeColor(startMode)
        : `linear-gradient(90deg, ${cameraModeColor(startMode)}, ${cameraModeColor(endMode)})`;
      segment.title = startMode === endMode
        ? cameraModeLabel(startMode)
        : `${cameraModeLabel(startMode)} → ${cameraModeLabel(endMode)} smooth transition`;
      segments.push(segment);
    }
    this.#segments.replaceChildren(...segments);
  }

  setSelectedCameraPoint(id: string | null): void {
    this.#selectedCameraPointId = id;
    for (const [pointId, marker] of this.#pointElements) {
      marker.classList.toggle("is-selected", pointId === id);
    }
  }

  #createCameraPointMarker(id: string, initialTimeMicroseconds: number): HTMLButtonElement {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "polyviewer-keyframe-marker";
    marker.dataset.cameraPointId = id;
    marker.dataset.timeMicroseconds = initialTimeMicroseconds.toString();
    marker.addEventListener("click", () => this.#actions.onSelectCameraPoint(id));
    marker.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      const startTime = Number.parseInt(marker.dataset.timeMicroseconds ?? "0", 10);
      let moved = false;
      marker.setPointerCapture(event.pointerId);
      const onMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        if (!moved && Math.abs(deltaX) < 4) return;
        moved = true;
        const width = this.#markers.getBoundingClientRect().width;
        this.#actions.onMoveCameraPoint(
          id,
          calculateDraggedCameraPointTime(
            startTime,
            deltaX,
            width,
            this.#durationMicroseconds,
          ),
        );
      };
      const onEnd = () => {
        marker.removeEventListener("pointermove", onMove);
        marker.removeEventListener("pointerup", onEnd);
        marker.removeEventListener("pointercancel", onEnd);
        this.#actions.onSelectCameraPoint(id);
      };
      marker.addEventListener("pointermove", onMove);
      marker.addEventListener("pointerup", onEnd);
      marker.addEventListener("pointercancel", onEnd);
      event.preventDefault();
    });
    return marker;
  }
}

export function cameraModeColor(mode: CameraMode): string {
  return {
    fixed: "#4b7dff",
    lookAt: "#ffbf47",
    normal: "#49d17d",
    follow: "#b06cff",
    attached: "#ff5e72",
  }[mode];
}

function cameraModeLabel(mode: CameraMode): string {
  return mode === "lookAt" ? "Look At" : mode[0]!.toUpperCase() + mode.slice(1);
}

export function calculateDraggedCameraPointTime(
  startTimeMicroseconds: number,
  deltaPixels: number,
  trackWidthPixels: number,
  durationMicroseconds: number,
): number {
  if (!Number.isFinite(trackWidthPixels) || trackWidthPixels <= 0) return startTimeMicroseconds;
  const next = Math.round(
    startTimeMicroseconds + deltaPixels / trackWidthPixels * durationMicroseconds,
  );
  return Math.max(0, Math.min(durationMicroseconds, next));
}

function formatTime(microseconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(microseconds / 1_000));
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const seconds = Math.floor(totalMilliseconds / 1_000) % 60;
  const milliseconds = totalMilliseconds % 1_000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}
