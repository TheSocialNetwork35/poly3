// Serialized into the verified vendor bridge; keep these classes self-contained.
export class CarPatternCache {
  #renderers = new WeakMap();
  #textures = new WeakMap();

  acquire(renderer, pattern, create) {
    let patterns = this.#renderers.get(renderer);
    if (!patterns) this.#renderers.set(renderer, patterns = new Map());
    let entry = patterns.get(pattern);
    if (!entry) {
      entry = { texture: create(), references: 0, patterns, pattern };
      patterns.set(pattern, entry);
      this.#textures.set(entry.texture, entry);
    }
    entry.references++;
    return entry.texture;
  }

  release(texture) {
    const entry = this.#textures.get(texture);
    if (!entry) throw new Error("Unknown car pattern texture");
    if (--entry.references === 0) {
      entry.patterns.delete(entry.pattern);
      this.#textures.delete(texture);
      texture.dispose();
    }
  }
}

// Preserve the native simulation protocol and global car IDs. Realtime physics
// stays on one worker; offline replay cars are assigned to independent workers.
export class ReplayWorkerPool extends EventTarget {
  #workers = [];
  #cars = new Map();
  #init = null;
  #limit = 1;
  #url;
  #closed = false;
  failure = null;

  constructor(url) {
    super();
    this.#url = url;
  }

  #spawn() {
    const worker = new Worker(this.#url);
    const slot = { worker, cars: 0 };
    worker.addEventListener("message", event => {
      this.dispatchEvent(new MessageEvent("message", { data: event.data }));
    });
    worker.addEventListener("error", event => {
      this.failure = new Error("Replay simulation failed: " + event.message);
      this.dispatchEvent(new Event("error"));
    });
    worker.addEventListener("messageerror", () => {
      this.failure = new Error("Replay simulation returned unreadable data.");
      this.dispatchEvent(new Event("error"));
    });
    this.#workers.push(slot);
    if (this.#init) worker.postMessage(this.#init);
    return slot;
  }

  postMessage(message) {
    if (this.#closed) throw new Error("Replay worker pool has been disposed.");
    if (this.failure) throw this.failure;
    if (message.messageType === 0) {
      this.#init = message;
      const cores = globalThis.navigator?.hardwareConcurrency || 2;
      this.#limit = message.isRealtime ? 1 : Math.max(1, Math.min(4, cores - 1));
      if (!this.#workers.length) this.#spawn();
      else for (const slot of this.#workers) slot.worker.postMessage(message);
      return;
    }
    let slot;
    if (message.messageType === 3) {
      slot = this.#workers.reduce((best, next) => !best || next.cars < best.cars ? next : best, null);
      if (!slot || (slot.cars > 0 && this.#workers.length < this.#limit)) slot = this.#spawn();
      this.#cars.set(message.carId, slot);
      slot.cars++;
    } else if ([4, 5, 6, 7].includes(message.messageType)) {
      slot = this.#cars.get(message.carId);
      if (!slot) return;
      if (message.messageType === 4) {
        this.#cars.delete(message.carId);
        slot.cars--;
      }
    } else slot = this.#workers[0] ?? this.#spawn();
    slot.worker.postMessage(message);
  }

  terminate() {
    this.#closed = true;
    for (const slot of this.#workers) slot.worker.terminate();
    this.#workers = [];
    this.#cars.clear();
    this.#init = null;
  }
}
