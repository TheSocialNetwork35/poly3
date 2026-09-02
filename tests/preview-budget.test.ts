import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimePatch = readFileSync(new URL("../scripts/prepare-runtime.mjs", import.meta.url), "utf8");
const editorShell = readFileSync(new URL("../src/polyviewer/ui/EditorShell.ts", import.meta.url), "utf8");
const videoExporter = readFileSync(new URL("../src/polyviewer/render/VideoExporter.ts", import.meta.url), "utf8");

describe("large replay preview budget", () => {
  it("limits interactive native car work without lowering fidelity", () => {
    expect(runtimePatch).toContain("pvReplay.previewLimit=20");
    expect(runtimePatch).toContain("polyviewerPreviewVisible");
    expect(runtimePatch).toContain("pvEnabled.slice(0,pvReplay.previewLimit)");
    expect(runtimePatch).not.toContain("polyviewerSetAdaptiveQuality");
    expect(runtimePatch).toContain("pvReplay.simulationConcurrency=20");
    expect(runtimePatch).toContain("pvReplay.syncPreviewSimulations=");
  });

  it("always keeps the selected camera target in the preview set", () => {
    expect(runtimePatch).toContain("pvPriority&&!pvPreview.has(pvPriority.polyviewerId)");
    expect(runtimePatch).toContain("pvPreview.add(pvPriority.polyviewerId)");
  });

  it("uses all enabled cars for capture and restores preview mode afterward", () => {
    expect(runtimePatch).toContain("pvReplay.setRenderMode=pvRendering");
    expect(runtimePatch).toContain("r?.setRenderMode?.(!0)");
    expect(runtimePatch).toContain("a?.setRenderMode?.(!1)");
    expect(runtimePatch).toContain("pvReplay.prepareRender=");
    expect(runtimePatch).toContain("pvReplay.releaseRenderPreparation=");
    expect(videoExporter).toContain("finally {");
    expect(videoExporter).toContain("this.#replay.releaseRenderPreparation();");
  });

  it("accepts 2,000 imports without eagerly starting every worker simulation", () => {
    expect(runtimePatch).toContain("pvMaxReplays=2000");
    expect(runtimePatch).toContain('polyviewerSimulationState:"idle"');
    expect(runtimePatch).not.toContain("pvWorker.startCar(pvCreated.id,new bt.A(pvRequestedFrames))");
    expect(runtimePatch).toContain("polyviewerRuntimeEntry:null");
    expect(runtimePatch).toContain("const pvDeactivate=");
    expect(runtimePatch).toContain("const pvBuildSampleFrames=");
    expect(runtimePatch).toContain("sampleFrames:[...pvSampleFrames]");
  });

  it("virtualizes the replay controls instead of mounting 2,000 editor rows", () => {
    expect(editorShell).toContain("visible.slice(start, end)");
    expect(editorShell).toContain("polyviewer-replay-spacer");
    expect(editorShell).toContain("requestAnimationFrame");
  });
});
