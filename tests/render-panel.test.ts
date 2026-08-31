import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RenderPanel", () => {
  const source = readFileSync(
    new URL("../src/polyviewer/ui/RenderPanel.ts", import.meta.url),
    "utf8",
  );

  it("offers expensive native effects as enabled-by-default render options", () => {
    expect(source).toContain('name="shadows" type="checkbox" checked');
    expect(source).toContain('name="particles" type="checkbox" checked');
    expect(source).toContain('name="skidmarks" type="checkbox" checked');
    expect(source).toContain('const carShadows = data.get("shadows") === "on";');
    expect(source).toContain('const particles = data.get("particles") === "on";');
    expect(source).toContain('const skidmarks = data.get("skidmarks") === "on";');
    expect(source).toContain("carShadows,");
    expect(source).toContain("particles,");
    expect(source).toContain("skidmarks,");
  });
});
