# PolyViewer

PolyViewer is a cinematic replay editor integrated with the real PolyTrack 0.6.2 browser runtime. The project is under active development; implemented capabilities and limitations are tracked honestly below.

## Current working slice

- Exact PolyTrack 0.6.2 web distribution runs from local, production, and Cloudflare Pages builds.
- A narrow, version-checked runtime bridge exposes the real PolyTrack renderer, scene, camera, canvas, and active state without replacing the game simulation.
- A working FreeCam controls the real rendering camera inside the real PolyTrack scene.
- FreeCam supports mouse look, six-axis translation, roll, FOV, speed adjustment, fast movement, and precision movement.
- A deterministic integer-microsecond `MasterTimeline` foundation is covered by tests.

Replay seeking, replay importing, camera keyframes, project files, and deterministic video export are not yet presented as finished features.

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

## FreeCam controls

- `F6`: enable or disable FreeCam
- Mouse: look
- `W A S D`: move
- `Q / E`: move down/up
- `Shift`: fast movement
- `Alt`: precision movement
- `Z / C`: roll
- `[ / ]`: FOV
- Mouse wheel: movement speed

When pointer lock is released, click the game canvas to capture the mouse again.

## Upstream integrity

The unmodified upstream PolyTrack distribution lives in `vendor/polytrack-0.6.2`. `scripts/prepare-runtime.mjs` copies it to a generated runtime directory and applies one exact, fail-closed bridge patch. The original simulation worker and game assets are not replaced by PolyViewer substitutes.

The original HTTP API rejects unrecognized browser origins. The build therefore redirects only the eight verified HTTP call sites to a same-origin Pages Function. That function has a version, endpoint, method, origin, and request-size allowlist and streams responses without caching. The two multiplayer WebSocket call sites remain direct and unmodified.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/UPSTREAM.md`](docs/UPSTREAM.md).
