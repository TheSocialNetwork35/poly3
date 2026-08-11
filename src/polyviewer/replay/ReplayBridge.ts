import { MasterTimeline } from "../timeline/MasterTimeline";
import { parseReplayImport } from "./ReplayImport";

const MICROSECONDS_PER_FRAME = 1_000;

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
}

export interface ReplayEditorState {
  timeMicroseconds: number;
  playing: boolean;
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
    this.#lifecycleMonitor = setInterval(() => this.#synchronizeRuntimeReplay(), 250);
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
    return listRuntimeReplays(this.#runtimeReplay);
  }

  addReplay(recordingString: string, name?: string): PolyViewerReplaySummary {
    const replay = this.#runtimeReplay;
    if (!replay) throw new Error("Open a PolyTrack replay before adding another recording.");
    if (typeof replay.addReplay !== "function") {
      throw new Error("The PolyTrack runtime was updated incompletely. Reload the page once and try again.");
    }
    const payload = parseReplayImport(recordingString);
    this.timeline.pause();
    const added = replay.addReplay(payload.recording, name, payload);
    this.#notify();
    return added;
  }

  setReplayName(id: string, name: string): void {
    this.#requireRuntimeReplay().setReplayName(id, name);
    this.#notify();
  }

  setReplayVisible(id: string, visible: boolean): void {
    this.#requireRuntimeReplay().setReplayVisible(id, visible);
    this.#notify();
  }

  setReplayOpacity(id: string, opacity: number): void {
    this.#requireRuntimeReplay().setReplayOpacity(id, opacity);
    this.#notify();
  }

  setReplayOffset(id: string, offsetMilliseconds: number): void {
    this.timeline.pause();
    const maximum = Math.floor(this.timeline.durationMicroseconds / MICROSECONDS_PER_FRAME);
    const safeOffset = Math.max(0, Math.min(maximum, Math.round(offsetMilliseconds)));
    this.#requireRuntimeReplay().setReplayOffset(id, safeOffset);
    this.#notify();
  }

  removeReplay(id: string): void {
    this.timeline.pause();
    this.#requireRuntimeReplay().removeReplay(id);
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

  #synchronizeRuntimeReplay(): void {
    const next = this.#bridge.replay;
    if (next === this.#runtimeReplay) return;
    this.#detachRuntimeReplay();
    this.#runtimeReplay = next;
    if (next) {
      this.timeline.setDurationMicroseconds(next.durationFrames * MICROSECONDS_PER_FRAME);
      this.timeline.seekMicroseconds(
        Math.min(next.timeFrames, next.loadedFrames) * MICROSECONDS_PER_FRAME,
      );
    }
    this.#applyDriverState();
    this.#notify();
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
      replays: listRuntimeReplays(replay),
    });
  }
}

function listRuntimeReplays(replay: PolyTrackReplayRuntimeBridge | null): PolyViewerReplaySummary[] {
  if (!replay) return [];
  if (typeof replay.listReplays === "function") return replay.listReplays();
  return replay.primaryCar ? [{
    id: "main",
    name: "Main Replay",
    visible: true,
    opacity: 1,
    offsetMilliseconds: 0,
    removable: false,
  }] : [];
}
