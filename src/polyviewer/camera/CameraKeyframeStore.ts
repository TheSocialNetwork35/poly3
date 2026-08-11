import {
  normalizeCameraMode,
  type CinematicCameraState,
} from "./FreeCameraController";

export interface CameraKeyframe {
  id: string;
  timeMicroseconds: number;
  state: CinematicCameraState;
  interpolation: "smooth";
}

export class CameraKeyframeStore {
  #points: CameraKeyframe[] = [];
  #listeners = new Set<(points: readonly CameraKeyframe[]) => void>();

  get points(): readonly CameraKeyframe[] {
    return this.#points;
  }

  get(id: string): CameraKeyframe | null {
    return this.#points.find((point) => point.id === id) ?? null;
  }

  add(timeMicroseconds: number, state: CinematicCameraState): CameraKeyframe {
    requireTime(timeMicroseconds);
    const point: CameraKeyframe = {
      id: createStableId(),
      timeMicroseconds,
      state: migrateCameraState(state),
      interpolation: "smooth",
    };
    this.#points.push(point);
    this.#sortAndNotify();
    return point;
  }

  addOrUpdateAtTime(timeMicroseconds: number, state: CinematicCameraState): CameraKeyframe {
    requireTime(timeMicroseconds);
    const existing = [...this.#points].reverse().find(
      (point) => point.timeMicroseconds === timeMicroseconds,
    );
    if (!existing) return this.add(timeMicroseconds, state);
    existing.state = migrateCameraState(state);
    this.#sortAndNotify();
    return existing;
  }

  update(id: string, timeMicroseconds: number, state: CinematicCameraState): void {
    requireTime(timeMicroseconds);
    const point = this.#requirePoint(id);
    point.timeMicroseconds = timeMicroseconds;
    point.state = migrateCameraState(state);
    this.#sortAndNotify();
  }

  move(id: string, timeMicroseconds: number): void {
    requireTime(timeMicroseconds);
    this.#requirePoint(id).timeMicroseconds = timeMicroseconds;
    this.#sortAndNotify();
  }

  duplicate(id: string): CameraKeyframe {
    const source = this.#requirePoint(id);
    return this.add(source.timeMicroseconds, source.state);
  }

  remove(id: string): void {
    const index = this.#points.findIndex((point) => point.id === id);
    if (index < 0) return;
    this.#points.splice(index, 1);
    this.#notify();
  }

  subscribe(listener: (points: readonly CameraKeyframe[]) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#points);
    return () => this.#listeners.delete(listener);
  }

  #requirePoint(id: string): CameraKeyframe {
    const point = this.#points.find((candidate) => candidate.id === id);
    if (!point) throw new Error(`Unknown camera point: ${id}`);
    return point;
  }

  #sortAndNotify(): void {
    // Modern JavaScript sorting is stable. Equal-time points retain creation
    // order so the most recently created one deterministically wins.
    this.#points.sort((a, b) => a.timeMicroseconds - b.timeMicroseconds);
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener(this.#points);
  }
}

export function migrateCameraState(state: CinematicCameraState): CinematicCameraState {
  const migrated = structuredClone(state);
  migrated.mode = normalizeCameraMode(migrated.mode);
  migrated.targetReplayId ||= "main";
  migrated.lookAtOffset ??= { x: 0, y: 0, z: 0, w: 1 };
  migrated.normalPositionOffset ??= { x: 0, y: 0, z: 0 };
  migrated.normalOrientationOffset ??= { x: 0, y: 0, z: 0, w: 1 };
  return migrated;
}

function requireTime(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Camera point time must be a non-negative safe integer.");
  }
}

function createStableId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `camera-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
