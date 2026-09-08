import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PackedReplayStore,
  installPackedReplayStoreFactory,
  decodeCarStateInto,
  type PackedCarState,
} from "../src/polyviewer/replay/PackedReplayStore";

describe("PackedReplayStore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shares one schedule across 1,900 stores and still accepts array callers", () => {
    vi.stubGlobal("window", {});
    installPackedReplayStoreFactory();
    const samples = new Set([0, 2]);
    const has = vi.spyOn(samples, "has");
    for (let car = 0; car < 1900; car++) {
      const store = window.__POLYVIEWER_CREATE_PACKED_REPLAY_STORE__!({ sampleFrames: samples });
      store.push(state(0));
      store.pushPacked(encode(state(1)));
      store.pushPacked(encode(state(2)));
      expect(store.packedBytes).toBe(encode(state(2)).byteLength);
    }
    expect(has).toHaveBeenCalledTimes(3800);
    const legacy = window.__POLYVIEWER_CREATE_PACKED_REPLAY_STORE__!({ sampleFrames: [0, 2] });
    legacy.push(state(0));
    legacy.pushPacked(encode(state(1)));
    expect(legacy.packedBytes).toBe(0);
  });
  it.each([null, new Set([0, 17, 33, 50])])("visits the same distinct states as millisecond lookups (%s)", samples => {
    const store = new PackedReplayStore({ sampleFrames: samples ?? undefined });
    for (let frame = 0; frame <= 50; frame++) store.push(state(frame));
    for (const [first, last] of [[1, 17], [18, 33], [35, 49], [51, 70], [0, 0]]) {
      const expected = new Set<number>();
      for (let frame = first!; frame <= last!; frame++) expected.add(store.getFrame(frame)!.frames);
      const visited: number[] = [];
      store.forEachFrameNumber(first!, last!, frame => visited.push(frame));
      expect(visited).toEqual([...expected]);
    }
  });

  it("keeps transferred binary states compact and decodes every native field", () => {
    const store = new PackedReplayStore();
    store.push(state(0));
    const expected = state(1, true);
    const packed = encode(expected);
    store.pushPacked(packed);

    expect(store.lastFrame).toBe(1);
    expect(store.packedBytes).toBe(packed.byteLength);
    expect(store.getFrame(1)).toEqual(expected);
    expect(store.getFrame(1)).toBe(store.getFrame(1));
  });

  it("alternates decoded objects so Car.setCarState can retain the previous frame", () => {
    const store = new PackedReplayStore();
    store.push(state(0));
    store.pushPacked(encode(state(1)));
    store.pushPacked(encode(state(2)));
    store.pushPacked(encode(state(3)));

    const first = store.getFrame(1)!;
    const second = store.getFrame(2)!;
    expect(first).not.toBe(second);
    expect(first.frames).toBe(1);
    expect(second.frames).toBe(2);
    expect(store.getFrame(3)!.frames).toBe(3);
  });

  it("rejects gaps and truncated worker data", () => {
    const store = new PackedReplayStore();
    expect(() => store.pushPacked(encode(state(1)))).toThrow("First frame must be zero");
    expect(() => decodeCarStateInto(new Uint8Array([0, 0, 0]), state(0))).toThrow(
      "CarState data is too short",
    );
  });

  it("tracks full worker progress while retaining only requested render frames", () => {
    const store = new PackedReplayStore({ sampleFrames: new Set([0, 2, 5]) });
    store.push(state(0));
    for (let frame = 1; frame <= 5; frame += 1) store.pushPacked(encode(state(frame)));

    expect(store.lastFrame).toBe(5);
    expect(store.getFrame(1)?.frames).toBe(0);
    expect(store.getFrame(2)?.frames).toBe(2);
    expect(store.getFrame(4)?.frames).toBe(2);
    expect(store.getFrame(5)?.frames).toBe(5);
    expect(store.packedBytes).toBe(encode(state(2)).byteLength * 2);
  });
});

function state(frame: number, detailed = false): PackedCarState {
  return {
    frames: frame,
    speedKmh: 123.5,
    hasStarted: true,
    finishFrames: detailed ? 9876 : null,
    nextCheckpointIndex: 12,
    hasCheckpointToRespawnAt: detailed,
    position: { x: 1.25, y: -2.5, z: 3.75 },
    quaternion: { x: 0.125, y: 0.25, z: 0.5, w: 0.75 },
    collisionImpulses: detailed ? [30.5, 80.25] : [],
    wheelContact: detailed
      ? [
          { position: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 1, z: 0 } },
          null,
          { position: { x: 4, y: 5, z: 6 }, normal: { x: 0.125, y: 0.5, z: 0.25 } },
          null,
        ]
      : [null, null, null, null],
    wheelSuspensionLength: [0.125, 0.25, 0.5, 0.75],
    wheelSuspensionVelocity: [1, 2, 3, 4],
    wheelDeltaRotation: [5, 6, 7, 8],
    wheelSkidInfo: [0.875, 0.75, 0.625, 0.5],
    steering: -0.375,
    brakeLightEnabled: detailed,
    controls: { up: true, right: detailed, down: false, left: true, reset: false },
  };
}

function encode(value: PackedCarState): Uint8Array {
  const contactCount = value.wheelContact.filter(Boolean).length;
  const size = 3 + 4 + 1 + (value.finishFrames === null ? 0 : 3) + 2 + 12 + 16 + 1
    + value.collisionImpulses.length * 4 + contactCount * 24 + 16 * 4 + 4 + 1;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const uint24 = (number: number): void => {
    bytes[offset++] = number & 255;
    bytes[offset++] = number >>> 8 & 255;
    bytes[offset++] = number >>> 16 & 255;
  };
  const float32 = (number: number): void => {
    view.setFloat32(offset, number, true);
    offset += 4;
  };
  const vector = (vectorValue: { x: number; y: number; z: number }): void => {
    float32(vectorValue.x);
    float32(vectorValue.y);
    float32(vectorValue.z);
  };
  uint24(value.frames);
  float32(value.speedKmh);
  bytes[offset++] = (value.hasStarted ? 1 : 0)
    | (value.finishFrames === null ? 0 : 2)
    | (value.hasCheckpointToRespawnAt ? 4 : 0)
    | (value.wheelContact[0] ? 8 : 0)
    | (value.wheelContact[1] ? 16 : 0)
    | (value.wheelContact[2] ? 32 : 0)
    | (value.wheelContact[3] ? 64 : 0);
  if (value.finishFrames !== null) uint24(value.finishFrames);
  view.setUint16(offset, value.nextCheckpointIndex, true);
  offset += 2;
  vector(value.position);
  float32(value.quaternion.x);
  float32(value.quaternion.y);
  float32(value.quaternion.z);
  float32(value.quaternion.w);
  bytes[offset++] = value.collisionImpulses.length;
  value.collisionImpulses.forEach(float32);
  for (const contact of value.wheelContact) {
    if (contact) {
      vector(contact.position);
      vector(contact.normal);
    }
  }
  value.wheelSuspensionLength.forEach(float32);
  value.wheelSuspensionVelocity.forEach(float32);
  value.wheelDeltaRotation.forEach(float32);
  value.wheelSkidInfo.forEach(float32);
  float32(value.steering);
  bytes[offset++] = (value.controls.up ? 1 : 0)
    | (value.controls.right ? 2 : 0)
    | (value.controls.down ? 4 : 0)
    | (value.controls.left ? 8 : 0)
    | (value.controls.reset ? 16 : 0)
    | (value.brakeLightEnabled ? 32 : 0);
  return bytes;
}
