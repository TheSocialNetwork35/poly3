export interface QuaternionValue {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface VectorValue {
  x: number;
  y: number;
  z: number;
}

export function quaternionFromYawPitchRoll(
  yaw: number,
  pitch: number,
  roll: number,
): QuaternionValue {
  const halfYaw = yaw / 2;
  const halfPitch = pitch / 2;
  const halfRoll = roll / 2;
  const yawRotation = { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) };
  const pitchRotation = { x: Math.sin(halfPitch), y: 0, z: 0, w: Math.cos(halfPitch) };
  const rollRotation = { x: 0, y: 0, z: Math.sin(halfRoll), w: Math.cos(halfRoll) };
  return multiplyQuaternions(multiplyQuaternions(yawRotation, pitchRotation), rollRotation);
}

export function multiplyQuaternions(a: QuaternionValue, b: QuaternionValue): QuaternionValue {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function invertQuaternion(q: QuaternionValue): QuaternionValue {
  const lengthSquared = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
  if (lengthSquared === 0) return { x: 0, y: 0, z: 0, w: 1 };
  return {
    x: -q.x / lengthSquared,
    y: -q.y / lengthSquared,
    z: -q.z / lengthSquared,
    w: q.w / lengthSquared,
  };
}

export function rotateVector(vector: VectorValue, q: QuaternionValue): VectorValue {
  const tx = 2 * (q.y * vector.z - q.z * vector.y);
  const ty = 2 * (q.z * vector.x - q.x * vector.z);
  const tz = 2 * (q.x * vector.y - q.y * vector.x);
  return {
    x: vector.x + q.w * tx + (q.y * tz - q.z * ty),
    y: vector.y + q.w * ty + (q.z * tx - q.x * tz),
    z: vector.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

export function yawPitchFromQuaternion(q: QuaternionValue): { yaw: number; pitch: number } {
  const { yaw, pitch } = yawPitchRollFromQuaternion(q);
  return { yaw, pitch };
}

export function yawPitchRollFromQuaternion(
  q: QuaternionValue,
): { yaw: number; pitch: number; roll: number } {
  const m11 = 1 - 2 * (q.y * q.y + q.z * q.z);
  const m13 = 2 * (q.x * q.z + q.y * q.w);
  const m21 = 2 * (q.x * q.y + q.z * q.w);
  const m22 = 1 - 2 * (q.x * q.x + q.z * q.z);
  const m23 = 2 * (q.y * q.z - q.x * q.w);
  const m31 = 2 * (q.x * q.z - q.y * q.w);
  const m33 = 1 - 2 * (q.x * q.x + q.y * q.y);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -m23)));
  if (Math.abs(m23) < 0.9999999) {
    return { yaw: Math.atan2(m13, m33), pitch, roll: Math.atan2(m21, m22) };
  }
  return {
    yaw: Math.atan2(-m31, m11),
    pitch,
    roll: 0,
  };
}
