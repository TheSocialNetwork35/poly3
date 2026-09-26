import { Deflate, ZipPassThrough } from "fflate";

/** Zip retains enumerable input properties for its central directory. Keep
 * compression buffers private and release them as soon as this entry ends. */
export class ReleasingZipDeflate extends ZipPassThrough {
  #deflater: Deflate | undefined;

  constructor(filename: string) {
    super(filename);
    this.compression = 8;
    this.#deflater = new Deflate({ level: 3 }, (data, final) => {
      if (final) this.#deflater = undefined;
      this.ondata(null, data, final);
    });
  }

  override process(chunk: Uint8Array, final: boolean): void {
    if (!this.#deflater) throw new Error("ZIP entry is already closed");
    try {
      this.#deflater.push(chunk, final);
    } catch (error) {
      this.#deflater = undefined;
      throw error;
    }
  }

  terminate(): void {
    this.#deflater = undefined;
  }
}
