export {};

declare global {
  interface Window {
    __POLYTRACK_062__?: PolyTrackBridge;
    __POLYVIEWER_INPUT_ACTIVE__: boolean;
    __POLYVIEWER_CREATE_PACKED_REPLAY_STORE__?: (options?: {
      sampleFrames?: number[] | ReadonlySet<number>;
    }) => PolyViewerPackedReplayStore;
  }

  interface PolyTrackBridge {
    readonly version: "0.6.2";
    readonly renderer: PolyTrackRenderer;
    readonly scene: PolyTrackScene;
    readonly camera: PolyTrackCamera;
    readonly canvas: HTMLCanvasElement;
    readonly audio: PolyTrackAudioBridge | null;
    readonly state: object;
    replay: PolyTrackReplayRuntimeBridge | null;
  }

  interface PolyTrackAudioBridge {
    readonly context: AudioContext | null;
    readonly destinationMaster: AudioNode | null;
  }

  interface PolyTrackReplayDriveResult {
    frame: number;
    advanceVisuals: boolean;
  }

  type PolyTrackReplayDriver = (
    deltaSeconds: number,
    durationFrames: number,
    loadedFrames: number,
  ) => PolyTrackReplayDriveResult;

  interface PolyTrackReplayRuntimeBridge {
    readonly owner: object;
    driver: PolyTrackReplayDriver | null;
    readonly durationFrames: number;
    readonly loadedFrames: number;
    readonly timeFrames: number;
    readonly primaryCar: PolyTrackCarTarget | null;
    listReplays?(): PolyViewerReplaySummary[];
    getCar?(id: string): PolyTrackCarTarget | null;
    getNativeCameraPose?(id: string): PolyTrackCameraPose | null;
    getPerformanceStatus?(): PolyViewerReplayPerformanceStatus;
    setPriorityReplay?(id: string): void;
    setRenderMode?(rendering: boolean): void;
    prepareRender?(
      settings: PolyViewerReplayRenderPreparation,
      signal?: AbortSignal,
      onProgress?: (completed: number, total: number) => void,
    ): Promise<void>;
    releaseRenderPreparation?(): void;
    addReplay?(recordingString: string, name?: string, metadata?: PolyViewerReplayImportMetadata): PolyViewerReplaySummary;
    beginReplayBatch?(): void;
    endReplayBatch?(): void;
    setReplayName(id: string, name: string): void;
    setReplayVisible(id: string, visible: boolean): void;
    setReplayOpacity(id: string, opacity: number): void;
    setReplayNameTagVisible?(id: string, visible: boolean): void;
    refreshOverlays?(): void;
    removeReplay(id: string): void;
    nativeCameraPose: PolyTrackCameraPose | null;
    setDriver(driver: PolyTrackReplayDriver | null): void;
    setNativePaused(paused: boolean): void;
    seekFrame(frame: number): void;
    evaluateFrame(frame: number, advanceVisuals: boolean): void;
  }

  interface PolyViewerReplayRenderPreparation {
    fps: number;
    simulationWorkers?: number;
    startMicroseconds: number;
    endMicroseconds: number;
  }

  interface PolyViewerReplayImportMetadata {
    carStyle?: string;
    frames?: number;
    verifiedState?: number;
  }

  interface PolyViewerReplaySummary {
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    nameTagVisible: boolean;
    removable: boolean;
  }

  interface PolyViewerReplayPerformanceStatus {
    quality: "full";
    totalReplays: number;
    visibleReplays: number;
    previewReplays: number;
    packedBytes: number;
    readyReplays: number;
    renderReady: boolean;
  }

  interface PolyViewerPackedReplayStore {
    readonly lastFrame: number;
    readonly packedBytes: number;
    push(state: object): void;
    pushPacked(bytes: Uint8Array): void;
    getFrame(frame: number): object | null;
  }

  interface PolyTrackCameraPose {
    position: { x: number; y: number; z: number };
    quaternion: { x: number; y: number; z: number; w: number };
    fov: number;
  }

  interface PolyTrackCarTarget {
    getPosition(): { x: number; y: number; z: number };
    getQuaternion(): { x: number; y: number; z: number; w: number };
  }

  interface PolyTrackRenderer {
    readonly scene: PolyTrackScene;
    readonly camera: PolyTrackCamera;
    readonly canvas: HTMLCanvasElement;
    polyviewerBeginCapture(
      width: number,
      height: number,
      effects?: { particles?: boolean; skidmarks?: boolean },
    ): void;
    polyviewerRenderFrame(carShadows?: boolean): void;
    polyviewerEndCapture(): void;
  }

  interface PolyTrackScene {
    onBeforeRender: ((...args: unknown[]) => void) | null;
  }

  interface PolyTrackVector3 {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): PolyTrackVector3;
  }

  interface PolyTrackQuaternion {
    x: number;
    y: number;
    z: number;
    w: number;
    set(x: number, y: number, z: number, w: number): PolyTrackQuaternion;
  }

  interface PolyTrackCamera {
    position: PolyTrackVector3;
    quaternion: PolyTrackQuaternion;
    fov?: number;
    aspect?: number;
    updateProjectionMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
    matrixWorldInverse: { copy(value: unknown): { invert(): void } };
    matrixWorld: unknown;
  }
}
