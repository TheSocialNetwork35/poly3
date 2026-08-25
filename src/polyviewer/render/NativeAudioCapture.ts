import type { ReplayBridge } from "../replay/ReplayBridge";

interface NativeAudioCaptureOptions {
  signal?: AbortSignal;
  onProgress?: (elapsedMicroseconds: number, durationMicroseconds: number) => void;
}

const WORKLET_NAME = "polyviewer-audio-capture";
const workletLoads = new WeakMap<AudioContext, Promise<void>>();

/** Must run directly from the Render button gesture. */
export async function prepareNativeReplayAudio(audio: PolyTrackAudioBridge | null): Promise<boolean> {
  const context = audio?.context;
  if (!context || !audio.destinationMaster || typeof context.resume !== "function") return false;
  if (context.state === "closed") return false;
  if (context.state !== "running") await context.resume();
  return context.state === "running";
}

/**
 * Captures PolyTrack's real WebAudio graph at 1.0x. AudioWorklet records
 * lossless PCM, avoiding the old Opus -> decode -> AAC double encode.
 */
export async function captureNativeReplayAudio(
  audio: PolyTrackAudioBridge | null,
  replay: ReplayBridge,
  startMicroseconds: number,
  endMicroseconds: number,
  options: NativeAudioCaptureOptions = {},
): Promise<AudioBuffer | null> {
  const durationMicroseconds = endMicroseconds - startMicroseconds;
  validateRange(startMicroseconds, endMicroseconds);
  const context = audio?.context;
  const master = audio?.destinationMaster;
  if (!context || !master || !await prepareNativeReplayAudio(audio)) return null;

  if (typeof globalThis.AudioWorkletNode === "function" && context.audioWorklet) {
    try {
      await ensureCaptureWorklet(context);
      return await capturePcmWithWorklet(
        context, master, replay, startMicroseconds, endMicroseconds, options,
      );
    } catch (error) {
      if (context.state !== "running") throw audioRendererError(error);
      if (!isWorkletSetupError(error)) throw error;
    }
  }

  return captureWithMediaRecorder(
    context, master, replay, startMicroseconds, endMicroseconds, durationMicroseconds, options,
  );
}

async function capturePcmWithWorklet(
  context: AudioContext,
  master: AudioNode,
  replay: ReplayBridge,
  startMicroseconds: number,
  endMicroseconds: number,
  options: NativeAudioCaptureOptions,
): Promise<AudioBuffer | null> {
  let node: AudioWorkletNode;
  try {
    node = new AudioWorkletNode(context, WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCountMode: "explicit",
      channelCount: 2,
    });
  } catch (error) {
    throw markWorkletSetupError(error);
  }
  const chunks: Float32Array[][] = [];
  let stoppedResolve: (() => void) | null = null;
  const stopped = new Promise<void>((resolve) => { stoppedResolve = resolve; });
  node.port.onmessage = (event: MessageEvent<{ type?: string; channels?: Float32Array[] }>) => {
    if (event.data.type === "chunk" && event.data.channels?.length) chunks.push(event.data.channels);
    if (event.data.type === "stopped") stoppedResolve?.();
  };
  const editorState = replay.captureEditorState();
  master.connect(node);

  try {
    replay.evaluateExactFrame(startMicroseconds, false);
    node.port.postMessage({ type: "start" });
    replay.play();
    await waitForTimeline(context, replay, startMicroseconds, endMicroseconds, options);
    node.port.postMessage({ type: "stop" });
    await withTimeout(stopped, 2_000, "The browser did not finish the lossless audio capture.");
  } finally {
    replay.pause();
    node.port.postMessage({ type: "stop" });
    master.disconnect(node);
    node.disconnect();
    node.port.close();
    replay.restoreEditorState(editorState);
  }

  return chunks.length === 0
    ? null
    : createAudioBufferFromChunks(context, chunks, endMicroseconds - startMicroseconds);
}

async function captureWithMediaRecorder(
  context: AudioContext,
  master: AudioNode,
  replay: ReplayBridge,
  startMicroseconds: number,
  endMicroseconds: number,
  durationMicroseconds: number,
  options: NativeAudioCaptureOptions,
): Promise<AudioBuffer | null> {
  if (typeof MediaRecorder !== "function") return null;
  const mimeType = ["audio/webm;codecs=opus", "audio/webm"]
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) return null;

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
    replay.evaluateExactFrame(startMicroseconds, false);
    recorder.start(250);
    replay.play();
    await waitForTimeline(context, replay, startMicroseconds, endMicroseconds, options);
    recorder.requestData();
    recorder.stop();
    await withTimeout(stopped, 3_000, "The browser did not finish the PolyTrack audio capture.");
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
  context: AudioContext,
  replay: ReplayBridge,
  startMicroseconds: number,
  endMicroseconds: number,
  options: NativeAudioCaptureOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const wallDeadline = performance.now() + (endMicroseconds - startMicroseconds) / 1_000 + 5_000;
    const update = () => {
      if (options.signal?.aborted) {
        reject(new DOMException("Rendering cancelled.", "AbortError"));
        return;
      }
      if (context.state !== "running") {
        reject(audioRendererError());
        return;
      }
      if (performance.now() > wallDeadline) {
        reject(new Error("PolyTrack audio could not reach the selected end time."));
        return;
      }
      const current = Math.min(endMicroseconds, replay.timeline.timeMicroseconds);
      options.onProgress?.(Math.max(0, current - startMicroseconds), endMicroseconds - startMicroseconds);
      if (current >= endMicroseconds) resolve();
      else requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  });
}

function ensureCaptureWorklet(context: AudioContext): Promise<void> {
  let loading = workletLoads.get(context);
  if (!loading) {
    loading = context.audioWorklet
      .addModule(new URL("/polyviewer-audio-capture-worklet.js", window.location.href).href)
      .catch((error) => { throw markWorkletSetupError(error); });
    workletLoads.set(context, loading);
  }
  return loading;
}

export function createAudioBufferFromChunks(
  context: BaseAudioContext,
  chunks: readonly (readonly Float32Array[])[],
  durationMicroseconds: number,
): AudioBuffer {
  const numberOfChannels = Math.max(1, ...chunks.map((chunk) => chunk.length));
  const frames = Math.max(1, Math.round(durationMicroseconds / 1_000_000 * context.sampleRate));
  const result = context.createBuffer(numberOfChannels, frames, context.sampleRate);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const destination = result.getChannelData(channel);
    let offset = 0;
    for (const chunk of chunks) {
      if (offset >= frames) break;
      const source = chunk[channel] ?? chunk[0];
      if (!source) continue;
      const copied = Math.min(source.length, frames - offset);
      destination.set(source.subarray(0, copied), offset);
      offset += copied;
    }
  }
  return result;
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

function validateRange(startMicroseconds: number, endMicroseconds: number): void {
  if (!Number.isSafeInteger(startMicroseconds) || !Number.isSafeInteger(endMicroseconds)
    || startMicroseconds < 0 || endMicroseconds <= startMicroseconds) {
    throw new RangeError("Audio capture needs a valid ordered microsecond range.");
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function markWorkletSetupError(error: unknown): Error {
  const marked = error instanceof Error ? error : new Error("AudioWorklet setup failed.");
  Object.defineProperty(marked, "polyviewerWorkletSetup", { value: true });
  return marked;
}

function isWorkletSetupError(error: unknown): boolean {
  return error instanceof Error
    && (error as Error & { polyviewerWorkletSetup?: boolean }).polyviewerWorkletSetup === true;
}

function audioRendererError(cause?: unknown): Error {
  const error = new Error("The browser audio device stopped. Continuing with video only.");
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  return error;
}
