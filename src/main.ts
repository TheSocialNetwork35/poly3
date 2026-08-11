import "./styles.css";
import { CameraKeyframeStore } from "./polyviewer/camera/CameraKeyframeStore";
import { FreeCameraController } from "./polyviewer/camera/FreeCameraController";
import { ShortcutManager } from "./polyviewer/input/ShortcutManager";
import { CleanPreviewController } from "./polyviewer/preview/CleanPreviewController";
import { ReplayBridge } from "./polyviewer/replay/ReplayBridge";
import { SceneEvaluator } from "./polyviewer/scene/SceneEvaluator";
import { MasterTimeline } from "./polyviewer/timeline/MasterTimeline";
import { EditorShell } from "./polyviewer/ui/EditorShell";
import { ReplayTimeline } from "./polyviewer/ui/ReplayTimeline";

const masterTimeline = new MasterTimeline();
const cameraPoints = new CameraKeyframeStore();
let cameraController: FreeCameraController | null = null;
let selectedCameraPointId: string | null = null;
let shell: EditorShell;
const cleanPreview = new CleanPreviewController(document, (enabled) => shell.setCleanPreview(enabled));
shell = new EditorShell({
  onCameraModeChange: (mode) => cameraController?.setMode(mode),
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
  onTargetReplayChange: (id) => cameraController?.setTargetReplay(id),
  onReplayNameChange: (id, name) => replayBridge?.setReplayName(id, name),
  onReplayVisibilityChange: (id, visible) => replayBridge?.setReplayVisible(id, visible),
  onReplayOpacityChange: (id, opacity) => replayBridge?.setReplayOpacity(id, opacity),
  onReplayOffsetChange: (id, offsetMilliseconds) => replayBridge?.setReplayOffset(id, offsetMilliseconds),
  onRemoveReplay: (id) => replayBridge?.removeReplay(id),
  onToggleCleanPreview: () => cleanPreview.toggle(),
});
let replayBridge: ReplayBridge | null = null;
let replayWasConnected = false;
let replayDurationMicroseconds = 0;
let nativeCameraWasAvailable = false;
let sceneEvaluator: SceneEvaluator | null = null;
const replayTimeline = new ReplayTimeline({
  onTogglePlayback: () => replayBridge?.togglePlayback(),
  onRestart: () => replayBridge?.restart(),
  onStep: (deltaMicroseconds) => replayBridge?.stepMicroseconds(deltaMicroseconds),
  onSeek: (timeMicroseconds) => replayBridge?.seekMicroseconds(timeMicroseconds),
  onSelectCameraPoint: selectCameraPoint,
  onMoveCameraPoint: moveCameraPoint,
});
const shortcuts = new ShortcutManager({
  onToggleEditor: () => cameraController?.toggle(),
  onTogglePlayback: () => replayBridge?.togglePlayback(),
  onStep: (deltaMicroseconds) => replayBridge?.stepMicroseconds(deltaMicroseconds),
  onAddCameraPoint: addCameraPoint,
  onUpdateCameraPoint: () => {
    if (selectedCameraPointId) updateCameraPoint(selectedCameraPointId);
  },
  onDeleteCameraPoint: () => {
    if (selectedCameraPointId) deleteCameraPoint(selectedCameraPointId);
  },
  onToggleCleanPreview: () => cleanPreview.toggle(),
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
        shell.setReplays(status.connected, status.replays);
        if (status.active) sceneEvaluator?.evaluatePreview(status.timeMicroseconds);
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
        if (!status.enabled) cleanPreview.setEnabled(false);
        replayBridge?.setActive(status.enabled);
        shortcuts.setActive(status.enabled);
      },
    });
    sceneEvaluator = new SceneEvaluator(
      () => cameraPoints.points,
      replayBridge,
      cameraController,
    );
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
  replayBridge?.pause();
  replayBridge?.seekMicroseconds(point.timeMicroseconds);
  cameraController?.applyState(point.state);
  replayTimeline.setSelectedCameraPoint(id);
  shell.setSelectedCameraPoint(point);
}

function addCameraPoint(): void {
  if (!cameraController) return;
  const point = cameraPoints.add(
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
  cameraPoints.move(id, clamped);
  if (selectedCameraPointId === id) {
    replayBridge?.seekMicroseconds(clamped);
    shell.setSelectedCameraPoint(cameraPoints.get(id));
  }
}

function deleteCameraPoint(id: string): void {
  cameraPoints.remove(id);
  if (selectedCameraPointId !== id) return;
  selectedCameraPointId = null;
  replayTimeline.setSelectedCameraPoint(null);
  shell.setSelectedCameraPoint(null);
}
