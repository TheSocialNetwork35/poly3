import { describe, expect, it, vi } from "vitest";
import { DeterministicFrameRenderer } from "../src/polyviewer/render/DeterministicFrameRenderer";

describe("DeterministicFrameRenderer", () => {
  it("renders exact timestamps, pre-rolls history, reports progress, and restores state", async () => {
    const renderer = createRenderer();
    const editorState = { timeMicroseconds: 750_000, playing: true };
    const scene = {
      captureEditorState: vi.fn(() => editorState),
      restoreEditorState: vi.fn(),
      evaluateRenderFrame: vi.fn(),
    };
    const frames: number[] = [];
    const progress = vi.fn();
    const frameRenderer = new DeterministicFrameRenderer(
      renderer as unknown as PolyTrackRenderer,
      scene as never,
    );

    await frameRenderer.render(
      { width: 1920, height: 1080, fps: 2, startMicroseconds: 1_000_000, endMicroseconds: 2_000_000 },
      { onFrame: (frame) => { frames.push(frame.timestampMicroseconds); }, onProgress: progress },
    );

    expect(scene.evaluateRenderFrame.mock.calls).toEqual([
      [0, false],
      [500_000, true],
      [1_000_000, true],
      [1_500_000, true],
    ]);
    expect(frames).toEqual([1_000_000, 1_500_000]);
    expect(renderer.polyviewerBeginCapture).toHaveBeenCalledWith(1920, 1080, {
      particles: true,
      skidmarks: true,
    });
    expect(renderer.polyviewerRenderFrame.mock.calls).toEqual([[true], [true]]);
    expect(renderer.polyviewerEndCapture).toHaveBeenCalledOnce();
    expect(scene.restoreEditorState).toHaveBeenCalledWith(editorState);
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it("restores the renderer and editor after cancellation", async () => {
    const renderer = createRenderer();
    const controller = new AbortController();
    controller.abort();
    const scene = {
      captureEditorState: () => ({ timeMicroseconds: 0, playing: false }),
      restoreEditorState: vi.fn(),
      evaluateRenderFrame: vi.fn(),
    };
    const frameRenderer = new DeterministicFrameRenderer(
      renderer as unknown as PolyTrackRenderer,
      scene as never,
    );

    await expect(frameRenderer.render(
      { width: 1280, height: 720, fps: 30, startMicroseconds: 0, endMicroseconds: 1_000_000 },
      { signal: controller.signal, onFrame: vi.fn() },
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(renderer.polyviewerEndCapture).toHaveBeenCalledOnce();
    expect(scene.restoreEditorState).toHaveBeenCalledOnce();
  });

  it("can explicitly skip native car shadow passes for faster exports", async () => {
    const renderer = createRenderer();
    const scene = {
      captureEditorState: () => ({ timeMicroseconds: 0, playing: false }),
      restoreEditorState: vi.fn(),
      evaluateRenderFrame: vi.fn(),
    };
    const frameRenderer = new DeterministicFrameRenderer(
      renderer as unknown as PolyTrackRenderer,
      scene as never,
    );

    await frameRenderer.render(
      {
        width: 1920,
        height: 1080,
        fps: 30,
        startMicroseconds: 0,
        endMicroseconds: 40_000,
        carShadows: false,
      },
      { onFrame: vi.fn() },
    );

    expect(renderer.polyviewerRenderFrame).toHaveBeenCalledWith(false);
  });

  it("passes independent particle and tire-mark choices to the native capture runtime", async () => {
    const renderer = createRenderer();
    const scene = {
      captureEditorState: () => ({ timeMicroseconds: 0, playing: false }),
      restoreEditorState: vi.fn(),
      evaluateRenderFrame: vi.fn(),
    };
    const frameRenderer = new DeterministicFrameRenderer(
      renderer as unknown as PolyTrackRenderer,
      scene as never,
    );

    await frameRenderer.render(
      {
        width: 1920,
        height: 1080,
        fps: 30,
        startMicroseconds: 0,
        endMicroseconds: 40_000,
        particles: false,
        skidmarks: false,
      },
      { onFrame: vi.fn() },
    );

    expect(renderer.polyviewerBeginCapture).toHaveBeenCalledWith(1920, 1080, {
      particles: false,
      skidmarks: false,
    });
  });
});

function createRenderer() {
  return {
    canvas: {
      toBlob(callback: (blob: Blob | null) => void) { callback(new Blob(["frame"])); },
    },
    polyviewerBeginCapture: vi.fn(),
    polyviewerRenderFrame: vi.fn(),
    polyviewerEndCapture: vi.fn(),
  };
}
