import type { CameraMode, FreeCameraStatus } from "../camera/FreeCameraController";
import type { CameraKeyframe } from "../camera/CameraKeyframeStore";

interface EditorShellOptions {
  onCameraModeChange?: (mode: CameraMode) => void;
  onAddCameraPoint?: () => void;
  onMoveCameraPoint?: (id: string, timeMicroseconds: number) => void;
  onUpdateCameraPoint?: (id: string) => void;
  onDuplicateCameraPoint?: (id: string) => void;
  onDeleteCameraPoint?: (id: string) => void;
}

export class EditorShell {
  readonly element: HTMLElement;
  readonly toggleButton: HTMLButtonElement;
  #status: HTMLElement;
  #modeButtons: HTMLButtonElement[];
  #pointEditor: HTMLElement;
  #pointTime: HTMLInputElement;
  #selectedPointId: string | null = null;

  constructor(options: EditorShellOptions = {}) {
    this.element = document.createElement("aside");
    this.element.className = "polyviewer-shell";
    this.element.innerHTML = `
      <div class="polyviewer-title"><span>POLY</span>VIEWER <small>0.6.2</small></div>
      <button class="polyviewer-toggle" type="button">Enter PolyViewer <kbd>F6</kbd></button>
      <div class="polyviewer-status" aria-live="polite">Connecting to PolyTrack…</div>
      <div class="polyviewer-camera-modes" aria-label="Camera mode">
        <span>Camera</span>
        <div>
          <button type="button" data-camera-mode="fixed">Fixed</button>
          <button type="button" data-camera-mode="lookAt">Look At</button>
          <button type="button" data-camera-mode="normal">Normal</button>
          <button type="button" data-camera-mode="follow">Follow</button>
          <button type="button" data-camera-mode="attached">Attached</button>
        </div>
        <small class="polyviewer-camera-target">Target: Main Replay</small>
      </div>
      <button class="polyviewer-add-point" type="button">＋ Add Camera Point</button>
      <section class="polyviewer-point-editor" aria-label="Selected Camera Point">
        <strong>Camera Point</strong>
        <label>Time <input type="number" min="0" step="0.001" inputmode="decimal" data-point-time></label>
        <div>
          <button type="button" data-point-action="update">Update</button>
          <button type="button" data-point-action="duplicate">Duplicate</button>
          <button type="button" data-point-action="delete">Delete</button>
        </div>
      </section>
      <details>
        <summary>Camera controls</summary>
        <dl>
          <div><dt>Look</dt><dd>Mouse</dd></div>
          <div><dt>Move</dt><dd>W A S D</dd></div>
          <div><dt>Down / up</dt><dd>Q / E</dd></div>
          <div><dt>Fast / precise</dt><dd>Shift / Alt</dd></div>
          <div><dt>Roll</dt><dd>Z / C</dd></div>
          <div><dt>FOV</dt><dd>[ / ]</dd></div>
          <div><dt>Speed</dt><dd>Mouse wheel</dd></div>
          <div><dt>Add point</dt><dd>K</dd></div>
          <div><dt>Update point</dt><dd>Shift + K</dd></div>
          <div><dt>Delete point</dt><dd>Delete</dd></div>
          <div><dt>Play / pause</dt><dd>Space</dd></div>
        </dl>
      </details>
    `;
    const toggle = this.element.querySelector<HTMLButtonElement>(".polyviewer-toggle");
    const status = this.element.querySelector<HTMLElement>(".polyviewer-status");
    if (!toggle || !status) throw new Error("Failed to construct the PolyViewer editor shell.");
    this.toggleButton = toggle;
    this.#status = status;
    this.#modeButtons = Array.from(
      this.element.querySelectorAll<HTMLButtonElement>("[data-camera-mode]"),
    );
    const pointEditor = this.element.querySelector<HTMLElement>(".polyviewer-point-editor");
    const pointTime = this.element.querySelector<HTMLInputElement>("[data-point-time]");
    if (!pointEditor || !pointTime) throw new Error("Failed to construct Camera Point editor.");
    this.#pointEditor = pointEditor;
    this.#pointTime = pointTime;
    for (const button of this.#modeButtons) {
      button.addEventListener("click", () => {
        const mode = button.dataset.cameraMode as CameraMode | undefined;
        if (mode) options.onCameraModeChange?.(mode);
      });
    }
    this.element.querySelector(".polyviewer-add-point")?.addEventListener(
      "click",
      () => options.onAddCameraPoint?.(),
    );
    pointTime.addEventListener("change", () => {
      if (!this.#selectedPointId) return;
      const seconds = Number.parseFloat(pointTime.value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        options.onMoveCameraPoint?.(this.#selectedPointId, Math.round(seconds * 1_000_000));
      }
    });
    for (const action of ["update", "duplicate", "delete"] as const) {
      this.element.querySelector(`[data-point-action="${action}"]`)?.addEventListener("click", () => {
        if (!this.#selectedPointId) return;
        if (action === "update") options.onUpdateCameraPoint?.(this.#selectedPointId);
        if (action === "duplicate") options.onDuplicateCameraPoint?.(this.#selectedPointId);
        if (action === "delete") options.onDeleteCameraPoint?.(this.#selectedPointId);
      });
    }
    document.body.append(this.element);
  }

  setSelectedCameraPoint(point: CameraKeyframe | null): void {
    this.#selectedPointId = point?.id ?? null;
    this.#pointEditor.classList.toggle("is-visible", point !== null);
    if (point) this.#pointTime.value = (point.timeMicroseconds / 1_000_000).toFixed(3);
  }

  update(status: FreeCameraStatus): void {
    this.element.classList.toggle("is-active", status.enabled);
    this.toggleButton.innerHTML = status.enabled
      ? "Exit PolyViewer <kbd>F6</kbd>"
      : "Enter PolyViewer <kbd>F6</kbd>";
    this.#status.textContent = status.enabled
      ? `${status.pointerLocked ? "Camera captured" : "Click the scene to capture"} · ${status.speed.toFixed(1)} u/s · ${status.fov.toFixed(0)}° FOV`
      : "Connected to the real PolyTrack renderer";
    for (const button of this.#modeButtons) {
      const mode = button.dataset.cameraMode as CameraMode;
      button.classList.toggle("is-selected", mode === status.mode);
      button.disabled = mode === "normal"
        ? !status.nativeCameraAvailable
        : (mode === "lookAt" || mode === "follow" || mode === "attached")
          && !status.targetAvailable;
    }
    const target = this.element.querySelector<HTMLElement>(".polyviewer-camera-target");
    if (target) target.textContent = status.targetAvailable
      ? "Target: Main Replay"
      : "Target modes need a replay";
  }

  setError(message: string): void {
    this.element.classList.add("has-error");
    this.#status.textContent = message;
    this.toggleButton.disabled = true;
  }
}
