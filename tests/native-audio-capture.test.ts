import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureNativeReplayAudio,
  createAudioBufferFromChunks,
} from "../src/polyviewer/render/NativeAudioCapture";

describe("native PolyTrack audio capture", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns an honest video-only fallback when MediaRecorder is unavailable", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const audio = {
      context: {} as AudioContext,
      destinationMaster: {} as AudioNode,
    };
    await expect(captureNativeReplayAudio(audio, {} as never, 0, 1_000_000)).resolves.toBeNull();
  });

  it("does not attempt to invent sound when the native PolyTrack graph is unavailable", async () => {
    await expect(captureNativeReplayAudio(null, {} as never, 0, 1_000_000)).resolves.toBeNull();
  });

  it("merges lossless PCM chunks and trims them to the exact video duration", () => {
    const channels: Float32Array[] = [];
    const context = {
      sampleRate: 4,
      createBuffer: (numberOfChannels: number, length: number) => {
        channels.splice(0, channels.length, ...Array.from(
          { length: numberOfChannels },
          () => new Float32Array(length),
        ));
        return {
          numberOfChannels,
          length,
          sampleRate: 4,
          duration: length / 4,
          getChannelData: (channel: number) => channels[channel]!,
        } as AudioBuffer;
      },
    } as unknown as BaseAudioContext;

    const result = createAudioBufferFromChunks(context, [
      [new Float32Array([0.1, 0.2]), new Float32Array([0.3, 0.4])],
      [new Float32Array([0.5, 0.6]), new Float32Array([0.7, 0.8])],
    ], 750_000);

    expect(result.length).toBe(3);
    expect(Array.from(channels[0]!)).toEqual([expect.closeTo(0.1), expect.closeTo(0.2), expect.closeTo(0.5)]);
    expect(Array.from(channels[1]!)).toEqual([expect.closeTo(0.3), expect.closeTo(0.4), expect.closeTo(0.7)]);
  });
});
