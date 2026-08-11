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
- The runtime has an explicit simulation determinism test path.
- The runtime provides an official `window.polytrackModConfiguration` hook with mod name, author, and `unblocked` fields. PolyViewer uses this hook before the game bundle loads so the real menu remains interactive on a non-Kodub host.
- Recording strings are serialized game inputs/state for the real simulation; PolyViewer must not invent a replacement format.
- Track import strings use the `PolyTrack1` prefix and compressed/binary decoding. Recording format investigation remains separate and incomplete.
- Dynamic webpack chunks `112`, `535`, `604`, and `657` are required for verifier, multiplayer, garage/customization, and admin paths.

## Current bridge

The upstream bundle stays untouched under `vendor/`. During `runtime:prepare`, one unique boot-loop anchor is checked and replaced. The replacement publishes `window.__POLYTRACK_062__` with getters for the active renderer, scene, camera, canvas, and state. If the exact anchor changes or occurs more than once, the build fails.

Eight verified HTTP backend call sites are routed to `/api/polytrack/`; two multiplayer WebSocket sites remain direct. The Pages Function proxies only the known v6 HTTP endpoints and methods. This is necessary because the upstream service denies unknown browser origins via CORS, which otherwise prevents the real 0.6.2 startup profile load on localhost and Cloudflare Pages.

FreeCam uses the real camera. It chains the scene's existing `onBeforeRender` callback and applies its transform immediately before Three.js renders. This prevents normal game camera updates from overwriting the cinematic transform while keeping the original state update and render path intact.

## Known unknowns to resolve next

- Stable active-state interfaces for entering replay/spectator mode and seeking.
- Exact recording-string parser entry point and recording version fields.
- Authoritative simulation frame rate and interpolation semantics.
- Stable car scene nodes and material ownership for per-replay opacity.
- Existing replay/ghost lifecycle suitable for large batch imports.
- Whether the active state can be adapted cleanly or needs a narrowly patched replay bridge.
- Offline audio evaluation and WebCodecs/muxer support for final export.

## Verified external limitation

The original main menu, track selector, official `Summer 1` track, car model, and physics simulation run successfully under the PolyViewer mod configuration. Kodub's online service rejects some profile and leaderboard operations from an unofficial deployment. Those errors are non-fatal for the local game and are shown honestly; PolyViewer does not synthesize leaderboard or account data.

No UI is enabled for these incomplete areas.
