import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShortcutManager, type PolyViewerKeyDetail } from "../src/polyviewer/input/ShortcutManager";

class FakeWindow extends EventTarget {}

describe("ShortcutManager", () => {
  beforeEach(() => vi.stubGlobal("window", new FakeWindow()));
  afterEach(() => vi.unstubAllGlobals());

  it("routes editor shortcuts through one active input owner", () => {
    const actions = createActions();
    const manager = new ShortcutManager(actions);
    manager.setActive(true);
    manager.handle(key("Space"));
    manager.handle(key("KeyK"));
    manager.handle(key("KeyK", true));
    manager.handle(key("Delete"));
    manager.handle(key("F7"));
    expect(actions.onTogglePlayback).toHaveBeenCalledOnce();
    expect(actions.onAddCameraPoint).toHaveBeenCalledOnce();
    expect(actions.onUpdateCameraPoint).toHaveBeenCalledOnce();
    expect(actions.onDeleteCameraPoint).toHaveBeenCalledOnce();
    expect(actions.onToggleCleanPreview).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it("keeps F6 global but ignores editing shortcuts while inactive", () => {
    const actions = createActions();
    const manager = new ShortcutManager(actions);
    manager.handle(key("KeyK"));
    manager.handle(key("F6"));
    expect(actions.onAddCameraPoint).not.toHaveBeenCalled();
    expect(actions.onToggleEditor).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it("forwards held camera controls and maps deterministic timeline steps", () => {
    const actions = createActions();
    const manager = new ShortcutManager(actions);
    manager.setActive(true);
    manager.handle(key("ArrowRight", true));
    manager.handle(key("KeyW"));
    manager.handle({ ...key("KeyW"), eventType: "keyup" });
    expect(actions.onStep).toHaveBeenCalledWith(1_000_000);
    expect(actions.onCameraInput).toHaveBeenCalledTimes(2);
    manager.dispose();
  });
});

function key(code: string, shiftKey = false): PolyViewerKeyDetail {
  return { eventType: "keydown", code, shiftKey, repeat: false };
}

function createActions() {
  return {
    onToggleEditor: vi.fn(),
    onTogglePlayback: vi.fn(),
    onStep: vi.fn(),
    onAddCameraPoint: vi.fn(),
    onUpdateCameraPoint: vi.fn(),
    onDeleteCameraPoint: vi.fn(),
    onToggleCleanPreview: vi.fn(),
    onCameraInput: vi.fn(),
  };
}
