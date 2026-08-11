import { afterEach, describe, expect, it, vi } from "vitest";
import { captureNativeReplayAudio } from "../src/polyviewer/render/NativeAudioCapture";

describe("native PolyTrack audio capture", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns an honest video-only fallback when MediaRecorder is unavailable", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const audio = {
      context: {} as AudioContext,
      destinationMaster: {} as AudioNode,
    };
    await expect(captureNativeReplayAudio(audio, {} as never, 1_000_000)).resolves.toBeNull();
  });

  it("does not attempt to invent sound when the native PolyTrack graph is unavailable", async () => {
    await expect(captureNativeReplayAudio(null, {} as never, 1_000_000)).resolves.toBeNull();
  });
});
