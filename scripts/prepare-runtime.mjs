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
  ',ee=0;window.__POLYTRACK_062__={version:"0.6.2",replay:null,get renderer(){return d},get scene(){return d.scene},get camera(){return d.camera},get canvas(){return d.canvas},get state(){return $}};d.setAnimationLoop((function(e){const t=Math.max(e-ee,0)/1e3;ee=e,$.update(t),M.update(t)}))';

const replayClassAnchor = "const cg=class{constructor(e,t,n,i,r,a,s,o,l,c,h,d,u){";
const replayDisposeAnchor = '}dispose(){(0,R.gn)(this,Lp,"f").clear(),(0,R.gn)(this,Dp,"f").clearMountains();';
const replayUpdateAnchor = 'update(e){(0,R.GG)(this,Kp,(0,R.gn)(this,Yp,"f").isPaused,"f");';

const replayConstructorBridge =
  ';const pvOwner=this,pvReplay={owner:pvOwner,driver:null,get durationFrames(){return Math.round(1e3*(0,R.gn)(pvOwner,Qp,"f"))},get loadedFrames(){let e=1/0;for(const t of(0,R.gn)(pvOwner,jp,"f"))e=Math.min(e,t.replay.getLastFrame().numberOfFrames);return e===1/0?0:e},get timeFrames(){return Math.round(1e3*(0,R.gn)(pvOwner,qp,"f"))},get primaryCar(){return(0,R.gn)(pvOwner,jp,"f")[(0,R.gn)(pvOwner,Hp,"f")]?.car??null},setDriver(e){this.driver=e},setNativePaused(e){const t=!!e;(0,R.GG)(pvOwner,Kp,t,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=t},seekFrame(e){if(!Number.isSafeInteger(e)||e<0)throw new RangeError("Replay frame must be a non-negative safe integer.");const t=Math.max(0,Math.min(this.durationFrames,this.loadedFrames,e));(0,R.GG)(pvOwner,qp,t/1e3,"f"),(0,R.GG)(pvOwner,Kp,!0,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=!0}};window.__POLYTRACK_062__.replay=pvReplay;window.dispatchEvent(new CustomEvent("polytrack:replay-ready"))';

const replayDisposeBridge =
  'const pvRuntime=window.__POLYTRACK_062__;pvRuntime?.replay?.owner===this&&(pvRuntime.replay.driver=null,pvRuntime.replay=null,window.dispatchEvent(new CustomEvent("polytrack:replay-disposed")));';

const replayUpdateBridge =
  'const pvReplay=window.__POLYTRACK_062__?.replay;if(pvReplay?.owner===this&&"function"==typeof pvReplay.driver){const pvDrive=pvReplay.driver(e,pvReplay.durationFrames,pvReplay.loadedFrames),pvAdvance=!!pvDrive?.advanceVisuals,pvFrame=pvDrive?.frame;Number.isSafeInteger(pvFrame)&&((0,R.GG)(this,qp,Math.max(0,Math.min(pvReplay.durationFrames,pvReplay.loadedFrames,pvFrame))/1e3-(pvAdvance?e:0),"f"),(0,R.GG)(this,Kp,!pvAdvance,"f"),(0,R.gn)(this,Yp,"f").isPaused=!pvAdvance)}';

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

let bridgedBundle = originalBundle.replace(animationLoopAnchor, bridge);

const replayClassOccurrences = originalBundle.split(replayClassAnchor).length - 1;
const replayDisposeOccurrences = originalBundle.split(replayDisposeAnchor).length - 1;
const replayUpdateOccurrences = originalBundle.split(replayUpdateAnchor).length - 1;
if (replayClassOccurrences !== 1 || replayDisposeOccurrences !== 1 || replayUpdateOccurrences !== 1) {
  throw new Error(
    `Refusing to patch PolyTrack replay state: expected one class/dispose/update anchor, found ${replayClassOccurrences}/${replayDisposeOccurrences}/${replayUpdateOccurrences}.`,
  );
}

const replayClassIndex = bridgedBundle.indexOf(replayClassAnchor);
const replayDisposeIndex = bridgedBundle.indexOf(replayDisposeAnchor, replayClassIndex);
if (replayClassIndex < 0 || replayDisposeIndex < 0) {
  throw new Error("Verified PolyTrack replay class boundaries were not found.");
}
bridgedBundle = insertAt(bridgedBundle, replayDisposeIndex, replayConstructorBridge);
bridgedBundle = bridgedBundle.replace(replayDisposeAnchor, `${replayDisposeAnchor}${replayDisposeBridge}`);
bridgedBundle = bridgedBundle.replace(replayUpdateAnchor, `${replayUpdateAnchor}${replayUpdateBridge}`);

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

function insertAt(value, index, insertion) {
  return value.slice(0, index) + insertion + value.slice(index);
}

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
