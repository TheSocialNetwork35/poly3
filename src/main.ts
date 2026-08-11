import "./styles.css";
import { FreeCameraController } from "./polyviewer/camera/FreeCameraController";
import { EditorShell } from "./polyviewer/ui/EditorShell";

const shell = new EditorShell();

void waitForPolyTrackBridge()
  .then((bridge) => {
    if (bridge.version !== "0.6.2") {
      throw new Error(`PolyViewer requires PolyTrack 0.6.2, received ${String(bridge.version)}.`);
    }
    const controller = new FreeCameraController(bridge, {
      onChange: (status) => shell.update(status),
    });
    shell.toggleButton.addEventListener("click", () => controller.toggle());
    window.addEventListener("pagehide", () => controller.dispose(), { once: true });
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
