import "./styles.css";
import { CameraKeyframeStore } from "./polyviewer/camera/CameraKeyframeStore";
import { CameraEditAuthority } from "./polyviewer/camera/CameraEditAuthority";
import { FreeCameraController } from "./polyviewer/camera/FreeCameraController";
import { ShortcutManager } from "./polyviewer/input/ShortcutManager";
import { CleanPreviewController } from "./polyviewer/preview/CleanPreviewController";
import { DeterministicFrameRenderer } from "./polyviewer/render/DeterministicFrameRenderer";
import { VideoExporter } from "./polyviewer/render/VideoExporter";
import { ReplayBridge } from "./polyviewer/replay/ReplayBridge";
import { installPackedReplayStoreFactory } from "./polyviewer/replay/PackedReplayStore";
import { SceneEvaluator } from "./polyviewer/scene/SceneEvaluator";
import { MasterTimeline } from "./polyviewer/timeline/MasterTimeline";
import { EditorShell } from "./polyviewer/ui/EditorShell";
import { ReplayTimeline } from "./polyviewer/ui/ReplayTimeline";
import { RenderPanel } from "./polyviewer/ui/RenderPanel";

installPackedReplayStoreFactory();

const masterTimeline = new MasterTimeline();
const cameraPoints = new CameraKeyframeStore();
let cameraController: FreeCameraController | null = null;
let selectedCameraPointId: string | null = null;
let shell: EditorShell;
let videoExporter: VideoExporter | null = null;
const cameraEditAuthority = new CameraEditAuthority();
const renderPanel = new RenderPanel({
  onRender: (settings, signal, includeAudio, onProgress, onPreparationProgress, onAudioProgress, onAudioWarning) => {
    if (!videoExporter) throw new Error("The PolyTrack renderer is not ready yet.");
    return videoExporter.export(settings, {
      signal,
      includeAudio,
      onProgress,
      onReplayPreparationProgress: onPreparationProgress,
      onAudioProgress,
      onAudioWarning,
    });
  },
});
const cleanPreview = new CleanPreviewController(document, (enabled) => shell.setCleanPreview(enabled));
shell = new EditorShell({
  onCameraModeChange: (mode) => {
    cameraEditAuthority.beginManualEdit();
    cameraController?.setMode(mode);
  },
  onAddCameraPoint: addCameraPoint,
  onMoveCameraPoint: moveCameraPoint,
  onUpdateCameraPoint: updateCameraPoint,
  onDuplicateCameraPoint: (id) => {
    const duplicate = cameraPoints.duplicate(id);
    selectCameraPoint(duplicate.id);
  },
  onDeleteCameraPoint: deleteCameraPoint,
  onAddReplay: (recordingString, name) => {
    replayBridge?.addReplay(recordingString, name);
  },
  onAddReplays: (recordingsValue, leaderboardValue) => {
    return replayBridge?.addReplays(recordingsValue, leaderboardValue);
  },
  onTargetReplayChange: (id) => {
    cameraEditAuthority.beginManualEdit();
    cameraController?.setTargetReplay(id);
    replayBridge?.setPriorityReplay(id);
  },
  onReplayNameChange: (id, name) => replayBridge?.setReplayName(id, name),
  onReplayVisibilityChange: (id, visible) => replayBridge?.setReplayVisible(id, visible),
  onReplayOpacityChange: (id, opacity) => replayBridge?.setReplayOpacity(id, opacity),
  onReplayMasterOpacityChange: (opacity) => replayBridge?.setAllReplayOpacity(opacity),
  onReplayNameTagVisibilityChange: (id, visible) => replayBridge?.setReplayNameTagVisible(id, visible),
  onRemoveReplay: (id) => replayBridge?.removeReplay(id),
  onToggleCleanPreview: () => cleanPreview.toggle(),
  onOpenRender: () => renderPanel.open(masterTimeline.durationMicroseconds),
  onResetCamera: () => {
    cameraEditAuthority.beginManualEdit();
    cameraController?.resetToNormal();
  },
});
let replayBridge: ReplayBridge | null = null;
let replayWasConnected = false;
let replayDurationMicroseconds = 0;
let nativeCameraWasAvailable = false;
let sceneEvaluator: SceneEvaluator | null = null;
let replayRevision = -1;
const replayTimeline = new ReplayTimeline({
  onTogglePlayback: () => {
    cameraEditAuthority.resumePath();
    replayBridge?.togglePlayback();
  },
  onRestart: () => {
    cameraEditAuthority.resumePath();
    replayBridge?.restart();
  },
  onStep: (deltaMicroseconds) => {
    cameraEditAuthority.resumePath();
    replayBridge?.stepMicroseconds(deltaMicroseconds);
  },
  onSeek: (timeMicroseconds) => {
    cameraEditAuthority.resumePath();
    replayBridge?.seekMicroseconds(timeMicroseconds);
  },
  onSelectCameraPoint: selectCameraPoint,
  onMoveCameraPoint: moveCameraPoint,
});
const shortcuts = new ShortcutManager({
  onToggleEditor: () => cameraController?.toggle(),
  onTogglePlayback: () => {
    cameraEditAuthority.resumePath();
    replayBridge?.togglePlayback();
  },
  onRestart: () => {
    cameraEditAuthority.resumePath();
    replayBridge?.restart();
  },
  onStep: (deltaMicroseconds) => {
    cameraEditAuthority.resumePath();
    replayBridge?.stepMicroseconds(deltaMicroseconds);
  },
  onAddCameraPoint: addCameraPoint,
  onUpdateCameraPoint: () => {
    if (selectedCameraPointId) updateCameraPoint(selectedCameraPointId);
  },
  onDeleteCameraPoint: () => {
    if (selectedCameraPointId) deleteCameraPoint(selectedCameraPointId);
  },
  onToggleCleanPreview: () => cleanPreview.toggle(),
  onResetCamera: () => {
    cameraEditAuthority.beginManualEdit();
    cameraController?.resetToNormal();
  },
  onCameraMode: (mode) => {
    cameraEditAuthority.beginManualEdit();
    cameraController?.setMode(mode);
  },
  onCameraInput: (detail) => cameraController?.handleInput(detail),
});
cameraPoints.subscribe((points) => {
  replayTimeline.setCameraPoints(points);
  if (selectedCameraPointId) shell.setSelectedCameraPoint(cameraPoints.get(selectedCameraPointId));
});

void waitForPolyTrackBridge()
  .then((bridge) => {
    if (bridge.version !== "0.6.2") {
      throw new Error(`PolyViewer requires PolyTrack 0.6.2, received ${String(bridge.version)}.`);
    }
    replayBridge = new ReplayBridge(bridge, masterTimeline, {
      onChange: (status) => {
        replayTimeline.update(status);
        if (status.replayRevision !== replayRevision) {
          shell.setReplays(status.connected, status.replays);
          replayRevision = status.replayRevision;
        }
        shell.setPerformanceStatus(status.performance);
        shell.setRenderAvailable(
          status.connected && status.durationMicroseconds > 0
          && status.loadedMicroseconds >= status.durationMicroseconds,
        );
        if (status.active && cameraEditAuthority.shouldApplyPath(status.playing)) {
          sceneEvaluator?.evaluatePreview(status.timeMicroseconds);
        }
        if (status.durationMicroseconds !== replayDurationMicroseconds) {
          replayTimeline.setCameraPoints(cameraPoints.points);
          replayDurationMicroseconds = status.durationMicroseconds;
        }
        if (status.connected !== replayWasConnected) cameraController?.refreshStatus();
        if (status.nativeCameraAvailable !== nativeCameraWasAvailable) {
          cameraController?.refreshStatus();
          nativeCameraWasAvailable = status.nativeCameraAvailable;
        }
        replayWasConnected = status.connected;
      },
    });
    cameraController = new FreeCameraController(bridge, {
      getTarget: (id) => replayBridge?.getCar(id) ?? null,
      getNativeCameraPose: (id) => replayBridge?.getNativeCameraPose(id) ?? null,
      onChange: (status) => {
        shell.update(status);
        replayBridge?.setPriorityReplay(status.targetReplayId);
        if (!status.enabled) cleanPreview.setEnabled(false);
        replayBridge?.setActive(status.enabled);
        shortcuts.setActive(status.enabled);
      },
      onUserEdited: () => {
        cameraEditAuthority.beginManualEdit();
      },
    });
    sceneEvaluator = new SceneEvaluator(
      () => cameraPoints.points,
      replayBridge,
      cameraController,
    );
    const frameRenderer = new DeterministicFrameRenderer(bridge.renderer, sceneEvaluator);
    videoExporter = new VideoExporter(frameRenderer, bridge.canvas, bridge.audio, replayBridge);
    shell.toggleButton.addEventListener("click", () => cameraController?.toggle());
    window.addEventListener("pagehide", () => {
      cameraController?.dispose();
      replayBridge?.dispose();
      shortcuts.dispose();
      cleanPreview.dispose();
    }, { once: true });
  })
  .catch((error: unknown) => {
    console.error(error);
    shell.setError(error instanceof Error ? error.message : "PolyTrack bridge failed to initialize.");
  });

async function waitForPolyTrackBridge(timeoutMilliseconds = 30_000): Promise<PolyTrackBridge> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMilliseconds) {
    if (window.__POLYTRACK_062__) return window.__POLYTRACK_062__;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out while waiting for the verified PolyTrack 0.6.2 runtime.");
}

function selectCameraPoint(id: string): void {
  const point = cameraPoints.get(id);
  if (!point) return;
  selectedCameraPointId = id;
  cameraEditAuthority.resumePath();
  replayBridge?.pause();
  replayBridge?.seekMicroseconds(point.timeMicroseconds);
  cameraController?.applyState(point.state);
  replayTimeline.setSelectedCameraPoint(id);
  shell.setSelectedCameraPoint(point);
}

function addCameraPoint(): void {
  if (!cameraController) return;
  const point = cameraPoints.addOrUpdateAtTime(
    masterTimeline.timeMicroseconds,
    cameraController.captureState(),
  );
  selectCameraPoint(point.id);
}

function updateCameraPoint(id: string): void {
  const point = cameraPoints.get(id);
  if (!point || !cameraController) return;
  cameraPoints.update(id, point.timeMicroseconds, cameraController.captureState());
  selectCameraPoint(id);
}

function moveCameraPoint(id: string, timeMicroseconds: number): void {
  const clamped = Math.max(0, Math.min(masterTimeline.durationMicroseconds, timeMicroseconds));
  cameraEditAuthority.resumePath();
  cameraPoints.move(id, clamped);
  selectedCameraPointId = id;
  replayBridge?.pause();
  replayBridge?.seekMicroseconds(clamped);
  const moved = cameraPoints.get(id);
  if (moved && cameraController) {
    // Dynamic modes (Look At, Normal, Follow, Attached) derive their final
    // world pose from replay state. Re-capture that pose at the new keyframe
    // time so adjacent quaternion transitions cannot retain stale endpoints.
    cameraController.applyState(moved.state);
    cameraPoints.update(id, clamped, cameraController.captureState());
  }
  replayTimeline.setSelectedCameraPoint(id);
  shell.setSelectedCameraPoint(cameraPoints.get(id));
}

function deleteCameraPoint(id: string): void {
  cameraPoints.remove(id);
  if (selectedCameraPointId !== id) return;
  selectedCameraPointId = null;
  replayTimeline.setSelectedCameraPoint(null);
  shell.setSelectedCameraPoint(null);
}
