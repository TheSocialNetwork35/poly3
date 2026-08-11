import type { ReplayBridge } from "../replay/ReplayBridge";

interface NativeAudioCaptureOptions {
  signal?: AbortSignal;
  onProgress?: (elapsedMicroseconds: number, durationMicroseconds: number) => void;
}

/**
 * Records PolyTrack's actual WebAudio graph at 1.0x, then pads/trims the
 * decoded samples to the exact deterministic video duration.
 */
export async function captureNativeReplayAudio(
  audio: PolyTrackAudioBridge | null,
  replay: ReplayBridge,
  durationMicroseconds: number,
  options: NativeAudioCaptureOptions = {},
): Promise<AudioBuffer | null> {
  const context = audio?.context;
  const master = audio?.destinationMaster;
  if (!context || !master || typeof MediaRecorder !== "function") return null;
  const mimeType = ["audio/webm;codecs=opus", "audio/webm"]
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) return null;

  await context.resume();
  const destination = context.createMediaStreamDestination();
  master.connect(destination);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(destination.stream, { mimeType });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.addEventListener("error", () => reject(new Error("PolyTrack audio recording failed.")), { once: true });
  });
  const editorState = replay.captureEditorState();

  try {
    replay.evaluateExactFrame(0, false);
    recorder.start(250);
    replay.play();
    await waitForTimeline(replay, durationMicroseconds, options);
    recorder.stop();
    await stopped;
  } finally {
    replay.pause();
    if (recorder.state !== "inactive") recorder.stop();
    master.disconnect(destination);
    for (const track of destination.stream.getTracks()) track.stop();
    replay.restoreEditorState(editorState);
  }

  const encoded = new Blob(chunks, { type: mimeType });
  if (encoded.size === 0) return null;
  const decoded = await context.decodeAudioData(await encoded.arrayBuffer());
  return fitAudioDuration(context, decoded, durationMicroseconds);
}

function waitForTimeline(
  replay: ReplayBridge,
  durationMicroseconds: number,
  options: NativeAudioCaptureOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const update = () => {
      if (options.signal?.aborted) {
        reject(new DOMException("Rendering cancelled.", "AbortError"));
        return;
      }
      const elapsed = Math.min(durationMicroseconds, replay.timeline.timeMicroseconds);
      options.onProgress?.(elapsed, durationMicroseconds);
      if (elapsed >= durationMicroseconds) resolve();
      else requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  });
}

function fitAudioDuration(
  context: BaseAudioContext,
  source: AudioBuffer,
  durationMicroseconds: number,
): AudioBuffer {
  const frames = Math.max(1, Math.round(durationMicroseconds / 1_000_000 * source.sampleRate));
  const result = context.createBuffer(source.numberOfChannels, frames, source.sampleRate);
  const copiedFrames = Math.min(frames, source.length);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    result.copyToChannel(source.getChannelData(channel).subarray(0, copiedFrames), channel);
  }
  return result;
}
