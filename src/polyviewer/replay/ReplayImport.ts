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
  const looksStructured = raw.startsWith("{")
    || /(?:^|\n)\s*"?recording"?\s*\n?\s*:/.test(raw);
  if (!looksStructured) return { recording: raw };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = parseInspectorObject(raw);
    if (!parsed) {
      throw new Error("The recording object is not valid JSON or copied PolyTrack run data.");
    }
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

function parseInspectorObject(raw: string): Record<string, unknown> | null {
  const recording = readStringField(raw, "recording");
  if (!recording) return null;
  const parsed: Record<string, unknown> = { recording };
  const carStyle = readStringField(raw, "carStyle");
  const frames = readIntegerField(raw, "frames");
  const verifiedState = readIntegerField(raw, "verifiedState");
  if (carStyle !== null) parsed.carStyle = carStyle;
  if (frames !== null) parsed.frames = frames;
  if (verifiedState !== null) parsed.verifiedState = verifiedState;
  return parsed;
}

function readStringField(raw: string, field: string): string | null {
  const match = raw.match(new RegExp(`(?:^|[\\n,{])\\s*"?${field}"?\\s*:\\s*"([^"]*)"`));
  return match?.[1] ?? null;
}

function readIntegerField(raw: string, field: string): number | null {
  const match = raw.match(new RegExp(`(?:^|[\\n,{])\\s*"?${field}"?\\s*:\\s*(-?\\d+)`));
  return match ? Number(match[1]) : null;
}
