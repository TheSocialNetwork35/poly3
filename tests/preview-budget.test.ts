import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimePatch = readFileSync(new URL("../scripts/prepare-runtime.mjs", import.meta.url), "utf8");

describe("large replay preview budget", () => {
  it("limits interactive native car work without lowering fidelity", () => {
    expect(runtimePatch).toContain("pvReplay.previewLimit=20");
    expect(runtimePatch).toContain("polyviewerPreviewVisible");
    expect(runtimePatch).toContain("pvEnabled.slice(0,pvReplay.previewLimit)");
    expect(runtimePatch).not.toContain("polyviewerSetAdaptiveQuality");
  });

  it("always keeps the selected camera target in the preview set", () => {
    expect(runtimePatch).toContain("pvPriority&&!pvPreview.has(pvPriority.polyviewerId)");
    expect(runtimePatch).toContain("pvPreview.add(pvPriority.polyviewerId)");
  });

  it("uses all enabled cars for capture and restores preview mode afterward", () => {
    expect(runtimePatch).toContain("pvReplay.setRenderMode=pvRendering");
    expect(runtimePatch).toContain("r?.setRenderMode?.(!0)");
    expect(runtimePatch).toContain("a?.setRenderMode?.(!1)");
  });
});
