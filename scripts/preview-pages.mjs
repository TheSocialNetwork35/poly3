import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const previewDirectory = await mkdtemp(join(tmpdir(), "polyviewer-pages-"));
await cp(resolve(root, "dist"), previewDirectory, { recursive: true });

const wrangler = resolve(root, "node_modules/.bin/wrangler");
const child = spawn(wrangler, ["pages", "dev", previewDirectory, "--port", "4173"], {
  cwd: root,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolveExit) => {
  child.on("exit", (code) => resolveExit(code ?? 1));
});
await rm(previewDirectory, { recursive: true, force: true });
process.exitCode = exitCode;
