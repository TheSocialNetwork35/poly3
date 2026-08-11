import "./styles.css";
import { CameraKeyframeStore } from "./polyviewer/camera/CameraKeyframeStore";
import { FreeCameraController } from "./polyviewer/camera/FreeCameraController";
import { ReplayBridge } from "./polyviewer/replay/ReplayBridge";
import { MasterTimeline } from "./polyviewer/timeline/MasterTimeline";
import { EditorShell } from "./polyviewer/ui/EditorShell";
import { ReplayTimeline } from "./polyviewer/ui/ReplayTimeline";

const masterTimeline = new MasterTimeline();
const cameraPoints = new CameraKeyframeStore();
let cameraController: FreeCameraController | null = null;
const shell = new EditorShell({
  onCameraModeChange: (mode) => cameraController?.setMode(mode),
  onAddCameraPoint: () => {
    if (cameraController) {
      cameraPoints.add(masterTimeline.timeMicroseconds, cameraController.captureState());
    }
  },
});
let replayBridge: ReplayBridge | null = null;
let replayWasConnected = false;
let replayDurationMicroseconds = 0;
const replayTimeline = new ReplayTimeline({
  onTogglePlayback: () => replayBridge?.togglePlayback(),
  onRestart: () => replayBridge?.restart(),
  onStep: (deltaMicroseconds) => replayBridge?.stepMicroseconds(deltaMicroseconds),
  onSeek: (timeMicroseconds) => replayBridge?.seekMicroseconds(timeMicroseconds),
});
cameraPoints.subscribe((points) => replayTimeline.setCameraPoints(points));

void waitForPolyTrackBridge()
  .then((bridge) => {
    if (bridge.version !== "0.6.2") {
      throw new Error(`PolyViewer requires PolyTrack 0.6.2, received ${String(bridge.version)}.`);
    }
    replayBridge = new ReplayBridge(bridge, masterTimeline, {
      onChange: (status) => {
        replayTimeline.update(status);
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
      },
    });
    shell.toggleButton.addEventListener("click", () => cameraController?.toggle());
    window.addEventListener("pagehide", () => {
      cameraController?.dispose();
      replayBridge?.dispose();
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
