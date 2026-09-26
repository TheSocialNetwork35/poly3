import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const fflateUrl = pathToFileURL(createRequire(import.meta.url).resolve("fflate")).href;
import { Zip, unzipSync, strToU8, strFromU8 } from "fflate";
import { ReleasingZipDeflate } from "../src/polyviewer/blender/ReleasingZipDeflate";

describe("Blender ZIP compressor lifetime", () => {
  it("releases completed compression buffers while the ZIP remains open", () => {
    const source = readFileSync(new URL("../src/polyviewer/blender/ReleasingZipDeflate.ts", import.meta.url), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace('"fflate"', JSON.stringify(fflateUrl));
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
    const result = execFileSync(process.execPath, ["--expose-gc", "--input-type=module", "-e", `
      import { Zip, ZipDeflate } from ${JSON.stringify(fflateUrl)};
      import { ReleasingZipDeflate } from ${JSON.stringify(moduleUrl)};
      const payload = new Uint8Array(65536).fill(65);
      function measure(Type) {
        global.gc(); const before = process.memoryUsage().arrayBuffers;
        const zip = new Zip((error) => { if (error) throw error; });
        for (let i = 0; i < 128; i++) {
          const entry = new Type('frame-' + i, { level: 3 });
          zip.add(entry); entry.push(payload, false); entry.push(new Uint8Array(), true);
        }
        global.gc(); const retained = process.memoryUsage().arrayBuffers - before;
        zip.end(); zip.terminate(); return retained;
      }
      console.log(JSON.stringify({ fixed: measure(ReleasingZipDeflate), old: measure(ZipDeflate) }));
    `], { encoding: "utf8" });
    const memory = JSON.parse(result);
    console.info("Retained ZIP ArrayBuffer bytes:", memory);
    expect(memory.old).toBeGreaterThan(50 * 1024 * 1024);
    expect(memory.fixed).toBeLessThan(8 * 1024 * 1024);
  }, 30_000);

  it("preserves multi-chunk, empty and Unicode entries with valid CRCs", () => {
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, data) => { if (error) throw error; chunks.push(data); });
    for (const name of ["empty", "scene.json", "🚗.json"]) {
      const entry = new ReleasingZipDeflate(name); zip.add(entry);
      if (name !== "empty") { entry.push(strToU8('hello '.repeat(20000))); entry.push(strToU8('🚗')); }
      entry.push(new Uint8Array(), true);
      expect(() => entry.push(new Uint8Array(), true)).toThrow();
    }
    zip.end();
    const files = unzipSync(Buffer.concat(chunks));
    expect(files.empty).toHaveLength(0);
    expect(strFromU8(files['🚗.json']!)).toBe('hello '.repeat(20000) + '🚗');
    expect(files['scene.json']).toEqual(files['🚗.json']);
  });
});
