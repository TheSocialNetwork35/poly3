import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoExporter } from "../src/polyviewer/render/VideoExporter";

describe("VideoExporter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports an honest WebCodecs limitation instead of falling back to screen recording", async () => {
    vi.stubGlobal("VideoEncoder", undefined);
    const exporter = new VideoExporter({} as never, {} as HTMLCanvasElement);
    await expect(exporter.export({
      width: 1920,
      height: 1080,
      fps: 60,
      startMicroseconds: 0,
      endMicroseconds: 1_000_000,
    })).rejects.toThrow("cannot encode video with WebCodecs");
  });
});
