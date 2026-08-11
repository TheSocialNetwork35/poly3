export interface ReplayImportPayload {
  recording: string;
  carStyle?: string;
  frames?: number;
  verifiedState?: number;
}

export interface NamedReplayImport {
  payload: ReplayImportPayload;
  name?: string;
}

export function parseReplayImports(
  recordingsValue: string,
  leaderboardValue = "",
): NamedReplayImport[] {
  const raw = recordingsValue.trim();
  if (!raw) throw new Error("Paste one or more PolyTrack recordings.");
  let values: unknown[];
  if (raw.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("The replay list is not valid JSON.");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("The replay list must contain at least one recording.");
    }
    values = parsed;
  } else {
    return [{ payload: parseReplayImport(raw), name: findSingleName(raw, leaderboardValue) }];
  }

  const names = parseLeaderboardEntries(leaderboardValue);
  const usedNames = new Set<number>();
  return values.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Replay ${index + 1} is not an object.`);
    }
    const payload = parseReplayImport(JSON.stringify(value));
    const embeddedName = readCleanName((value as Record<string, unknown>).nickname);
    const matchIndex = names.findIndex((entry, nameIndex) => !usedNames.has(nameIndex)
      && entry.carStyle === payload.carStyle && entry.frames === payload.frames);
    if (matchIndex >= 0) usedNames.add(matchIndex);
    return {
      payload,
      name: embeddedName ?? (matchIndex >= 0 ? names[matchIndex]!.nickname : undefined),
    };
  });
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

interface LeaderboardEntry {
  nickname: string;
  carStyle?: string;
  frames?: number;
}

function parseLeaderboardEntries(value: string): LeaderboardEntry[] {
  const raw = value.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The optional leaderboard names are not valid JSON.");
  }
  const entries = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>).entries
    : parsed;
  if (!Array.isArray(entries)) throw new Error('Leaderboard JSON needs an "entries" array.');
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const object = entry as Record<string, unknown>;
    const nickname = readCleanName(object.nickname);
    if (!nickname) return [];
    return [{
      nickname,
      carStyle: typeof object.carStyle === "string" ? object.carStyle : undefined,
      frames: Number.isSafeInteger(object.frames) ? Number(object.frames) : undefined,
    }];
  });
}

function findSingleName(recording: string, leaderboard: string): string | undefined {
  const payload = parseReplayImport(recording);
  return parseLeaderboardEntries(leaderboard).find(
    (entry) => entry.carStyle === payload.carStyle && entry.frames === payload.frames,
  )?.nickname;
}

function readCleanName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean ? clean.slice(0, 60) : undefined;
}
