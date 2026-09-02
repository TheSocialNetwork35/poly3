import type { CameraMode, FreeCameraStatus } from "../camera/FreeCameraController";
import type { CameraKeyframe } from "../camera/CameraKeyframeStore";
import { MAX_REPLAY_CARS } from "../replay/ReplayBridge";
import type { ReplayImportProgress } from "../replay/ReplayBridge";

interface EditorShellOptions {
  onCameraModeChange?: (mode: CameraMode) => void;
  onAddCameraPoint?: () => void;
  onMoveCameraPoint?: (id: string, timeMicroseconds: number) => void;
  onUpdateCameraPoint?: (id: string) => void;
  onDuplicateCameraPoint?: (id: string) => void;
  onDeleteCameraPoint?: (id: string) => void;
  onAddReplay?: (recordingString: string, name?: string) => void;
  onAddReplays?: (
    recordingsValue: string,
    leaderboardValue?: string,
    onProgress?: (progress: ReplayImportProgress) => void,
  ) => void | Promise<unknown>;
  onTargetReplayChange?: (id: string) => void;
  onReplayNameChange?: (id: string, name: string) => void;
  onReplayVisibilityChange?: (id: string, visible: boolean) => void;
  onReplayOpacityChange?: (id: string, opacity: number) => void;
  onReplayMasterOpacityChange?: (opacity: number) => void;
  onReplayNameTagVisibilityChange?: (id: string, visible: boolean) => void;
  onRemoveReplay?: (id: string) => void;
  onToggleCleanPreview?: () => void;
  onOpenRender?: () => void;
  onResetCamera?: () => void;
}

export class EditorShell {
  readonly element: HTMLElement;
  readonly toggleButton: HTMLButtonElement;
  #status: HTMLElement;
  #modeButtons: HTMLButtonElement[];
  #pointEditor: HTMLElement;
  #pointTime: HTMLInputElement;
  #selectedPointId: string | null = null;
  #addReplayButton: HTMLButtonElement;
  #replayCount: HTMLElement;
  #replayDialog: HTMLDialogElement;
  #targetSelect: HTMLSelectElement;
  #replayList: HTMLElement;
  #replaySearch: HTMLInputElement;
  #masterOpacity: HTMLInputElement;
  #masterOpacityValue: HTMLOutputElement;
  #masterOpacityFrame = 0;
  #applyingMasterOpacity = false;
  #replays: PolyViewerReplaySummary[] = [];
  #cleanPreviewButton: HTMLButtonElement;
  #renderButton: HTMLButtonElement;
  #shortcutSheet: HTMLElement;
  #rightStack: HTMLElement;
  #replayPanel: HTMLElement;
  #replayDetails: HTMLDetailsElement;
  #performanceStatus: HTMLElement;
  #performanceSignature = "";
  #targetSignature = "";
  #replayListFrame = 0;

  constructor(options: EditorShellOptions = {}) {
    this.element = document.createElement("aside");
    this.element.className = "polyviewer-shell";
    this.element.innerHTML = `
      <div class="polyviewer-title"><span>POLY</span>VIEWER <small>0.6.2</small></div>
      <button class="polyviewer-toggle" type="button">Enter PolyViewer <kbd>F1</kbd></button>
      <button class="polyviewer-clean-preview-button" type="button">Clean Preview <kbd>F8</kbd></button>
      <button class="polyviewer-render-button" type="button">Render</button>
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
      </div>
      <button class="polyviewer-reset-camera" type="button">Reset Camera to Normal <kbd>R</kbd></button>
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
    `;
    this.#rightStack = document.createElement("div");
    this.#rightStack.className = "polyviewer-right-stack";
    this.#replayPanel = document.createElement("aside");
    this.#replayPanel.className = "polyviewer-replay-panel";
    this.#replayPanel.innerHTML = `
      <details>
        <summary><span>Replays</span><span class="polyviewer-replay-count">0 runs</span></summary>
        <div class="polyviewer-replay-panel-content">
          <div class="polyviewer-replays">
            <span>Replay players</span>
            <button class="polyviewer-add-replay" type="button">＋ Add Replay</button>
          </div>
          <p class="polyviewer-replay-performance" aria-live="polite">Full quality · lossless replay cache</p>
          <label class="polyviewer-camera-target">Camera target <select data-camera-target></select></label>
          <div class="polyviewer-master-opacity">
            <div><strong>All cars opacity</strong><output>100%</output></div>
            <input data-replay-master-opacity type="range" min="0" max="100" step="1" value="100" aria-label="Set opacity for all cars">
            <small>Sets every car now. Individual sliders can still override it.</small>
          </div>
          <label class="polyviewer-replay-search">Find run <input type="search" placeholder="Name…" autocomplete="off"></label>
          <section class="polyviewer-replay-list" aria-label="Replay players" data-empty-label="No replay loaded"></section>
        </div>
      </details>
      <dialog class="polyviewer-replay-dialog">
        <form method="dialog">
          <strong>Add Replays</strong>
          <label>Single replay name (optional)<input name="name" type="text" maxlength="60" placeholder="World Record"></label>
          <label>Recording, object, or replay array JSON<textarea name="recording" required spellcheck="false" placeholder='[{"recording":"…","frames":15178,"carStyle":"…"}]'></textarea></label>
          <label>Leaderboard names JSON (optional)<textarea name="leaderboard" spellcheck="false" placeholder='{"entries":[{"nickname":"SpeedySebas","frames":15178,"carStyle":"…"}]}'></textarea></label>
          <section class="polyviewer-import-progress" aria-live="polite" hidden>
            <div><span>Reading recordings…</span><strong>0%</strong></div>
            <progress max="1" value="0"></progress>
          </section>
          <p class="polyviewer-replay-error" role="alert"></p>
          <div>
            <button value="cancel" type="button" data-replay-cancel>Cancel</button>
            <button value="default" type="submit">Add Replays</button>
          </div>
        </form>
      </dialog>
    `;
    const toggle = this.element.querySelector<HTMLButtonElement>(".polyviewer-toggle");
    const status = this.element.querySelector<HTMLElement>(".polyviewer-status");
    const cleanPreviewButton = this.element.querySelector<HTMLButtonElement>(".polyviewer-clean-preview-button");
    const renderButton = this.element.querySelector<HTMLButtonElement>(".polyviewer-render-button");
    if (!toggle || !status || !cleanPreviewButton || !renderButton) throw new Error("Failed to construct the PolyViewer editor shell.");
    this.toggleButton = toggle;
    this.#status = status;
    this.#cleanPreviewButton = cleanPreviewButton;
    this.#renderButton = renderButton;
    this.#shortcutSheet = document.createElement("aside");
    this.#shortcutSheet.className = "polyviewer-shortcut-sheet";
    this.#shortcutSheet.innerHTML = `
      <details>
        <summary>Controls & shortcuts</summary>
        <dl>
          <div><dt>Open / close</dt><dd>F1 / § / \`</dd></div>
          <div><dt>Reset Normal camera</dt><dd>R</dd></div>
          <div><dt>Camera modes</dt><dd>1 2 3 4 5</dd></div>
          <div><dt>Look</dt><dd>Mouse · locked in Look At</dd></div>
          <div><dt>Move</dt><dd>W A S D</dd></div>
          <div><dt>Down / up</dt><dd>Q / E</dd></div>
          <div><dt>Fast / precise</dt><dd>Shift / Alt</dd></div>
          <div><dt>Roll</dt><dd>Z / C · locked in Look At</dd></div>
          <div><dt>FOV</dt><dd>[ / ]</dd></div>
          <div><dt>Move speed</dt><dd>Mouse wheel</dd></div>
          <div><dt>Add point</dt><dd>K</dd></div>
          <div><dt>Update point</dt><dd>Shift + K</dd></div>
          <div><dt>Delete point</dt><dd>Delete</dd></div>
          <div><dt>Play / pause</dt><dd>Space</dd></div>
          <div><dt>Small / large step</dt><dd>← → / Shift</dd></div>
          <div><dt>Restart timeline</dt><dd>↓</dd></div>
          <div><dt>Clean Preview</dt><dd>F8</dd></div>
        </dl>
      </details>`;
    this.#rightStack.append(this.#replayPanel, this.#shortcutSheet);
    cleanPreviewButton.addEventListener("click", () => options.onToggleCleanPreview?.());
    renderButton.addEventListener("click", () => options.onOpenRender?.());
    this.element.querySelector(".polyviewer-reset-camera")?.addEventListener(
      "click",
      () => options.onResetCamera?.(),
    );
    this.#modeButtons = Array.from(
      this.element.querySelectorAll<HTMLButtonElement>("[data-camera-mode]"),
    );
    const pointEditor = this.element.querySelector<HTMLElement>(".polyviewer-point-editor");
    const pointTime = this.element.querySelector<HTMLInputElement>("[data-point-time]");
    if (!pointEditor || !pointTime) throw new Error("Failed to construct Camera Point editor.");
    this.#pointEditor = pointEditor;
    this.#pointTime = pointTime;
    const addReplayButton = this.#replayPanel.querySelector<HTMLButtonElement>(".polyviewer-add-replay");
    const replayCount = this.#replayPanel.querySelector<HTMLElement>(".polyviewer-replay-count");
    const replayDialog = this.#replayPanel.querySelector<HTMLDialogElement>(".polyviewer-replay-dialog");
    const targetSelect = this.#replayPanel.querySelector<HTMLSelectElement>("[data-camera-target]");
    const replayList = this.#replayPanel.querySelector<HTMLElement>(".polyviewer-replay-list");
    const replayDetails = this.#replayPanel.querySelector<HTMLDetailsElement>("details");
    const replaySearch = this.#replayPanel.querySelector<HTMLInputElement>(".polyviewer-replay-search input");
    const masterOpacity = this.#replayPanel.querySelector<HTMLInputElement>("[data-replay-master-opacity]");
    const masterOpacityValue = this.#replayPanel.querySelector<HTMLOutputElement>(".polyviewer-master-opacity output");
    const performanceStatus = this.#replayPanel.querySelector<HTMLElement>(".polyviewer-replay-performance");
    if (!addReplayButton || !replayCount || !replayDialog || !targetSelect || !replayList || !replayDetails || !replaySearch || !masterOpacity || !masterOpacityValue || !performanceStatus) {
      throw new Error("Failed to construct replay import controls.");
    }
    this.#addReplayButton = addReplayButton;
    this.#replayCount = replayCount;
    this.#replayDialog = replayDialog;
    this.#targetSelect = targetSelect;
    this.#replayList = replayList;
    this.#replayDetails = replayDetails;
    this.#replaySearch = replaySearch;
    this.#masterOpacity = masterOpacity;
    this.#masterOpacityValue = masterOpacityValue;
    this.#performanceStatus = performanceStatus;
    replaySearch.addEventListener("input", () => {
      replayList.scrollTop = 0;
      this.#renderReplayRows();
    });
    replayDetails.addEventListener("toggle", () => this.#renderReplayRows());
    replayList.addEventListener("scroll", () => {
      if (this.#replayListFrame !== 0) return;
      this.#replayListFrame = requestAnimationFrame(() => {
        this.#replayListFrame = 0;
        this.#renderReplayRows();
      });
    }, { passive: true });
    masterOpacity.addEventListener("input", () => {
      this.#showMasterOpacityValue(Number(masterOpacity.value));
      this.#previewMasterOpacityInRows(masterOpacity.value);
      if (this.#masterOpacityFrame === 0) {
        this.#masterOpacityFrame = requestAnimationFrame(() => this.#applyMasterOpacity(options));
      }
    });
    masterOpacity.addEventListener("change", () => {
      if (this.#masterOpacityFrame !== 0) cancelAnimationFrame(this.#masterOpacityFrame);
      this.#masterOpacityFrame = 0;
      this.#applyMasterOpacity(options);
    });
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
    addReplayButton.addEventListener("click", () => {
      const error = replayDialog.querySelector<HTMLElement>(".polyviewer-replay-error");
      if (error) error.textContent = "";
      replayDialog.showModal();
    });
    replayDialog.querySelector("[data-replay-cancel]")?.addEventListener("click", () => {
      replayDialog.close();
    });
    replayDialog.querySelector("form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const data = new FormData(form);
      const recording = String(data.get("recording") ?? "").trim();
      const name = String(data.get("name") ?? "").trim();
      const leaderboard = String(data.get("leaderboard") ?? "").trim();
      const error = replayDialog.querySelector<HTMLElement>(".polyviewer-replay-error");
      const importProgress = replayDialog.querySelector<HTMLElement>(".polyviewer-import-progress");
      const importProgressText = importProgress?.querySelector<HTMLElement>("span");
      const importProgressPercent = importProgress?.querySelector<HTMLElement>("strong");
      const importProgressBar = importProgress?.querySelector<HTMLProgressElement>("progress");
      if (!recording) {
        if (error) error.textContent = "Paste a PolyTrack recording first.";
        return;
      }
      try {
        const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (submit) {
          submit.disabled = true;
          submit.textContent = "Adding…";
        }
        if (importProgress) importProgress.hidden = false;
        if (recording.startsWith("[") || leaderboard) {
          await options.onAddReplays?.(recording, leaderboard || undefined, (progress) => {
            const ratio = progress.total > 0 ? progress.completed / progress.total : 0;
            const percent = Math.round(ratio * 100);
            if (importProgressBar) {
              importProgressBar.max = Math.max(1, progress.total);
              importProgressBar.value = progress.completed;
              importProgressBar.removeAttribute("aria-busy");
              if (progress.phase === "reading") importProgressBar.setAttribute("aria-busy", "true");
            }
            if (importProgressPercent) importProgressPercent.textContent = progress.phase === "reading" ? "…" : `${percent}%`;
            if (importProgressText) {
              if (progress.phase === "reading") importProgressText.textContent = "Reading and checking recordings…";
              else if (progress.phase === "ready") importProgressText.textContent = `${progress.total.toLocaleString()} recordings ready`;
              else {
                const eta = progress.estimatedRemainingMilliseconds;
                const remaining = eta !== null && progress.completed > 0
                  ? ` · about ${formatDuration(eta)} left`
                  : "";
                importProgressText.textContent = `Adding ${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()}${remaining}`;
              }
            }
          });
        } else {
          options.onAddReplay?.(recording, name || undefined);
        }
        form.reset();
        replayDialog.close();
      } catch (caught) {
        if (error) error.textContent = caught instanceof Error ? caught.message : "The replay could not be added.";
      } finally {
        const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Add Replays";
        }
        if (importProgress && replayDialog.open) importProgress.hidden = true;
      }
    });
    targetSelect.addEventListener("change", () => options.onTargetReplayChange?.(targetSelect.value));
    replayList.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      const row = input.closest<HTMLElement>("[data-replay-id]");
      const id = row?.dataset.replayId;
      if (!id) return;
      if (input.matches("[data-replay-name]")) options.onReplayNameChange?.(id, input.value);
      if (input.matches("[data-replay-visible]")) options.onReplayVisibilityChange?.(id, input.checked);
      if (input.matches("[data-replay-opacity]")) options.onReplayOpacityChange?.(id, Number(input.value) / 100);
      if (input.matches("[data-replay-name-tag]")) {
        options.onReplayNameTagVisibilityChange?.(id, input.checked);
      }
    });
    replayList.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-replay-remove]");
      const id = button?.closest<HTMLElement>("[data-replay-id]")?.dataset.replayId;
      if (id) options.onRemoveReplay?.(id);
    });
    document.body.append(this.element);
    document.body.append(this.#rightStack);
  }

  setSelectedCameraPoint(point: CameraKeyframe | null): void {
    this.#selectedPointId = point?.id ?? null;
    this.#pointEditor.classList.toggle("is-visible", point !== null);
    if (point) this.#pointTime.value = (point.timeMicroseconds / 1_000_000).toFixed(3);
  }

  setCleanPreview(enabled: boolean): void {
    this.#cleanPreviewButton.classList.toggle("is-selected", enabled);
    this.#cleanPreviewButton.setAttribute("aria-pressed", String(enabled));
  }

  setRenderAvailable(available: boolean): void {
    this.#renderButton.disabled = !available;
  }

  setPerformanceStatus(status: PolyViewerReplayPerformanceStatus): void {
    const packedMegabytes = status.packedBytes / (1024 * 1024);
    const signature = `${status.quality}:${status.totalReplays}:${status.visibleReplays}:${status.previewReplays}:${status.readyReplays}:${packedMegabytes.toFixed(1)}`;
    if (signature === this.#performanceSignature) return;
    this.#performanceSignature = signature;
    const deferred = status.readyReplays < status.visibleReplays
      ? ` · ${status.visibleReplays - status.readyReplays} prepare on Render`
      : "";
    const storage = status.packedBytes > 0 ? ` · ${formatStorageSize(status.packedBytes)} replay cache` : "";
    const preview = status.visibleReplays > status.previewReplays
      ? `Preview ${status.previewReplays}/${status.visibleReplays} cars · render all`
      : `Preview all ${status.previewReplays} cars`;
    this.#performanceStatus.textContent = `${preview}${storage}${deferred}`;
    this.#performanceStatus.dataset.mode = "full";
    this.#performanceStatus.title = "Only the 20 preview cars are simulated during editing. Final rendering prepares every enabled car through a bounded worker queue.";
  }

  setReplays(connected: boolean, replays: PolyViewerReplaySummary[]): void {
    this.#addReplayButton.disabled = !connected || replays.length >= MAX_REPLAY_CARS;
    this.#masterOpacity.disabled = !connected || replays.length === 0;
    this.#replayCount.textContent = formatRunCount(replays.length);
    if (sameReplaySummaries(this.#replays, replays)) return;
    this.#replays = replays.map((replay) => ({ ...replay }));
    this.#syncMasterOpacity(replays);
    if (this.#applyingMasterOpacity) return;
    const selectedTarget = this.#targetSelect.value;
    const targetSignature = replays.map((replay) => `${replay.id}\u0000${replay.name}`).join("\u0001");
    if (targetSignature !== this.#targetSignature) {
      this.#targetSignature = targetSignature;
      this.#targetSelect.replaceChildren(...replays.map((replay) => {
        const option = document.createElement("option");
        option.value = replay.id;
        option.textContent = replay.name;
        return option;
      }));
    }
    const nextTarget = replays.some((replay) => replay.id === selectedTarget)
      ? selectedTarget
      : replays[0]?.id ?? "";
    this.#targetSelect.value = nextTarget;
    if (nextTarget !== selectedTarget && nextTarget) {
      this.#targetSelect.dispatchEvent(new Event("change"));
    }
    this.#renderReplayRows();
  }

  update(status: FreeCameraStatus): void {
    this.element.classList.toggle("is-active", status.enabled);
    this.#rightStack.classList.toggle("is-active", status.enabled);
    this.toggleButton.innerHTML = status.enabled
      ? "Exit PolyViewer <kbd>F1</kbd>"
      : "Enter PolyViewer <kbd>F1</kbd>";
    this.#status.textContent = status.enabled
      ? `${status.pointerLocked ? "Camera captured" : "Click the scene to capture"} · Move speed ${status.speed.toFixed(1)} · ${status.fov.toFixed(0)}° FOV`
      : "Connected to the real PolyTrack renderer";
    for (const button of this.#modeButtons) {
      const mode = button.dataset.cameraMode as CameraMode;
      button.classList.toggle("is-selected", mode === status.mode);
      button.disabled = mode === "normal"
        ? !status.nativeCameraAvailable
        : (mode === "lookAt" || mode === "follow" || mode === "attached")
          && !status.targetAvailable;
    }
    this.#targetSelect.disabled = !status.targetAvailable;
    if (this.#targetSelect.querySelector(`option[value="${CSS.escape(status.targetReplayId)}"]`)) {
      this.#targetSelect.value = status.targetReplayId;
    }
  }

  setError(message: string): void {
    this.element.classList.add("has-error");
    this.#status.textContent = message;
    this.toggleButton.disabled = true;
  }

  #renderReplayRows(): void {
    const query = this.#replaySearch.value.trim().toLocaleLowerCase();
    const visible = query
      ? this.#replays.filter((replay) => replay.name.toLocaleLowerCase().includes(query))
      : this.#replays;
    this.#replayCount.textContent = query
      ? `${visible.length}/${this.#replays.length} runs`
      : formatRunCount(this.#replays.length);
    if (!this.#replayDetails.open || visible.length === 0) {
      this.#replayList.replaceChildren();
    } else {
      const rowHeight = 104;
      const overscan = 5;
      const viewportRows = Math.max(1, Math.ceil(this.#replayList.clientHeight / rowHeight));
      const start = Math.max(0, Math.floor(this.#replayList.scrollTop / rowHeight) - overscan);
      const end = Math.min(visible.length, start + viewportRows + overscan * 2);
      const top = document.createElement("div");
      top.className = "polyviewer-replay-spacer";
      top.style.height = `${start * rowHeight}px`;
      const bottom = document.createElement("div");
      bottom.className = "polyviewer-replay-spacer";
      bottom.style.height = `${(visible.length - end) * rowHeight}px`;
      this.#replayList.replaceChildren(
        top,
        ...visible.slice(start, end).map((replay) => createReplayRow(replay)),
        bottom,
      );
    }
    this.#replayList.dataset.emptyLabel = this.#replays.length > 0
      ? "No matching run"
      : "No replay loaded";
    this.#replayList.classList.toggle("is-visible", visible.length > 0);
  }

  #applyMasterOpacity(options: EditorShellOptions): void {
    this.#masterOpacityFrame = 0;
    const percentage = Number(this.#masterOpacity.value);
    if (!Number.isFinite(percentage)) return;
    this.#applyingMasterOpacity = true;
    try {
      options.onReplayMasterOpacityChange?.(percentage / 100);
    } finally {
      this.#applyingMasterOpacity = false;
    }
  }

  #previewMasterOpacityInRows(value: string): void {
    for (const input of this.#replayList.querySelectorAll<HTMLInputElement>("[data-replay-opacity]")) {
      input.value = value;
      const output = input.closest(".polyviewer-opacity")?.querySelector<HTMLElement>("span");
      if (output) output.textContent = `${value}%`;
    }
  }

  #syncMasterOpacity(replays: PolyViewerReplaySummary[]): void {
    if (replays.length === 0) {
      this.#masterOpacity.value = "100";
      this.#masterOpacityValue.textContent = "100%";
      return;
    }
    const first = Math.round(replays[0]!.opacity * 100);
    const uniform = replays.every((replay) => Math.round(replay.opacity * 100) === first);
    if (uniform) {
      this.#masterOpacity.value = String(first);
      this.#showMasterOpacityValue(first);
    } else {
      this.#masterOpacityValue.textContent = "Mixed";
    }
  }

  #showMasterOpacityValue(percentage: number): void {
    this.#masterOpacityValue.textContent = `${Math.round(percentage)}%`;
  }
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function formatStorageSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRunCount(count: number): string {
  return `${count} ${count === 1 ? "run" : "runs"}`;
}

function createReplayRow(replay: PolyViewerReplaySummary): HTMLElement {
  const row = document.createElement("article");
  row.dataset.replayId = replay.id;
  row.innerHTML = `
    <input data-replay-name aria-label="Replay name" maxlength="60">
    <label title="Visible"><input data-replay-visible type="checkbox"> 👁</label>
    <label class="polyviewer-opacity"><input data-replay-opacity type="range" min="0" max="100" step="1"><span></span></label>
    <label class="polyviewer-name-tag"><input data-replay-name-tag type="checkbox"> Name label</label>
    ${replay.removable ? '<button data-replay-remove type="button" title="Remove replay">Remove</button>' : ""}
  `;
  const name = row.querySelector<HTMLInputElement>("[data-replay-name]");
  const visible = row.querySelector<HTMLInputElement>("[data-replay-visible]");
  const opacity = row.querySelector<HTMLInputElement>("[data-replay-opacity]");
  const percentage = row.querySelector<HTMLElement>(".polyviewer-opacity span");
  const nameTag = row.querySelector<HTMLInputElement>("[data-replay-name-tag]");
  if (name) name.value = replay.name;
  if (visible) visible.checked = replay.visible;
  if (opacity) {
    opacity.value = String(Math.round(replay.opacity * 100));
    opacity.addEventListener("input", () => { if (percentage) percentage.textContent = `${opacity.value}%`; });
  }
  if (percentage) percentage.textContent = `${Math.round(replay.opacity * 100)}%`;
  if (nameTag) nameTag.checked = replay.nameTagVisible;
  return row;
}

function sameReplaySummaries(a: PolyViewerReplaySummary[], b: PolyViewerReplaySummary[]): boolean {
  return a.length === b.length && a.every((entry, index) => JSON.stringify(entry) === JSON.stringify(b[index]));
}
