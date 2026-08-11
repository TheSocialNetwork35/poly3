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
- **Add Replay** accepts a real PolyTrack recording string and passes it to the native 0.6.2 recording deserializer. Imported runs receive a real `Car`, replay-state buffer, and worker simulation and join the original replay update loop.
- The replay list exposes native visibility, per-car opacity, a non-negative start offset, rename/remove controls, and a camera-target selector. All five target-aware camera modes resolve stable replay IDs to real cars; Normal reads that car's own native `cameraOrbit`.
- **Clean Preview** (`F7`) reversibly hides the standard PolyTrack HUD while leaving the real canvas, PolyViewer tools, alerts, and errors available. Exiting PolyViewer always restores the original HUD.
- Preview and future export now share one `SceneEvaluator` for Camera Point evaluation. Its exact-frame path can synchronously advance the native replay in one-millisecond steps through real `Car.setCarState`, `Car.update`, and native camera updates.

The 5/10/20-car performance qualification, project files, and deterministic video export are not yet presented as finished features.

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

- `F6`: enter or exit PolyViewer
- `F7`: toggle Clean Preview while PolyViewer is active
- Mouse: look
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

One capture-phase input bridge intercepts active PolyViewer controls before the original game handlers. `ShortcutManager` is the single owner of editor shortcut routing; the replay and camera components no longer register competing keyboard listeners. Shortcuts are ignored while typing in an input, textarea, select, or contenteditable element.

PolyViewer's Stage 1 replay integration activates in PolyTrack's real replay preview (the game's **Watch** flow). It never invents replay frames. While the simulation worker is still preparing a recording, seeks are clamped to the last verified loaded frame.

The **Add Replay** control is enabled only in that real Watch context. Invalid strings are rejected by PolyTrack's own parser and surfaced in the dialog; PolyViewer does not provide a fallback or synthetic recording format. A newly imported replay is simulated to the shared master duration, and the common loaded-frame boundary waits for every active replay.

## Camera modes

- **Fixed:** independent six-axis world camera that stays where the creator places it
- **Look At:** keeps its world-space position while continuously aiming at the selected real replay car
- **Normal:** the real PolyTrack `cameraOrbit` replay camera with local cinematic position/orientation offsets and PolyViewer FOV
- **Follow:** follows the main replay's position while keeping an independent world orientation
- **Attached:** stores camera position and rotation in the replay car's local space for cockpit, wheel, bumper, roof, and other mounted shots

Changing modes preserves the visible camera pose. Look At derives a robust quaternion from the real target position every frame and supports a local intentional orientation/roll offset. Normal does not approximate a chase camera: PolyTrack continues updating its original orbit camera, including its own delayed/smoothed rotation, and PolyViewer composes keyframed offsets on the captured native pose. Attached offsets use quaternion transforms, so vehicle turns, jumps, rolls, and resets are inherited without Euler-angle wrapping. Legacy `free` Camera Point data migrates to `fixed` when loaded into the store.

Camera points store stable ID, exact time, mode, world pose, quaternion orientation, FOV, replay target, follow offset, attached offset/local orientation, and the default Smooth interpolation setting. During playback the same master clock evaluates a smooth ease-in/ease-out path. Rotations use shortest-path quaternion slerp, and transitions between different camera modes use their captured world poses to avoid jumps. Clicking a marker pauses and seeks to its exact time, applies its camera state, and opens the editor. Dragging uses a four-pixel threshold, clamps to replay duration, and preserves the stable point ID.

## Upstream integrity

The unmodified upstream PolyTrack distribution lives in `vendor/polytrack-0.6.2`. `scripts/prepare-runtime.mjs` copies it to a generated runtime directory and applies one exact, fail-closed bridge patch. The original simulation worker and game assets are not replaced by PolyViewer substitutes.

The original HTTP API rejects unrecognized browser origins. The build therefore redirects only the eight verified HTTP call sites to a same-origin Pages Function. That function has a version, endpoint, method, origin, and request-size allowlist and streams responses without caching. The two multiplayer WebSocket call sites remain direct and unmodified.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/UPSTREAM.md`](docs/UPSTREAM.md).
