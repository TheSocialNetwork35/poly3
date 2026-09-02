import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableVideoCodec,
  getFirstEncodableAudioCodec,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny";
import type { ReplayBridge } from "../replay/ReplayBridge";
import type { FrameRenderSettings } from "./DeterministicFrameRenderer";
import { DeterministicFrameRenderer } from "./DeterministicFrameRenderer";
import { captureNativeReplayAudio, prepareNativeReplayAudio } from "./NativeAudioCapture";

export interface VideoExportOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  onReplayPreparationProgress?: (completed: number, total: number) => void;
  onAudioProgress?: (elapsedMicroseconds: number, durationMicroseconds: number) => void;
  onAudioWarning?: (message: string) => void;
  includeAudio?: boolean;
}

export interface VideoExportResult {
  blob: Blob;
  codec: VideoCodec;
  mimeType: string;
  extension: "mp4";
  hasAudio: boolean;
}

export class VideoExporter {
  #frameRenderer: DeterministicFrameRenderer;
  #canvas: HTMLCanvasElement;
  #audio: PolyTrackAudioBridge | null;
  #replay: ReplayBridge;

  constructor(
    frameRenderer: DeterministicFrameRenderer,
    canvas: HTMLCanvasElement,
    audio: PolyTrackAudioBridge | null,
    replay: ReplayBridge,
  ) {
    this.#frameRenderer = frameRenderer;
    this.#canvas = canvas;
    this.#audio = audio;
    this.#replay = replay;
  }

  async export(settings: FrameRenderSettings, options: VideoExportOptions = {}): Promise<VideoExportResult> {
    if (typeof globalThis.VideoEncoder !== "function") {
      throw new Error("This browser cannot encode video with WebCodecs. Use a current Chromium-based browser over HTTPS.");
    }

    // Resume WebAudio before the first capability-check await consumes the
    // Render button's user activation. A failed audio device must never block
    // deterministic video export.
    let audioPrepared = false;
    if (options.includeAudio !== false) {
      try {
        audioPrepared = await prepareNativeReplayAudio(this.#audio);
        if (!audioPrepared) options.onAudioWarning?.("PolyTrack sound is unavailable in this browser session.");
      } catch (error) {
        options.onAudioWarning?.(
          error instanceof Error ? error.message : "The browser could not start PolyTrack sound.",
        );
      }
    }

    const format = new Mp4OutputFormat({ fastStart: false });
    const codec = await selectCodec(format, settings.width, settings.height);
    if (!codec) {
      throw new Error(`No MP4 video encoder supports ${settings.width}×${settings.height} in this browser.`);
    }

    await this.#replay.prepareAllForRender(settings, options.signal, options.onReplayPreparationProgress);
    try {
      let audioBuffer: AudioBuffer | null = null;
      if (options.includeAudio !== false && audioPrepared) {
        try {
          audioBuffer = await captureNativeReplayAudio(
            this.#audio,
            this.#replay,
            settings.startMicroseconds,
            settings.endMicroseconds,
            { signal: options.signal, onProgress: options.onAudioProgress },
          );
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          options.onAudioWarning?.(error instanceof Error ? error.message : "Audio capture failed.");
        }
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
      let audioSource: AudioBufferSource | null = null;
      if (audioBuffer) {
        const audioCodec = await selectAudioCodec(
          format,
          audioBuffer.numberOfChannels,
          audioBuffer.sampleRate,
        );
        if (audioCodec) {
          audioSource = new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH });
          output.addAudioTrack(audioSource, { name: "PolyTrack game audio" });
        }
      }
      await output.start();

      try {
        const videoRender = this.#frameRenderer.render(settings, {
          signal: options.signal,
          captureImage: false,
          onProgress: options.onProgress,
          onFrame: async (frame) => {
            const timestamp = (frame.timestampMicroseconds - settings.startMicroseconds) / 1_000_000;
            await source.add(timestamp, frame.durationMicroseconds / 1_000_000);
          },
        });
        await Promise.all([videoRender, audioSource?.add(audioBuffer!) ?? Promise.resolve()]);
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
        hasAudio: audioSource !== null,
      };
    } finally {
      this.#replay.releaseRenderPreparation();
    }
  }
}

async function selectAudioCodec(
  format: Mp4OutputFormat,
  numberOfChannels: number,
  sampleRate: number,
): Promise<AudioCodec | null> {
  const supported = format.getSupportedAudioCodecs();
  const preference: AudioCodec[] = ["aac", "opus"];
  return getFirstEncodableAudioCodec(
    preference.filter((codec) => supported.includes(codec)),
    { numberOfChannels, sampleRate, quality: QUALITY_HIGH },
  );
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
