import "./styles.css";
import { CameraKeyframeStore } from "./polyviewer/camera/CameraKeyframeStore";
import { evaluateCameraPath } from "./polyviewer/camera/CameraPathEvaluator";
import { FreeCameraController } from "./polyviewer/camera/FreeCameraController";
import { ShortcutManager } from "./polyviewer/input/ShortcutManager";
import { ReplayBridge } from "./polyviewer/replay/ReplayBridge";
import { MasterTimeline } from "./polyviewer/timeline/MasterTimeline";
import { EditorShell } from "./polyviewer/ui/EditorShell";
import { ReplayTimeline } from "./polyviewer/ui/ReplayTimeline";

const masterTimeline = new MasterTimeline();
const cameraPoints = new CameraKeyframeStore();
let cameraController: FreeCameraController | null = null;
let selectedCameraPointId: string | null = null;
const shell = new EditorShell({
  onCameraModeChange: (mode) => cameraController?.setMode(mode),
  onAddCameraPoint: addCameraPoint,
  onMoveCameraPoint: moveCameraPoint,
  onUpdateCameraPoint: updateCameraPoint,
  onDuplicateCameraPoint: (id) => {
    const duplicate = cameraPoints.duplicate(id);
    selectCameraPoint(duplicate.id);
  },
  onDeleteCameraPoint: deleteCameraPoint,
});
let replayBridge: ReplayBridge | null = null;
let replayWasConnected = false;
let replayDurationMicroseconds = 0;
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
        if (status.playing) {
          const cameraState = evaluateCameraPath(cameraPoints.points, status.timeMicroseconds);
          if (cameraState) cameraController?.applyState(cameraState);
        }
        if (status.durationMicroseconds !== replayDurationMicroseconds) {
          replayTimeline.setCameraPoints(cameraPoints.points);
          replayDurationMicroseconds = status.durationMicroseconds;
        }
        if (status.connected !== replayWasConnected) cameraController?.refreshStatus();
        replayWasConnected = status.connected;
      },
    });
    cameraController = new FreeCameraController(bridge, {
      getTarget: () => replayBridge?.primaryCar ?? null,
      onChange: (status) => {
        shell.update(status);
        replayBridge?.setActive(status.enabled);
        shortcuts.setActive(status.enabled);
      },
    });
    shell.toggleButton.addEventListener("click", () => cameraController?.toggle());
    window.addEventListener("pagehide", () => {
      cameraController?.dispose();
      replayBridge?.dispose();
      shortcuts.dispose();
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
