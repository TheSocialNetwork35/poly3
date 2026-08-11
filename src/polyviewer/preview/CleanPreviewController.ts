export class CleanPreviewController {
  #document: Document;
  #enabled = false;
  #onChange?: (enabled: boolean) => void;

  constructor(documentValue: Document = document, onChange?: (enabled: boolean) => void) {
    this.#document = documentValue;
    this.#onChange = onChange;
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
    this.#document.body.classList.toggle("polyviewer-clean-preview", enabled);
    this.#onChange?.(enabled);
  }

  dispose(): void {
    this.setEnabled(false);
  }
}
