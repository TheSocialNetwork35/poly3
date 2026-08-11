import { describe, expect, it, vi } from "vitest";
import { CleanPreviewController } from "../src/polyviewer/preview/CleanPreviewController";

describe("CleanPreviewController", () => {
  it("toggles one reversible document state and always restores it on dispose", () => {
    const classes = new Set<string>();
    const documentValue = {
      body: {
        classList: {
          toggle(name: string, enabled: boolean) {
            if (enabled) classes.add(name);
            else classes.delete(name);
          },
        },
      },
    } as unknown as Document;
    const onChange = vi.fn();
    const preview = new CleanPreviewController(documentValue, onChange);

    preview.toggle();
    expect(preview.enabled).toBe(true);
    expect(classes.has("polyviewer-clean-preview")).toBe(true);
    preview.dispose();
    expect(preview.enabled).toBe(false);
    expect(classes.has("polyviewer-clean-preview")).toBe(false);
    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, false);
  });
});
