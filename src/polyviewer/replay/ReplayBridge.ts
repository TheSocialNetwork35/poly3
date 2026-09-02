import { MasterTimeline } from "../timeline/MasterTimeline";
import { parseReplayImport, parseReplayImports, type ReplayImportPayload } from "./ReplayImport";

const MICROSECONDS_PER_FRAME = 1_000;
export const MAX_REPLAY_CARS = 2_000;

interface ReplayBridgeOptions {
  onChange?: (status: ReplayBridgeStatus) => void;
}

export interface ReplayBridgeStatus {
  connected: boolean;
  active: boolean;
  playing: boolean;
  timeMicroseconds: number;
  durationMicroseconds: number;
  loadedMicroseconds: number;
  nativeCameraAvailable: boolean;
  replays: PolyViewerReplaySummary[];
  replayRevision: number;
  performance: PolyViewerReplayPerformanceStatus;
}

export interface ReplayEditorState {
  timeMicroseconds: number;
  playing: boolean;
}

export interface ReplayImportProgress {
  phase: "reading" | "registering" | "ready";
  completed: number;
  total: number;
  elapsedMilliseconds: number;
  estimatedRemainingMilliseconds: number | null;
}

/**
 * Owns the single connection between PolyViewer's deterministic clock and the
 * verified PolyTrack replay-preview state. PolyTrack still evaluates every car
 * through its native replay, Car.setCarState, and Car.update path.
 */
export class ReplayBridge {
  readonly timeline: MasterTimeline;
  #bridge: PolyTrackBridge;
  #runtimeReplay: PolyTrackReplayRuntimeBridge | null = null;
  #active = false;
  #onChange?: (status: ReplayBridgeStatus) => void;
  #lifecycleMonitor: ReturnType<typeof setInterval>;
  #replays: PolyViewerReplaySummary[] = [];
  #replayRevision = 0;
  #performance: PolyViewerReplayPerformanceStatus = emptyPerformanceStatus();
  #priorityReplayId = "main";

  constructor(bridge: PolyTrackBridge, timeline: MasterTimeline, options: ReplayBridgeOptions = {}) {
    this.#bridge = bridge;
    this.timeline = timeline;
    this.#onChange = options.onChange;
    window.addEventListener("polytrack:replay-ready", this.#onReplayLifecycle);
    window.addEventListener("polytrack:replay-disposed", this.#onReplayLifecycle);
    this.#synchronizeRuntimeReplay();
    // Replay previews can be constructed and disposed during the same loading
    // burst. The events are primary; this low-frequency identity check makes
    // the adapter robust if a lifecycle event predates PolyViewer startup.
    this.#lifecycleMonitor = setInterval(() => {
      const changed = this.#synchronizeRuntimeReplay();
      if (!changed && this.#refreshPerformance()) this.#notify();
    }, 250);
  }

  get connected(): boolean {
    return this.#runtimeReplay !== null;
  }

  get active(): boolean {
    return this.#active;
  }

  get primaryCar(): PolyTrackCarTarget | null {
    return this.#runtimeReplay?.primaryCar ?? null;
  }

  getCar(id: string): PolyTrackCarTarget | null {
    const replay = this.#runtimeReplay;
    if (!replay) return null;
    if (typeof replay.getCar === "function") return replay.getCar(id);
    return id === "main" ? replay.primaryCar : null;
  }

  get nativeCameraPose(): PolyTrackCameraPose | null {
    return this.#runtimeReplay?.nativeCameraPose ?? null;
  }

  getNativeCameraPose(id: string): PolyTrackCameraPose | null {
    const replay = this.#runtimeReplay;
    if (!replay) return null;
    if (typeof replay.getNativeCameraPose === "function") return replay.getNativeCameraPose(id);
    return id === "main" ? replay.nativeCameraPose : null;
  }

  get replays(): PolyViewerReplaySummary[] {
    return this.#replays;
  }

  addReplay(recordingString: string, name?: string): PolyViewerReplaySummary {
    const replay = this.#runtimeReplay;
    if (!replay) throw new Error("Open a PolyTrack replay before adding another recording.");
    if (typeof replay.addReplay !== "function") {
      throw new Error("The PolyTrack runtime was updated incompletely. Reload the page once and try again.");
    }
    const payload = parseReplayImport(recordingString);
    this.timeline.pause();
    const added = this.#addParsedReplay(replay, payload, name);
    this.#refreshReplays();
    this.#refreshPerformance();
    this.#notify();
    return added;
  }

  async addReplays(
    recordingsValue: string,
    leaderboardValue = "",
    onProgress?: (progress: ReplayImportProgress) => void,
  ): Promise<PolyViewerReplaySummary[]> {
    const replay = this.#runtimeReplay;
    if (!replay || typeof replay.addReplay !== "function") {
      throw new Error("Open a PolyTrack replay and reload once if the runtime was just updated.");
    }
    const startedAt = performance.now();
    onProgress?.({
      phase: "reading",
      completed: 0,
      total: 0,
      elapsedMilliseconds: 0,
      estimatedRemainingMilliseconds: null,
    });
    await yieldToBrowser();
    const imports = parseReplayImports(recordingsValue, leaderboardValue);
    const available = MAX_REPLAY_CARS - this.#replays.length;
    if (imports.length > available) {
      throw new Error(`This project supports up to ${MAX_REPLAY_CARS} cars; ${Math.max(0, available)} slots remain.`);
    }
    this.timeline.pause();
    const added: PolyViewerReplaySummary[] = [];
    onProgress?.({
      phase: "registering",
      completed: 0,
      total: imports.length,
      elapsedMilliseconds: performance.now() - startedAt,
      estimatedRemainingMilliseconds: null,
    });
    replay.beginReplayBatch?.();
    try {
      for (let index = 0; index < imports.length; index += 1) {
        const item = imports[index]!;
        added.push(this.#addParsedReplay(replay, item.payload, item.name));
        const completed = index + 1;
        if (completed % 20 === 0 || completed === imports.length) {
          const elapsedMilliseconds = performance.now() - startedAt;
          onProgress?.({
            phase: "registering",
            completed,
            total: imports.length,
            elapsedMilliseconds,
            estimatedRemainingMilliseconds: completed > 0
              ? elapsedMilliseconds / completed * (imports.length - completed)
              : null,
          });
          if (completed < imports.length) await yieldToBrowser();
        }
      }
    } catch (error) {
      for (const entry of added.reverse()) replay.removeReplay(entry.id);
      this.#refreshReplays();
      this.#refreshPerformance();
      throw error;
    } finally {
      replay.endReplayBatch?.();
    }
    this.#refreshReplays();
    this.#refreshPerformance();
    this.#notify();
    onProgress?.({
      phase: "ready",
      completed: imports.length,
      total: imports.length,
      elapsedMilliseconds: performance.now() - startedAt,
      estimatedRemainingMilliseconds: 0,
    });
    return added;
  }

  setReplayName(id: string, name: string): void {
    this.#requireRuntimeReplay().setReplayName(id, name);
    this.#refreshReplays();
    this.#notify();
  }

  setReplayVisible(id: string, visible: boolean): void {
    this.#requireRuntimeReplay().setReplayVisible(id, visible);
    this.#refreshReplays();
    this.#refreshPerformance();
    this.#notify();
  }

  setReplayOpacity(id: string, opacity: number): void {
    this.#requireRuntimeReplay().setReplayOpacity(id, opacity);
    this.#refreshReplays();
    this.#notify();
  }

  setAllReplayOpacity(opacity: number): void {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new RangeError("Replay opacity must be between 0 and 1.");
    }
    const replay = this.#requireRuntimeReplay();
    for (const entry of listRuntimeReplays(replay)) {
      replay.setReplayOpacity(entry.id, opacity);
    }
    this.#refreshReplays();
    this.#notify();
  }

  setReplayNameTagVisible(id: string, visible: boolean): void {
    const replay = this.#requireRuntimeReplay();
    if (typeof replay.setReplayNameTagVisible !== "function") {
      throw new Error("Reload once to enable replay name labels.");
    }
    replay.setReplayNameTagVisible(id, visible);
    this.#refreshReplays();
    this.#refreshPerformance();
    this.#notify();
  }

  removeReplay(id: string): void {
    this.timeline.pause();
    this.#requireRuntimeReplay().removeReplay(id);
    this.#refreshReplays();
    this.#refreshPerformance();
    this.#notify();
  }

  setPriorityReplay(id: string): void {
    if (!id || id === this.#priorityReplayId) return;
    this.#priorityReplayId = id;
    const replay = this.#runtimeReplay;
    replay?.setPriorityReplay?.(id);
    if (this.#refreshPerformance()) this.#notify();
  }

  async prepareAllForRender(
    settings: PolyViewerReplayRenderPreparation,
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<void> {
    const replay = this.#requireRuntimeReplay();
    if (typeof replay.prepareRender !== "function") {
      if (this.#performance.renderReady) return;
      throw new Error("Reload once to enable deferred replay preparation.");
    }
    await replay.prepareRender(settings, signal, onProgress);
    this.#refreshPerformance();
    this.#notify();
  }

  releaseRenderPreparation(): void {
    this.#runtimeReplay?.releaseRenderPreparation?.();
    this.#refreshPerformance();
    this.#notify();
  }

  evaluateExactFrame(timeMicroseconds: number, advanceVisuals: boolean): void {
    const replay = this.#requireRuntimeReplay();
    const maximum = Math.min(replay.durationFrames, replay.loadedFrames) * MICROSECONDS_PER_FRAME;
    const safeTime = Math.max(0, Math.min(maximum, Math.round(timeMicroseconds)));
    this.timeline.pause();
    this.timeline.seekMicroseconds(safeTime);
    replay.evaluateFrame(Math.round(safeTime / MICROSECONDS_PER_FRAME), advanceVisuals);
    this.#notify();
  }

  captureEditorState(): ReplayEditorState {
    return { timeMicroseconds: this.timeline.timeMicroseconds, playing: this.timeline.playing };
  }

  restoreEditorState(state: ReplayEditorState): void {
    this.evaluateExactFrame(state.timeMicroseconds, false);
    if (state.playing) this.play();
  }

  setActive(active: boolean): void {
    if (active === this.#active) return;
    this.#active = active;
    this.#synchronizeRuntimeReplay();
    this.#applyDriverState();
    this.#notify();
  }

  play(): void {
    if (!this.#active || !this.#runtimeReplay) return;
    this.timeline.play();
    this.#notify();
  }

  pause(): void {
    this.timeline.pause();
    this.#notify();
  }

  togglePlayback(): void {
    this.timeline.playing ? this.pause() : this.play();
  }

  restart(): void {
    this.timeline.pause();
    this.timeline.restart();
    this.#notify();
  }

  seekMicroseconds(timeMicroseconds: number): void {
    if (!this.#runtimeReplay) return;
    const loaded = this.#runtimeReplay.loadedFrames * MICROSECONDS_PER_FRAME;
    const safeTime = Math.max(0, Math.min(loaded, Math.round(timeMicroseconds)));
    this.timeline.seekMicroseconds(safeTime);
    this.#runtimeReplay.evaluateFrame(Math.round(safeTime / MICROSECONDS_PER_FRAME), false);
    this.#notify();
  }

  stepMicroseconds(deltaMicroseconds: number): void {
    this.timeline.pause();
    const loaded = (this.#runtimeReplay?.loadedFrames ?? 0) * MICROSECONDS_PER_FRAME;
    this.timeline.stepMicroseconds(deltaMicroseconds);
    if (this.timeline.timeMicroseconds > loaded) this.timeline.seekMicroseconds(loaded);
    this.#notify();
  }

  dispose(): void {
    this.#active = false;
    this.#detachRuntimeReplay();
    window.removeEventListener("polytrack:replay-ready", this.#onReplayLifecycle);
    window.removeEventListener("polytrack:replay-disposed", this.#onReplayLifecycle);
    clearInterval(this.#lifecycleMonitor);
  }

  #driver: PolyTrackReplayDriver = (deltaSeconds, durationFrames, loadedFrames) => {
    const durationMicroseconds = durationFrames * MICROSECONDS_PER_FRAME;
    const loadedMicroseconds = loadedFrames * MICROSECONDS_PER_FRAME;
    if (durationMicroseconds !== this.timeline.durationMicroseconds) {
      this.timeline.setDurationMicroseconds(durationMicroseconds);
    }

    let advanceVisuals = false;
    if (this.timeline.playing) {
      const requestedDelta = Math.round(deltaSeconds * this.timeline.rate * 1_000_000);
      if (this.timeline.timeMicroseconds + requestedDelta <= loadedMicroseconds) {
        this.timeline.update(deltaSeconds);
        advanceVisuals = requestedDelta > 0;
      }
    }

    this.#notify();
    return {
      frame: Math.min(loadedFrames, Math.round(this.timeline.timeMicroseconds / MICROSECONDS_PER_FRAME)),
      advanceVisuals,
    };
  };

  #synchronizeRuntimeReplay(): boolean {
    const next = this.#bridge.replay;
    if (next === this.#runtimeReplay) return false;
    this.#detachRuntimeReplay();
    this.#runtimeReplay = next;
    if (next) {
      this.timeline.setDurationMicroseconds(next.durationFrames * MICROSECONDS_PER_FRAME);
      this.timeline.seekMicroseconds(
        Math.min(next.timeFrames, next.loadedFrames) * MICROSECONDS_PER_FRAME,
      );
      next.setPriorityReplay?.(this.#priorityReplayId);
    }
    this.#refreshReplays();
    this.#refreshPerformance();
    this.#applyDriverState();
    this.#notify();
    return true;
  }

  #applyDriverState(): void {
    const replay = this.#runtimeReplay;
    if (!replay) return;
    if (this.#active) {
      replay.setNativePaused(true);
      replay.setDriver(this.#driver);
    } else {
      replay.setDriver(null);
      replay.setNativePaused(!this.timeline.playing);
    }
  }

  #detachRuntimeReplay(): void {
    if (!this.#runtimeReplay) return;
    this.#runtimeReplay.setDriver(null);
    this.#runtimeReplay = null;
    this.#refreshReplays();
    this.#refreshPerformance();
  }

  #onReplayLifecycle = (): void => {
    this.#synchronizeRuntimeReplay();
  };

  #requireRuntimeReplay(): PolyTrackReplayRuntimeBridge {
    if (!this.#runtimeReplay) throw new Error("Open a PolyTrack replay first.");
    return this.#runtimeReplay;
  }

  #notify(): void {
    const replay = this.#runtimeReplay;
    this.#onChange?.({
      connected: replay !== null,
      active: this.#active,
      playing: this.timeline.playing,
      timeMicroseconds: this.timeline.timeMicroseconds,
      durationMicroseconds: this.timeline.durationMicroseconds,
      loadedMicroseconds: (replay?.loadedFrames ?? 0) * MICROSECONDS_PER_FRAME,
      nativeCameraAvailable: replay?.nativeCameraPose !== null && replay?.nativeCameraPose !== undefined,
      replays: this.#replays,
      replayRevision: this.#replayRevision,
      performance: this.#performance,
    });
  }

  #refreshReplays(): void {
    const next = listRuntimeReplays(this.#runtimeReplay);
    if (sameReplaySummaries(this.#replays, next)) return;
    this.#replays = next;
    this.#replayRevision += 1;
  }

  #refreshPerformance(): boolean {
    const next = this.#runtimeReplay?.getPerformanceStatus?.() ?? emptyPerformanceStatus(this.#replays.length);
    if (samePerformanceStatus(this.#performance, next)) return false;
    this.#performance = { ...next };
    return true;
  }

  #addParsedReplay(
    replay: PolyTrackReplayRuntimeBridge,
    payload: ReplayImportPayload,
    name?: string,
  ): PolyViewerReplaySummary {
    if (typeof replay.addReplay !== "function") throw new Error("Replay importing is unavailable.");
    // `frames` is leaderboard/result metadata, not an editor duration. Passing
    // it into the runtime used to resize or truncate the shared shot and could
    // leave deterministic rendering permanently waiting for that replay.
    const runtimeMetadata: ReplayImportPayload = { recording: payload.recording };
    if (payload.carStyle) runtimeMetadata.carStyle = payload.carStyle;
    if (payload.verifiedState !== undefined) runtimeMetadata.verifiedState = payload.verifiedState;
    return replay.addReplay(payload.recording, name, runtimeMetadata);
  }
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function emptyPerformanceStatus(totalReplays = 0): PolyViewerReplayPerformanceStatus {
  return {
    quality: "full",
    totalReplays,
    visibleReplays: totalReplays,
    previewReplays: Math.min(totalReplays, 20),
    packedBytes: 0,
    readyReplays: totalReplays,
    renderReady: totalReplays > 0,
  };
}

function samePerformanceStatus(
  left: PolyViewerReplayPerformanceStatus,
  right: PolyViewerReplayPerformanceStatus,
): boolean {
  return left.quality === right.quality
    && left.totalReplays === right.totalReplays
    && left.visibleReplays === right.visibleReplays
    && left.previewReplays === right.previewReplays
    && left.packedBytes === right.packedBytes
    && left.readyReplays === right.readyReplays
    && left.renderReady === right.renderReady;
}

function sameReplaySummaries(
  left: readonly PolyViewerReplaySummary[],
  right: readonly PolyViewerReplaySummary[],
): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && entry.id === candidate.id
      && entry.name === candidate.name
      && entry.visible === candidate.visible
      && entry.opacity === candidate.opacity
      && entry.nameTagVisible === candidate.nameTagVisible
      && entry.removable === candidate.removable;
  });
}

function listRuntimeReplays(replay: PolyTrackReplayRuntimeBridge | null): PolyViewerReplaySummary[] {
  if (!replay) return [];
  if (typeof replay.listReplays === "function") {
    return replay.listReplays().map((summary) => ({
      id: summary.id,
      name: summary.name,
      visible: summary.visible,
      opacity: summary.opacity,
      removable: summary.removable,
      nameTagVisible: summary.nameTagVisible ?? false,
    }));
  }
  return replay.primaryCar ? [{
    id: "main",
    name: "Main Replay",
    visible: true,
    opacity: 1,
    nameTagVisible: false,
    removable: false,
  }] : [];
}
