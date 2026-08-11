export interface ReplayImportPayload {
  recording: string;
  carStyle?: string;
  frames?: number;
  verifiedState?: number;
}

/** Accepts PolyTrack's bare recording string and the object copied from a run. */
export function parseReplayImport(value: string): ReplayImportPayload {
  const raw = value.trim();
  if (!raw) throw new Error("Paste a PolyTrack recording or recording object.");
  if (!raw.startsWith("{")) return { recording: raw };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The recording object is not valid JSON. Put double quotes around its fields and values.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The recording JSON must be an object.");
  }
  const object = parsed as Record<string, unknown>;
  if (typeof object.recording !== "string" || !object.recording.trim()) {
    throw new Error('The recording object needs a non-empty "recording" field.');
  }
  const payload: ReplayImportPayload = { recording: object.recording.trim() };
  if (object.carStyle !== undefined) {
    if (typeof object.carStyle !== "string" || !object.carStyle.trim()) {
      throw new Error('"carStyle" must be a non-empty string.');
    }
    payload.carStyle = object.carStyle.trim();
  }
  if (object.frames !== undefined) {
    if (!Number.isSafeInteger(object.frames) || Number(object.frames) <= 0) {
      throw new Error('"frames" must be a positive integer.');
    }
    payload.frames = Number(object.frames);
  }
  if (object.verifiedState !== undefined) {
    if (!Number.isSafeInteger(object.verifiedState)) {
      throw new Error('"verifiedState" must be an integer.');
    }
    payload.verifiedState = Number(object.verifiedState);
  }
  return payload;
}
