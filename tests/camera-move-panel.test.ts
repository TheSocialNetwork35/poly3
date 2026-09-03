import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Camera Move UI", () => {
  const shell = readFileSync(new URL("../src/polyviewer/ui/EditorShell.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/polyviewer/ui/CameraMovePanel.ts", import.meta.url), "utf8");

  it("places a clearly named import/export action in the right-side stack", () => {
    expect(shell).toContain("Camera Import / Export");
    expect(shell).toContain("this.#rightStack.append(cameraMoveButton, this.#replayPanel, this.#shortcutSheet)");
    expect(shell).not.toContain('<button class="polyviewer-camera-moves-button"');
  });

  it("labels the import and export workflows explicitly", () => {
    expect(panel).toContain("Export Camera Move");
    expect(panel).toContain("Choose Camera Move File");
    expect(panel).toContain("Import Camera Move");
    expect(panel).toContain('class="polyviewer-camera-move-import-options" hidden');
  });
});
