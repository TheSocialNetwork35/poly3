import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDirectory = resolve(root, "vendor/polytrack-0.6.2");
const staticDirectory = resolve(root, "static");
const runtimeDirectory = resolve(root, ".runtime");

const animationLoopAnchor =
  ",ee=0;d.setAnimationLoop((function(e){const t=Math.max(e-ee,0)/1e3;ee=e,$.update(t),M.update(t)}))";

const bridge =
  ',ee=0;window.__POLYTRACK_062__={version:"0.6.2",get renderer(){return d},get scene(){return d.scene},get camera(){return d.camera},get canvas(){return d.canvas},get state(){return $}};d.setAnimationLoop((function(e){const t=Math.max(e-ee,0)/1e3;ee=e,$.update(t),M.update(t)}))';

const upstreamApiBase = '"https://vps.kodub.com/"+';
const localApiBase = '"/api/polytrack/"+';

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true });
await linkDirectoryEntries(vendorDirectory, runtimeDirectory, new Set(["main.bundle.js"]));
await linkDirectoryEntries(staticDirectory, runtimeDirectory);

const mainBundlePath = resolve(runtimeDirectory, "main.bundle.js");
const originalBundle = await readFile(resolve(vendorDirectory, "main.bundle.js"), "utf8");
const occurrences = originalBundle.split(animationLoopAnchor).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `Refusing to patch PolyTrack: expected one verified 0.6.2 animation-loop anchor, found ${occurrences}.`,
  );
}

const apiOccurrences = originalBundle.split(upstreamApiBase).length - 1;
if (apiOccurrences !== 10) {
  throw new Error(
    `Refusing to patch PolyTrack API routing: expected ten verified 0.6.2 endpoints, found ${apiOccurrences}.`,
  );
}

const bridgedBundle = originalBundle.replace(animationLoopAnchor, bridge);
const proxiedBundle = bridgedBundle
  .replaceAll(upstreamApiBase, localApiBase)
  .replaceAll(`new WebSocket(${localApiBase}`, `new WebSocket(${upstreamApiBase}`);

if (proxiedBundle.split(localApiBase).length - 1 !== 8) {
  throw new Error("PolyTrack HTTP proxy patch did not produce the expected eight endpoints.");
}
if (proxiedBundle.split(`new WebSocket(${upstreamApiBase}`).length - 1 !== 2) {
  throw new Error("PolyTrack multiplayer WebSocket endpoints were not preserved.");
}

await writeFile(mainBundlePath, proxiedBundle);
console.log("Prepared the verified PolyTrack 0.6.2 runtime with the PolyViewer bridge.");

async function linkDirectoryEntries(source, destination, excludedNames = new Set()) {
  const entries = await readdir(source, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => !excludedNames.has(entry.name))
      .map(async (entry) => {
        const sourcePath = resolve(source, entry.name);
        const destinationPath = resolve(destination, entry.name);
        await symlink(relative(destination, sourcePath), destinationPath, entry.isDirectory() ? "dir" : "file");
      }),
  );
}
