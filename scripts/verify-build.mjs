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
if (!bundle.includes("pvMaxReplays=2000") || !bundle.includes("pvReplay.getPerformanceStatus=")
  || !bundle.includes('quality:"full"') || !bundle.includes("polyviewerPacked===!0")
  || !bundle.includes("__POLYVIEWER_CREATE_PACKED_REPLAY_STORE__")) {
  throw new Error("The production bundle does not contain full-quality packed replay evaluation.");
}
if (!bundle.includes("pvReplay.previewLimit=20") || !bundle.includes("pvReplay.setRenderMode=")
  || !bundle.includes("polyviewerPreviewVisible") || !bundle.includes("r?.setRenderMode?.(!0)")
  || !bundle.includes("a?.setRenderMode?.(!1)")) {
  throw new Error("The production bundle does not enforce the 20-car preview budget and all-car render mode.");
}
if (!bundle.includes("pvReplay.simulationConcurrency=20")
  || !bundle.includes("pvReplay.syncPreviewSimulations=")
  || !bundle.includes("pvReplay.prepareRender=")
  || !bundle.includes('polyviewerSimulationState:"idle"')
  || bundle.includes("pvWorker.startCar(pvCreated.id,new bt.A(pvRequestedFrames))")) {
  throw new Error("The production bundle does not defer non-preview simulations until render preparation.");
}
if (!bundle.includes("polyviewerRuntimeEntry:null")
  || !bundle.includes("const pvDeactivate=")
  || !bundle.includes("const pvBuildSampleFrames=")
  || !bundle.includes("sampleFrames:[...pvSampleFrames]")) {
  throw new Error("The production bundle does not contain lazy car activation and sampled render replay storage.");
}
if (bundle.includes("polyviewerSetAdaptiveQuality") || bundle.includes("polyviewerHistoryEnabled")
  || bundle.includes("__POLYVIEWER_LIGHTWEIGHT_CAR__")) {
  throw new Error("A removed adaptive-fidelity path remains in the production bundle.");
}
if (bundle.includes("supports up to 20 simultaneous replays")) {
  throw new Error("The removed 20-car runtime ceiling remains in the production bundle.");
}
if (!bundle.includes("time:new bt.A(pvReplay.durationFrames)")
  || !bundle.includes("pvWorker.startCar(pvCreated.id,new bt.A(pvReplay.durationFrames))")
  || bundle.includes("durationOverrideFrames")) {
  throw new Error("Imported leaderboard frame metadata can still alter the authoritative shot duration.");
}
if (bundle.includes("pvReplay.setReplayOffset=") || bundle.includes("polyviewerOffsetFrames")) {
  throw new Error("Removed replay offset controls remain in the production runtime.");
}
if (!bundle.includes("pvReplay.evaluateFrame=") || !bundle.includes("pvApplyState(pvEntry,pvFrame)")
  || !bundle.includes("pvEntry.car.update(pvDelta)")) {
  throw new Error("The production bundle does not contain exact state evaluation with native frame-rate visual updates.");
}
if (bundle.split("pvEntry.car.update(pvDelta)").length - 1 !== 1) {
  throw new Error("The production bundle can perform more than one native visual update per replay per output frame.");
}
if (!bundle.includes("polyviewerRefreshNameTag()") || !bundle.includes("pvReplay.setReplayNameTagVisible=")) {
  throw new Error("The production bundle does not contain camera-facing replay name labels.");
}
if (!bundle.includes("this.polyviewerVisible!==!1") || !bundle.includes("for(const e of(0,l.gn)(this,Pe,\"f\"))e.clear()")) {
  throw new Error("Hidden replay cars can still retain native particles or skidmark trails.");
}
if (!bundle.includes("polyviewerBeginCapture(e,t,n={})") || !bundle.includes("polyviewerRenderFrame(e=!0)") || !bundle.includes("polyviewerEndCapture()")
  || !bundle.includes("polyviewerCaptureShadowPass?Math.max(2,") || !bundle.includes("t.shadowMap.enabled=!1")) {
  throw new Error("The production bundle does not contain deterministic WebGL capture controls.");
}
if (!bundle.includes("__POLYVIEWER_RENDER_EFFECTS__={particles:")
  || !bundle.includes("__POLYVIEWER_RENDER_EFFECTS__?.particles!==!1")
  || !bundle.includes("__POLYVIEWER_RENDER_EFFECTS__?.skidmarks!==!1")
  || !bundle.includes("polyviewerSetRenderEffects(e)")
  || !bundle.includes("setVisible(e){(0,d.gn)(this,a,\"f\").visible=e}")) {
  throw new Error("The production bundle does not contain independent particle and tire-mark render controls.");
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
