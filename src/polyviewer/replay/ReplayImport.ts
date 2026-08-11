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
    const payload = parseReplayImport(typeof value === "string" ? value : JSON.stringify(value));
    const embeddedName = value && typeof value === "object" && !Array.isArray(value)
      ? readCleanName((value as Record<string, unknown>).nickname)
      : undefined;
    const matchIndex = names.findIndex((entry, nameIndex) => !usedNames.has(nameIndex)
      && replayMetadataMatches(entry, payload));
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
  try {
    return inferReplayPayload(JSON.parse(raw));
  } catch {
    const inspector = parseInspectorObject(raw);
    if (inspector) return inferReplayPayload(inspector);
    return inferLooseReplayPayload(raw);
  }
}

function inferReplayPayload(value: unknown): ReplayImportPayload {
  if (typeof value === "string") return inferLooseReplayPayload(value.trim());
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PolyViewer could not find a recording in the pasted data.");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const strings = collectStrings(value);
  const recording = findKeyedString(entries, ["recording", "replay", "replaydata", "runrecording"])
    ?? strings.find((candidate) => isLikelyRecording(candidate));
  if (!recording) {
    throw new Error("PolyViewer found metadata, but no PolyTrack recording string.");
  }
  const payload: ReplayImportPayload = { recording };
  const carStyle = findKeyedString(entries, ["carstyle", "vehicleStyle", "vehiclestyle"])
    ?? strings.find((candidate) => candidate !== recording && isLikelyCarStyle(candidate));
  if (carStyle) payload.carStyle = carStyle;
  const frames = findKeyedInteger(entries, ["frames", "framecount", "durationframes"]);
  if (frames !== undefined && frames > 0) payload.frames = frames;
  const verifiedState = findKeyedInteger(entries, ["verifiedstate", "verified"]);
  if (verifiedState !== undefined) payload.verifiedState = verifiedState;
  return payload;
}

function inferLooseReplayPayload(raw: string): ReplayImportPayload {
  if (!raw) throw new Error("Paste a PolyTrack recording.");
  if (isLikelyCarStyle(raw)) {
    throw new Error("A CarStyle was detected, but a recording string is still required.");
  }
  const candidates = Array.from(raw.matchAll(/[A-Za-z0-9_-]{8,}/g), (match) => match[0]!);
  const recording = candidates.find((candidate) => isLikelyRecording(candidate))
    ?? (!/[\s,:{}\[\]"]/u.test(raw) ? raw : undefined);
  if (!recording) {
    throw new Error("PolyViewer could not automatically detect a recording string.");
  }
  const payload: ReplayImportPayload = { recording };
  const carStyle = candidates.find((candidate) => candidate !== recording && isLikelyCarStyle(candidate));
  if (carStyle) payload.carStyle = carStyle;
  return payload;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
}

function findKeyedString(entries: [string, unknown][], aliases: string[]): string | undefined {
  const wanted = new Set(aliases.map(normalizeKey));
  for (const [key, value] of entries) {
    if (wanted.has(normalizeKey(key)) && typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function findKeyedInteger(entries: [string, unknown][], aliases: string[]): number | undefined {
  const wanted = new Set(aliases.map(normalizeKey));
  for (const [key, value] of entries) {
    if (!wanted.has(normalizeKey(key))) continue;
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  return undefined;
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isLikelyRecording(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value) && value.length > 24
    && (/^eN/.test(value) || value.length > 48);
}

function isLikelyCarStyle(value: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(value);
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
    (entry) => replayMetadataMatches(entry, payload),
  )?.nickname;
}

function replayMetadataMatches(entry: LeaderboardEntry, payload: ReplayImportPayload): boolean {
  if (entry.carStyle && payload.carStyle && entry.carStyle !== payload.carStyle) return false;
  if (entry.frames !== undefined && payload.frames !== undefined && entry.frames !== payload.frames) return false;
  return (entry.carStyle !== undefined && payload.carStyle !== undefined)
    || (entry.frames !== undefined && payload.frames !== undefined);
}

function readCleanName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean ? clean.slice(0, 60) : undefined;
}
