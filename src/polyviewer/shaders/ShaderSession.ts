import { loadShaderSettings, type ShaderSettings } from "./ShaderSettings";

/** No postprocessing code is loaded until the user explicitly enables preview. */
export class ShaderSession {
  settings = loadShaderSettings();
  enabled = false;
  private suspended = false;
  private revision = 0;
  private pipeline?: { ready?: Promise<void>; dispose(): void };
  constructor(private bridge: PolyTrackRenderer, private onStatus: (message: string, active: boolean) => void) {}

  async configure(settings: ShaderSettings, enabled: boolean): Promise<void> {
    this.settings = { ...settings };
    this.enabled = enabled;
    const revision = ++this.revision;
    this.pipeline?.dispose(); this.pipeline = undefined;
    if (!enabled || this.suspended) {
      this.onStatus(this.suspended ? "Preview paused during export." : "Preview off · native rendering", false);
      return;
    }
    this.onStatus("Preparing shaders…", false);
    try {
      const { CinematicCapture } = await import("../render/CinematicCapture");
      if (revision !== this.revision) return;
      this.pipeline = new CinematicCapture(this.bridge, this.bridge.canvas.width, this.bridge.canvas.height, this.settings, true, error => {
        ++this.revision; this.enabled = false; this.pipeline = undefined;
        this.onStatus(`Shaders unavailable: ${error instanceof Error ? error.message : String(error)}`, false);
      });
      await this.pipeline.ready;
      if (revision !== this.revision) return;
      this.onStatus("Live preview on · extra GPU work", true);
    } catch (error) {
      if (revision !== this.revision) return;
      this.pipeline?.dispose(); this.pipeline = undefined;
      this.enabled = false;
      this.onStatus(`Shaders unavailable: ${error instanceof Error ? error.message : String(error)}`, false);
    }
  }
  suspend(): void {
    this.suspended = true; ++this.revision;
    this.pipeline?.dispose(); this.pipeline = undefined;
  }
  resume(): void { this.suspended = false; void this.configure(this.settings, this.enabled); }
  dispose(): void { this.enabled = false; this.suspend(); }
}
