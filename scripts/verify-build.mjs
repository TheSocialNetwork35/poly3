import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const requiredFiles = [
  "dist/index.html",
  "dist/manifest.json",
  "dist/main.bundle.js",
  "dist/simulation_worker.bundle.js",
  "dist/models/car.glb",
  "dist/models/road.glb",
  "dist/lib/draco/draco_decoder.wasm",
  "dist/lib/polytrack_physics.js",
  "dist/polytrack_physics.wasm",
  "dist/polyviewer-audio-capture-worklet.js",
  "dist/tracks/official/summer1.track",
  "dist/_headers",
];

for (const path of requiredFiles) {
  await access(resolve(path), constants.R_OK);
  const info = await stat(resolve(path));
  if (info.size === 0) throw new Error(`Build artifact is empty: ${path}`);
}

const bundle = await readFile(resolve("dist/main.bundle.js"), "utf8");
if (!bundle.includes('window.__POLYTRACK_062__={version:"0.6.2",replay:null')) {
  throw new Error("The production bundle does not contain the verified PolyViewer bridge.");
}
if (!bundle.includes('window.dispatchEvent(new CustomEvent("polytrack:replay-ready"))')) {
  throw new Error("The production bundle does not contain the verified replay-preview bridge.");
}
if (!bundle.includes("nativeCameraPose={position:")) {
  throw new Error("The production bundle does not expose the verified native replay-camera pose.");
}
if (!bundle.includes("pvReplay.addReplay=") || !bundle.includes("constructor.deserialize(pvRecordingString.trim())")) {
  throw new Error("The production bundle does not contain the verified native replay importer.");
}
if (!bundle.includes("pvMaxReplays=500") || !bundle.includes("pvReplay.getPerformanceStatus=")
  || !bundle.includes("polyviewerHistoryEnabled")) {
  throw new Error("The production bundle does not contain adaptive large-replay evaluation.");
}
if (bundle.includes("supports up to 20 simultaneous replays")) {
  throw new Error("The removed 20-car runtime ceiling remains in the production bundle.");
}
if (!bundle.includes("pvRequestedFrames=pvReplay.durationFrames") || bundle.includes("durationOverrideFrames")) {
  throw new Error("Imported leaderboard frame metadata can still alter the authoritative shot duration.");
}
if (bundle.includes("pvReplay.setReplayOffset=") || bundle.includes("polyviewerOffsetFrames")) {
  throw new Error("Removed replay offset controls remain in the production runtime.");
}
if (!bundle.includes("pvReplay.evaluateFrame=") || !bundle.includes("pvApplyEntry(pvEntry,pvFrame,.001)")) {
  throw new Error("The production bundle does not contain exact native frame evaluation.");
}
if (!bundle.includes("polyviewerRefreshNameTag()") || !bundle.includes("pvReplay.setReplayNameTagVisible=")) {
  throw new Error("The production bundle does not contain camera-facing replay name labels.");
}
if (!bundle.includes("this.polyviewerVisible!==!1") || !bundle.includes("for(const e of(0,l.gn)(this,Pe,\"f\"))e.clear()")) {
  throw new Error("Hidden replay cars can still retain native particles or skidmark trails.");
}
if (!bundle.includes("polyviewerBeginCapture(e,t)") || !bundle.includes("polyviewerRenderFrame()") || !bundle.includes("polyviewerEndCapture()")) {
  throw new Error("The production bundle does not contain deterministic WebGL capture controls.");
}
if (!bundle.includes("window.__POLYVIEWER_AUDIO__=this") || !bundle.includes("get audio(){return window.__POLYVIEWER_AUDIO__??null}")) {
  throw new Error("The production bundle does not expose PolyTrack's native audio graph for export.");
}
if (bundle.split('"/api/polytrack/"+').length - 1 !== 8) {
  throw new Error("The production bundle does not route all eight HTTP API endpoints through Pages.");
}
if (bundle.split('new WebSocket("https://vps.kodub.com/"+').length - 1 !== 2) {
  throw new Error("The production bundle does not preserve the two direct multiplayer WebSockets.");
}

console.log("Verified production build, original simulation worker, models, and PolyViewer bridge.");
