import type { CameraKeyframe } from "./CameraKeyframeStore";
import { migrateCameraState } from "./CameraKeyframeStore";
import type { CameraMode, CinematicCameraState } from "./FreeCameraController";

export const CAMERA_MOVE_FORMAT = "polyviewer-camera-move";
export const CAMERA_MOVE_VERSION = 1;

export interface CameraMoveTargetReference {
  sourceId: string;
  sourceName: string;
  sourceIndex: number;
  role: "main" | "replay";
}

export interface CameraMoveDocument {
  format: typeof CAMERA_MOVE_FORMAT;
  version: typeof CAMERA_MOVE_VERSION;
  polytrackVersion: "0.6.2";
  timebase: "integer-microseconds";
  name: string;
  createdAt: string;
  compatibility: {
    usesWorldSpace: boolean;
    usesWorldOrientation: boolean;
    mapPolicy: "same-map-for-exact-world-shots" | "portable-world-oriented-follow" | "replay-relative";
  };
  targetReferences: CameraMoveTargetReference[];
  points: CameraKeyframe[];
}

export type CameraMoveTargetMapping = Record<string, string>;

export function createCameraMoveDocument(
  name: string,
  points: readonly CameraKeyframe[],
  replays: readonly PolyViewerReplaySummary[],
): CameraMoveDocument {
  if (points.length === 0) throw new Error("Add at least one Camera Point before saving a Camera Move.");
  const cleanName = name.trim() || "Untitled Camera Move";
  const replayById = new Map(replays.map((replay, index) => [replay.id, { replay, index }]));
  const referencedIds = [...new Set(points.map((point) => point.state.targetReplayId || "main"))];
  const targetReferences = referencedIds.map((sourceId) => {
    const match = replayById.get(sourceId);
    return {
      sourceId,
      sourceName: match?.replay.name ?? (sourceId === "main" ? "Main Replay" : sourceId),
      sourceIndex: match?.index ?? -1,
      role: sourceId === "main" ? "main" as const : "replay" as const,
    };
  });
  const copiedPoints = points.map(validateAndCopyPoint);
  const usesWorldSpace = copiedPoints.some((point) => {
    const mode = point.state.mode === "free" ? "fixed" : point.state.mode;
    return mode === "fixed" || mode === "lookAt";
  });
  const usesWorldOrientation = copiedPoints.some((point) => point.state.mode === "follow");
  return {
    format: CAMERA_MOVE_FORMAT,
    version: CAMERA_MOVE_VERSION,
    polytrackVersion: "0.6.2",
    timebase: "integer-microseconds",
    name: cleanName,
    createdAt: new Date().toISOString(),
    compatibility: {
      usesWorldSpace,
      usesWorldOrientation,
      mapPolicy: usesWorldSpace
        ? "same-map-for-exact-world-shots"
        : usesWorldOrientation ? "portable-world-oriented-follow" : "replay-relative",
    },
    targetReferences,
    points: copiedPoints,
  };
}

export function parseCameraMoveDocument(value: string): CameraMoveDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("This is not a valid PolyViewer Camera Move file.");
  }
  if (!isRecord(parsed) || parsed.format !== CAMERA_MOVE_FORMAT) {
    throw new Error("Choose a PolyViewer Camera Move (.polycam.json) file.");
  }
  if (parsed.version !== CAMERA_MOVE_VERSION) {
    throw new Error(`Camera Move version ${String(parsed.version)} is not supported by this PolyViewer version.`);
  }
  if (parsed.polytrackVersion !== "0.6.2" || parsed.timebase !== "integer-microseconds") {
    throw new Error("This Camera Move does not use the PolyTrack 0.6.2 microsecond timeline.");
  }
  if (typeof parsed.name !== "string" || !Array.isArray(parsed.points) || parsed.points.length === 0) {
    throw new Error("The Camera Move file has no valid Camera Points.");
  }
  if (!Array.isArray(parsed.targetReferences) || !isRecord(parsed.compatibility)) {
    throw new Error("The Camera Move file is incomplete.");
  }
  const targetReferences = parsed.targetReferences.map((reference) => {
    if (!isRecord(reference) || typeof reference.sourceId !== "string"
      || typeof reference.sourceName !== "string" || !Number.isSafeInteger(reference.sourceIndex)
      || (reference.role !== "main" && reference.role !== "replay")) {
      throw new Error("The Camera Move contains an invalid replay target reference.");
    }
    return {
      sourceId: reference.sourceId,
      sourceName: reference.sourceName,
      sourceIndex: reference.sourceIndex as number,
      role: reference.role === "main" ? "main" as const : "replay" as const,
    };
  });
  const points = parsed.points.map(validateAndCopyPoint);
  points.sort((a, b) => a.timeMicroseconds - b.timeMicroseconds);
  const ids = new Set(points.map((point) => point.id));
  if (ids.size !== points.length) throw new Error("The Camera Move contains duplicate Camera Point IDs.");
  const referenced = new Set(targetReferences.map((reference) => reference.sourceId));
  if (referenced.size !== targetReferences.length) {
    throw new Error("The Camera Move contains duplicate replay target references.");
  }
  if (points.some((point) => !referenced.has(point.state.targetReplayId))) {
    throw new Error("The Camera Move is missing target information for one or more Camera Points.");
  }
  const usesWorldSpace = points.some((point) => point.state.mode === "fixed" || point.state.mode === "lookAt");
  const usesWorldOrientation = points.some((point) => point.state.mode === "follow");
  return {
    format: CAMERA_MOVE_FORMAT,
    version: CAMERA_MOVE_VERSION,
    polytrackVersion: "0.6.2",
    timebase: "integer-microseconds",
    name: parsed.name.trim() || "Untitled Camera Move",
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    compatibility: {
      usesWorldSpace,
      usesWorldOrientation,
      mapPolicy: usesWorldSpace
        ? "same-map-for-exact-world-shots"
        : usesWorldOrientation ? "portable-world-oriented-follow" : "replay-relative",
    },
    targetReferences,
    points,
  };
}

export function suggestCameraMoveMappings(
  document: CameraMoveDocument,
  replays: readonly PolyViewerReplaySummary[],
): Record<string, string | null> {
  const byName = new Map<string, string[]>();
  for (const replay of replays) {
    const key = normalizeName(replay.name);
    byName.set(key, [...(byName.get(key) ?? []), replay.id]);
  }
  const main = replays.find((replay) => replay.id === "main")?.id ?? replays[0]?.id ?? null;
  return Object.fromEntries(document.targetReferences.map((reference) => {
    if (reference.role === "main") return [reference.sourceId, main];
    const named = byName.get(normalizeName(reference.sourceName));
    return [reference.sourceId, named?.length === 1 ? named[0]! : null];
  }));
}

export function remapCameraMovePoints(
  document: CameraMoveDocument,
  mapping: CameraMoveTargetMapping,
): CameraKeyframe[] {
  for (const reference of document.targetReferences) {
    if (!mapping[reference.sourceId]) throw new Error(`Choose a target for “${reference.sourceName}”.`);
  }
  return document.points.map((point) => ({
    ...structuredClone(point),
    state: migrateCameraState({
      ...structuredClone(point.state),
      targetReplayId: mapping[point.state.targetReplayId]!,
    }),
  }));
}

export function cameraMoveDurationMicroseconds(document: CameraMoveDocument): number {
  const first = document.points[0]?.timeMicroseconds ?? 0;
  const last = document.points.at(-1)?.timeMicroseconds ?? first;
  return Math.max(0, last - first);
}

function validateAndCopyPoint(value: unknown): CameraKeyframe {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0
    || !Number.isSafeInteger(value.timeMicroseconds) || (value.timeMicroseconds as number) < 0
    || value.interpolation !== "smooth" || !isRecord(value.state)) {
    throw new Error("The Camera Move contains an invalid Camera Point.");
  }
  const state = validateAndCopyState(value.state);
  return {
    id: value.id,
    timeMicroseconds: value.timeMicroseconds as number,
    interpolation: "smooth",
    state,
  };
}

function validateAndCopyState(value: Record<string, unknown>): CinematicCameraState {
  const modes: ReadonlySet<string> = new Set<CameraMode | "free">([
    "fixed", "lookAt", "normal", "follow", "attached", "free",
  ]);
  if (typeof value.mode !== "string" || !modes.has(value.mode)
    || typeof value.targetReplayId !== "string" || value.targetReplayId.length === 0
    || !isFiniteNumber(value.fov) || value.fov < 1 || value.fov > 179) {
    throw new Error("The Camera Move contains invalid camera settings.");
  }
  for (const key of ["position", "followOffset", "attachedOffset", "normalPositionOffset"] as const) {
    if (key !== "normalPositionOffset" || value[key] !== undefined) requireVector(value[key]);
  }
  for (const key of ["orientation", "attachedOrientation", "lookAtOffset", "normalOrientationOffset"] as const) {
    if ((key === "lookAtOffset" || key === "normalOrientationOffset") && value[key] === undefined) continue;
    requireQuaternion(value[key]);
  }
  if (value.normalFovOffset !== undefined && !isFiniteNumber(value.normalFovOffset)) {
    throw new Error("The Camera Move contains an invalid Normal-camera FOV offset.");
  }
  const copy = structuredClone(value) as unknown as CinematicCameraState;
  delete copy.modeTransition;
  return migrateCameraState(copy);
}

function requireVector(value: unknown): void {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) {
    throw new Error("The Camera Move contains an invalid camera position.");
  }
}

function requireQuaternion(value: unknown): void {
  requireVector(value);
  if (!isRecord(value) || !isFiniteNumber(value.w)) {
    throw new Error("The Camera Move contains an invalid camera rotation.");
  }
  const length = Math.hypot(value.x as number, value.y as number, value.z as number, value.w);
  if (length < 0.000001 || Math.abs(length - 1) > 0.02) {
    throw new Error("The Camera Move contains a broken camera rotation.");
  }
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
