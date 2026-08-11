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

export function lookAtQuaternion(from: VectorValue, target: VectorValue): QuaternionValue {
  const forward = normalizeVector({
    x: target.x - from.x,
    y: target.y - from.y,
    z: target.z - from.z,
  });
  if (Math.hypot(forward.x, forward.y, forward.z) === 0) return { x: 0, y: 0, z: 0, w: 1 };
  const z = { x: -forward.x, y: -forward.y, z: -forward.z };
  let x = normalizeVector(crossVectors({ x: 0, y: 1, z: 0 }, z));
  if (Math.hypot(x.x, x.y, x.z) < 1e-6) {
    x = normalizeVector(crossVectors({ x: 0, y: 0, z: 1 }, z));
  }
  const y = crossVectors(z, x);
  return quaternionFromRotationMatrix(
    x.x, y.x, z.x,
    x.y, y.y, z.y,
    x.z, y.z, z.z,
  );
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

export function slerpQuaternions(a: QuaternionValue, b: QuaternionValue, amount: number): QuaternionValue {
  const t = Math.max(0, Math.min(1, amount));
  let end = b;
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (dot < 0) {
    dot = -dot;
    end = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  }
  if (dot > 0.9995) return normalizeQuaternion({
    x: a.x + t * (end.x - a.x),
    y: a.y + t * (end.y - a.y),
    z: a.z + t * (end.z - a.z),
    w: a.w + t * (end.w - a.w),
  });
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  const denominator = Math.sin(angle);
  const startWeight = Math.sin((1 - t) * angle) / denominator;
  const endWeight = Math.sin(t * angle) / denominator;
  return {
    x: a.x * startWeight + end.x * endWeight,
    y: a.y * startWeight + end.y * endWeight,
    z: a.z * startWeight + end.z * endWeight,
    w: a.w * startWeight + end.w * endWeight,
  };
}

function normalizeQuaternion(q: QuaternionValue): QuaternionValue {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function normalizeVector(vector: VectorValue): VectorValue {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length === 0) return { x: 0, y: 0, z: 0 };
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function crossVectors(a: VectorValue, b: VectorValue): VectorValue {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function quaternionFromRotationMatrix(
  m11: number, m12: number, m13: number,
  m21: number, m22: number, m23: number,
  m31: number, m32: number, m33: number,
): QuaternionValue {
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return normalizeQuaternion({
      x: (m32 - m23) * s,
      y: (m13 - m31) * s,
      z: (m21 - m12) * s,
      w: 0.25 / s,
    });
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return normalizeQuaternion({ x: 0.25 * s, y: (m12 + m21) / s, z: (m13 + m31) / s, w: (m32 - m23) / s });
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return normalizeQuaternion({ x: (m12 + m21) / s, y: 0.25 * s, z: (m23 + m32) / s, w: (m13 - m31) / s });
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return normalizeQuaternion({ x: (m13 + m31) / s, y: (m23 + m32) / s, z: 0.25 * s, w: (m21 - m12) / s });
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
