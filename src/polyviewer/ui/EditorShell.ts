import type { CameraMode, FreeCameraStatus } from "../camera/FreeCameraController";

interface EditorShellOptions {
  onCameraModeChange?: (mode: CameraMode) => void;
}

export class EditorShell {
  readonly element: HTMLElement;
  readonly toggleButton: HTMLButtonElement;
  #status: HTMLElement;
  #modeButtons: HTMLButtonElement[];

  constructor(options: EditorShellOptions = {}) {
    this.element = document.createElement("aside");
    this.element.className = "polyviewer-shell";
    this.element.innerHTML = `
      <div class="polyviewer-title"><span>POLY</span>VIEWER <small>0.6.2</small></div>
      <button class="polyviewer-toggle" type="button">Enable FreeCam <kbd>F6</kbd></button>
      <div class="polyviewer-status" aria-live="polite">Connecting to PolyTrack…</div>
      <div class="polyviewer-camera-modes" aria-label="Camera mode">
        <span>Camera</span>
        <div>
          <button type="button" data-camera-mode="free">Free</button>
          <button type="button" data-camera-mode="fixed">Fixed</button>
          <button type="button" data-camera-mode="follow">Follow</button>
          <button type="button" data-camera-mode="attached">Attached</button>
        </div>
        <small class="polyviewer-camera-target">Target: Main Replay</small>
      </div>
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
    for (const button of this.#modeButtons) {
      button.addEventListener("click", () => {
        const mode = button.dataset.cameraMode as CameraMode | undefined;
        if (mode) options.onCameraModeChange?.(mode);
      });
    }
    document.body.append(this.element);
  }

  update(status: FreeCameraStatus): void {
    this.element.classList.toggle("is-active", status.enabled);
    this.toggleButton.innerHTML = status.enabled
      ? "Disable FreeCam <kbd>F6</kbd>"
      : "Enable FreeCam <kbd>F6</kbd>";
    this.#status.textContent = status.enabled
      ? `${status.pointerLocked ? "Camera captured" : "Click the scene to capture"} · ${status.speed.toFixed(1)} u/s · ${status.fov.toFixed(0)}° FOV`
      : "Connected to the real PolyTrack renderer";
    for (const button of this.#modeButtons) {
      const mode = button.dataset.cameraMode as CameraMode;
      button.classList.toggle("is-selected", mode === status.mode);
      button.disabled = (mode === "follow" || mode === "attached") && !status.targetAvailable;
    }
    const target = this.element.querySelector<HTMLElement>(".polyviewer-camera-target");
    if (target) target.textContent = status.targetAvailable
      ? "Target: Main Replay"
      : "Follow modes need a replay";
  }

  setError(message: string): void {
    this.element.classList.add("has-error");
    this.#status.textContent = message;
    this.toggleButton.disabled = true;
  }
}
