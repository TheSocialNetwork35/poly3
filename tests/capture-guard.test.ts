import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureGuard } from "../src/polyviewer/render/CaptureGuard";

afterEach(() => vi.useRealTimers());
function canvas() {
  return Object.assign(new EventTarget(), { getContext: () => ({ isContextLost: () => false }) }) as unknown as HTMLCanvasElement;
}

describe("capture failure recovery", () => {
  it("interrupts an encoder that never resolves on GPU context loss", async () => {
    const c = canvas();
    const guard = new CaptureGuard(c);
    const waiting = guard.wait(new Promise(() => {}));
    c.dispatchEvent(new Event("webglcontextlost"));
    await expect(waiting).rejects.toThrow(/GPU lost/);
    guard.dispose();
  });

  it("cancels a pending encoder immediately", async () => {
    const controller = new AbortController();
    const guard = new CaptureGuard(canvas(), controller.signal);
    const waiting = guard.wait(new Promise(() => {}));
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    guard.dispose();
  });

  it("detects an already lost context without waiting for an event", () => {
    const c = canvas();
    c.getContext = (() => ({ isContextLost: () => true })) as never;
    const guard = new CaptureGuard(c);
    expect(() => guard.check()).toThrow(/GPU lost/);
    guard.dispose();
  });

  it("bounds a stalled encoder and clears successful operation timers", async () => {
    vi.useFakeTimers();
    const guard = new CaptureGuard(canvas());
    await expect(guard.wait(Promise.resolve(42))).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
    const waiting = guard.wait(new Promise(() => {}));
    const assertion = expect(waiting).rejects.toThrow(/no progress/);
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
    guard.dispose();
  });
});
