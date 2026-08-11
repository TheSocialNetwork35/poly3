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

const rendererCaptureAnchor = 'clear(){(0,i.gn)(this,k,"f").clear()}update(e){';
const rendererCaptureReplacement = 'clear(){(0,i.gn)(this,k,"f").clear()}polyviewerBeginCapture(e,t){if(this.polyviewerCaptureState)throw new Error("A PolyViewer capture is already active.");if(!Number.isSafeInteger(e)||!Number.isSafeInteger(t)||e<=0||t<=0)throw new RangeError("Capture dimensions must be positive safe integers.");const n=(0,i.gn)(this,k,"f"),a=(0,i.gn)(this,M,"f"),s=(0,i.gn)(this,w,"f");this.polyviewerCaptureState={pixelRatio:n.getPixelRatio(),width:s.width/n.getPixelRatio(),height:s.height/n.getPixelRatio(),aspect:a.aspect},n.setPixelRatio(1),n.setSize(e,t,!1),a.aspect=e/t,a.updateProjectionMatrix()}polyviewerRenderFrame(){const e=(0,i.gn)(this,_ ,"f");null!=e&&(e.camera=(0,i.gn)(this,M,"f"),e.update()),(0,i.gn)(this,k,"f").render((0,i.gn)(this,E,"f"),(0,i.gn)(this,M,"f"))}polyviewerEndCapture(){const e=this.polyviewerCaptureState;if(!e)return;const t=(0,i.gn)(this,k,"f"),n=(0,i.gn)(this,M,"f");t.setPixelRatio(e.pixelRatio),t.setSize(e.width,e.height,!1),n.aspect=e.aspect,n.updateProjectionMatrix(),this.polyviewerCaptureState=null}update(e){';

const replayClassAnchor = "const cg=class{constructor(e,t,n,i,r,a,s,o,l,c,h,d,u){";
const replayDisposeAnchor = '}dispose(){(0,R.gn)(this,Lp,"f").clear(),(0,R.gn)(this,Dp,"f").clearMountains();';
const replayUpdateAnchor = 'update(e){(0,R.GG)(this,Kp,(0,R.gn)(this,Yp,"f").isPaused,"f");';
const nativeCameraUpdateAnchor = 'for(const e of(0,R.gn)(this,jp,"f"))e.car.update(i),e.car.updateCameras(i);';
const replayApplyAnchor = 'lg=function(e){for(const t of(0,R.gn)(this,jp,"f"))if(t.car.getTime().numberOfFrames!=e){const n=t.replay.getFrame(e);null!=n&&t.car.setCarState(n,n.frames!=t.car.getTime().numberOfFrames&&n.frames!=t.car.getTime().numberOfFrames+1)}};';
const replayApplyReplacement = 'lg=function(e){for(const t of(0,R.gn)(this,jp,"f")){const pvLocalFrame=Math.max(0,e-(t.polyviewerOffsetFrames??0));if(t.car.getTime().numberOfFrames!=pvLocalFrame){const n=t.replay.getFrame(pvLocalFrame);null!=n&&t.car.setCarState(n,n.frames!=t.car.getTime().numberOfFrames&&n.frames!=t.car.getTime().numberOfFrames+1)}}};';

const replayConstructorBridge =
  ';const pvOwner=this,pvReplay={owner:pvOwner,driver:null,nativeCameraPose:null,get durationFrames(){return Math.round(1e3*(0,R.gn)(pvOwner,Qp,"f"))},get loadedFrames(){let e=1/0;for(const t of(0,R.gn)(pvOwner,jp,"f"))e=Math.min(e,t.replay.getLastFrame().numberOfFrames+(t.polyviewerOffsetFrames??0));return e===1/0?0:Math.max(0,e)},get timeFrames(){return Math.round(1e3*(0,R.gn)(pvOwner,qp,"f"))},get primaryCar(){return(0,R.gn)(pvOwner,jp,"f")[(0,R.gn)(pvOwner,Hp,"f")]?.car??null},setDriver(e){this.driver=e},setNativePaused(e){const t=!!e;(0,R.GG)(pvOwner,Kp,t,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=t},seekFrame(e){if(!Number.isSafeInteger(e)||e<0)throw new RangeError("Replay frame must be a non-negative safe integer.");const t=Math.max(0,Math.min(this.durationFrames,this.loadedFrames,e));(0,R.GG)(pvOwner,qp,t/1e3,"f"),(0,R.GG)(pvOwner,Kp,!0,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=!0}};window.__POLYTRACK_062__.replay=pvReplay;window.dispatchEvent(new CustomEvent("polytrack:replay-ready"))';

const replayManagementBridge =
  ';{const pvEntries=(0,R.gn)(pvOwner,jp,"f");for(let pvIndex=0;pvIndex<pvEntries.length;pvIndex++){const pvEntry=pvEntries[pvIndex];pvEntry.polyviewerId=pvIndex===0?"main":`native-${pvIndex}`,pvEntry.polyviewerName=pvEntry.settings.nickname??(pvIndex===0?"Main Replay":`Replay ${pvIndex+1}`),pvEntry.polyviewerVisible=!0,pvEntry.polyviewerOpacity=1,pvEntry.polyviewerOffsetFrames=0}let pvNextReplayId=1;pvReplay.listReplays=()=>pvEntries.map((pvEntry,pvIndex)=>({id:pvEntry.polyviewerId,name:pvEntry.polyviewerName,visible:pvEntry.polyviewerVisible,opacity:pvEntry.polyviewerOpacity,offsetMilliseconds:pvEntry.polyviewerOffsetFrames,removable:pvIndex>0}));pvReplay.getCar=pvId=>pvEntries.find(pvEntry=>pvEntry.polyviewerId===pvId)?.car??null;pvReplay.getNativeCameraPose=pvId=>{const pvCamera=pvReplay.getCar(pvId)?.cameraOrbit;return pvCamera?{position:{x:pvCamera.position.x,y:pvCamera.position.y,z:pvCamera.position.z},quaternion:{x:pvCamera.quaternion.x,y:pvCamera.quaternion.y,z:pvCamera.quaternion.z,w:pvCamera.quaternion.w},fov:pvCamera.fov}:null};pvReplay.addReplay=(pvRecordingString,pvName)=>{if(pvEntries.length>=20)throw new Error("PolyViewer currently supports up to 20 simultaneous replays.");if("string"!=typeof pvRecordingString||pvRecordingString.trim().length===0)throw new Error("Paste a PolyTrack recording string.");const pvMain=pvEntries[0],pvRecording=pvMain.car.getRecording().constructor.deserialize(pvRecordingString.trim());if(null==pvRecording)throw new Error("Invalid PolyTrack 0.6.2 recording string.");const pvTrack=(0,R.gn)(pvOwner,Lp,"f"),pvMountains=(0,R.gn)(pvOwner,Dp,"f"),pvStart=pvTrack.getStartTransform();if(null==pvStart)throw new Error("Track has no starting point");const pvCar=new U.A(null,pvStart,pvRecording,null,(0,R.gn)(pvOwner,Gp,"f"),(0,R.gn)(pvOwner,Fp,"f"),pvMountains,pvTrack,(0,R.gn)(pvOwner,Np,"f"),(0,R.gn)(pvOwner,Wp,"f"),null);pvCar.setCarStyle(pvMain.car.getCarStyle());const pvEntry={replay:new Ht,checkpointTimes:[],finishSpeed:null,carId:null,car:pvCar,settings:{...pvMain.settings,nickname:"string"==typeof pvName&&pvName.trim().length>0?pvName.trim():`Replay ${pvEntries.length+1}`,recording:pvRecording,time:new bt.A(pvReplay.durationFrames),carStyle:pvMain.car.getCarStyle()},polyviewerId:`replay-${pvNextReplayId++}`,polyviewerName:"",polyviewerVisible:!0,polyviewerOpacity:1,polyviewerOffsetFrames:0};pvEntry.polyviewerName=pvEntry.settings.nickname,pvCar.setNameTag(null,pvEntry.polyviewerName);const pvWorker=(0,R.gn)(pvOwner,Ip,"f"),pvCreated=pvWorker.createCar(pvStart,pvMountains.getMountainVertices(),pvMountains.getMountainOffset(),(0,R.gn)(pvOwner,Np,"f"),pvRecording,pvState=>{pvEntry.replay.push(pvState),null!=pvEntry.carId&&pvState.frames>=pvReplay.durationFrames&&(pvWorker.deleteCar(pvEntry.carId),pvEntry.carId=null)});return pvEntry.replay.push(pvCreated.carState),pvEntry.carId=pvCreated.id,pvEntries.push(pvEntry),pvWorker.startCar(pvCreated.id,new bt.A(pvReplay.durationFrames)),pvReplay.listReplays().at(-1)};pvReplay.setReplayName=(pvId,pvName)=>{const pvEntry=pvEntries.find(pvItem=>pvItem.polyviewerId===pvId),pvClean=String(pvName??"").trim();if(!pvEntry)throw new Error("Replay not found");if(!pvClean)throw new Error("Replay name cannot be empty");pvEntry.polyviewerName=pvClean,pvEntry.settings.nickname=pvClean,pvEntry.car.setNameTag(null,pvClean)};pvReplay.setReplayVisible=(pvId,pvVisible)=>{const pvEntry=pvEntries.find(pvItem=>pvItem.polyviewerId===pvId);if(!pvEntry)throw new Error("Replay not found");pvEntry.polyviewerVisible=!!pvVisible,pvEntry.car.setVisible(pvEntry.polyviewerVisible)};pvReplay.setReplayOpacity=(pvId,pvOpacity)=>{const pvEntry=pvEntries.find(pvItem=>pvItem.polyviewerId===pvId);if(!pvEntry)throw new Error("Replay not found");if(!Number.isFinite(pvOpacity)||pvOpacity<0||pvOpacity>1)throw new RangeError("Replay opacity must be between 0 and 1");pvEntry.polyviewerOpacity=pvOpacity,pvEntry.car.setOpacity(pvOpacity)};pvReplay.setReplayOffset=(pvId,pvOffset)=>{const pvEntry=pvEntries.find(pvItem=>pvItem.polyviewerId===pvId);if(!pvEntry)throw new Error("Replay not found");if(!Number.isSafeInteger(pvOffset)||pvOffset<0||pvOffset>pvReplay.durationFrames)throw new RangeError("Replay offset must be a non-negative integer within the replay duration");pvEntry.polyviewerOffsetFrames=pvOffset};pvReplay.removeReplay=pvId=>{const pvIndex=pvEntries.findIndex(pvItem=>pvItem.polyviewerId===pvId);if(pvIndex<=0)return!1;const pvEntry=pvEntries[pvIndex];return null!=pvEntry.carId&&((0,R.gn)(pvOwner,Ip,"f").deleteCar(pvEntry.carId),pvEntry.carId=null),pvEntry.car.dispose(),pvEntries.splice(pvIndex,1),!0}}';

const replayEvaluationBridge =
  ';pvReplay.evaluatedFrame=pvReplay.timeFrames,pvReplay.evaluateFrame=(pvRequestedFrame,pvAdvanceVisuals)=>{if(!Number.isSafeInteger(pvRequestedFrame)||pvRequestedFrame<0)throw new RangeError("Replay frame must be a non-negative safe integer.");const pvTarget=Math.max(0,Math.min(pvReplay.durationFrames,pvReplay.loadedFrames,pvRequestedFrame)),pvEntries=(0,R.gn)(pvOwner,jp,"f"),pvApply=pvFrame=>{(0,R.gn)(pvOwner,Pp,"m",lg).call(pvOwner,pvFrame);for(const pvEntry of pvEntries)pvEntry.car.update(.001),pvEntry.car.updateCameras(.001)};if(pvAdvanceVisuals&&pvTarget>pvReplay.evaluatedFrame)for(let pvFrame=pvReplay.evaluatedFrame+1;pvFrame<=pvTarget;pvFrame++)pvApply(pvFrame);else{(0,R.gn)(pvOwner,Pp,"m",lg).call(pvOwner,pvTarget);for(const pvEntry of pvEntries)pvEntry.car.update(0),pvEntry.car.updateCameras(0)}pvReplay.evaluatedFrame=pvTarget,(0,R.GG)(pvOwner,qp,pvTarget/1e3,"f"),(0,R.GG)(pvOwner,Kp,!0,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=!0,pvReplay.nativeCameraPose=pvReplay.getNativeCameraPose("main")};';

const replayDisposeBridge =
  'const pvRuntime=window.__POLYTRACK_062__;pvRuntime?.replay?.owner===this&&(pvRuntime.replay.driver=null,pvRuntime.replay=null,window.dispatchEvent(new CustomEvent("polytrack:replay-disposed")));';

const replayUpdateBridge =
  'const pvReplay=window.__POLYTRACK_062__?.replay;if(pvReplay?.owner===this&&"function"==typeof pvReplay.driver){const pvDrive=pvReplay.driver(e,pvReplay.durationFrames,pvReplay.loadedFrames),pvAdvance=!!pvDrive?.advanceVisuals,pvFrame=pvDrive?.frame;Number.isSafeInteger(pvFrame)&&((0,R.GG)(this,qp,Math.max(0,Math.min(pvReplay.durationFrames,pvReplay.loadedFrames,pvFrame))/1e3-(pvAdvance?e:0),"f"),(0,R.GG)(this,Kp,!pvAdvance,"f"),(0,R.gn)(this,Yp,"f").isPaused=!pvAdvance)}';

const nativeCameraUpdateBridge =
  'const pvNativeCamera=s.car.cameraOrbit,pvNativeReplay=window.__POLYTRACK_062__?.replay;pvNativeReplay?.owner===this&&(pvNativeReplay.nativeCameraPose={position:{x:pvNativeCamera.position.x,y:pvNativeCamera.position.y,z:pvNativeCamera.position.z},quaternion:{x:pvNativeCamera.quaternion.x,y:pvNativeCamera.quaternion.y,z:pvNativeCamera.quaternion.z,w:pvNativeCamera.quaternion.w},fov:pvNativeCamera.fov});';

const upstreamApiBase = '"https://vps.kodub.com/"+';
const localApiBase = '"/api/polytrack/"+';

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true });
await linkDirectoryEntries(vendorDirectory, runtimeDirectory, new Set(["main.bundle.js"]));
await linkDirectoryEntries(staticDirectory, runtimeDirectory);

const mainBundlePath = resolve(runtimeDirectory, "main.bundle.js");
const originalBundle = await readFile(resolve(vendorDirectory, "main.bundle.js"), "utf8");
const occurrences = originalBundle.split(animationLoopAnchor).length - 1;
const rendererCaptureOccurrences = originalBundle.split(rendererCaptureAnchor).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `Refusing to patch PolyTrack: expected one verified 0.6.2 animation-loop anchor, found ${occurrences}.`,
  );
}
if (rendererCaptureOccurrences !== 1) {
  throw new Error(`Refusing to patch PolyTrack renderer capture: expected one verified anchor, found ${rendererCaptureOccurrences}.`);
}

const apiOccurrences = originalBundle.split(upstreamApiBase).length - 1;
if (apiOccurrences !== 10) {
  throw new Error(
    `Refusing to patch PolyTrack API routing: expected ten verified 0.6.2 endpoints, found ${apiOccurrences}.`,
  );
}

let bridgedBundle = originalBundle
  .replace(animationLoopAnchor, bridge)
  .replace(rendererCaptureAnchor, rendererCaptureReplacement);

const replayClassOccurrences = originalBundle.split(replayClassAnchor).length - 1;
const replayDisposeOccurrences = originalBundle.split(replayDisposeAnchor).length - 1;
const replayUpdateOccurrences = originalBundle.split(replayUpdateAnchor).length - 1;
const nativeCameraUpdateOccurrences = originalBundle.split(nativeCameraUpdateAnchor).length - 1;
const replayApplyOccurrences = originalBundle.split(replayApplyAnchor).length - 1;
if (replayClassOccurrences !== 1 || replayDisposeOccurrences !== 1 || replayUpdateOccurrences !== 1 || nativeCameraUpdateOccurrences !== 1 || replayApplyOccurrences !== 1) {
  throw new Error(
    `Refusing to patch PolyTrack replay state: expected one class/dispose/update/native-camera/apply anchor, found ${replayClassOccurrences}/${replayDisposeOccurrences}/${replayUpdateOccurrences}/${nativeCameraUpdateOccurrences}/${replayApplyOccurrences}.`,
  );
}

const replayClassIndex = bridgedBundle.indexOf(replayClassAnchor);
const replayDisposeIndex = bridgedBundle.indexOf(replayDisposeAnchor, replayClassIndex);
if (replayClassIndex < 0 || replayDisposeIndex < 0) {
  throw new Error("Verified PolyTrack replay class boundaries were not found.");
}
bridgedBundle = insertAt(bridgedBundle, replayDisposeIndex, replayConstructorBridge + replayManagementBridge + replayEvaluationBridge);
bridgedBundle = bridgedBundle.replace(replayDisposeAnchor, `${replayDisposeAnchor}${replayDisposeBridge}`);
bridgedBundle = bridgedBundle.replace(replayUpdateAnchor, `${replayUpdateAnchor}${replayUpdateBridge}`);
bridgedBundle = bridgedBundle.replace(nativeCameraUpdateAnchor, `${nativeCameraUpdateAnchor}${nativeCameraUpdateBridge}`);
bridgedBundle = bridgedBundle.replace(replayApplyAnchor, replayApplyReplacement);

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
