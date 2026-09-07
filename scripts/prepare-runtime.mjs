import { CarPatternCache, ReplayWorkerPool } from "./runtime-resources.mjs";
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
const rendererCaptureReplacement = 'clear(){(0,i.gn)(this,k,"f").clear()}polyviewerBeginCapture(e,t,n={}){if(this.polyviewerCaptureState)throw new Error("A PolyViewer capture is already active.");if(!Number.isSafeInteger(e)||!Number.isSafeInteger(t)||e<=0||t<=0)throw new RangeError("Capture dimensions must be positive safe integers.");const a=(0,i.gn)(this,k,"f"),s=(0,i.gn)(this,M,"f"),o=(0,i.gn)(this,w,"f");this.polyviewerCaptureState={pixelRatio:a.getPixelRatio(),width:o.width/a.getPixelRatio(),height:o.height/a.getPixelRatio(),aspect:s.aspect,renderEffects:window.__POLYVIEWER_RENDER_EFFECTS__},window.__POLYVIEWER_RENDER_EFFECTS__={particles:n.particles!==!1,skidmarks:n.skidmarks!==!1};const r=window.__POLYTRACK_062__?.replay;r?.setRenderMode?.(!0);if(r?.listReplays&&r.getCar)for(const e of r.listReplays())r.getCar(e.id)?.polyviewerSetRenderEffects?.(window.__POLYVIEWER_RENDER_EFFECTS__);a.setPixelRatio(1),a.setSize(e,t,!1),s.aspect=e/t,s.updateProjectionMatrix()}polyviewerRenderFrame(e=!0){const t=(0,i.gn)(this,k,"f");if(e&&null!=this.polyviewerLastUpdateSource){this.polyviewerCaptureShadowPass=!0;try{this.update(this.polyviewerLastUpdateSource)}finally{this.polyviewerCaptureShadowPass=!1}return}const n=t.shadowMap.enabled;t.shadowMap.enabled=!1;try{(0,i.gn)(this,k,"f").render((0,i.gn)(this,E,"f"),(0,i.gn)(this,M,"f"))}finally{t.shadowMap.enabled=n}}polyviewerEndCapture(){const e=this.polyviewerCaptureState;if(!e)return;const t=(0,i.gn)(this,k,"f"),n=(0,i.gn)(this,M,"f");t.setPixelRatio(e.pixelRatio),t.setSize(e.width,e.height,!1),n.aspect=e.aspect,n.updateProjectionMatrix(),void 0===e.renderEffects?delete window.__POLYVIEWER_RENDER_EFFECTS__:window.__POLYVIEWER_RENDER_EFFECTS__=e.renderEffects;const a=window.__POLYTRACK_062__?.replay;if(a?.listReplays&&a.getCar)for(const e of a.listReplays())a.getCar(e.id)?.polyviewerSetRenderEffects?.(window.__POLYVIEWER_RENDER_EFFECTS__??{});a?.setRenderMode?.(!1),this.polyviewerCaptureState=null}update(e){this.polyviewerLastUpdateSource=e;if(this.polyviewerCaptureState&&!this.polyviewerCaptureShadowPass)return;';
const rendererShadowQualityAnchor = 'let t=(0,i.gn)(this,x,"f")?.getSettingInteger(W.A.ShadowQuality)??0;';
const rendererShadowQualityReplacement = 'let t=this.polyviewerCaptureShadowPass?Math.max(2,(0,i.gn)(this,x,"f")?.getSettingInteger(W.A.ShadowQuality)??0):(0,i.gn)(this,x,"f")?.getSettingInteger(W.A.ShadowQuality)??0;';
const rendererResizeAnchor = '(0,i.gn)(this,b,"m",z).call(this),(0,i.gn)(this,b,"m",G).call(this),(0,i.gn)(this,k,"f").render';
const rendererResizeReplacement = 'this.polyviewerCaptureShadowPass||(0,i.gn)(this,b,"m",z).call(this),(0,i.gn)(this,b,"m",G).call(this),(0,i.gn)(this,k,"f").render';

const replayClassAnchor = "const cg=class{constructor(e,t,n,i,r,a,s,o,l,c,h,d,u){";
const replayDisposeAnchor = '}dispose(){(0,R.gn)(this,Lp,"f").clear(),(0,R.gn)(this,Dp,"f").clearMountains();';
const replayUpdateAnchor = 'update(e){(0,R.GG)(this,Kp,(0,R.gn)(this,Yp,"f").isPaused,"f");';
const nativeCameraUpdateAnchor = 'for(const e of(0,R.gn)(this,jp,"f"))e.car.update(i),e.car.updateCameras(i);';
const nativeCameraUpdateReplacement = 'const pvDrivenReplay=window.__POLYTRACK_062__?.replay;for(const e of(0,R.gn)(this,jp,"f")){const t=pvDrivenReplay?.owner!==this||"function"!=typeof pvDrivenReplay.driver||e.polyviewerPreviewVisible!==!1||e.polyviewerId===pvDrivenReplay.priorityReplayId;t&&e.car.update(i),(pvDrivenReplay?.owner!==this||"function"!=typeof pvDrivenReplay.driver||e.polyviewerId==="main"||e.polyviewerId===pvDrivenReplay.priorityReplayId)&&e.car.updateCameras(i)}';
const replayLoadedFramesAnchor = 'let t=1/0;for(const e of(0,R.gn)(this,jp,"f"))t=Math.min(t,e.replay.getLastFrame().numberOfFrames);';
const replayLoadedFramesReplacement = 'const pvDrivenLoad=window.__POLYTRACK_062__?.replay;let t=pvDrivenLoad?.owner===this&&"function"==typeof pvDrivenLoad.driver?pvDrivenLoad.loadedFrames:1/0;if(!(pvDrivenLoad?.owner===this&&"function"==typeof pvDrivenLoad.driver))for(const e of(0,R.gn)(this,jp,"f"))t=Math.min(t,e.replay.getLastFrame().numberOfFrames);';
const replayApplyAnchor = 'lg=function(e){for(const t of(0,R.gn)(this,jp,"f"))if(t.car.getTime().numberOfFrames!=e){const n=t.replay.getFrame(e);null!=n&&t.car.setCarState(n,n.frames!=t.car.getTime().numberOfFrames&&n.frames!=t.car.getTime().numberOfFrames+1)}};';
const replayApplyReplacement = 'lg=function(e){const t=window.__POLYTRACK_062__?.replay;for(const n of(0,R.gn)(this,jp,"f")){if(t?.owner===this&&"function"==typeof t.driver&&n.polyviewerPreviewVisible===!1&&n.polyviewerId!==t.priorityReplayId)continue;const i=Math.min(e,n.replay.getLastFrame().numberOfFrames);if(n.car.getTime().numberOfFrames!=i){const e=n.replay.getFrame(i);null!=e&&n.car.setCarState(e,e.frames!=n.car.getTime().numberOfFrames&&e.frames!=n.car.getTime().numberOfFrames+1)}}};';

const simulationStateDispatchAnchor = 'case o.UpdateResult:{const e=t.carStateBuffers;for(const t of e){const e=new Uint8Array(t),n=e[0]|e[1]<<8|e[2]<<16|e[3]<<24,i=(0,r.gn)(this,p,"f").get(n);if(null!=i){i(m.VO(e.subarray(4)).carState)}}break';
const simulationStateDispatchReplacement = 'case o.UpdateResult:{const e=t.carStateBuffers;for(const t of e){const e=new Uint8Array(t),n=e[0]|e[1]<<8|e[2]<<16|e[3]<<24,i=(0,r.gn)(this,p,"f").get(n);if(null!=i){const t=e.subarray(4);i.polyviewerPacked===!0?i(t):i(m.VO(t).carState)}}break';

const carVisibilityAnchor = 'setVisible(e){(0,l.gn)(this,me,"f").visible=e}getCarState(){';
const carVisibilityReplacement = 'setVisible(e){this.polyviewerVisible=!!e,(0,l.gn)(this,me,"f").visible=e,e||(0,l.gn)(this,Ne,"f")?.clear();if(!e){for(const e of(0,l.gn)(this,Pe,"f"))e.clear();null!=(0,l.gn)(this,ve,"f")&&((0,l.gn)(this,ve,"f").visible=!1)}}polyviewerSetRenderEffects(e){const t=e?.particles!==!1,n=e?.skidmarks!==!1;(0,l.gn)(this,Ne,"f")?.setVisible(t),t||(0,l.gn)(this,Ne,"f")?.clear();for(const e of(0,l.gn)(this,Pe,"f"))e.setVisible(n),n||e.clear()}polyviewerRefreshNameTag(){const e=(0,l.gn)(this,ve,"f");if(null!=e){const t=this.getPosition(),n=new c.Pq0(0,1,0).applyQuaternion(this.getQuaternion());e.position.copy(t.clone().addScaledVector(n,1.75));const i=e.position.distanceToSquared((0,l.gn)(this,ge,"f").camera.position);e.visible=this.polyviewerVisible!==!1&&this.polyviewerNameTagEnabled===!0&&(0,l.gn)(this,te,"f").hasStarted&&i>=6.25&&i<=2500,e.visible&&e.lookAt((0,l.gn)(this,ge,"f").camera.position)}}getCarState(){';
const nameTagVisibilityAnchor = '.visible=(0,l.gn)(this,te,"f").hasStarted&&i>=r*r&&i<=a*a,';
const nameTagVisibilityReplacement = '.visible=this.polyviewerVisible!==!1&&this.polyviewerNameTagEnabled===!0&&(0,l.gn)(this,te,"f").hasStarted&&i>=r*r&&i<=a*a,';
const skidSpawnAnchor = 'e>0&&(0,l.gn)(this,Re,"f")?.getSettingBoolean(rt.A.SkidmarksEnabled)';
const skidSpawnReplacement = 'e>0&&this.polyviewerVisible!==!1&&window.__POLYVIEWER_RENDER_EFFECTS__?.skidmarks!==!1&&(0,l.gn)(this,Re,"f")?.getSettingBoolean(rt.A.SkidmarksEnabled)';
const particleSpawnAnchor = '0==(0,l.gn)(this,Le,"f")[n]&&null!=(0,l.gn)(this,Ne,"f")&&(0,l.gn)(this,Ne,"f").spawn';
const particleSpawnReplacement = '0==(0,l.gn)(this,Le,"f")[n]&&this.polyviewerVisible!==!1&&window.__POLYVIEWER_RENDER_EFFECTS__?.particles!==!1&&null!=(0,l.gn)(this,Ne,"f")&&(0,l.gn)(this,Ne,"f").spawn';
const particleUpdateAnchor = '(0,l.gn)(this,Ne,"f")?.update(e),null!=(0,l.gn)(this,ve,"f")';
const particleUpdateReplacement = 'window.__POLYVIEWER_RENDER_EFFECTS__?.particles!==!1&&(0,l.gn)(this,Ne,"f")?.update(e),null!=(0,l.gn)(this,ve,"f")';
const skidVisibilityAnchor = 'dispose(){(0,l.gn)(this,E,"f").geometry.dispose(),(0,l.gn)(this,T,"f").scene.remove((0,l.gn)(this,E,"f"))}clear(){';
const skidVisibilityReplacement = 'dispose(){(0,l.gn)(this,E,"f").geometry.dispose(),(0,l.gn)(this,T,"f").scene.remove((0,l.gn)(this,E,"f"))}setVisible(e){(0,l.gn)(this,E,"f").visible=e}clear(){';
const particleVisibilityAnchor = 'dispose(){(0,d.gn)(this,a,"f").dispose(),(0,d.gn)(this,r,"f").scene.remove((0,d.gn)(this,a,"f"))}clear(){';
const particleVisibilityReplacement = 'dispose(){(0,d.gn)(this,a,"f").dispose(),(0,d.gn)(this,r,"f").scene.remove((0,d.gn)(this,a,"f"))}setVisible(e){(0,d.gn)(this,a,"f").visible=e}clear(){';

const replayConstructorBridge =
  ';const pvOwner=this,pvReplay={owner:pvOwner,driver:null,nativeCameraPose:null,priorityReplayId:"main",requestedFrame:0,get durationFrames(){return Math.round(1e3*(0,R.gn)(pvOwner,Qp,"f"))},get loadedFrames(){const e=(0,R.gn)(pvOwner,jp,"f")[0];return null==e?0:Math.max(0,e.replay.getLastFrame().numberOfFrames)},get timeFrames(){return Math.round(1e3*(0,R.gn)(pvOwner,qp,"f"))},get primaryCar(){return(0,R.gn)(pvOwner,jp,"f")[0]?.car??null},setDriver(e){this.driver=e},setNativePaused(e){const t=!!e;(0,R.GG)(pvOwner,Kp,t,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=t},seekFrame(e){if(!Number.isSafeInteger(e)||e<0)throw new RangeError("Replay frame must be a non-negative safe integer.");const t=Math.max(0,Math.min(this.durationFrames,this.loadedFrames,e));(0,R.GG)(pvOwner,qp,t/1e3,"f"),(0,R.GG)(pvOwner,Kp,!0,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=!0}};window.__POLYTRACK_062__.replay=pvReplay;window.dispatchEvent(new CustomEvent("polytrack:replay-ready"))';

const replayManagementBridge = `;{
  const pvEntries=(0,R.gn)(pvOwner,jp,"f"),pvCatalog=[],pvMaxReplays=2000,pvWorker=(0,R.gn)(pvOwner,Ip,"f"),pvTrack=(0,R.gn)(pvOwner,Lp,"f"),pvMountains=(0,R.gn)(pvOwner,Dp,"f"),pvStart=pvTrack.getStartTransform();
  if(null==pvStart)throw new Error("Track has no starting point");
  pvReplay.renderMode=!1;pvReplay.renderPreparing=!1;pvReplay.renderPrepared=!1;pvReplay.previewLimit=20;pvReplay.simulationConcurrency=20;pvReplay.renderPreparationPromise=null;pvReplay.replayBatchDepth=0;
  for(let pvIndex=0;pvIndex<pvEntries.length;pvIndex++){
    const pvEntry=pvEntries[pvIndex];
    pvEntry.polyviewerId=pvIndex===0?"main":"native-"+pvIndex;
    pvEntry.polyviewerName=pvEntry.settings.nickname??(pvIndex===0?"Main Replay":"Replay "+(pvIndex+1));
    pvEntry.polyviewerVisible=!0;pvEntry.polyviewerPreviewVisible=!0;pvEntry.polyviewerOpacity=1;pvEntry.polyviewerNameTagVisible=!1;pvEntry.polyviewerManaged=!1;pvEntry.polyviewerSimulationState="native";pvEntry.polyviewerRuntimeEntry=pvEntry;pvCatalog.push(pvEntry);
  }
  let pvNextReplayId=1;
  const pvCreateReplayStore=pvSampleFrames=>{const pvStore=window.__POLYVIEWER_CREATE_PACKED_REPLAY_STORE__?.(pvSampleFrames?{sampleFrames:[...pvSampleFrames]}:void 0);if(!pvStore)throw new Error("PolyViewer replay storage is not ready. Reload once and try again.");return{get polyviewerPackedBytes(){return pvStore.packedBytes},push:pvState=>pvStore.push(pvState),pushPacked:pvBytes=>pvStore.pushPacked(pvBytes),getFrame:pvFrame=>pvStore.getFrame(pvFrame),getLastFrame:()=>new bt.A(pvStore.lastFrame)}};
  const pvRuntime=pvEntry=>pvEntry.polyviewerRuntimeEntry??null;
  const pvIsReady=pvEntry=>{const pvLive=pvRuntime(pvEntry);return null!=pvLive&&(pvEntry.polyviewerManaged?pvLive.polyviewerSimulationState==="ready":pvLive.replay.getLastFrame().numberOfFrames>=pvReplay.durationFrames)};
  const pvActivate=(pvEntry,pvSampleFrames)=>{if(pvRuntime(pvEntry))return pvRuntime(pvEntry);const pvMain=pvCatalog[0],pvInitialState=pvRuntime(pvMain)?.replay.getFrame(0);if(null==pvInitialState)throw new Error("Main replay start state is unavailable");const pvCar=new U.A(null,pvStart,pvEntry.polyviewerRecording,null,(0,R.gn)(pvOwner,Gp,"f"),(0,R.gn)(pvOwner,Fp,"f"),pvMountains,pvTrack,(0,R.gn)(pvOwner,Np,"f"),(0,R.gn)(pvOwner,Wp,"f"),null);pvCar.setCarStyle(pvEntry.polyviewerCarStyle);pvCar.setNameTag(null,pvEntry.polyviewerName);pvCar.polyviewerNameTagEnabled=pvEntry.polyviewerNameTagVisible===!0;pvCar.setOpacity(pvEntry.polyviewerOpacity);pvCar.setVisible(pvEntry.polyviewerPreviewVisible!==!1);const pvStore=pvCreateReplayStore(pvSampleFrames);pvStore.push(pvInitialState);const pvLive={replay:pvStore,checkpointTimes:[],finishSpeed:null,carId:null,car:pvCar,settings:{...pvEntry.settings},polyviewerId:pvEntry.polyviewerId,polyviewerName:pvEntry.polyviewerName,polyviewerVisible:pvEntry.polyviewerVisible,polyviewerPreviewVisible:pvEntry.polyviewerPreviewVisible,polyviewerOpacity:pvEntry.polyviewerOpacity,polyviewerNameTagVisible:pvEntry.polyviewerNameTagVisible,polyviewerManaged:!0,polyviewerRecording:pvEntry.polyviewerRecording,polyviewerInitialState:pvInitialState,polyviewerSimulationState:"idle",polyviewerSimulationGeneration:0,polyviewerCatalogEntry:pvEntry};pvEntry.polyviewerRuntimeEntry=pvLive;pvEntries.push(pvLive);return pvLive};
  const pvStopSimulation=pvEntry=>{const pvLive=pvRuntime(pvEntry);if(!pvLive?.polyviewerManaged)return;if(null!=pvLive.carId){pvWorker.deleteCar(pvLive.carId);pvLive.carId=null}pvLive.polyviewerSimulationGeneration+=1};
  const pvDeactivate=pvEntry=>{const pvLive=pvRuntime(pvEntry);if(!pvLive?.polyviewerManaged)return;pvStopSimulation(pvEntry);pvLive.car.dispose();const pvIndex=pvEntries.indexOf(pvLive);pvIndex>=0&&pvEntries.splice(pvIndex,1);pvEntry.polyviewerRuntimeEntry=null};
  const pvStartSimulation=(pvEntry,pvSampleFrames)=>{const pvLive=pvActivate(pvEntry,pvSampleFrames);if(pvLive.polyviewerSimulationState!=="idle")return;const pvGeneration=++pvLive.polyviewerSimulationGeneration,pvStore=pvCreateReplayStore(pvSampleFrames),pvCallback=pvBytes=>{if(pvLive.polyviewerSimulationGeneration!==pvGeneration)return;pvStore.pushPacked(pvBytes);const pvFrame=pvBytes[0]|pvBytes[1]<<8|pvBytes[2]<<16;if(null!=pvLive.carId&&pvFrame>=pvReplay.durationFrames){pvWorker.deleteCar(pvLive.carId);pvLive.carId=null;pvLive.polyviewerSimulationState="ready";pvReplay.refreshPerformance?.()}};pvCallback.polyviewerPacked=!0;const pvCreated=pvWorker.createCar(pvStart,pvMountains.getMountainVertices(),pvMountains.getMountainOffset(),(0,R.gn)(pvOwner,Np,"f"),pvEntry.polyviewerRecording,pvCallback);pvLive.polyviewerInitialState=pvCreated.carState;pvStore.push(pvCreated.carState);pvLive.replay=pvStore;pvLive.carId=pvCreated.id;pvLive.polyviewerSimulationState="simulating";pvWorker.startCar(pvCreated.id,new bt.A(pvReplay.durationFrames))};
  pvReplay.syncPreviewSimulations=()=>{if(pvReplay.renderPreparing||pvReplay.renderPrepared||pvReplay.renderMode)return;for(const pvEntry of pvCatalog){const pvLive=pvRuntime(pvEntry);if(pvEntry.polyviewerManaged&&pvEntry.polyviewerPreviewVisible)pvStartSimulation(pvEntry);else if(pvEntry.polyviewerManaged&&pvLive)pvDeactivate(pvEntry)}};
  pvReplay.refreshVisibility=()=>{
    const pvEnabled=pvCatalog.filter(pvEntry=>pvEntry.polyviewerVisible!==!1),pvPreview=new Set(pvEnabled.slice(0,pvReplay.previewLimit).map(pvEntry=>pvEntry.polyviewerId)),pvPriority=pvCatalog.find(pvEntry=>pvEntry.polyviewerId===pvReplay.priorityReplayId&&pvEntry.polyviewerVisible!==!1);
    if(!pvReplay.renderMode&&pvPriority&&!pvPreview.has(pvPriority.polyviewerId)){const pvReplace=[...pvPreview].reverse().find(pvId=>pvId!==pvPriority.polyviewerId);pvReplace&&pvPreview.delete(pvReplace),pvPreview.add(pvPriority.polyviewerId)}
    for(const pvEntry of pvCatalog){const pvActual=pvEntry.polyviewerVisible!==!1&&(pvReplay.renderMode||pvPreview.has(pvEntry.polyviewerId));pvEntry.polyviewerPreviewVisible=pvActual;const pvLive=pvRuntime(pvEntry);pvLive&&(pvLive.polyviewerPreviewVisible=pvActual,pvLive.car.setVisible(pvActual))}
    pvReplay.syncPreviewSimulations()
  };
  pvReplay.refreshPerformance=()=>{const pvVisible=pvCatalog.filter(pvEntry=>pvEntry.polyviewerVisible!==!1),pvPreview=pvVisible.filter(pvEntry=>pvEntry.polyviewerPreviewVisible!==!1),pvReady=pvVisible.filter(pvIsReady).length,pvPackedBytes=pvEntries.reduce((pvTotal,pvEntry)=>pvTotal+(pvEntry.replay.polyviewerPackedBytes??0),0);pvReplay.performanceStatus={quality:"full",totalReplays:pvCatalog.length,visibleReplays:pvVisible.length,previewReplays:pvPreview.length,packedBytes:pvPackedBytes,readyReplays:pvReady,renderReady:pvVisible.length>0&&pvReady===pvVisible.length};return pvReplay.performanceStatus};
  pvReplay.getPerformanceStatus=()=>({...pvReplay.refreshPerformance()});
  pvReplay.beginReplayBatch=()=>{pvReplay.replayBatchDepth+=1};
  pvReplay.endReplayBatch=()=>{pvReplay.replayBatchDepth=Math.max(0,pvReplay.replayBatchDepth-1);if(pvReplay.replayBatchDepth===0)pvReplay.refreshVisibility(),pvReplay.refreshPerformance()};
  const pvBuildSampleFrames=pvSettings=>{const pvSamples=new Set([0,pvReplay.durationFrames]),pvFps=Math.max(1,Math.round(pvSettings?.fps??60)),pvStartUs=Math.max(0,Math.round(pvSettings?.startMicroseconds??0)),pvEndUs=Math.min(1e3*pvReplay.durationFrames,Math.round(pvSettings?.endMicroseconds??1e3*pvReplay.durationFrames));for(let pvIndex=1;;pvIndex++){const pvUs=Math.floor(pvIndex*1e6/pvFps);if(pvUs>=pvStartUs)break;pvSamples.add(Math.round(pvUs/1e3))}for(let pvIndex=0;;pvIndex++){const pvUs=pvStartUs+Math.floor(pvIndex*1e6/pvFps);if(pvUs>=pvEndUs)break;pvSamples.add(Math.round(pvUs/1e3))}return pvSamples};
  pvReplay.prepareRender=(pvSettings,pvSignal,pvProgress)=>{if(pvReplay.renderPreparationPromise)return pvReplay.renderPreparationPromise;const pvTargets=pvCatalog.filter(pvEntry=>pvEntry.polyviewerVisible!==!1),pvSamples=pvBuildSampleFrames(pvSettings);pvReplay.renderPreparing=!0;const pvTask=new Promise((pvResolve,pvReject)=>{let pvTimer=null,pvSettled=!1;const pvFinish=pvCallback=>{if(pvSettled)return;pvSettled=!0;null!=pvTimer&&clearInterval(pvTimer);pvSignal?.removeEventListener("abort",pvTick);pvCallback()};const pvTick=()=>{try{if(pvSignal?.aborted)throw new DOMException("Rendering cancelled.","AbortError");const pvReady=pvTargets.filter(pvIsReady).length;pvProgress?.(pvReady,pvTargets.length);if(pvReady===pvTargets.length){pvFinish(pvResolve);return}let pvSlots=pvReplay.simulationConcurrency-pvTargets.filter(pvEntry=>pvRuntime(pvEntry)?.polyviewerSimulationState==="simulating").length;for(const pvEntry of pvTargets)if(pvSlots>0&&pvEntry.polyviewerManaged&&!pvIsReady(pvEntry)&&pvRuntime(pvEntry)?.polyviewerSimulationState!=="simulating")pvStartSimulation(pvEntry,pvSamples),pvSlots-=1}catch(pvError){pvFinish(()=>pvReject(pvError))}};pvSignal?.addEventListener("abort",pvTick,{once:!0});pvTimer=setInterval(pvTick,50);pvTick()});pvReplay.renderPreparationPromise=pvTask.then(()=>{pvReplay.renderPreparing=!1;pvReplay.renderPrepared=!0;pvReplay.refreshPerformance()}).catch(pvError=>{pvReplay.renderPreparing=!1;pvReplay.renderPrepared=!1;for(const pvEntry of pvTargets)pvEntry.polyviewerManaged&&!pvEntry.polyviewerPreviewVisible&&pvDeactivate(pvEntry);pvReplay.syncPreviewSimulations();pvReplay.refreshPerformance();throw pvError}).finally(()=>{pvReplay.renderPreparationPromise=null});return pvReplay.renderPreparationPromise};
  pvReplay.releaseRenderPreparation=()=>{pvReplay.renderPreparing=!1;pvReplay.renderPrepared=!1;pvReplay.renderMode=!1;pvReplay.refreshVisibility();pvReplay.refreshPerformance()};
  pvReplay.setRenderMode=pvRendering=>{const pvEnabled=!!pvRendering;if(pvEnabled&&!pvReplay.refreshPerformance().renderReady)throw new Error("Replay cars are not prepared for rendering yet.");pvReplay.renderMode=pvEnabled;pvEnabled||(pvReplay.renderPrepared=!1);pvReplay.refreshVisibility();pvReplay.refreshPerformance()};
  pvReplay.setPriorityReplay=pvId=>{if(pvCatalog.some(pvEntry=>pvEntry.polyviewerId===pvId)){pvReplay.priorityReplayId=pvId;pvReplay.refreshVisibility();pvReplay.refreshPerformance()}};
  pvReplay.listReplays=()=>pvCatalog.map((pvEntry,pvIndex)=>({id:pvEntry.polyviewerId,name:pvEntry.polyviewerName,visible:pvEntry.polyviewerVisible,opacity:pvEntry.polyviewerOpacity,nameTagVisible:pvEntry.polyviewerNameTagVisible===!0,removable:pvIndex>0}));
  pvReplay.getCatalogEntry=pvId=>pvCatalog.find(pvEntry=>pvEntry.polyviewerId===pvId)??null;
  pvReplay.getCar=pvId=>pvRuntime(pvReplay.getCatalogEntry(pvId))?.car??null;
  pvReplay.getNativeCameraPose=pvId=>{const pvCamera=pvReplay.getCar(pvId)?.cameraOrbit;return pvCamera?{position:{x:pvCamera.position.x,y:pvCamera.position.y,z:pvCamera.position.z},quaternion:{x:pvCamera.quaternion.x,y:pvCamera.quaternion.y,z:pvCamera.quaternion.z,w:pvCamera.quaternion.w},fov:pvCamera.fov}:null};
  pvReplay.addReplay=(pvRecordingString,pvName,pvMetadata={})=>{
    if(pvCatalog.length>=pvMaxReplays)throw new Error("PolyViewer currently supports up to "+pvMaxReplays+" imported cars.");
    if("string"!=typeof pvRecordingString||pvRecordingString.trim().length===0)throw new Error("Paste a PolyTrack recording string.");
    const pvMain=pvCatalog[0],pvMainLive=pvRuntime(pvMain),pvRecording=pvMainLive.car.getRecording().constructor.deserialize(pvRecordingString.trim());
    if(null==pvRecording)throw new Error("Invalid PolyTrack 0.6.2 recording string.");
    let pvCarStyle=pvMainLive.car.getCarStyle();if("string"==typeof pvMetadata.carStyle&&pvMetadata.carStyle.trim().length>0)pvCarStyle=pvCarStyle.constructor.deserializeSafe(pvMetadata.carStyle.trim());
    const pvCleanName="string"==typeof pvName&&pvName.trim().length>0?pvName.trim():"Replay "+(pvCatalog.length+1),pvEntry={settings:{...pvMain.settings,nickname:pvCleanName,recording:pvRecording,time:new bt.A(pvReplay.durationFrames),carStyle:pvCarStyle},polyviewerId:"replay-"+pvNextReplayId++,polyviewerName:pvCleanName,polyviewerVisible:!0,polyviewerPreviewVisible:!1,polyviewerOpacity:1,polyviewerNameTagVisible:!1,polyviewerVerifiedState:Number.isSafeInteger(pvMetadata.verifiedState)?pvMetadata.verifiedState:null,polyviewerManaged:!0,polyviewerRecording:pvRecording,polyviewerCarStyle:pvCarStyle,polyviewerRuntimeEntry:null};
    pvCatalog.push(pvEntry);if(pvReplay.replayBatchDepth===0)pvReplay.refreshVisibility(),pvReplay.refreshPerformance();return{id:pvEntry.polyviewerId,name:pvEntry.polyviewerName,visible:!0,opacity:1,nameTagVisible:!1,removable:!0}
  };
  pvReplay.setReplayName=(pvId,pvName)=>{const pvEntry=pvReplay.getCatalogEntry(pvId),pvClean=String(pvName??"").trim();if(!pvEntry)throw new Error("Replay not found");if(!pvClean)throw new Error("Replay name cannot be empty");pvEntry.polyviewerName=pvClean;pvEntry.settings.nickname=pvClean;const pvLive=pvRuntime(pvEntry);pvLive&&(pvLive.polyviewerName=pvClean,pvLive.settings.nickname=pvClean,pvLive.car.setNameTag(null,pvClean))};
  pvReplay.setReplayVisible=(pvId,pvVisible)=>{const pvEntry=pvReplay.getCatalogEntry(pvId);if(!pvEntry)throw new Error("Replay not found");pvEntry.polyviewerVisible=!!pvVisible;pvReplay.refreshVisibility();pvReplay.refreshPerformance()};
  pvReplay.setReplayOpacity=(pvId,pvOpacity)=>{const pvEntry=pvReplay.getCatalogEntry(pvId);if(!pvEntry)throw new Error("Replay not found");if(!Number.isFinite(pvOpacity)||pvOpacity<0||pvOpacity>1)throw new RangeError("Replay opacity must be between 0 and 1");pvEntry.polyviewerOpacity=pvOpacity;const pvLive=pvRuntime(pvEntry);pvLive&&(pvLive.polyviewerOpacity=pvOpacity,pvLive.car.setOpacity(pvOpacity))};
  pvReplay.removeReplay=pvId=>{const pvIndex=pvCatalog.findIndex(pvItem=>pvItem.polyviewerId===pvId);if(pvIndex<=0)return!1;const pvEntry=pvCatalog[pvIndex];pvDeactivate(pvEntry);pvCatalog.splice(pvIndex,1);pvReplay.priorityReplayId=pvCatalog.some(pvItem=>pvItem.polyviewerId===pvReplay.priorityReplayId)?pvReplay.priorityReplayId:"main";if(pvReplay.replayBatchDepth===0)pvReplay.refreshVisibility(),pvReplay.refreshPerformance();return!0};
  pvReplay.refreshVisibility();pvReplay.refreshPerformance()
}`;

const replayOverlayBridge =
  ';{for(const pvEntry of(0,R.gn)(pvOwner,jp,"f"))pvEntry.car.polyviewerNameTagEnabled=pvEntry.polyviewerNameTagVisible===!0,pvEntry.car.setNameTag(null,pvEntry.polyviewerName);pvReplay.setReplayNameTagVisible=(pvId,pvVisible)=>{const pvEntry=pvReplay.getCatalogEntry(pvId);if(!pvEntry)throw new Error("Replay not found");pvEntry.polyviewerNameTagVisible=!!pvVisible;const pvCar=pvReplay.getCar(pvId);pvCar&&(pvCar.polyviewerNameTagEnabled=!!pvVisible,pvCar.polyviewerRefreshNameTag());pvReplay.refreshPerformance()};pvReplay.refreshOverlays=()=>{for(const pvSummary of pvReplay.listReplays())if(pvSummary.nameTagVisible&&pvSummary.visible)pvReplay.getCar(pvSummary.id)?.polyviewerRefreshNameTag()}}';

const replayEvaluationBridge =
  ';pvReplay.evaluatedFrame=pvReplay.timeFrames,pvReplay.evaluateFrame=(pvRequestedFrame,pvAdvanceVisuals)=>{if(!Number.isSafeInteger(pvRequestedFrame)||pvRequestedFrame<0)throw new RangeError("Replay frame must be a non-negative safe integer.");const pvTarget=Math.max(0,Math.min(pvReplay.durationFrames,pvReplay.loadedFrames,pvRequestedFrame)),pvPrevious=pvReplay.evaluatedFrame,pvEntries=(0,R.gn)(pvOwner,jp,"f"),pvActive=pvEntries.filter(pvEntry=>pvEntry.polyviewerPreviewVisible!==!1||pvEntry.polyviewerId===pvReplay.priorityReplayId),pvApplyState=(pvEntry,pvFrame)=>{const pvAvailableFrame=Math.min(pvFrame,pvEntry.replay.getLastFrame().numberOfFrames),pvState=pvEntry.replay.getFrame(pvAvailableFrame);if(null!=pvState&&pvEntry.car.getTime().numberOfFrames!=pvState.frames)pvEntry.car.setCarState(pvState,pvState.frames!=pvEntry.car.getTime().numberOfFrames&&pvState.frames!=pvEntry.car.getTime().numberOfFrames+1)};let pvDelta=0;if(pvAdvanceVisuals&&pvTarget>pvPrevious){for(let pvFrame=pvPrevious+1;pvFrame<=pvTarget;pvFrame++)for(const pvEntry of pvActive)pvApplyState(pvEntry,pvFrame);pvDelta=(pvTarget-pvPrevious)/1e3}else for(const pvEntry of pvActive)pvApplyState(pvEntry,pvTarget);for(const pvEntry of pvActive){pvEntry.car.update(pvDelta);(pvEntry.polyviewerId==="main"||pvEntry.polyviewerId===pvReplay.priorityReplayId)&&pvEntry.car.updateCameras(pvDelta)}pvReplay.evaluatedFrame=pvTarget,(0,R.GG)(pvOwner,qp,pvTarget/1e3,"f"),(0,R.GG)(pvOwner,Kp,!0,"f"),(0,R.gn)(pvOwner,Yp,"f").isPaused=!0,pvReplay.nativeCameraPose=pvReplay.getNativeCameraPose("main")};';

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
const rendererShadowQualityOccurrences = originalBundle.split(rendererShadowQualityAnchor).length - 1;
const rendererResizeOccurrences = originalBundle.split(rendererResizeAnchor).length - 1;
const audioManagerOccurrences = originalBundle.split(audioManagerAnchor).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `Refusing to patch PolyTrack: expected one verified 0.6.2 animation-loop anchor, found ${occurrences}.`,
  );
}
if (rendererCaptureOccurrences !== 1 || rendererShadowQualityOccurrences !== 1 || rendererResizeOccurrences !== 1) {
  throw new Error(`Refusing to patch PolyTrack renderer capture: expected verified capture/shadow/resize anchors, found ${rendererCaptureOccurrences}/${rendererShadowQualityOccurrences}/${rendererResizeOccurrences}.`);
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
  .replace(rendererShadowQualityAnchor, rendererShadowQualityReplacement)
  .replace(rendererResizeAnchor, rendererResizeReplacement)
  .replace(audioManagerAnchor, audioManagerReplacement);

const replayClassOccurrences = originalBundle.split(replayClassAnchor).length - 1;
const replayDisposeOccurrences = originalBundle.split(replayDisposeAnchor).length - 1;
const replayUpdateOccurrences = originalBundle.split(replayUpdateAnchor).length - 1;
const nativeCameraUpdateOccurrences = originalBundle.split(nativeCameraUpdateAnchor).length - 1;
const replayLoadedFramesOccurrences = originalBundle.split(replayLoadedFramesAnchor).length - 1;
const replayApplyOccurrences = originalBundle.split(replayApplyAnchor).length - 1;
const simulationStateDispatchOccurrences = originalBundle.split(simulationStateDispatchAnchor).length - 1;
const carVisibilityOccurrences = originalBundle.split(carVisibilityAnchor).length - 1;
const nameTagVisibilityOccurrences = originalBundle.split(nameTagVisibilityAnchor).length - 1;
const skidSpawnOccurrences = originalBundle.split(skidSpawnAnchor).length - 1;
const particleSpawnOccurrences = originalBundle.split(particleSpawnAnchor).length - 1;
const particleUpdateOccurrences = originalBundle.split(particleUpdateAnchor).length - 1;
const skidVisibilityOccurrences = originalBundle.split(skidVisibilityAnchor).length - 1;
const particleVisibilityOccurrences = originalBundle.split(particleVisibilityAnchor).length - 1;
if (replayClassOccurrences !== 1 || replayDisposeOccurrences !== 1 || replayUpdateOccurrences !== 1 || nativeCameraUpdateOccurrences !== 1 || replayLoadedFramesOccurrences !== 1 || replayApplyOccurrences !== 1 || simulationStateDispatchOccurrences !== 1 || carVisibilityOccurrences !== 1 || nameTagVisibilityOccurrences !== 1 || skidSpawnOccurrences !== 1 || particleSpawnOccurrences !== 1 || particleUpdateOccurrences !== 1 || skidVisibilityOccurrences !== 1 || particleVisibilityOccurrences !== 1) {
  throw new Error(
    `Refusing to patch PolyTrack replay state: verified anchor count mismatch ${replayClassOccurrences}/${replayDisposeOccurrences}/${replayUpdateOccurrences}/${nativeCameraUpdateOccurrences}/${replayLoadedFramesOccurrences}/${replayApplyOccurrences}/${simulationStateDispatchOccurrences}/${carVisibilityOccurrences}/${nameTagVisibilityOccurrences}/${skidSpawnOccurrences}/${particleSpawnOccurrences}/${particleUpdateOccurrences}/${skidVisibilityOccurrences}/${particleVisibilityOccurrences}.`,
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
bridgedBundle = bridgedBundle.replace(simulationStateDispatchAnchor, simulationStateDispatchReplacement);
bridgedBundle = bridgedBundle
  .replace(carVisibilityAnchor, carVisibilityReplacement)
  .replace(nameTagVisibilityAnchor, nameTagVisibilityReplacement)
  .replace(skidSpawnAnchor, skidSpawnReplacement)
  .replace(particleSpawnAnchor, particleSpawnReplacement)
  .replace(particleUpdateAnchor, particleUpdateReplacement)
  .replace(skidVisibilityAnchor, skidVisibilityReplacement)
  .replace(particleVisibilityAnchor, particleVisibilityReplacement);

// Exact anchors keep resource ownership changes tied to the audited 0.6.2 runtime.
const resourcePatches = [
  ['We=function(e,t){if(null==B.patterns)', 'We=function(e,t){return window.__POLYVIEWER_PATTERN_CACHE__.acquire(e,t,()=>{if(null==B.patterns)', 1],
  ['return i},Ve=function(e){', 'return i})},Ve=function(e){', 1],
  ['(0,l.gn)(this,ke,"f").dispose()', 'window.__POLYVIEWER_PATTERN_CACHE__.release((0,l.gn)(this,ke,"f"))', 3],
  ['new Worker("simulation_worker.bundle.js")', 'new window.__POLYVIEWER_WORKER_POOL__("simulation_worker.bundle.js")', 1],
  ['throw new Error("Simulation error: "+e.message)', 'this.polyviewerSimulationError=(0,r.gn)(this,h,"f").failure??new Error("Simulation error: "+e.message)', 1],
  ['pvTick=()=>{try{if(pvSignal?.aborted)', 'pvTick=()=>{try{if(pvWorker.polyviewerSimulationError)throw pvWorker.polyviewerSimulationError;if(pvSignal?.aborted)', 1],
];
for (const [anchor, replacement, count] of resourcePatches) {
  if (bridgedBundle.split(anchor).length - 1 !== count) throw new Error(`Resource patch anchor mismatch: ${anchor}`);
  bridgedBundle = bridgedBundle.replaceAll(anchor, replacement);
}
bridgedBundle = `window.__POLYVIEWER_PATTERN_CACHE__=new (${CarPatternCache.toString()})();window.__POLYVIEWER_WORKER_POOL__=${ReplayWorkerPool.toString()};\n` + bridgedBundle;

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
