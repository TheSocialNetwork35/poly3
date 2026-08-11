const MICROSECONDS_PER_SECOND = 1_000_000;

export class MasterTimeline {
  #timeMicroseconds = 0;
  #durationMicroseconds = 0;
  #playing = false;
  #rate = 1;

  get timeMicroseconds(): number {
    return this.#timeMicroseconds;
  }

  get timeSeconds(): number {
    return this.#timeMicroseconds / MICROSECONDS_PER_SECOND;
  }

  get durationMicroseconds(): number {
    return this.#durationMicroseconds;
  }

  get playing(): boolean {
    return this.#playing;
  }

  setDurationMicroseconds(value: number): void {
    this.#durationMicroseconds = requireNonNegativeInteger(value, "duration");
    this.#timeMicroseconds = Math.min(this.#timeMicroseconds, this.#durationMicroseconds);
  }

  setRate(value: number): void {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError("Playback rate must be positive.");
    this.#rate = value;
  }

  play(): void {
    if (this.#timeMicroseconds >= this.#durationMicroseconds) this.#timeMicroseconds = 0;
    this.#playing = true;
  }

  pause(): void {
    this.#playing = false;
  }

  seekMicroseconds(value: number): void {
    const time = requireNonNegativeInteger(value, "time");
    this.#timeMicroseconds = Math.min(time, this.#durationMicroseconds);
  }

  seekFrame(frame: number, fps: number): void {
    requireNonNegativeInteger(frame, "frame");
    if (!Number.isInteger(fps) || fps <= 0) throw new RangeError("FPS must be a positive integer.");
    this.seekMicroseconds(Math.round((frame * MICROSECONDS_PER_SECOND) / fps));
  }

  update(deltaSeconds: number): void {
    if (!this.#playing) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("Timeline delta must be finite and non-negative.");
    }
    const delta = Math.round(deltaSeconds * this.#rate * MICROSECONDS_PER_SECOND);
    this.#timeMicroseconds = Math.min(this.#durationMicroseconds, this.#timeMicroseconds + delta);
    if (this.#timeMicroseconds === this.#durationMicroseconds) this.#playing = false;
  }
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}
