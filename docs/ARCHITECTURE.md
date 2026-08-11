# Verified PolyTrack 0.6.2 architecture

This record distinguishes observations made directly from the supplied production bundles from planned PolyViewer work.

## Verified integration facts

- The main runtime is a webpack production bundle and identifies itself as PolyTrack `0.6.2`.
- The renderer is Three.js WebGL. Its wrapper exposes the active scene, perspective camera, and canvas and delegates to `WebGLRenderer.setAnimationLoop`.
- Application boot obtains the `#screen` canvas, constructs the renderer wrapper, loads GLTF/Draco resources, constructs the active application state, and calls that state's `update(deltaSeconds)` from the animation loop.
- Vehicle rendering loads `models/car.glb`; track rendering loads the real block, pillar, plane, road, wide-road, sign, and wall GLTF resources.
- Physics runs in `simulation_worker.bundle.js` and is version-checked against `0.6.2`.
- The worker supports realtime and non-realtime simulation. Non-realtime jobs require `targetSimulationFrames` and process frames from real serialized car recordings.
- The main runtime sends serialized track data, collision geometry, car recording data, and target frame counts to the worker using transferable buffers.
- Replay objects expose frame-addressable state (`getFrame`, `getLastFrame`) and the game throws when a replay frame is missing.
- Physics/replay frame numbers are milliseconds: native replay code converts between seconds and frames with a factor of `1000`.
- The recording class stores input transition frame numbers for up/right/down/left/reset, delta-encodes them as 24-bit values, deflates the bytes, and serializes them as a string. Its verified maximum is 5,999,999 frames.
- The simulation manager creates a real worker car from the track, mountain collision data, and serialized recording. A non-realtime replay run supplies a target frame and receives complete `CarState` frames asynchronously.
- A replay buffer requires frame zero first and strictly contiguous subsequent frames. `getFrame` returns null outside the loaded range.
- The native replay-preview state creates real `Car` instances, pre-simulates each recording in the worker, and stores full states including position, quaternion, contacts, suspension length/velocity, per-wheel delta rotation, skid information, steering, brake lights, and controls.
- Native seeking uses `Car.setCarState`. Consecutive forward playback applies every intermediate state. Backward or large seeks set the reset flag, which clears tire particles and each skidmark trail before applying the target state.
- `Car.update(delta)` applies the real model matrix, steering quaternion, accumulated wheel rotation, suspension morph targets, brake lights, particles, and skidmark spawning. PolyViewer therefore preserves a real positive visual delta during forward playback and uses zero only while paused, scrubbing, or waiting for worker frames.
- The runtime has an explicit simulation determinism test path.
- The runtime provides an official `window.polytrackModConfiguration` hook with mod name, author, and `unblocked` fields. PolyViewer uses this hook before the game bundle loads so the real menu remains interactive on a non-Kodub host.
- Recording strings are serialized game inputs/state for the real simulation; PolyViewer must not invent a replacement format.
- Track import strings use the `PolyTrack1` prefix and compressed/binary decoding. Recording format investigation remains separate and incomplete.
- Dynamic webpack chunks `112`, `535`, `604`, and `657` are required for verifier, multiplayer, garage/customization, and admin paths.

## Current bridge

The upstream bundle stays untouched under `vendor/`. During `runtime:prepare`, one unique boot-loop anchor is checked and replaced. The replacement publishes `window.__POLYTRACK_062__` with getters for the active renderer, scene, camera, canvas, and state. If the exact anchor changes or occurs more than once, the build fails.

Eight verified HTTP backend call sites are routed to `/api/polytrack/`; two multiplayer WebSocket sites remain direct. The Pages Function proxies only the known v6 HTTP endpoints and methods. This is necessary because the upstream service denies unknown browser origins via CORS, which otherwise prevents the real 0.6.2 startup profile load on localhost and Cloudflare Pages.

FreeCam uses the real camera. It chains the scene's existing `onBeforeRender` callback and applies its transform immediately before Three.js renders. This prevents normal game camera updates from overwriting the cinematic transform while keeping the original state update and render path intact.

The camera controller obtains the selected target through the replay adapter and calls the real car's public `getPosition()` and `getQuaternion()` methods. Follow stores a world-space positional offset and independent camera quaternion. Attached stores position and orientation in vehicle-local space using quaternion multiplication/inversion. Mode changes first evaluate the current world pose and then derive the new offsets, avoiding visible jumps.

`CameraKeyframeStore` owns the editor's ordered camera-point data independently from the UI. Every point uses the `MasterTimeline` integer-microsecond time and a deep copy of the full cinematic camera state. Mutations preserve stable IDs, re-sort deterministically, and notify timeline consumers. This model is intended to be serialized directly by the later versioned project-file layer.

`CameraPathEvaluator` is a pure deterministic function shared by preview now and final export later. It evaluates Smooth position/FOV curves with cubic smoothstep and orientation with shortest-path quaternion slerp. Same-mode Follow/Attached segments interpolate their native offsets; mixed-mode segments interpolate captured world poses and switch modes only at the destination point, preventing an orientation or transform snap mid-shot.

The replay bridge is injected only into the uniquely verified 0.6.2 replay-preview class. It publishes lifecycle, duration, loaded frame count, current frame, primary real car, and one external driver callback. `ReplayBridge` owns that callback and is the only adapter between `MasterTimeline` and minified PolyTrack internals. The original preview state still performs frame application, cleanup, car visual updates, environment updates, and rendering. Exact anchors are counted and the build fails closed if any anchor changes.

## Known unknowns to resolve next

- Exact recording-string parser entry point and recording version fields.
- Stable car scene nodes and material ownership for per-replay opacity.
- Existing replay/ghost lifecycle suitable for large batch imports.
- Exact reconstruction policy for history-dependent particles across arbitrary long seeks beyond the native reset behavior.
- Offline audio evaluation and WebCodecs/muxer support for final export.

## Verified external limitation

The original main menu, track selector, official `Summer 1` track, car model, and physics simulation run successfully under the PolyViewer mod configuration. Kodub's online service rejects some profile and leaderboard operations from an unofficial deployment. Those errors are non-fatal for the local game and are shown honestly; PolyViewer does not synthesize leaderboard or account data.

No UI is enabled for these incomplete areas.
