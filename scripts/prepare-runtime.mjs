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
  ',ee=0;window.__POLYTRACK_062__={version:"0.6.2",replay:null,get audio(){return window.__POLYVIEWER_AUDIO__??null},get renderer(){return d},get scene(){return d.scene},get camera(){return d.camera},get canvas(){return d.canvas},get state(){return $}};d.setAnimationLoop((function(e){const t=Math.max(e-ee,0)/1e3;ee=e,$.update(t),M.update(t)}))';

const audioManagerAnchor = 'this.isAppActive=!0,(0,R.GG)(this,m,e,"f"),(0,R.GG)(this,A,t,"f");try{const e=new(window.AudioContext||window.webkitAudioContext);';
const audioManagerReplacement = 'this.isAppActive=!0,window.__POLYVIEWER_AUDIO__=this,(0,R.GG)(this,m,e,"f"),(0,R.GG)(this,A,t,"f");try{const e=new(window.AudioContext||window.webkitAudioContext);';

const rendererCaptureAnchor = 'clear(){(0,i.gn)(this,k,"f").clear()}update(e){';
const rendererCaptureReplacement = 'clear(){(0,i.gn)(this,k,"f").clear()}polyviewerBeginCapture(e,t){if(this.polyviewerCaptureState)throw new Error("A PolyViewer capture is already active.");if(!Number.isSafeInteger(e)||!Number.isSafeInteger(t)||e<=0||t<=0)throw new RangeError("Capture dimensions must be positive safe integers.");const n=(0,i.gn)(this,k,"f"),a=(0,i.gn)(this,M,"f"),s=(0,i.gn)(this,w,"f");this.polyviewerCaptureState={pixelRatio:n.getPixelRatio(),width:s.width/n.getPixelRatio(),height:s.height/n.getPixelRatio(),aspect:a.aspect},n.setPixelRatio(1),n.setSize(e,t,!1),a.aspect=e/t,a.updateProjectionMatrix()}polyviewerRenderFrame(){const e=(0,i.gn)(this,_ ,"f");null!=e&&(e.camera=(0,i.gn)(this,M,"f"),e.update()),(0,i.gn)(this,k,"f").render((0,i.gn)(this,E,"f"),(0,i.gn)(this,M,"f"))}polyviewerEndCapture(){const e=this.polyviewerCaptureState;if(!e)return;const t=(0,i.gn)(this,k,"f"),n=(0,i.gn)(this,M,"f");t.setPixelRatio(e.pixelRatio),t.setSize(e.width,e.height,!1),n.aspect=e.aspect,n.updateProjectionMatrix(),this.polyviewerCaptureState=null}update(e){if(this.polyviewerCaptureState)return;';

const replayClassAnchor = "const cg=class{constructor(e,t,n,i,r,a,s,o,l,c,h,d,u){";
const replayDisposeAnchor = '}dispose(){(0,R.gn)(this,Lp,"f").clear(),(0,R.gn)(this,Dp,"f").clearMountains();';
const replayUpdateAnchor = 'update(e){(0,R.GG)(this,Kp,(0,R.gn)(this,Yp,"f").isPaused,"f");';
const nativeCameraUpdateAnchor = 'for(const e of(0,R.gn)(this,jp,"f"))e.car.update(i),e.car.updateCameras(i);';
const nativeCameraUpdateReplacement = 'const pvDrivenReplay=window.__POLYTRACK_062__?.replay;for(const e of(0,R.gn)(this,jp,"f")){const t=pvDrivenReplay?.owner!==this||"function"!=typeof pvDrivenReplay.driver||e.polyviewerVisible!==!1||e.polyviewerId===pvDrivenReplay.priorityReplayId;t&&e.car.update(i),(pvDrivenReplay?.owner!==this||"function"!=typeof pvDrivenReplay.driver||e.polyviewerId==="main"||e.polyviewerId===pvDrivenReplay.priorityReplayId)&&e.car.updateCameras(i)}';
const replayLoadedFramesAnchor = 'let t=1/0;for(const e of(0,R.gn)(this,jp,"f"))t=Math.min(t,e.replay.getLastFrame().numberOfFrames);';
const replayLoadedFramesReplacement = 'const pvDrivenLoad=window.__POLYTRACK_062__?.replay;let t=pvDrivenLoad?.owner===this&&"function"==typeof pvDrivenLoad.driver?pvDrivenLoad.loadedFrames:1/0;if(!(pvDrivenLoad?.owner===this&&"function"==typeof pvDrivenLoad.driver))for(const e of(0,R.gn)(this,jp,"f"))t=Math.min(t,e.replay.getLastFrame().numberOfFrames);';
const replayApplyAnchor = 'lg=function(e){for(const t of(0,R.gn)(this,jp,"f"))if(t.car.getTime().numberOfFrames!=e){const n=t.replay.getFrame(e);null!=n&&t.car.setCarState(n,n.frames!=t.car.getTime().numberOfFrames&&n.frames!=t.car.getTime().numberOfFrames+1)}};';
const replayApplyReplacement = 'lg=function(e){const t=window.__POLYTRACK_062__?.replay;for(const n of(0,R.gn)(this,jp,"f")){if(t?.owner===this&&"function"==typeof t.driver){if(n.polyviewerVisible===!1&&n.polyviewerId!==t.priorityReplayId)continue;if(e!==t.requestedFrame&&n.polyviewerHistoryEnabled!==!0)continue}const i=Math.min(e,n.replay.getLastFrame().numberOfFrames);if(n.car.getTime().numberOfFrames!=i){const e=n.replay.getFrame(i);null!=e&&n.car.setCarState(e,e.frames!=n.car.getTime().numberOfFrames&&e.frames!=n.car.getTime().numberOfFrames+1)}}};';

const carVisibilityAnchor = 'setVisible(e){(0,l.gn)(this,me,"f").visible=e}getCarState(){';
const carVisibilityReplacement = 'setVisible(e){this.polyviewerVisible=!!e,(0,l.gn)(this,me,"f").visible=e,e||(0,l.gn)(this,Ne,"f")?.clear();if(!e){for(const e of(0,l.gn)(this,Pe,"f"))e.clear();null!=(0,l.gn)(this,ve,"f")&&((0,l.gn)(this,ve,"f").visible=!1)}}polyviewerSetAdaptiveQuality(e,t){this.polyviewerEffectsEnabled=!!e;if(!e){(0,l.gn)(this,Ne,"f")?.clear();for(const e of(0,l.gn)(this,Pe,"f"))e.clear()}(0,l.gn)(this,me,"f").traverse((e=>{"castShadow"in e&&(void 0===e.polyviewerOriginalCastShadow&&(e.polyviewerOriginalCastShadow=e.castShadow),e.castShadow=t?!1:e.polyviewerOriginalCastShadow),"receiveShadow"in e&&(void 0===e.polyviewerOriginalReceiveShadow&&(e.polyviewerOriginalReceiveShadow=e.receiveShadow),e.receiveShadow=t?!1:e.polyviewerOriginalReceiveShadow)}))}polyviewerRefreshNameTag(){const e=(0,l.gn)(this,ve,"f");if(null!=e){const t=this.getPosition(),n=new c.Pq0(0,1,0).applyQuaternion(this.getQuaternion());e.position.copy(t.clone().addScaledVector(n,1.75));const i=e.position.distanceToSquared((0,l.gn)(this,ge,"f").camera.position);e.visible=this.polyviewerVisible!==!1&&this.polyviewerNameTagEnabled===!0&&(0,l.gn)(this,te,"f").hasStarted&&i>=6.25&&i<=2500,e.visible&&e.lookAt((0,l.gn)(this,ge,"f").camera.position)}}getCarState(){';
const nameTagVisibilityAnchor = '.visible=(0,l.gn)(this,te,"f").hasStarted&&i>=r*r&&i<=a*a,';
const nameTagVisibilityReplacement = '.visible=this.polyviewerVisible!==!1&&this.polyviewerNameTagEnabled===!0&&(0,l.gn)(this,te,"f").hasStarted&&i>=r*r&&i<=a*a,';
const skidSpawnAnchor = 'e>0&&(0,l.gn)(this,Re,"f")?.getSettingBoolean(rt.A.SkidmarksEnabled)';
const skidSpawnReplacement = 'e>0&&this.polyviewerVisible!==!1&&this.polyviewerEffectsEnabled!==!1&&(0,l.gn)(this,Re,"f")?.getSettingBoolean(rt.A.SkidmarksEnabled)';
const particleSpawnAnchor = '0==(0,l.gn)(this,Le,"f")[n]&&null!=(0,l.gn)(this,Ne,"f")&&(0,l.gn)(this,Ne,"f").spawn';
const particleSpawnReplacement = '0==(0,l.gn)(this,Le,"f")[n]&&this.polyviewerVisible!==!1&&this.polyviewerEffectsEnabled!==!1&&null!=(0,l.gn)(this,Ne,"f")&&(0,l.gn)(this,Ne,"f").spawn';
const particleAllocationAnchor = 'd?.getSettingBoolean(rt.A.ParticlesEnabled)?(0,l.GG)(this,Ne,new U.A(r),"f"):(0,l.GG)(this,Ne,null,"f")';
const particleAllocationReplacement = '!window.__POLYVIEWER_LIGHTWEIGHT_CAR__&&d?.getSettingBoolean(rt.A.ParticlesEnabled)?(0,l.GG)(this,Ne,new U.A(r),"f"):(0,l.GG)(this,Ne,null,"f")';
const skidAllocationAnchor = 'null!=(0,l.gn)(this,_e,"f")&&null!=(0,l.gn)(this,Ce,"f")&&(0,l.GG)(this,Pe,[new z((0,l.gn)(this,ge,"f")),new z((0,l.gn)(this,ge,"f")),new z((0,l.gn)(this,ge,"f")),new z((0,l.gn)(this,ge,"f"))],"f")';
const skidAllocationReplacement = '!window.__POLYVIEWER_LIGHTWEIGHT_CAR__&&null!=(0,l.gn)(this,_e,"f")&&null!=(0,l.gn)(this,Ce,"f")&&(0,l.GG)(this,Pe,[new z((0,l.gn)(this,ge,"f")),new z((0,l.gn)(this,ge,"f")),new z((0,l.gn)(this,ge,"f")),new z((0,l.gn)(this,ge,"f"))],"f")';

const replayConstructorBridge =
  ';const pvOwner=this,pvReplay={owner:pvOwner,driver:null,nativeCameraPose:null,priorityReplayId:"main",requestedFrame:0,get durationFrames(){return Math.round(1e3*(0,R.gn)(pvOwner,Qp,"f"))},get loadedFrames(){const e=(0,R.gn)(pvOwner,jp,"f")[0];return null==e?0:Math.max(0,e.replay.getLastFrame().numberOfFrames)},get timeFrames(){return Math.round(1e3*(0,R.gn)(pvOwner,qp,"f"))},get primaryCar(){return(0,R.gn)(pvOwner,jp,"f")[0]?.car??null},setDriver(e){this.driver=e},setNativePaused(e){const t=!!e;(0,R.GG)(pvOwner,Kp,t,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=t},seekFrame(e){if(!Number.isSafeInteger(e)||e<0)throw new RangeError("Replay frame must be a non-negative safe integer.");const t=Math.max(0,Math.min(this.durationFrames,this.loadedFrames,e));(0,R.GG)(pvOwner,qp,t/1e3,"f"),(0,R.GG)(pvOwner,Kp,!0,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=!0}};window.__POLYTRACK_062__.replay=pvReplay;window.dispatchEvent(new CustomEvent("polytrack:replay-ready"))';

const replayManagementBridge = `;{
  const pvEntries=(0,R.gn)(pvOwner,jp,"f"),pvMaxReplays=500,pvFullEffectsLimit=20;
  for(let pvIndex=0;pvIndex<pvEntries.length;pvIndex++){
    const pvEntry=pvEntries[pvIndex];
    pvEntry.polyviewerId=pvIndex===0?"main":"native-"+pvIndex;
    pvEntry.polyviewerName=pvEntry.settings.nickname??(pvIndex===0?"Main Replay":"Replay "+(pvIndex+1));
    pvEntry.polyviewerVisible=!0;pvEntry.polyviewerOpacity=1;pvEntry.polyviewerLightweight=!1;
  }
  let pvNextReplayId=1;
  const pvPolicy=pvCount=>pvCount<=20?{mode:"full",budget:pvCount}:pvCount<=100?{mode:"balanced",budget:12}:pvCount<=250?{mode:"crowd",budget:6}:{mode:"massive",budget:2};
  pvReplay.refreshPerformance=()=>{
    const pvVisible=pvEntries.filter(pvEntry=>pvEntry.polyviewerVisible!==!1);let pvPolicyValue=pvPolicy(pvVisible.length);if(pvPolicyValue.mode==="full"&&pvVisible.some(pvEntry=>pvEntry.polyviewerLightweight))pvPolicyValue={mode:"balanced",budget:pvVisible.length};const pvHistory=new Set;
    const pvAddPriority=pvEntry=>{if(pvEntry&&pvEntry.polyviewerVisible!==!1&&pvHistory.size<pvPolicyValue.budget)pvHistory.add(pvEntry)};
    pvAddPriority(pvEntries[0]);pvAddPriority(pvEntries.find(pvEntry=>pvEntry.polyviewerId===pvReplay.priorityReplayId));
    for(const pvEntry of pvVisible)if(pvEntry.polyviewerNameTagVisible===!0)pvAddPriority(pvEntry);
    for(const pvEntry of pvVisible)pvAddPriority(pvEntry);
    for(const pvEntry of pvEntries){
      pvEntry.polyviewerHistoryEnabled=pvHistory.has(pvEntry);
      const pvEffects=pvEntry.polyviewerHistoryEnabled&&pvEntry.polyviewerVisible!==!1,pvCrowd=pvPolicyValue.mode!=="full"&&!pvEntry.polyviewerHistoryEnabled,pvSignature=(pvEffects?1:0)+":"+(pvCrowd?1:0);
      if(pvEntry.polyviewerPerformanceSignature!==pvSignature){pvEntry.polyviewerPerformanceSignature=pvSignature;pvEntry.car.polyviewerSetAdaptiveQuality(pvEffects,pvCrowd)}
    }
    const pvReady=pvEntries.filter(pvEntry=>null==pvEntry.carId||pvEntry.replay.getLastFrame().numberOfFrames>=pvReplay.durationFrames).length;
    pvReplay.performanceStatus={mode:pvPolicyValue.mode,totalReplays:pvEntries.length,visibleReplays:pvVisible.length,historyBudget:pvHistory.size,lightweightReplays:pvEntries.filter(pvEntry=>pvEntry.polyviewerLightweight).length,readyReplays:pvReady,renderReady:pvEntries.length>0&&pvEntries.every(pvEntry=>pvEntry.polyviewerVisible===!1||null==pvEntry.carId||pvEntry.replay.getLastFrame().numberOfFrames>=pvReplay.durationFrames)};
    return pvReplay.performanceStatus;
  };
  pvReplay.getPerformanceStatus=()=>({...pvReplay.refreshPerformance()});
  pvReplay.setPriorityReplay=pvId=>{if(pvEntries.some(pvEntry=>pvEntry.polyviewerId===pvId)){pvReplay.priorityReplayId=pvId;pvReplay.refreshPerformance()}};
  pvReplay.listReplays=()=>pvEntries.map((pvEntry,pvIndex)=>({id:pvEntry.polyviewerId,name:pvEntry.polyviewerName,visible:pvEntry.polyviewerVisible,opacity:pvEntry.polyviewerOpacity,removable:pvIndex>0}));
  pvReplay.getCar=pvId=>pvEntries.find(pvEntry=>pvEntry.polyviewerId===pvId)?.car??null;
  pvReplay.getNativeCameraPose=pvId=>{const pvCamera=pvReplay.getCar(pvId)?.cameraOrbit;return pvCamera?{position:{x:pvCamera.position.x,y:pvCamera.position.y,z:pvCamera.position.z},quaternion:{x:pvCamera.quaternion.x,y:pvCamera.quaternion.y,z:pvCamera.quaternion.z,w:pvCamera.quaternion.w},fov:pvCamera.fov}:null};
  pvReplay.addReplay=(pvRecordingString,pvName,pvMetadata={})=>{
    if(pvEntries.length>=pvMaxReplays)throw new Error("PolyViewer currently supports up to "+pvMaxReplays+" simultaneous cars in this performance stage.");
    if("string"!=typeof pvRecordingString||pvRecordingString.trim().length===0)throw new Error("Paste a PolyTrack recording string.");
    const pvMain=pvEntries[0],pvRecording=pvMain.car.getRecording().constructor.deserialize(pvRecordingString.trim());
    if(null==pvRecording)throw new Error("Invalid PolyTrack 0.6.2 recording string.");
    let pvCarStyle=pvMain.car.getCarStyle();
    if("string"==typeof pvMetadata.carStyle&&pvMetadata.carStyle.trim().length>0)pvCarStyle=pvCarStyle.constructor.deserializeSafe(pvMetadata.carStyle.trim());
    const pvRequestedFrames=pvReplay.durationFrames,pvTrack=(0,R.gn)(pvOwner,Lp,"f"),pvMountains=(0,R.gn)(pvOwner,Dp,"f"),pvStart=pvTrack.getStartTransform();
    if(null==pvStart)throw new Error("Track has no starting point");
    const pvLightweight=pvEntries.length>=pvFullEffectsLimit;let pvCar;
    window.__POLYVIEWER_LIGHTWEIGHT_CAR__=pvLightweight;
    try{pvCar=new U.A(null,pvStart,pvRecording,null,(0,R.gn)(pvOwner,Gp,"f"),(0,R.gn)(pvOwner,Fp,"f"),pvMountains,pvTrack,(0,R.gn)(pvOwner,Np,"f"),(0,R.gn)(pvOwner,Wp,"f"),null)}finally{window.__POLYVIEWER_LIGHTWEIGHT_CAR__=!1}
    pvCar.setCarStyle(pvCarStyle);
    const pvEntry={replay:new Ht,checkpointTimes:[],finishSpeed:null,carId:null,car:pvCar,settings:{...pvMain.settings,nickname:"string"==typeof pvName&&pvName.trim().length>0?pvName.trim():"Replay "+(pvEntries.length+1),recording:pvRecording,time:new bt.A(pvRequestedFrames),carStyle:pvCarStyle},polyviewerId:"replay-"+pvNextReplayId++,polyviewerName:"",polyviewerVisible:!0,polyviewerOpacity:1,polyviewerLightweight:pvLightweight,polyviewerVerifiedState:Number.isSafeInteger(pvMetadata.verifiedState)?pvMetadata.verifiedState:null};
    pvEntry.polyviewerName=pvEntry.settings.nickname;pvCar.setNameTag(null,pvEntry.polyviewerName);
    const pvWorker=(0,R.gn)(pvOwner,Ip,"f"),pvCreated=pvWorker.createCar(pvStart,pvMountains.getMountainVertices(),pvMountains.getMountainOffset(),(0,R.gn)(pvOwner,Np,"f"),pvRecording,pvState=>{pvEntry.replay.push(pvState);if(null!=pvEntry.carId&&pvState.frames>=pvRequestedFrames){pvWorker.deleteCar(pvEntry.carId);pvEntry.carId=null}});
    pvEntry.replay.push(pvCreated.carState);pvEntry.carId=pvCreated.id;pvEntries.push(pvEntry);pvReplay.refreshPerformance();pvWorker.startCar(pvCreated.id,new bt.A(pvRequestedFrames));return pvReplay.listReplays().at(-1)
  };
  pvReplay.setReplayName=(pvId,pvName)=>{const pvEntry=pvEntries.find(pvItem=>pvItem.polyviewerId===pvId),pvClean=String(pvName??"").trim();if(!pvEntry)throw new Error("Replay not found");if(!pvClean)throw new Error("Replay name cannot be empty");pvEntry.polyviewerName=pvClean;pvEntry.settings.nickname=pvClean;pvEntry.car.setNameTag(null,pvClean)};
  pvReplay.setReplayVisible=(pvId,pvVisible)=>{const pvEntry=pvEntries.find(pvItem=>pvItem.polyviewerId===pvId);if(!pvEntry)throw new Error("Replay not found");pvEntry.polyviewerVisible=!!pvVisible;pvEntry.car.setVisible(pvEntry.polyviewerVisible);pvReplay.refreshPerformance()};
  pvReplay.setReplayOpacity=(pvId,pvOpacity)=>{const pvEntry=pvEntries.find(pvItem=>pvItem.polyviewerId===pvId);if(!pvEntry)throw new Error("Replay not found");if(!Number.isFinite(pvOpacity)||pvOpacity<0||pvOpacity>1)throw new RangeError("Replay opacity must be between 0 and 1");pvEntry.polyviewerOpacity=pvOpacity;pvEntry.car.setOpacity(pvOpacity)};
  pvReplay.removeReplay=pvId=>{const pvIndex=pvEntries.findIndex(pvItem=>pvItem.polyviewerId===pvId);if(pvIndex<=0)return!1;const pvEntry=pvEntries[pvIndex];if(null!=pvEntry.carId){(0,R.gn)(pvOwner,Ip,"f").deleteCar(pvEntry.carId);pvEntry.carId=null}pvEntry.car.dispose();pvEntries.splice(pvIndex,1);pvReplay.priorityReplayId=pvEntries.some(pvItem=>pvItem.polyviewerId===pvReplay.priorityReplayId)?pvReplay.priorityReplayId:"main";pvReplay.refreshPerformance();return!0};
  pvReplay.refreshPerformance()
}`;

const replayOverlayBridge =
  ';{const pvEntries=(0,R.gn)(pvOwner,jp,"f"),pvListReplays=pvReplay.listReplays;for(const pvEntry of pvEntries)pvEntry.polyviewerNameTagVisible=!1,pvEntry.car.polyviewerNameTagEnabled=!1,pvEntry.car.setNameTag(null,pvEntry.polyviewerName);pvReplay.listReplays=()=>pvListReplays().map((pvSummary,pvIndex)=>({...pvSummary,nameTagVisible:pvEntries[pvIndex]?.polyviewerNameTagVisible===!0}));pvReplay.setReplayNameTagVisible=(pvId,pvVisible)=>{const pvEntry=pvEntries.find(pvItem=>pvItem.polyviewerId===pvId);if(!pvEntry)throw new Error("Replay not found");pvEntry.polyviewerNameTagVisible=!!pvVisible,pvEntry.car.polyviewerNameTagEnabled=!!pvVisible,pvEntry.car.polyviewerRefreshNameTag(),pvReplay.refreshPerformance()};pvReplay.refreshOverlays=()=>{for(const pvEntry of pvEntries)pvEntry.polyviewerNameTagVisible&&pvEntry.polyviewerVisible&&pvEntry.car.polyviewerRefreshNameTag()}}';

const replayEvaluationBridge =
  ';pvReplay.evaluatedFrame=pvReplay.timeFrames,pvReplay.evaluateFrame=(pvRequestedFrame,pvAdvanceVisuals)=>{if(!Number.isSafeInteger(pvRequestedFrame)||pvRequestedFrame<0)throw new RangeError("Replay frame must be a non-negative safe integer.");const pvTarget=Math.max(0,Math.min(pvReplay.durationFrames,pvReplay.loadedFrames,pvRequestedFrame)),pvEntries=(0,R.gn)(pvOwner,jp,"f"),pvActive=pvEntries.filter(pvEntry=>pvEntry.polyviewerVisible!==!1||pvEntry.polyviewerId===pvReplay.priorityReplayId),pvApplyEntry=(pvEntry,pvFrame,pvDelta)=>{const pvAvailableFrame=Math.min(pvFrame,pvEntry.replay.getLastFrame().numberOfFrames);if(pvEntry.car.getTime().numberOfFrames!=pvAvailableFrame){const pvState=pvEntry.replay.getFrame(pvAvailableFrame);null!=pvState&&pvEntry.car.setCarState(pvState,pvState.frames!=pvEntry.car.getTime().numberOfFrames&&pvState.frames!=pvEntry.car.getTime().numberOfFrames+1)}pvEntry.car.update(pvDelta);(pvEntry.polyviewerId==="main"||pvEntry.polyviewerId===pvReplay.priorityReplayId)&&pvEntry.car.updateCameras(pvDelta)};if(pvAdvanceVisuals&&pvTarget>pvReplay.evaluatedFrame){const pvHistory=pvActive.filter(pvEntry=>pvEntry.polyviewerHistoryEnabled===!0),pvDirect=pvActive.filter(pvEntry=>pvEntry.polyviewerHistoryEnabled!==!0);for(let pvFrame=pvReplay.evaluatedFrame+1;pvFrame<=pvTarget;pvFrame++)for(const pvEntry of pvHistory)pvApplyEntry(pvEntry,pvFrame,.001);for(const pvEntry of pvDirect)pvApplyEntry(pvEntry,pvTarget,0)}else for(const pvEntry of pvActive)pvApplyEntry(pvEntry,pvTarget,0);pvReplay.evaluatedFrame=pvTarget,(0,R.GG)(pvOwner,qp,pvTarget/1e3,"f"),(0,R.GG)(pvOwner,Kp,!0,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=!0,pvReplay.nativeCameraPose=pvReplay.getNativeCameraPose("main")};';

const replayDisposeBridge =
  'const pvRuntime=window.__POLYTRACK_062__;pvRuntime?.replay?.owner===this&&(pvRuntime.replay.driver=null,pvRuntime.replay=null,window.dispatchEvent(new CustomEvent("polytrack:replay-disposed")));';

const replayUpdateBridge =
  'const pvReplay=window.__POLYTRACK_062__?.replay;if(pvReplay?.owner===this&&"function"==typeof pvReplay.driver){const pvDrive=pvReplay.driver(e,pvReplay.durationFrames,pvReplay.loadedFrames),pvAdvance=!!pvDrive?.advanceVisuals,pvFrame=pvDrive?.frame;Number.isSafeInteger(pvFrame)&&(pvReplay.requestedFrame=Math.max(0,Math.min(pvReplay.durationFrames,pvReplay.loadedFrames,pvFrame)),(0,R.GG)(this,qp,pvReplay.requestedFrame/1e3-(pvAdvance?e:0),"f"),(0,R.GG)(this,Kp,!pvAdvance,"f"),(0,R.gn)(this,Yp,"f").isPaused=!pvAdvance)}';

const nativeCameraUpdateBridge =
  'const pvNativeCamera=s.car.cameraOrbit,pvNativeReplay=window.__POLYTRACK_062__?.replay;pvNativeReplay?.owner===this&&(pvNativeReplay.nativeCameraPose={position:{x:pvNativeCamera.position.x,y:pvNativeCamera.position.y,z:pvNativeCamera.position.z},quaternion:{x:pvNativeCamera.quaternion.x,y:pvNativeCamera.quaternion.y,z:pvNativeCamera.quaternion.z,w:pvNativeCamera.quaternion.w},fov:pvNativeCamera.fov});';

const upstreamApiBase = '"https://vps.kodub.com/"+';
const localApiBase = '"/api/polytrack/"+';

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true });
await linkDirectoryEntries(vendorDirectory, runtimeDirectory, new Set(["main.bundle.js", "manifest.json"]));
await linkDirectoryEntries(staticDirectory, runtimeDirectory);

const mainBundlePath = resolve(runtimeDirectory, "main.bundle.js");
const originalBundle = await readFile(resolve(vendorDirectory, "main.bundle.js"), "utf8");
const occurrences = originalBundle.split(animationLoopAnchor).length - 1;
const rendererCaptureOccurrences = originalBundle.split(rendererCaptureAnchor).length - 1;
const audioManagerOccurrences = originalBundle.split(audioManagerAnchor).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `Refusing to patch PolyTrack: expected one verified 0.6.2 animation-loop anchor, found ${occurrences}.`,
  );
}
if (rendererCaptureOccurrences !== 1) {
  throw new Error(`Refusing to patch PolyTrack renderer capture: expected one verified anchor, found ${rendererCaptureOccurrences}.`);
}
if (audioManagerOccurrences !== 1) {
  throw new Error(`Refusing to patch PolyTrack audio capture: expected one verified anchor, found ${audioManagerOccurrences}.`);
}

const apiOccurrences = originalBundle.split(upstreamApiBase).length - 1;
if (apiOccurrences !== 10) {
  throw new Error(
    `Refusing to patch PolyTrack API routing: expected ten verified 0.6.2 endpoints, found ${apiOccurrences}.`,
  );
}

let bridgedBundle = originalBundle
  .replace(animationLoopAnchor, bridge)
  .replace(rendererCaptureAnchor, rendererCaptureReplacement)
  .replace(audioManagerAnchor, audioManagerReplacement);

const replayClassOccurrences = originalBundle.split(replayClassAnchor).length - 1;
const replayDisposeOccurrences = originalBundle.split(replayDisposeAnchor).length - 1;
const replayUpdateOccurrences = originalBundle.split(replayUpdateAnchor).length - 1;
const nativeCameraUpdateOccurrences = originalBundle.split(nativeCameraUpdateAnchor).length - 1;
const replayLoadedFramesOccurrences = originalBundle.split(replayLoadedFramesAnchor).length - 1;
const replayApplyOccurrences = originalBundle.split(replayApplyAnchor).length - 1;
const carVisibilityOccurrences = originalBundle.split(carVisibilityAnchor).length - 1;
const nameTagVisibilityOccurrences = originalBundle.split(nameTagVisibilityAnchor).length - 1;
const skidSpawnOccurrences = originalBundle.split(skidSpawnAnchor).length - 1;
const particleSpawnOccurrences = originalBundle.split(particleSpawnAnchor).length - 1;
const particleAllocationOccurrences = originalBundle.split(particleAllocationAnchor).length - 1;
const skidAllocationOccurrences = originalBundle.split(skidAllocationAnchor).length - 1;
if (replayClassOccurrences !== 1 || replayDisposeOccurrences !== 1 || replayUpdateOccurrences !== 1 || nativeCameraUpdateOccurrences !== 1 || replayLoadedFramesOccurrences !== 1 || replayApplyOccurrences !== 1 || carVisibilityOccurrences !== 1 || nameTagVisibilityOccurrences !== 1 || skidSpawnOccurrences !== 1 || particleSpawnOccurrences !== 1 || particleAllocationOccurrences !== 1 || skidAllocationOccurrences !== 1) {
  throw new Error(
    `Refusing to patch PolyTrack replay state: verified anchor count mismatch ${replayClassOccurrences}/${replayDisposeOccurrences}/${replayUpdateOccurrences}/${nativeCameraUpdateOccurrences}/${replayLoadedFramesOccurrences}/${replayApplyOccurrences}/${carVisibilityOccurrences}/${nameTagVisibilityOccurrences}/${skidSpawnOccurrences}/${particleSpawnOccurrences}/${particleAllocationOccurrences}/${skidAllocationOccurrences}.`,
  );
}

const replayClassIndex = bridgedBundle.indexOf(replayClassAnchor);
const replayDisposeIndex = bridgedBundle.indexOf(replayDisposeAnchor, replayClassIndex);
if (replayClassIndex < 0 || replayDisposeIndex < 0) {
  throw new Error("Verified PolyTrack replay class boundaries were not found.");
}
bridgedBundle = insertAt(bridgedBundle, replayDisposeIndex, replayConstructorBridge + replayManagementBridge + replayOverlayBridge + replayEvaluationBridge);
bridgedBundle = bridgedBundle.replace(replayDisposeAnchor, `${replayDisposeAnchor}${replayDisposeBridge}`);
bridgedBundle = bridgedBundle.replace(replayUpdateAnchor, `${replayUpdateAnchor}${replayUpdateBridge}`);
bridgedBundle = bridgedBundle.replace(nativeCameraUpdateAnchor, `${nativeCameraUpdateReplacement};${nativeCameraUpdateBridge}`);
bridgedBundle = bridgedBundle.replace(replayLoadedFramesAnchor, replayLoadedFramesReplacement);
bridgedBundle = bridgedBundle.replace(replayApplyAnchor, replayApplyReplacement);
bridgedBundle = bridgedBundle
  .replace(carVisibilityAnchor, carVisibilityReplacement)
  .replace(nameTagVisibilityAnchor, nameTagVisibilityReplacement)
  .replace(skidSpawnAnchor, skidSpawnReplacement)
  .replace(particleSpawnAnchor, particleSpawnReplacement)
  .replace(particleAllocationAnchor, particleAllocationReplacement)
  .replace(skidAllocationAnchor, skidAllocationReplacement);

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
