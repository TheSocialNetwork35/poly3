export interface PackedVector3 {
  x: number;
  y: number;
  z: number;
}

export interface PackedQuaternion extends PackedVector3 {
  w: number;
}

export interface PackedWheelContact {
  position: PackedVector3;
  normal: PackedVector3;
}

export interface PackedCarState {
  frames: number;
  speedKmh: number;
  hasStarted: boolean;
  finishFrames: number | null;
  nextCheckpointIndex: number;
  hasCheckpointToRespawnAt: boolean;
  position: PackedVector3;
  quaternion: PackedQuaternion;
  collisionImpulses: number[];
  wheelContact: Array<PackedWheelContact | null>;
  wheelSuspensionLength: number[];
  wheelSuspensionVelocity: number[];
  wheelDeltaRotation: number[];
  wheelSkidInfo: number[];
  steering: number;
  brakeLightEnabled: boolean;
  controls: {
    up: boolean;
    right: boolean;
    down: boolean;
    left: boolean;
    reset: boolean;
  };
}

type StoredFrame = PackedCarState | Uint8Array;

/**
 * Stores worker-produced CarState buffers without expanding every millisecond
 * into a large graph of JavaScript objects. Two reusable decoded states are
 * alternated because PolyTrack's native Car.setCarState keeps the previous
 * state while applying the next one.
 */
export class PackedReplayStore {
  #frames: StoredFrame[] = [];
  #decodeSlots = [createCarState(), createCarState()];
  #nextDecodeSlot = 0;
  #cachedFrame = -1;
  #cachedState: PackedCarState | null = null;
  #packedBytes = 0;

  get lastFrame(): number {
    return Math.max(0, this.#frames.length - 1);
  }

  get packedBytes(): number {
    return this.#packedBytes;
  }

  push(state: PackedCarState): void {
    this.#assertNextFrame(state.frames);
    this.#frames.push(state);
  }

  pushPacked(bytes: Uint8Array): void {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 3) {
      throw new Error("Packed CarState data is invalid.");
    }
    const frame = readUint24(bytes, 0);
    this.#assertNextFrame(frame);
    this.#frames.push(bytes);
    this.#packedBytes += bytes.byteLength;
  }

  getFrame(frame: number): PackedCarState | null {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame >= this.#frames.length) return null;
    const stored = this.#frames[frame]!;
    if (!(stored instanceof Uint8Array)) return stored;
    if (this.#cachedFrame === frame) return this.#cachedState;
    const target = this.#decodeSlots[this.#nextDecodeSlot]!;
    this.#nextDecodeSlot = (this.#nextDecodeSlot + 1) % this.#decodeSlots.length;
    decodeCarStateInto(stored, target);
    this.#cachedFrame = frame;
    this.#cachedState = target;
    return target;
  }

  #assertNextFrame(frame: number): void {
    if (frame !== this.#frames.length) {
      throw new Error(this.#frames.length === 0
        ? "First frame must be zero"
        : "Car states are not continuous");
    }
  }
}

export function installPackedReplayStoreFactory(): void {
  window.__POLYVIEWER_CREATE_PACKED_REPLAY_STORE__ = () => new PackedReplayStore();
}

export function decodeCarStateInto(bytes: Uint8Array, target: PackedCarState): PackedCarState {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const requireBytes = (count: number): void => {
    if (offset + count > bytes.byteLength) throw new Error("CarState data is too short");
  };
  const float32 = (): number => {
    requireBytes(4);
    const value = view.getFloat32(offset, true);
    offset += 4;
    return value;
  };

  requireBytes(3);
  target.frames = readUint24(bytes, offset);
  offset += 3;
  target.speedKmh = float32();
  requireBytes(1);
  const flags = bytes[offset++]!;
  target.hasStarted = (flags & 1) !== 0;
  const hasFinishFrame = (flags & 2) !== 0;
  target.hasCheckpointToRespawnAt = (flags & 4) !== 0;
  const contactFlags = [8, 16, 32, 64];
  if (hasFinishFrame) {
    requireBytes(3);
    target.finishFrames = readUint24(bytes, offset);
    offset += 3;
  } else {
    target.finishFrames = null;
  }
  requireBytes(2);
  target.nextCheckpointIndex = view.getUint16(offset, true);
  offset += 2;
  readVector3(target.position, float32);
  target.quaternion.x = float32();
  target.quaternion.y = float32();
  target.quaternion.z = float32();
  target.quaternion.w = float32();

  requireBytes(1);
  const collisionCount = bytes[offset++]!;
  if (collisionCount > 4) throw new Error("Number of collision impulses exceeds maximum allowed");
  target.collisionImpulses.length = collisionCount;
  for (let index = 0; index < collisionCount; index += 1) {
    target.collisionImpulses[index] = float32();
  }

  for (let index = 0; index < 4; index += 1) {
    if ((flags & contactFlags[index]!) === 0) {
      target.wheelContact[index] = null;
      continue;
    }
    const contact = target.wheelContact[index] ?? createWheelContact();
    readVector3(contact.position, float32);
    readVector3(contact.normal, float32);
    target.wheelContact[index] = contact;
  }
  readNumberArray(target.wheelSuspensionLength, float32);
  readNumberArray(target.wheelSuspensionVelocity, float32);
  readNumberArray(target.wheelDeltaRotation, float32);
  readNumberArray(target.wheelSkidInfo, float32);
  target.steering = float32();

  requireBytes(1);
  const controls = bytes[offset++]!;
  target.controls.up = (controls & 1) !== 0;
  target.controls.right = (controls & 2) !== 0;
  target.controls.down = (controls & 4) !== 0;
  target.controls.left = (controls & 8) !== 0;
  target.controls.reset = (controls & 16) !== 0;
  target.brakeLightEnabled = (controls & 32) !== 0;
  return target;
}

function createCarState(): PackedCarState {
  return {
    frames: 0,
    speedKmh: 0,
    hasStarted: false,
    finishFrames: null,
    nextCheckpointIndex: 0,
    hasCheckpointToRespawnAt: false,
    position: { x: 0, y: 0, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    collisionImpulses: [],
    wheelContact: [null, null, null, null],
    wheelSuspensionLength: [0, 0, 0, 0],
    wheelSuspensionVelocity: [0, 0, 0, 0],
    wheelDeltaRotation: [0, 0, 0, 0],
    wheelSkidInfo: [0, 0, 0, 0],
    steering: 0,
    brakeLightEnabled: false,
    controls: { up: false, right: false, down: false, left: false, reset: false },
  };
}

function createWheelContact(): PackedWheelContact {
  return {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 0 },
  };
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | bytes[offset + 1]! << 8 | bytes[offset + 2]! << 16;
}

function readVector3(target: PackedVector3, read: () => number): void {
  target.x = read();
  target.y = read();
  target.z = read();
}

function readNumberArray(target: number[], read: () => number): void {
  for (let index = 0; index < 4; index += 1) target[index] = read();
}
