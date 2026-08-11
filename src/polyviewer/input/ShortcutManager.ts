import type { CameraMode } from "../camera/FreeCameraController";

export interface PolyViewerKeyDetail {
  eventType: "keydown" | "keyup" | "keypress";
  code: string;
  key?: string;
  shiftKey: boolean;
  repeat: boolean;
}

interface ShortcutActions {
  onToggleEditor: () => void;
  onTogglePlayback: () => void;
  onStep: (deltaMicroseconds: number) => void;
  onAddCameraPoint: () => void;
  onUpdateCameraPoint: () => void;
  onDeleteCameraPoint: () => void;
  onToggleCleanPreview: () => void;
  onResetCamera: () => void;
  onCameraMode: (mode: CameraMode) => void;
  onCameraInput: (detail: PolyViewerKeyDetail) => void;
}

export class ShortcutManager {
  #active = false;
  #actions: ShortcutActions;

  constructor(actions: ShortcutActions) {
    this.#actions = actions;
    window.addEventListener("polyviewer:key", this.#onKey as EventListener);
  }

  setActive(active: boolean): void {
    this.#active = active;
  }

  dispose(): void {
    window.removeEventListener("polyviewer:key", this.#onKey as EventListener);
  }

  handle(detail: PolyViewerKeyDetail): boolean {
    if ((detail.code === "F1" || detail.code === "F6" || detail.code === "Backquote"
      || detail.code === "IntlBackslash" || detail.key === "§")
      && detail.eventType === "keydown" && !detail.repeat) {
      this.#actions.onToggleEditor();
      return true;
    }
    if (!this.#active) return false;
    if (detail.eventType === "keydown" && !detail.repeat) {
      if (detail.code === "Space") this.#actions.onTogglePlayback();
      else if (detail.code === "ArrowLeft") this.#actions.onStep(detail.shiftKey ? -1_000_000 : -16_000);
      else if (detail.code === "ArrowRight") this.#actions.onStep(detail.shiftKey ? 1_000_000 : 16_000);
      else if (detail.code === "KeyK" && detail.shiftKey) this.#actions.onUpdateCameraPoint();
      else if (detail.code === "KeyK") this.#actions.onAddCameraPoint();
      else if (detail.code === "F7") this.#actions.onToggleCleanPreview();
      else if (detail.code === "KeyR") this.#actions.onResetCamera();
      else if (detail.code === "Digit1") this.#actions.onCameraMode("fixed");
      else if (detail.code === "Digit2") this.#actions.onCameraMode("lookAt");
      else if (detail.code === "Digit3") this.#actions.onCameraMode("normal");
      else if (detail.code === "Digit4") this.#actions.onCameraMode("follow");
      else if (detail.code === "Digit5") this.#actions.onCameraMode("attached");
      else if (detail.code === "Delete" || detail.code === "Backspace") {
        this.#actions.onDeleteCameraPoint();
      } else {
        this.#actions.onCameraInput(detail);
        return false;
      }
      return true;
    }
    this.#actions.onCameraInput(detail);
    return false;
  }

  #onKey = (event: CustomEvent<PolyViewerKeyDetail>): void => {
    this.handle(event.detail);
  };
}
