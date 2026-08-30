import {
  invertQuaternion,
  lookAtQuaternion,
  multiplyQuaternions,
  quaternionFromYawPitchRoll,
  rotateVector,
  slerpQuaternions,
  yawPitchRollFromQuaternion,
  type QuaternionValue,
  type VectorValue,
} from "../math/quaternion";
import type { PolyViewerKeyDetail } from "../input/ShortcutManager";

interface FreeCameraOptions {
  onChange?: (state: FreeCameraStatus) => void;
  onUserEdited?: () => void;
  getTarget?: (replayId: string) => PolyTrackCarTarget | null;
  getNativeCameraPose?: (replayId: string) => PolyTrackCameraPose | null;
}

export interface FreeCameraStatus {
  enabled: boolean;
  pointerLocked: boolean;
  speed: number;
  fov: number;
  mode: CameraMode;
  targetAvailable: boolean;
  nativeCameraAvailable: boolean;
  targetReplayId: string;
}

export type CameraMode = "fixed" | "lookAt" | "normal" | "follow" | "attached";
export type StoredCameraMode = CameraMode | "free";

export interface CameraStateSnapshot {
  mode: StoredCameraMode;
  position: VectorValue;
  orientation: QuaternionValue;
  fov: number;
  targetReplayId: string;
  followOffset: VectorValue;
  attachedOffset: VectorValue;
  attachedOrientation: QuaternionValue;
  lookAtOffset?: QuaternionValue;
  normalPositionOffset?: VectorValue;
  normalOrientationOffset?: QuaternionValue;
  normalFovOffset?: number;
}

export interface CameraModeTransition {
  from: CameraMode;
  to: CameraMode;
  amount: number;
  fromState?: CameraStateSnapshot;
  toState?: CameraStateSnapshot;
}

export interface CinematicCameraState extends CameraStateSnapshot {
  modeTransition?: CameraModeTransition;
}

export class FreeCameraController {
  #bridge: PolyTrackBridge;
  #enabled = false;
  #keys = new Set<string>();
  #position = { x: 0, y: 0, z: 0 };
  #yaw = 0;
  #pitch = 0;
  #roll = 0;
  #fov = 50;
  #speed = 18;
  #mode: CameraMode = "normal";
  #followOffset = { x: 0, y: 0, z: 0 };
  #attachedOffset = { x: 0, y: 0, z: 0 };
  #lookAtOffset: QuaternionValue = { x: 0, y: 0, z: 0, w: 1 };
  #normalPositionOffset = { x: 0, y: 0, z: 0 };
  #normalOrientationOffset: QuaternionValue = { x: 0, y: 0, z: 0, w: 1 };
  #normalFovOffset = 0;
  #modeTransition?: CameraModeTransition;
  #targetReplayId = "main";
  #getTarget: (replayId: string) => PolyTrackCarTarget | null;
  #getNativeCameraPose: (replayId: string) => PolyTrackCameraPose | null;
  #lastFrame = performance.now();
  #frameRequest = 0;
  #scene: PolyTrackScene | null = null;
  #previousBeforeRender: PolyTrackScene["onBeforeRender"] = null;
  #onChange?: (state: FreeCameraStatus) => void;
  #onUserEdited?: () => void;

  constructor(bridge: PolyTrackBridge, options: FreeCameraOptions = {}) {
    this.#bridge = bridge;
    this.#onChange = options.onChange;
    this.#onUserEdited = options.onUserEdited;
    this.#getTarget = options.getTarget ?? (() => null);
    this.#getNativeCameraPose = options.getNativeCameraPose ?? (() => null);
    window.addEventListener("mousemove", this.#onMouseMove, true);
    window.addEventListener("wheel", this.#onWheel, { capture: true, passive: false });
    document.addEventListener("pointerlockchange", this.#notify);
    bridge.canvas.addEventListener("click", this.#capturePointer);
    this.#attachToCurrentScene();
    this.#frameRequest = requestAnimationFrame(this.#tick);
    this.#notify();
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  toggle(): void {
    this.setEnabled(!this.#enabled);
  }

  get mode(): CameraMode {
    return this.#mode;
  }

  refreshStatus(): void {
    this.#notify();
  }

  setTargetReplay(id: string): void {
    if (!id || id === this.#targetReplayId) return;
    const currentPose = this.#evaluatePose(this.#readTargetPose());
    const currentFov = this.#evaluateFov();
    this.#modeTransition = undefined;
    this.#targetReplayId = id;
    this.#position = { ...currentPose.position };
    this.#captureModeOffsets(this.#readTargetPose(), currentPose.position, currentPose.orientation);
    this.#captureFovOffset(currentFov);
    this.#notify();
  }

  setMode(mode: CameraMode): void {
    if (mode === this.#mode && !this.#modeTransition) return;
    const target = this.#readTargetPose();
    const currentPose = this.#evaluatePose(target);
    const currentFov = this.#evaluateFov();
    this.#position = currentPose.position;
    const angles = yawPitchRollFromQuaternion(currentPose.orientation);
    this.#yaw = angles.yaw;
    this.#pitch = angles.pitch;
    this.#roll = angles.roll;
    this.#mode = mode;
    this.#modeTransition = undefined;
    if (mode === "lookAt") {
      // Look At owns camera direction. Entering it must not preserve a hidden
      // manual aim offset from the previous mode.
      this.#lookAtOffset = { x: 0, y: 0, z: 0, w: 1 };
      this.#yaw = 0;
      this.#pitch = 0;
      this.#roll = 0;
      this.#capturePositionOffset(target, currentPose.position);
    } else {
      this.#captureModeOffsets(target, currentPose.position, currentPose.orientation);
    }
    this.#fov = currentFov;
    this.#captureFovOffset(currentFov);
    this.#notify();
  }

  resetToNormal(): void {
    this.#mode = "normal";
    this.#modeTransition = undefined;
    this.#normalPositionOffset = { x: 0, y: 0, z: 0 };
    this.#normalOrientationOffset = { x: 0, y: 0, z: 0, w: 1 };
    this.#normalFovOffset = 0;
    this.#yaw = 0;
    this.#pitch = 0;
    this.#roll = 0;
    const native = this.#getNativeCameraPose(this.#targetReplayId);
    if (native) {
      this.#position = { ...native.position };
      this.#fov = native.fov;
    }
    this.#notify();
  }

  handleInput(detail: PolyViewerKeyDetail): void {
    this.#onKeyInput(detail);
  }

  captureState(): CinematicCameraState {
    const target = this.#readTargetPose();
    const pose = this.#evaluatePose(target);
    const localOrientation = quaternionFromYawPitchRoll(this.#yaw, this.#pitch, this.#roll);
    const native = this.#readNativeCameraPose();
    const effectiveFov = this.#evaluateFov();
    const lookAtOffset = target
      ? multiplyQuaternions(
        invertQuaternion(lookAtQuaternion(pose.position, target.position)),
        pose.orientation,
      )
      : this.#lookAtOffset;
    const normalOrientationOffset = native
      ? multiplyQuaternions(invertQuaternion(native.orientation), pose.orientation)
      : localOrientation;
    return {
      mode: this.#mode,
      position: { ...pose.position },
      orientation: { ...pose.orientation },
      fov: effectiveFov,
      targetReplayId: this.#targetReplayId,
      followOffset: { ...this.#followOffset },
      attachedOffset: { ...this.#attachedOffset },
      attachedOrientation: this.#mode === "attached"
        ? { ...localOrientation }
        : target
          ? multiplyQuaternions(invertQuaternion(target.orientation), pose.orientation)
          : { ...localOrientation },
      lookAtOffset: { ...lookAtOffset },
      normalPositionOffset: { ...this.#normalPositionOffset },
      normalOrientationOffset: { ...normalOrientationOffset },
      normalFovOffset: this.#normalFovOffset,
    };
  }

  applyState(state: CinematicCameraState): void {
    this.#mode = normalizeCameraMode(state.mode);
    this.#targetReplayId = state.targetReplayId || "main";
    this.#fov = state.fov;
    this.#position = { ...state.position };
    this.#followOffset = { ...state.followOffset };
    this.#attachedOffset = { ...state.attachedOffset };
    this.#lookAtOffset = state.lookAtOffset ?? { x: 0, y: 0, z: 0, w: 1 };
    this.#normalPositionOffset = state.normalPositionOffset ?? { x: 0, y: 0, z: 0 };
    this.#normalOrientationOffset = state.normalOrientationOffset
      ?? { x: 0, y: 0, z: 0, w: 1 };
    this.#normalFovOffset = state.normalFovOffset ?? 0;
    this.#modeTransition = state.modeTransition;
    const orientation = this.#mode === "attached"
      ? state.attachedOrientation
      : this.#mode === "normal"
        ? this.#normalOrientationOffset
      : this.#mode === "lookAt"
        ? this.#lookAtOffset
        : state.orientation;
    const angles = yawPitchRollFromQuaternion(orientation);
    this.#yaw = angles.yaw;
    this.#pitch = angles.pitch;
    this.#roll = angles.roll;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.#enabled) return;
    this.#enabled = enabled;
    window.__POLYVIEWER_INPUT_ACTIVE__ = enabled;
    this.#keys.clear();
    if (enabled) {
      this.#captureFromCamera(this.#bridge.camera);
      this.#requestPointerLock();
    } else if (document.pointerLockElement === this.#bridge.canvas) {
      document.exitPointerLock();
    }
    this.#notify();
  }

  dispose(): void {
    this.setEnabled(false);
    cancelAnimationFrame(this.#frameRequest);
    window.removeEventListener("mousemove", this.#onMouseMove, true);
    window.removeEventListener("wheel", this.#onWheel, true);
    document.removeEventListener("pointerlockchange", this.#notify);
    this.#bridge.canvas.removeEventListener("click", this.#capturePointer);
    this.#detachFromScene();
  }

  #captureFromCamera(camera: PolyTrackCamera): void {
    this.#position = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const orientation = yawPitchRollFromQuaternion(camera.quaternion);
    this.#yaw = orientation.yaw;
    this.#pitch = orientation.pitch;
    this.#roll = orientation.roll;
    this.#fov = camera.fov ?? 50;
    this.#captureModeOffsets(this.#readTargetPose(), this.#position, camera.quaternion);
    this.#captureFovOffset(this.#fov);
  }

  #attachToCurrentScene(): void {
    const scene = this.#bridge.scene;
    if (scene === this.#scene) return;
    this.#detachFromScene();
    this.#scene = scene;
    this.#previousBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = (...args: unknown[]) => {
      this.#previousBeforeRender?.(...args);
      if (this.#enabled) this.#applyToCamera(this.#bridge.camera);
    };
  }

  #detachFromScene(): void {
    if (this.#scene) this.#scene.onBeforeRender = this.#previousBeforeRender;
    this.#scene = null;
    this.#previousBeforeRender = null;
  }

  #applyToCamera(camera: PolyTrackCamera): void {
    const pose = this.#evaluatePose(this.#readTargetPose());
    const fov = this.#evaluateFov();
    this.#position = { ...pose.position };
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.quaternion.set(
      pose.orientation.x,
      pose.orientation.y,
      pose.orientation.z,
      pose.orientation.w,
    );
    if (typeof camera.fov === "number" && Math.abs(camera.fov - fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    // Native car updates happen before PolyViewer applies its final camera.
    // Refresh enabled billboards here so they face the camera that is actually
    // rendered, including deterministic export frames.
    this.#bridge.replay?.refreshOverlays?.();
  }

  #tick = (now: number): void => {
    this.#attachToCurrentScene();
    const delta = Math.min(0.1, Math.max(0, (now - this.#lastFrame) / 1000));
    this.#lastFrame = now;
    if (this.#enabled) this.#updateMovement(delta);
    this.#frameRequest = requestAnimationFrame(this.#tick);
  };

  #updateMovement(delta: number): void {
    const target = this.#readTargetPose();
    const pose = this.#evaluatePose(target);
    const orientation = pose.orientation;
    let x = 0;
    let y = 0;
    let z = 0;
    if (this.#keys.has("KeyW")) z -= 1;
    if (this.#keys.has("KeyS")) z += 1;
    if (this.#keys.has("KeyA")) x -= 1;
    if (this.#keys.has("KeyD")) x += 1;
    if (this.#keys.has("KeyQ")) y -= 1;
    if (this.#keys.has("KeyE")) y += 1;
    const magnitude = Math.hypot(x, y, z);
    if (magnitude === 0) return;
    this.#modeTransition = undefined;

    const local = rotateVector({ x: x / magnitude, y: 0, z: z / magnitude }, orientation);
    local.y += y / magnitude;
    const modifier = this.#keys.has("ShiftLeft") || this.#keys.has("ShiftRight")
      ? 4
      : this.#keys.has("AltLeft") || this.#keys.has("AltRight")
        ? 0.2
        : 1;
    const distance = this.#speed * modifier * delta;
    const nextPosition = {
      x: pose.position.x + local.x * distance,
      y: pose.position.y + local.y * distance,
      z: pose.position.z + local.z * distance,
    };
    this.#position = nextPosition;
    this.#capturePositionOffset(target, nextPosition);
    this.#onUserEdited?.();
  }

  #onKeyInput(detail: PolyViewerKeyDetail): void {
    const { code, eventType } = detail;
    if (!this.#enabled) return;
    if (eventType === "keyup") {
      this.#keys.delete(code);
      return;
    }
    if (eventType !== "keydown") return;
    this.#keys.add(code);
    if (code === "KeyZ" && cameraModeAllowsManualRotation(this.#mode)) {
      this.#modeTransition = undefined;
      this.#roll = Math.max(-Math.PI, this.#roll + 0.02);
    }
    if (code === "KeyC" && cameraModeAllowsManualRotation(this.#mode)) {
      this.#modeTransition = undefined;
      this.#roll = Math.min(Math.PI, this.#roll - 0.02);
    }
    if (["BracketLeft", "BracketRight"].includes(code)) this.#modeTransition = undefined;
    if (code === "BracketLeft") {
      if (this.#mode === "normal") this.#normalFovOffset = Math.max(-90, this.#normalFovOffset - 1);
      else this.#fov = Math.max(10, this.#fov - 1);
    }
    if (code === "BracketRight") {
      if (this.#mode === "normal") this.#normalFovOffset = Math.min(90, this.#normalFovOffset + 1);
      else this.#fov = Math.min(120, this.#fov + 1);
    }
    if (["BracketLeft", "BracketRight"].includes(code)
      || (["KeyZ", "KeyC"].includes(code) && cameraModeAllowsManualRotation(this.#mode))) {
      this.#onUserEdited?.();
    }
    this.#notify();
  }

  #onMouseMove = (event: MouseEvent): void => {
    if (!this.#enabled || document.pointerLockElement !== this.#bridge.canvas) return;
    if (!cameraModeAllowsManualRotation(this.#mode)) return;
    this.#modeTransition = undefined;
    this.#yaw -= event.movementX * 0.002;
    this.#pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, this.#pitch - event.movementY * 0.002));
    this.#onUserEdited?.();
  };

  #readTargetPose(): CameraTargetPose | null {
    return this.#readTargetPoseFor(this.#targetReplayId);
  }

  #evaluatePose(target: CameraTargetPose | null): CameraPose {
    const transition = this.#modeTransition;
    if (transition?.fromState && transition.toState) {
      return resolveCameraModeTransitionPose(
        transition,
        (replayId) => this.#readTargetPoseFor(replayId),
        (replayId) => this.#readNativeCameraPoseFor(replayId),
      );
    }
    const localOrientation = quaternionFromYawPitchRoll(this.#yaw, this.#pitch, this.#roll);
    const native = this.#readNativeCameraPose();
    if (this.#mode === "normal" && native) {
      return evaluateNativeCameraOffset(native, this.#normalPositionOffset, localOrientation);
    }
    if (this.#mode === "normal") {
      return { position: { ...this.#position }, orientation: localOrientation };
    }
    if (!target || this.#mode === "fixed") {
      return { position: { ...this.#position }, orientation: localOrientation };
    }
    if (this.#mode === "lookAt") {
      return {
        position: { ...this.#position },
        orientation: multiplyQuaternions(
          lookAtQuaternion(this.#position, target.position),
          localOrientation,
        ),
      };
    }
    if (this.#mode === "follow") {
      return {
        position: addVectors(target.position, this.#followOffset),
        orientation: localOrientation,
      };
    }
    return {
      position: addVectors(target.position, rotateVector(this.#attachedOffset, target.orientation)),
      orientation: multiplyQuaternions(target.orientation, localOrientation),
    };
  }

  #captureModeOffsets(
    target: CameraTargetPose | null,
    worldPosition: VectorValue,
    worldOrientation: QuaternionValue,
  ): void {
    if (this.#mode === "normal") {
      const native = this.#readNativeCameraPose();
      if (native) {
        const worldOffset = subtractVectors(worldPosition, native.position);
        this.#normalPositionOffset = rotateVector(worldOffset, invertQuaternion(native.orientation));
        const offset = multiplyQuaternions(invertQuaternion(native.orientation), worldOrientation);
        this.#normalOrientationOffset = offset;
        const angles = yawPitchRollFromQuaternion(offset);
        this.#yaw = angles.yaw;
        this.#pitch = angles.pitch;
        this.#roll = angles.roll;
      }
      return;
    }
    if (!target) return;
    this.#capturePositionOffset(target, worldPosition);
    if (this.#mode === "lookAt") {
      const base = lookAtQuaternion(worldPosition, target.position);
      const offset = multiplyQuaternions(invertQuaternion(base), worldOrientation);
      this.#lookAtOffset = offset;
      const angles = yawPitchRollFromQuaternion(offset);
      this.#yaw = angles.yaw;
      this.#pitch = angles.pitch;
      this.#roll = angles.roll;
    }
    if (this.#mode === "attached") {
      const local = multiplyQuaternions(invertQuaternion(target.orientation), worldOrientation);
      const angles = yawPitchRollFromQuaternion(local);
      this.#yaw = angles.yaw;
      this.#pitch = angles.pitch;
      this.#roll = angles.roll;
    }
  }

  #capturePositionOffset(target: CameraTargetPose | null, worldPosition: VectorValue): void {
    if (this.#mode === "normal") {
      const native = this.#readNativeCameraPose();
      if (native) {
        this.#normalPositionOffset = rotateVector(
          subtractVectors(worldPosition, native.position),
          invertQuaternion(native.orientation),
        );
      }
      return;
    }
    if (!target) return;
    const worldOffset = subtractVectors(worldPosition, target.position);
    this.#followOffset = worldOffset;
    this.#attachedOffset = rotateVector(worldOffset, invertQuaternion(target.orientation));
  }

  #captureFovOffset(worldFov: number): void {
    if (this.#mode !== "normal") return;
    const native = this.#readNativeCameraPose();
    this.#normalFovOffset = native?.fov === undefined ? 0 : worldFov - native.fov;
  }

  #evaluateFov(): number {
    const transition = this.#modeTransition;
    if (transition?.fromState && transition.toState) {
      return resolveCameraModeTransitionFov(
        transition,
        (replayId) => this.#readNativeCameraPoseFor(replayId),
      );
    }
    if (this.#mode === "normal") {
      const native = this.#readNativeCameraPose();
      if (native?.fov !== undefined) return clampFov(native.fov + this.#normalFovOffset);
    }
    return clampFov(this.#fov);
  }

  #onWheel = (event: WheelEvent): void => {
    if (!this.#enabled) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, select, dialog")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#speed = Math.max(0.25, Math.min(500, this.#speed * Math.exp(-event.deltaY * 0.001)));
    this.#notify();
  };

  #capturePointer = (): void => {
    if (this.#enabled && document.pointerLockElement !== this.#bridge.canvas) {
      this.#requestPointerLock();
    }
  };

  #requestPointerLock(): void {
    this.#bridge.canvas.requestPointerLock().catch(() => {
      // Pointer lock can be denied by browser policy or test automation. FreeCam
      // remains enabled and the user can retry by clicking the scene.
      this.#notify();
    });
  }

  #notify = (): void => {
    this.#onChange?.({
      enabled: this.#enabled,
      pointerLocked: document.pointerLockElement === this.#bridge.canvas,
      speed: this.#speed,
      fov: this.#evaluateFov(),
      mode: this.#mode,
      targetAvailable: this.#getTarget(this.#targetReplayId) !== null,
      nativeCameraAvailable: this.#getNativeCameraPose(this.#targetReplayId) !== null,
      targetReplayId: this.#targetReplayId,
    });
  };

  #readNativeCameraPose(): CameraPose | null {
    return this.#readNativeCameraPoseFor(this.#targetReplayId);
  }

  #readTargetPoseFor(replayId: string): CameraTargetPose | null {
    const target = this.#getTarget(replayId);
    if (!target) return null;
    const position = target.getPosition();
    const orientation = target.getQuaternion();
    return {
      position: { x: position.x, y: position.y, z: position.z },
      orientation: {
        x: orientation.x,
        y: orientation.y,
        z: orientation.z,
        w: orientation.w,
      },
    };
  }

  #readNativeCameraPoseFor(replayId: string): CameraPose | null {
    const pose = this.#getNativeCameraPose(replayId);
    if (!pose) return null;
    return {
      position: { ...pose.position },
      orientation: { ...pose.quaternion },
      fov: pose.fov,
    };
  }
}

export function normalizeCameraMode(mode: StoredCameraMode): CameraMode {
  return mode === "free" ? "fixed" : mode;
}

export function cameraModeAllowsManualRotation(mode: StoredCameraMode): boolean {
  return normalizeCameraMode(mode) !== "lookAt";
}

export interface CameraTargetPose {
  position: VectorValue;
  orientation: QuaternionValue;
}

export interface CameraPose extends CameraTargetPose {
  fov?: number;
}

export function resolveCameraSnapshotPose(
  state: CameraStateSnapshot,
  target: CameraTargetPose | null,
  native: CameraPose | null,
): CameraPose {
  const mode = normalizeCameraMode(state.mode);
  const fallback = {
    position: { ...state.position },
    orientation: { ...state.orientation },
  };
  if (mode === "normal") {
    if (!native) return fallback;
    return evaluateNativeCameraOffset(
      native,
      state.normalPositionOffset ?? { x: 0, y: 0, z: 0 },
      state.normalOrientationOffset ?? { x: 0, y: 0, z: 0, w: 1 },
    );
  }
  if (mode === "fixed" || !target) return fallback;
  if (mode === "lookAt") {
    return {
      position: { ...state.position },
      orientation: multiplyQuaternions(
        lookAtQuaternion(state.position, target.position),
        state.lookAtOffset ?? { x: 0, y: 0, z: 0, w: 1 },
      ),
    };
  }
  if (mode === "follow") {
    return {
      position: addVectors(target.position, state.followOffset),
      orientation: { ...state.orientation },
    };
  }
  return {
    position: addVectors(target.position, rotateVector(state.attachedOffset, target.orientation)),
    orientation: multiplyQuaternions(target.orientation, state.attachedOrientation),
  };
}

export function blendCameraPoses(from: CameraPose, to: CameraPose, amount: number): CameraPose {
  const clamped = Math.max(0, Math.min(1, amount));
  return {
    position: {
      x: from.position.x + (to.position.x - from.position.x) * clamped,
      y: from.position.y + (to.position.y - from.position.y) * clamped,
      z: from.position.z + (to.position.z - from.position.z) * clamped,
    },
    orientation: slerpQuaternions(from.orientation, to.orientation, clamped),
  };
}

export function resolveCameraModeTransitionPose(
  transition: CameraModeTransition,
  getTarget: (replayId: string) => CameraTargetPose | null,
  getNative: (replayId: string) => CameraPose | null,
): CameraPose {
  if (!transition.fromState || !transition.toState) {
    throw new Error("Camera mode transition is missing its endpoint states.");
  }
  const resolve = (state: CameraStateSnapshot) => resolveCameraSnapshotPose(
    state,
    getTarget(state.targetReplayId),
    getNative(state.targetReplayId),
  );
  return blendCameraPoses(
    resolve(transition.fromState),
    resolve(transition.toState),
    transition.amount,
  );
}

export function resolveCameraSnapshotFov(
  state: CameraStateSnapshot,
  native: CameraPose | null,
): number {
  if (normalizeCameraMode(state.mode) === "normal" && native?.fov !== undefined) {
    return clampFov(native.fov + (state.normalFovOffset ?? 0));
  }
  return clampFov(state.fov);
}

export function resolveCameraModeTransitionFov(
  transition: CameraModeTransition,
  getNative: (replayId: string) => CameraPose | null,
): number {
  if (!transition.fromState || !transition.toState) {
    throw new Error("Camera mode transition is missing its endpoint states.");
  }
  const from = resolveCameraSnapshotFov(
    transition.fromState,
    getNative(transition.fromState.targetReplayId),
  );
  const to = resolveCameraSnapshotFov(
    transition.toState,
    getNative(transition.toState.targetReplayId),
  );
  const amount = Math.max(0, Math.min(1, transition.amount));
  return from + (to - from) * amount;
}

export function evaluateNativeCameraOffset(
  native: CameraPose,
  positionOffset: VectorValue,
  orientationOffset: QuaternionValue,
): CameraPose {
  return {
    position: addVectors(native.position, rotateVector(positionOffset, native.orientation)),
    orientation: multiplyQuaternions(native.orientation, orientationOffset),
  };
}

function addVectors(a: VectorValue, b: VectorValue): VectorValue {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtractVectors(a: VectorValue, b: VectorValue): VectorValue {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function clampFov(value: number): number {
  return Math.max(10, Math.min(120, value));
}
