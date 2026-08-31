import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RenderPanel", () => {
  const source = readFileSync(
    new URL("../src/polyviewer/ui/RenderPanel.ts", import.meta.url),
    "utf8",
  );

  it("offers native car shadows as an enabled-by-default render option", () => {
    expect(source).toContain('name="shadows" type="checkbox" checked');
    expect(source).toContain('const carShadows = data.get("shadows") === "on";');
    expect(source).toContain("carShadows,");
  });
});
