/** Interrupt pending canvas/encoder work when the GPU disappears or Cancel is pressed. */
export class CaptureGuard {
  #canvas: HTMLCanvasElement;
  #signal?: AbortSignal;
  #failure: Error | null = null;
  #pending = new Set<(error: Error) => void>();
  #onLost = () => this.#fail(new Error(
    "The GPU lost its WebGL context. Export stopped. Wait for recovery, then retry at a lower resolution or with fewer effects.",
  ));
  #onAbort = () => this.#fail(new DOMException("Rendering cancelled.", "AbortError"));

  constructor(canvas: HTMLCanvasElement, signal?: AbortSignal) {
    this.#canvas = canvas;
    this.#signal = signal;
    canvas.addEventListener("webglcontextlost", this.#onLost);
    signal?.addEventListener("abort", this.#onAbort, { once: true });
    if (signal?.aborted) this.#onAbort();
  }

  check(): void {
    const gl = this.#canvas.getContext("webgl2") ?? this.#canvas.getContext("webgl");
    if (gl?.isContextLost()) this.#onLost();
    if (this.#failure) throw this.#failure;
  }

  async wait<T>(work: Promise<T>, timeoutMs = 60_000): Promise<T> {
    this.check();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectPending: (error: Error) => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      rejectPending = reject;
      this.#pending.add(reject);
      timer = setTimeout(() => reject(new Error("Video capture made no progress for 60 seconds. Export stopped; try a lower resolution.")), timeoutMs);
    });
    try {
      const result = await Promise.race([work, interrupted]);
      this.check();
      return result;
    } finally {
      clearTimeout(timer);
      this.#pending.delete(rejectPending);
    }
  }

  dispose(): void {
    this.#canvas.removeEventListener("webglcontextlost", this.#onLost);
    this.#signal?.removeEventListener("abort", this.#onAbort);
  }

  #fail(error: Error): void {
    this.#failure ??= error;
    for (const reject of this.#pending) reject(this.#failure);
  }
}
