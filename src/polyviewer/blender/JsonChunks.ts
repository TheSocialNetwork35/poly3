/** Bounded JSON serialization: never build a complete scene-sized JS string. */
export function* jsonChunks(value: unknown, chunkSize = 64 * 1024): Generator<string> {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new RangeError("Invalid JSON chunk size");
  let buffer = "";
  for (const token of tokens(value)) {
    for (let offset = 0; offset < token.length;) {
      const count = Math.min(chunkSize - buffer.length, token.length - offset);
      buffer += token.slice(offset, offset + count); offset += count;
      if (buffer.length === chunkSize) { yield buffer; buffer = ""; }
    }
  }
  if (buffer) yield buffer;
}
function* tokens(value: unknown): Generator<string> {
  if (Array.isArray(value)) {
    yield "[";
    for (let i = 0; i < value.length; i++) { if (i) yield ","; yield* tokens(value[i] ?? null); }
    yield "]";
  } else if (value && typeof value === "object") {
    yield "{"; let first = true;
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      if (!first) yield ","; first = false;
      yield* tokens(key); yield ":"; yield* tokens(item);
    }
    yield "}";
  } else {
    // ASCII JSON avoids splitting a UTF-16 surrogate pair between UTF-8 chunks.
    yield (JSON.stringify(value) ?? "null").replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  }
}
