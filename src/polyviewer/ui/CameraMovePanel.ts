import type { CameraKeyframe } from "../camera/CameraKeyframeStore";
import {
  cameraMoveDurationMicroseconds,
  createCameraMoveDocument,
  parseCameraMoveDocument,
  remapCameraMovePoints,
  suggestCameraMoveMappings,
  type CameraMoveDocument,
  type CameraMoveTargetMapping,
} from "../camera/CameraMoveFile";

interface CameraMovePanelOptions {
  onImport: (points: readonly CameraKeyframe[], strategy: "replace" | "append") => void;
}

export class CameraMovePanel {
  readonly element: HTMLDialogElement;
  #options: CameraMovePanelOptions;
  #points: readonly CameraKeyframe[] = [];
  #replays: readonly PolyViewerReplaySummary[] = [];
  #document: CameraMoveDocument | null = null;
  #fileInput: HTMLInputElement;
  #importButton: HTMLButtonElement;
  #mappingList: HTMLElement;
  #summary: HTMLElement;
  #warning: HTMLElement;
  #acknowledge: HTMLInputElement;
  #status: HTMLElement;
  #importOptions: HTMLElement;
  #playheadMicroseconds = 0;
  #timelineDurationMicroseconds = 0;

  constructor(options: CameraMovePanelOptions) {
    this.#options = options;
    this.element = document.createElement("dialog");
    this.element.className = "polyviewer-camera-move-dialog";
    this.element.innerHTML = `
      <form method="dialog">
        <header>
          <div><strong>Camera Import / Export</strong><small>Save this camera path or bring one into the current project.</small></div>
          <button type="button" data-camera-move-close aria-label="Close">×</button>
        </header>
        <section class="polyviewer-camera-move-save">
          <div class="polyviewer-camera-move-heading">
            <span class="polyviewer-camera-move-heading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 16v4h14v-4"/></svg></span>
            <div><span>Export</span><strong>Save this camera path</strong><small>Downloads every Camera Point, mode, rotation, FOV, timing and car target.</small></div>
          </div>
          <label>Move name <input name="moveName" maxlength="80" value="My Camera Move"></label>
          <button type="button" data-camera-move-export><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 16v4h14v-4"/></svg> Export Camera Move</button>
        </section>
        <section class="polyviewer-camera-move-load">
          <div class="polyviewer-camera-move-heading">
            <span class="polyviewer-camera-move-heading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21V9m0 0 4 4m-4-4-4 4M5 8V4h14v4"/></svg></span>
            <div><span>Import</span><strong>Use a saved camera path</strong><small>Choose a .polycam.json file, then connect its cars.</small></div>
          </div>
          <input data-camera-move-file type="file" accept=".json,.polycam.json,application/json" hidden>
          <button type="button" data-camera-move-choose><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21V9m0 0 4 4m-4-4-4 4M5 8V4h14v4"/></svg> Choose Camera Move File</button>
          <div class="polyviewer-camera-move-import-options" hidden>
            <div class="polyviewer-camera-move-summary" hidden></div>
            <div class="polyviewer-camera-move-warning" hidden></div>
            <label class="polyviewer-camera-move-ack" hidden>
              <input type="checkbox"> I am using the same map, or I understand that world-space cameras may need repositioning.
            </label>
            <div class="polyviewer-camera-move-mappings" hidden>
              <strong>Connect camera targets</strong>
              <small>PolyViewer matched Main Replay and unique player names automatically. Change anything that is wrong.</small>
              <div></div>
            </div>
            <label>Import behavior
              <select name="importStrategy">
                <option value="replace">Replace current Camera Points</option>
                <option value="append">Add at current playhead</option>
              </select>
            </label>
            <button type="button" data-camera-move-import disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21V9m0 0 4 4m-4-4-4 4M5 8V4h14v4"/></svg> Import Camera Move</button>
          </div>
          <p class="polyviewer-camera-move-status" role="status" aria-live="polite"></p>
        </section>
      </form>
    `;
    const fileInput = this.element.querySelector<HTMLInputElement>("[data-camera-move-file]");
    const importButton = this.element.querySelector<HTMLButtonElement>("[data-camera-move-import]");
    const mappingList = this.element.querySelector<HTMLElement>(".polyviewer-camera-move-mappings > div");
    const summary = this.element.querySelector<HTMLElement>(".polyviewer-camera-move-summary");
    const warning = this.element.querySelector<HTMLElement>(".polyviewer-camera-move-warning");
    const acknowledge = this.element.querySelector<HTMLInputElement>(".polyviewer-camera-move-ack input");
    const status = this.element.querySelector<HTMLElement>(".polyviewer-camera-move-status");
    const importOptions = this.element.querySelector<HTMLElement>(".polyviewer-camera-move-import-options");
    if (!fileInput || !importButton || !mappingList || !summary || !warning || !acknowledge || !status || !importOptions) {
      throw new Error("Failed to construct Camera Move panel.");
    }
    this.#fileInput = fileInput;
    this.#importButton = importButton;
    this.#mappingList = mappingList;
    this.#summary = summary;
    this.#warning = warning;
    this.#acknowledge = acknowledge;
    this.#status = status;
    this.#importOptions = importOptions;
    this.element.querySelector("[data-camera-move-close]")?.addEventListener("click", () => this.element.close());
    this.element.querySelector("form")?.addEventListener("submit", (event) => event.preventDefault());
    this.element.querySelector("[data-camera-move-export]")?.addEventListener("click", () => this.#export());
    this.element.querySelector("[data-camera-move-choose]")?.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => void this.#readSelectedFile());
    acknowledge.addEventListener("change", () => this.#refreshImportAvailability());
    mappingList.addEventListener("change", () => this.#refreshImportAvailability());
    this.element.querySelector('[name="importStrategy"]')?.addEventListener("change", () => this.#renderWarning());
    importButton.addEventListener("click", () => this.#import());
    document.body.append(this.element);
  }

  open(
    points: readonly CameraKeyframe[],
    replays: readonly PolyViewerReplaySummary[],
    playheadMicroseconds: number,
    timelineDurationMicroseconds: number,
  ): void {
    this.#points = points.map((point) => structuredClone(point));
    this.#replays = replays.map((replay) => ({ ...replay }));
    this.#playheadMicroseconds = playheadMicroseconds;
    this.#timelineDurationMicroseconds = timelineDurationMicroseconds;
    this.#document = null;
    this.#importOptions.hidden = true;
    this.#fileInput.value = "";
    this.#mappingList.replaceChildren();
    this.#summary.hidden = true;
    this.#warning.hidden = true;
    const acknowledgement = this.#acknowledge.closest<HTMLElement>(".polyviewer-camera-move-ack");
    if (acknowledgement) acknowledgement.hidden = true;
    const mappings = this.#mappingList.closest<HTMLElement>(".polyviewer-camera-move-mappings");
    if (mappings) mappings.hidden = true;
    this.#acknowledge.checked = false;
    this.#importButton.disabled = true;
    this.#status.textContent = "";
    const exportButton = this.element.querySelector<HTMLButtonElement>("[data-camera-move-export]");
    if (exportButton) exportButton.disabled = points.length === 0;
    this.element.showModal();
  }

  #export(): void {
    try {
      const name = this.element.querySelector<HTMLInputElement>('[name="moveName"]')?.value ?? "Camera Move";
      const document = createCameraMoveDocument(name, this.#points, this.#replays);
      const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = globalThis.document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(document.name)}.polycam.json`;
      globalThis.document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      this.#status.textContent = `Saved ${document.points.length} Camera Points exactly.`;
    } catch (error) {
      this.#status.textContent = error instanceof Error ? error.message : "The Camera Move could not be saved.";
    }
  }

  async #readSelectedFile(): Promise<void> {
    const file = this.#fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("This Camera Move file is unexpectedly large.");
      this.#document = parseCameraMoveDocument(await file.text());
      this.#renderDocument(this.#document);
      this.#status.textContent = "Camera Move checked successfully.";
    } catch (error) {
      this.#document = null;
      this.#importOptions.hidden = true;
      this.#summary.hidden = true;
      this.#importButton.disabled = true;
      this.#status.textContent = error instanceof Error ? error.message : "The Camera Move could not be opened.";
    }
  }

  #renderDocument(document: CameraMoveDocument): void {
    this.#importOptions.hidden = false;
    const modes = [...new Set(document.points.map((point) => point.state.mode === "free" ? "fixed" : point.state.mode))];
    this.#summary.hidden = false;
    this.#summary.replaceChildren();
    const title = globalThis.document.createElement("strong");
    title.textContent = document.name;
    const details = globalThis.document.createElement("small");
    const mapFit = document.compatibility.usesWorldSpace
      ? "same map recommended"
      : document.compatibility.usesWorldOrientation
        ? "portable · Follow keeps world direction"
        : "works on any map";
    details.textContent = `${document.points.length} Camera Points · ${formatTime(cameraMoveDurationMicroseconds(document))} · ${modes.join(" · ")} · ${mapFit}`;
    this.#summary.append(title, details);
    this.#renderWarning();
    const acknowledgement = this.#acknowledge.closest<HTMLElement>(".polyviewer-camera-move-ack");
    if (acknowledgement) acknowledgement.hidden = !document.compatibility.usesWorldSpace;
    this.#acknowledge.checked = !document.compatibility.usesWorldSpace;

    const suggestions = suggestCameraMoveMappings(document, this.#replays);
    this.#mappingList.replaceChildren(...document.targetReferences.map((reference) => {
      const label = globalThis.document.createElement("label");
      const name = globalThis.document.createElement("span");
      name.textContent = reference.sourceName;
      const select = globalThis.document.createElement("select");
      select.dataset.sourceTarget = reference.sourceId;
      const placeholder = globalThis.document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose car…";
      select.append(placeholder, ...this.#replays.map((replay) => {
        const option = globalThis.document.createElement("option");
        option.value = replay.id;
        option.textContent = replay.name;
        return option;
      }));
      select.value = suggestions[reference.sourceId] ?? "";
      label.append(name, select);
      return label;
    }));
    const mappings = this.#mappingList.closest<HTMLElement>(".polyviewer-camera-move-mappings");
    if (mappings) mappings.hidden = document.targetReferences.length === 0;
    this.#refreshImportAvailability();
  }

  #renderWarning(): void {
    if (!this.#document) {
      this.#warning.hidden = true;
      return;
    }
    const warnings: string[] = [];
    if (this.#document.compatibility.usesWorldSpace) {
      warnings.push("Map check: this move contains Fixed or Look At points. Their positions are exact world coordinates, so they reproduce exactly on the same map. On another map they still import, but may be underground or outside the track.");
    }
    if (!this.#document.compatibility.usesWorldSpace && this.#document.compatibility.usesWorldOrientation) {
      warnings.push("Follow compatibility: the camera follows the new car position, but intentionally keeps its saved world offset and direction. Check the composition when using a different map.");
    }
    const strategy = this.element.querySelector<HTMLSelectElement>('[name="importStrategy"]')?.value;
    const first = this.#document.points[0]!.timeMicroseconds;
    const last = this.#document.points.at(-1)!.timeMicroseconds;
    const importedEnd = strategy === "append"
      ? this.#playheadMicroseconds + last - first
      : last;
    if (this.#timelineDurationMicroseconds > 0 && importedEnd > this.#timelineDurationMicroseconds) {
      warnings.push(`Timing check: this move ends at ${formatTime(importedEnd)}, after the current replay ends at ${formatTime(this.#timelineDurationMicroseconds)}. PolyViewer will preserve the timing exactly and will not stretch it.`);
    }
    this.#warning.hidden = warnings.length === 0;
    this.#warning.textContent = warnings.join(" ");
  }

  #refreshImportAvailability(): void {
    const mapped = [...this.#mappingList.querySelectorAll<HTMLSelectElement>("select")]
      .every((select) => select.value.length > 0);
    this.#importButton.disabled = !this.#document || !mapped
      || (this.#document.compatibility.usesWorldSpace && !this.#acknowledge.checked);
  }

  #import(): void {
    if (!this.#document || this.#importButton.disabled) return;
    try {
      const mapping: CameraMoveTargetMapping = {};
      for (const select of this.#mappingList.querySelectorAll<HTMLSelectElement>("select")) {
        mapping[select.dataset.sourceTarget!] = select.value;
      }
      const points = remapCameraMovePoints(this.#document, mapping);
      const strategy = this.element.querySelector<HTMLSelectElement>('[name="importStrategy"]')?.value === "append"
        ? "append" : "replace";
      this.#options.onImport(points, strategy);
      this.#status.textContent = strategy === "replace"
        ? `Imported ${points.length} Camera Points exactly.`
        : `Added ${points.length} Camera Points at the playhead.`;
      this.element.close();
    } catch (error) {
      this.#status.textContent = error instanceof Error ? error.message : "The Camera Move could not be imported.";
    }
  }
}

function formatTime(microseconds: number): string {
  const seconds = microseconds / 1_000_000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}

function safeFilename(value: string): string {
  return value.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "camera-move";
}
