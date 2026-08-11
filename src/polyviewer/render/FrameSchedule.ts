const MICROSECONDS_PER_SECOND = 1_000_000n;

export function frameCountForRange(
  startMicroseconds: number,
  endMicroseconds: number,
  fps: number,
): number {
  requireRange(startMicroseconds, endMicroseconds, fps);
  const duration = BigInt(endMicroseconds - startMicroseconds);
  return Number((duration * BigInt(fps) + MICROSECONDS_PER_SECOND - 1n) / MICROSECONDS_PER_SECOND);
}

export function frameTimeMicroseconds(
  frameIndex: number,
  startMicroseconds: number,
  fps: number,
): number {
  if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) throw new RangeError("Frame index must be a non-negative safe integer.");
  if (!Number.isSafeInteger(startMicroseconds) || startMicroseconds < 0) throw new RangeError("Start time must be a non-negative safe integer.");
  if (!Number.isSafeInteger(fps) || fps <= 0) throw new RangeError("FPS must be a positive safe integer.");
  const numerator = BigInt(frameIndex) * MICROSECONDS_PER_SECOND;
  const rounded = (numerator + BigInt(Math.floor(fps / 2))) / BigInt(fps);
  return startMicroseconds + Number(rounded);
}

function requireRange(start: number, end: number, fps: number): void {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw new RangeError("Render range must use ordered non-negative integer microseconds.");
  }
  if (!Number.isSafeInteger(fps) || fps <= 0) throw new RangeError("FPS must be a positive safe integer.");
}
