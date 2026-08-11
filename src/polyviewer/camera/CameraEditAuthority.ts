/** Controls whether a paused path may overwrite a camera the user is editing. */
export class CameraEditAuthority {
  #manualOverride = false;

  beginManualEdit(): void {
    this.#manualOverride = true;
  }

  resumePath(): void {
    this.#manualOverride = false;
  }

  shouldApplyPath(playing: boolean): boolean {
    if (playing) this.#manualOverride = false;
    return !this.#manualOverride;
  }
}
