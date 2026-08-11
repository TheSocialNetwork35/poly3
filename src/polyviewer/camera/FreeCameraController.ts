import {
  quaternionFromYawPitchRoll,
  rotateVector,
  yawPitchFromQuaternion,
  type QuaternionValue,
} from "../math/quaternion";

interface FreeCameraOptions {
  onChange?: (state: FreeCameraStatus) => void;
}

interface PolyViewerKeyDetail {
  eventType: "keydown" | "keyup" | "keypress";
  code: string;
}

export interface FreeCameraStatus {
  enabled: boolean;
  pointerLocked: boolean;
  speed: number;
  fov: number;
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
  #lastFrame = performance.now();
  #frameRequest = 0;
  #scene: PolyTrackScene | null = null;
  #previousBeforeRender: PolyTrackScene["onBeforeRender"] = null;
  #onChange?: (state: FreeCameraStatus) => void;

  constructor(bridge: PolyTrackBridge, options: FreeCameraOptions = {}) {
    this.#bridge = bridge;
    this.#onChange = options.onChange;
    window.addEventListener("polyviewer:key", this.#onKeyInput as EventListener);
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
    window.removeEventListener("polyviewer:key", this.#onKeyInput as EventListener);
    window.removeEventListener("mousemove", this.#onMouseMove, true);
    window.removeEventListener("wheel", this.#onWheel, true);
    document.removeEventListener("pointerlockchange", this.#notify);
    this.#bridge.canvas.removeEventListener("click", this.#capturePointer);
    this.#detachFromScene();
  }

  #captureFromCamera(camera: PolyTrackCamera): void {
    this.#position = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const orientation = yawPitchFromQuaternion(camera.quaternion);
    this.#yaw = orientation.yaw;
    this.#pitch = orientation.pitch;
    this.#roll = 0;
    this.#fov = camera.fov ?? 50;
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
    const q = quaternionFromYawPitchRoll(this.#yaw, this.#pitch, this.#roll);
    camera.position.set(this.#position.x, this.#position.y, this.#position.z);
    camera.quaternion.set(q.x, q.y, q.z, q.w);
    if (typeof camera.fov === "number" && Math.abs(camera.fov - this.#fov) > 0.001) {
      camera.fov = this.#fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  }

  #tick = (now: number): void => {
    this.#attachToCurrentScene();
    const delta = Math.min(0.1, Math.max(0, (now - this.#lastFrame) / 1000));
    this.#lastFrame = now;
    if (this.#enabled) this.#updateMovement(delta);
    this.#frameRequest = requestAnimationFrame(this.#tick);
  };

  #updateMovement(delta: number): void {
    const orientation = quaternionFromYawPitchRoll(this.#yaw, this.#pitch, this.#roll);
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

    const local = rotateVector({ x: x / magnitude, y: 0, z: z / magnitude }, orientation);
    local.y += y / magnitude;
    const modifier = this.#keys.has("ShiftLeft") || this.#keys.has("ShiftRight")
      ? 4
      : this.#keys.has("AltLeft") || this.#keys.has("AltRight")
        ? 0.2
        : 1;
    const distance = this.#speed * modifier * delta;
    this.#position.x += local.x * distance;
    this.#position.y += local.y * distance;
    this.#position.z += local.z * distance;
  }

  #onKeyInput = (event: CustomEvent<PolyViewerKeyDetail>): void => {
    const { code, eventType } = event.detail;
    if (code === "F6" && eventType === "keydown") {
      this.toggle();
      return;
    }
    if (!this.#enabled) return;
    if (eventType === "keyup") {
      this.#keys.delete(code);
      return;
    }
    if (eventType !== "keydown") return;
    this.#keys.add(code);
    if (code === "KeyZ") this.#roll = Math.max(-Math.PI, this.#roll + 0.02);
    if (code === "KeyC") this.#roll = Math.min(Math.PI, this.#roll - 0.02);
    if (code === "BracketLeft") this.#fov = Math.max(10, this.#fov - 1);
    if (code === "BracketRight") this.#fov = Math.min(120, this.#fov + 1);
    this.#notify();
  };

  #onMouseMove = (event: MouseEvent): void => {
    if (!this.#enabled || document.pointerLockElement !== this.#bridge.canvas) return;
    this.#yaw -= event.movementX * 0.002;
    this.#pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, this.#pitch - event.movementY * 0.002));
  };

  #onWheel = (event: WheelEvent): void => {
    if (!this.#enabled) return;
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
      fov: this.#fov,
    });
  };
}
