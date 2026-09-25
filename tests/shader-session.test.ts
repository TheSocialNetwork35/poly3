import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShaderSession } from "../src/polyviewer/shaders/ShaderSession";
import { DEFAULT_SHADERS } from "../src/polyviewer/shaders/ShaderSettings";
const hooks = vi.hoisted(() => ({ create: vi.fn(), dispose: vi.fn() }));
vi.mock("../src/polyviewer/render/CinematicCapture", () => ({ CinematicCapture: class {
  constructor(...args: unknown[]) { hooks.create(...args); }
  dispose() { hooks.dispose(); }
} }));
const bridge = { canvas: { width: 800, height: 600 } } as PolyTrackRenderer;
beforeEach(() => vi.clearAllMocks());
describe("optional shader preview", () => {
  it("allocates nothing while off, including settings edits", async () => {
    const session = new ShaderSession(bridge, vi.fn());
    await session.configure(DEFAULT_SHADERS, false);
    await session.configure({ ...DEFAULT_SHADERS, bloomIntensity: 2 }, false);
    expect(hooks.create).not.toHaveBeenCalled();
  });
  it("ignores an in-flight enable after it is disabled or capture suspends it", async () => {
    const session = new ShaderSession(bridge, vi.fn());
    const enabling = session.configure(DEFAULT_SHADERS, true);
    await session.configure(DEFAULT_SHADERS, false);
    await enabling;
    expect(hooks.create).not.toHaveBeenCalled();
    const next = session.configure(DEFAULT_SHADERS, true);
    session.suspend();
    await next;
    expect(hooks.create).not.toHaveBeenCalled();
  });
  it("disposes before rebuilding and isolates capture from preview", async () => {
    const session = new ShaderSession(bridge, vi.fn());
    await session.configure(DEFAULT_SHADERS, true);
    expect(hooks.create).toHaveBeenCalledOnce();
    session.suspend();
    expect(hooks.dispose).toHaveBeenCalledOnce();
    await session.configure({ ...DEFAULT_SHADERS, contrast: 0.2 }, true);
    expect(hooks.create).toHaveBeenCalledOnce();
    session.resume();
    await vi.waitFor(() => expect(hooks.create).toHaveBeenCalledTimes(2));
    session.dispose();
    expect(hooks.dispose).toHaveBeenCalledTimes(2);
  });
  it("reports allocation failure and remains disabled", async () => {
    hooks.create.mockImplementationOnce(() => { throw new Error("No framebuffer"); });
    const status = vi.fn();
    const session = new ShaderSession(bridge, status);
    await session.configure(DEFAULT_SHADERS, true);
    expect(session.enabled).toBe(false);
    expect(status).toHaveBeenLastCalledWith("Shaders unavailable: No framebuffer", false);
  });
});
