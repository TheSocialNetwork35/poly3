import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableVideoCodec,
  type VideoCodec,
} from "mediabunny";
import type { FrameRenderSettings } from "./DeterministicFrameRenderer";
import { DeterministicFrameRenderer } from "./DeterministicFrameRenderer";

export interface VideoExportOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export interface VideoExportResult {
  blob: Blob;
  codec: VideoCodec;
  mimeType: string;
  extension: "mp4";
}

export class VideoExporter {
  #frameRenderer: DeterministicFrameRenderer;
  #canvas: HTMLCanvasElement;

  constructor(frameRenderer: DeterministicFrameRenderer, canvas: HTMLCanvasElement) {
    this.#frameRenderer = frameRenderer;
    this.#canvas = canvas;
  }

  async export(settings: FrameRenderSettings, options: VideoExportOptions = {}): Promise<VideoExportResult> {
    if (typeof globalThis.VideoEncoder !== "function") {
      throw new Error("This browser cannot encode video with WebCodecs. Use a current Chromium-based browser over HTTPS.");
    }

    const format = new Mp4OutputFormat({ fastStart: false });
    const codec = await selectCodec(format, settings.width, settings.height);
    if (!codec) {
      throw new Error(`No MP4 video encoder supports ${settings.width}×${settings.height} in this browser.`);
    }

    const target = new BufferTarget();
    const output = new Output({ format, target });
    const source = new CanvasSource(this.#canvas, {
      codec,
      quality: QUALITY_HIGH,
      latencyMode: "quality",
      keyFrameInterval: 2,
      sizeChangeBehavior: "deny",
    });
    output.addVideoTrack(source, { frameRate: settings.fps });
    await output.start();

    try {
      await this.#frameRenderer.render(settings, {
        signal: options.signal,
        captureImage: false,
        onProgress: options.onProgress,
        onFrame: async (frame) => {
          const timestamp = (frame.timestampMicroseconds - settings.startMicroseconds) / 1_000_000;
          await source.add(timestamp, frame.durationMicroseconds / 1_000_000);
        },
      });
      await output.finalize();
    } catch (error) {
      if (output.state === "started") await output.cancel();
      throw error;
    }

    if (!target.buffer) throw new Error("The MP4 muxer finalized without producing a video buffer.");
    const mimeType = await output.getMimeType();
    return {
      blob: new Blob([target.buffer], { type: mimeType }),
      codec,
      mimeType,
      extension: "mp4",
    };
  }
}

async function selectCodec(
  format: Mp4OutputFormat,
  width: number,
  height: number,
): Promise<VideoCodec | null> {
  const supported = format.getSupportedVideoCodecs();
  const preference: VideoCodec[] = ["avc", "hevc", "vp9", "av1"];
  const candidates = preference.filter((codec) => supported.includes(codec));
  return getFirstEncodableVideoCodec(candidates, { width, height, quality: QUALITY_HIGH });
}
