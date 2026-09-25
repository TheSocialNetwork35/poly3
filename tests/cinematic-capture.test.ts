import { describe, expect, it, vi, beforeEach } from "vitest";
import { DeterministicFrameRenderer } from "../src/polyviewer/render/DeterministicFrameRenderer";
const hooks = vi.hoisted(() => ({ create: vi.fn(), render: vi.fn(), dispose: vi.fn() }));
vi.mock("../src/polyviewer/render/CinematicCapture", () => ({
  CinematicCapture: class {
    constructor() { hooks.create(); }
    render() { hooks.render(); }
    dispose() { hooks.dispose(); }
  },
}));
function fixture() {
  const renderer = { canvas: Object.assign(new EventTarget(), { getContext: () => ({ isContextLost: () => false }) }), polyviewerBeginCapture: vi.fn(), polyviewerRenderFrame: vi.fn(), polyviewerEndCapture: vi.fn() };
  const evaluator = { captureEditorState: vi.fn(() => ({ timeMicroseconds: 1000, playing: false })), evaluateRenderFrame: vi.fn(), restoreEditorState: vi.fn() };
  return { renderer, evaluator, capture: new DeterministicFrameRenderer(renderer as never, evaluator as never) };
}
const settings = { width: 640, height: 360, fps: 30, startMicroseconds: 0, endMicroseconds: 33_333 };
beforeEach(() => { vi.resetAllMocks(); });
describe("optional cinematic lifecycle", () => {
  it("allocates no cinematic pipeline for ordinary capture", async () => {
    const { capture } = fixture();
    await capture.render(settings, { captureImage: false, onFrame() {} });
    expect(hooks.create).not.toHaveBeenCalled();
    expect(hooks.render).not.toHaveBeenCalled();
  });
  it("releases the pipeline and restores the game after a failed shader pass", async () => {
    const { capture, renderer, evaluator } = fixture();
    hooks.render.mockImplementation(() => { throw new Error("Shader failed"); });
    await expect(capture.render({ ...settings, cinematic: true }, { captureImage: false, onFrame() {} })).rejects.toThrow("Shader failed");
    expect(hooks.dispose).toHaveBeenCalledOnce();
    expect(renderer.polyviewerEndCapture).toHaveBeenCalledOnce();
    expect(evaluator.restoreEditorState).toHaveBeenCalledOnce();
  });
  it("restores the game even if GPU cleanup itself fails", async () => {
    const { capture, renderer, evaluator } = fixture();
    hooks.dispose.mockImplementation(() => { throw new Error("Device lost"); });
    await expect(capture.render({ ...settings, cinematic: true }, { captureImage: false, onFrame() {} })).rejects.toThrow("Device lost");
    expect(renderer.polyviewerEndCapture).toHaveBeenCalledOnce();
    expect(evaluator.restoreEditorState).toHaveBeenCalledOnce();
  });
});
