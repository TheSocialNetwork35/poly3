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
  const forward = rotateVector({ x: 0, y: 0, z: -1 }, q);
  return {
    yaw: Math.atan2(-forward.x, -forward.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, forward.y))),
  };
}
