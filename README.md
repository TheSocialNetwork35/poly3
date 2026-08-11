# PolyViewer

PolyViewer is a cinematic replay editor integrated with the real PolyTrack 0.6.2 browser runtime. The project is under active development; implemented capabilities and limitations are tracked honestly below.

## Current working slice

- Exact PolyTrack 0.6.2 web distribution runs from local, production, and Cloudflare Pages builds.
- A narrow, version-checked runtime bridge exposes the real PolyTrack renderer, scene, camera, canvas, and active state without replacing the game simulation.
- A working FreeCam controls the real rendering camera inside the real PolyTrack scene.
- FreeCam supports mouse look, six-axis translation, roll, FOV, speed adjustment, fast movement, and precision movement.
- The deterministic integer-microsecond `MasterTimeline` drives PolyTrack's real replay-preview state.
- Replay transport supports play, pause, restart, scrubbing, backward seeking, and small/large stepping.
- The bottom timeline appears only while PolyViewer is active and reports replay preparation progress honestly.
- Replay evaluation stays on PolyTrack's native worker-generated frame buffer and `Car.setCarState` / `Car.update` visual path.
- Five camera modes are available through one simple control: Fixed, world-space Look At, native Normal, position-only Follow, and vehicle-relative Attached.
- Follow and Attached use the real replay car's position/quaternion and remain disabled until a real replay target exists.
- **Add Camera Point** captures a stable, complete camera state at the exact integer-microsecond playhead time and adds a marker to the timeline.
- Camera Point markers can be selected and dragged; the compact editor supports exact time, Update, Duplicate, and Delete.
- Moving the camera after selecting or creating a point enters a manual edit override instead of being overwritten by the paused path. Scrubbing or pressing Play returns control to the deterministic camera path.
- Camera modes have stable timeline colors: Fixed blue, Look At amber, Normal green, Follow purple, and Attached red. Different-mode or different-target points create a live world-space crossfade: both virtual cameras keep evaluating against the current replay frame, then their resolved positions and shortest-path quaternions are blended smoothly.
- **Add Replay** accepts bare recordings, copied objects, loose recording/CarStyle text, or arrays. It detects recording and 22-character CarStyle values even when field names differ. Recording and car style still pass through PolyTrack's native 0.6.2 deserializers.
- The same dialog accepts an array of up to the remaining 20-car capacity. Optional leaderboard JSON connects nicknames by the exact `carStyle` + `frames` pair, so arrays do not depend on matching list order.
- The compact left replay list exposes native visibility, per-car opacity, rename/remove controls, searchable run names, and an independent name-label toggle for every car including the main replay. The list/search design remains usable when the later performance work raises capacity toward 200 cars.
- **Clean Preview** (`F8`) reversibly hides the standard PolyTrack HUD while leaving the real canvas, PolyViewer tools, alerts, and errors available. Exiting PolyViewer always restores the original HUD.
- Preview and future export now share one `SceneEvaluator` for Camera Point evaluation. Its exact-frame path can synchronously advance the native replay in one-millisecond steps through real `Car.setCarState`, `Car.update`, and native camera updates.
- The deterministic frame renderer uses rational integer timestamps, pre-rolls visual history, temporarily configures the real PolyTrack WebGL renderer at the requested output size, captures frames sequentially, supports cancellation/progress, and restores editor time/playback plus renderer size/aspect in `finally`.
- **Render** offers 1080p, 1440p, or 4K at 30/60 FPS. WebCodecs encodes exact canvas frames and Mediabunny muxes a downloadable MP4. A separate 1.0× pass records PolyTrack's real WebAudio graph so engine, tire, collision, skid, and music audio keep real-time pitch and duration while video remains offline/deterministic.
- Render Start/End fields limit export to an exact replay range. Sound is optional; capture and recorder-finalization timeouts prevent a failed browser audio pass from loading forever, and export continues honestly as video-only when native sound cannot be finalized.

The 5/10/20-car performance qualification and project save/load are not yet presented as finished features. Video export is available only when the current browser exposes a compatible WebCodecs encoder; unsupported browsers receive an explicit error instead of a fake realtime fallback.

## Upstream online-service limitation

The real game, official tracks, local profiles, physics, and single-player modes run on the PolyViewer host. Kodub's backend remains authoritative and can reject profile, leaderboard, recording, or multiplayer requests from an unofficial origin. PolyViewer does not fabricate these responses. The narrowly allowlisted Pages proxy preserves the original request/response protocol, but it cannot override an upstream authorization decision.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

The Cloudflare Pages build command is `npm run build`; the output directory is `dist`. `npm run preview` runs the production output with Vite's equivalent local proxy. `npm run preview:pages` runs the same output through Wrangler Pages for platform-specific checks.

## Camera controls

- `F1`: primary enter/exit shortcut
- `§ / Backquote / IntlBackslash`: layout-aware alternatives (`F6` remains as a fallback)
- `R`: reset position/offsets and return to the native Normal camera
- `1 / 2 / 3 / 4 / 5`: Fixed / Look At / Normal / Follow / Attached
- `Down Arrow`: restart the master timeline
- `F8`: toggle Clean Preview while PolyViewer is active
- Mouse: look (disabled in Look At because the selected car owns direction)
- `W A S D`: move
- `Q / E`: move down/up
- `Shift`: fast movement
- `Alt`: precision movement
- `Z / C`: roll
- `[ / ]`: FOV
- Mouse wheel: movement speed

When pointer lock is released, click the game canvas to capture the mouse again.

## Replay timeline controls

- `Space`: play or pause
- `K`: add a Camera Point at the exact playhead time
- `Shift + K`: update the selected Camera Point from the current camera
- `Delete / Backspace`: delete the selected Camera Point
- `Left / Right`: step 16 milliseconds
- `Shift + Left / Right`: step one second
- Timeline slider: seek or scrub through worker-produced replay frames
- `↺`: pause and return to the start

One capture-phase input bridge intercepts active PolyViewer controls before the original game handlers. `ShortcutManager` is the single owner of editor shortcut routing. Editable controls stop propagation to PolyTrack without cancelling browser text editing, so WASD, Backspace, punctuation, and international keyboard characters remain typeable. The complete expandable shortcut sheet lives at the right edge of the viewer.

PolyViewer's Stage 1 replay integration activates in PolyTrack's real replay preview (the game's **Watch** flow). It never invents replay frames. While the simulation worker is still preparing a recording, seeks are clamped to the last verified loaded frame.

The **Add Replay** control is enabled only in that real Watch context. Invalid strings are rejected by PolyTrack's own parser and surfaced in the dialog; PolyViewer does not provide a fallback or synthetic recording format. Imported `frames` values are used only to associate leaderboard names. They never resize, shorten, or extend the authoritative main shot. Every imported replay is simulated to the existing shared master duration, and the common loaded-frame boundary waits for every active replay.

## Camera modes

- **Fixed:** independent six-axis world camera that stays where the creator places it
- **Look At:** keeps its world-space position while continuously aiming at the selected real replay car
- **Normal:** the real PolyTrack `cameraOrbit` replay camera with local cinematic position/orientation offsets and PolyViewer FOV
- **Follow:** follows the main replay's position while keeping an independent world orientation
- **Attached:** stores camera position and rotation in the replay car's local space for cockpit, wheel, bumper, roof, and other mounted shots

Changing modes preserves the visible camera pose. Look At derives a robust quaternion from the real target position every frame; manual mouse rotation and roll are intentionally locked in that mode while position and FOV remain editable. Normal does not approximate a chase camera: PolyTrack continues updating its original orbit camera, including its own delayed/smoothed rotation, and PolyViewer composes keyframed offsets on the captured native pose. Attached offsets use quaternion transforms, so vehicle turns, jumps, rolls, and resets are inherited without Euler-angle wrapping. Legacy `free` Camera Point data migrates to `fixed` when loaded into the store.

Camera points store stable ID, exact time, mode, world pose, quaternion orientation, FOV, replay target, follow offset, attached offset/local orientation, and the default Smooth interpolation setting. During playback the same master clock evaluates a smooth ease-in/ease-out path. Rotations and all mode-local orientation offsets use shortest-path quaternion slerp. Moving a dynamic Camera Point seeks the real replay and re-captures its derived world endpoint at the new time, preventing stale transition rotations. Clicking a marker pauses and seeks to its exact time, applies its camera state, and opens the editor. Dragging uses a four-pixel threshold, clamps to replay duration, and preserves the stable point ID.

## Upstream integrity

The unmodified upstream PolyTrack distribution lives in `vendor/polytrack-0.6.2`. `scripts/prepare-runtime.mjs` copies it to a generated runtime directory and applies one exact, fail-closed bridge patch. The original simulation worker and game assets are not replaced by PolyViewer substitutes.

The original HTTP API rejects unrecognized browser origins. The build therefore redirects only the eight verified HTTP call sites to a same-origin Pages Function. That function has a version, endpoint, method, origin, and request-size allowlist and streams responses without caching. The two multiplayer WebSocket call sites remain direct and unmodified.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/UPSTREAM.md`](docs/UPSTREAM.md).
