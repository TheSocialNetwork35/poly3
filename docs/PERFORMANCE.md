# PolyViewer replay scaling

## Quality contract

Car count must never select a lower visual quality. Every visible replay keeps the real PolyTrack car model, style, materials, wheels, suspension, shadows, particles, skidmarks, steering, and exact worker-produced history. A hidden car may skip visual work and clear its own transient effects because it contributes no pixels; making it visible again restores the normal full-quality path.

The current 500-car import ceiling is a development guardrail. It does not imply that 500 cars have already been qualified at realtime preview speed on every laptop, and it is not raised merely to advertise a larger number.

## Verified bottlenecks

PolyTrack physics is already compiled to `polytrack_physics.wasm` and runs in `simulation_worker.bundle.js`. Rewriting the same simulation in another Rust/Wasm module would duplicate an existing worker architecture and would not reduce GPU draw calls.

The first large CPU/memory costs in the previous bridge were instead:

- every worker-produced millisecond state was decoded immediately into a permanent nested JavaScript object;
- `Car.update` rebuilt the model, wheels, suspension morphs, particles, skidmarks, and camera state once for every millisecond, up to 1,000 full visual updates per replay-second per car;
- every imported car owns a complete real PolyTrack scene hierarchy, so draw calls and transparent/shadow passes scale with visible car count;
- importing many real `Car` instances in one task could monopolize the main thread;
- replay-list summaries were repeatedly allocated while the editor was animating.

## Implemented full-quality optimizations

### Lossless packed replay storage

Imported simulation results stay in the worker's original transferred `Uint8Array` representation. `PackedReplayStore` decodes only the requested state into one of two reusable objects. Two slots are required because native `Car.setCarState` retains the previous state while applying the next. This removes the permanent per-millisecond JavaScript object graph without changing a value in the replay format.

### Native visual cadence

Forward evaluation still applies every exact one-millisecond state in order. After that state pass, each visible car receives one `Car.update(accumulatedDelta)` per preview or output frame, which matches the native PolyTrack render-loop cadence. Camera updates are limited to the main and selected target cars because those are the only native camera poses PolyViewer consumes. No wheel, particle, trail, material, or shadow feature is removed.

Offline rendering pre-rolls a nonzero Start time at the selected output FPS. The replay bridge processes all exact states between those timestamps, while history-dependent visuals advance once per would-be video frame. Output timestamps remain rational and independent of wall-clock rendering speed.

### Main-thread and UI control

Large array imports construct four native Cars and then yield to the browser. Replay summaries are revision-cached, the 500-row panel uses CSS rendering containment, and invisible cars are skipped by state/visual evaluation after their native transient effects are cleared.

## Render and audio behavior

The editor timeline follows the main replay's loaded state. Deterministic Render becomes available once the main replay and every visible imported replay have completed worker preparation. Hidden unfinished replays do not block an export they cannot appear in.

Audio is captured from PolyTrack's native master graph at 1.0× into PCM with an AudioWorklet, then encoded once by Mediabunny. The AudioContext is resumed from the Render click before asynchronous codec checks. A failed or interrupted audio device produces a warning and video-only MP4 instead of hanging the completed timeline.

## Next scaling layer

Once CPU and memory measurements are complete on representative hardware, the remaining dominant cost is expected to be GPU draw calls. Three.js already provides `InstancedMesh`, `BatchedMesh`, renderer statistics, and WebGL multi-draw support. A PolyViewer batching layer must preserve PolyTrack's real geometry and every visible style/material combination, per-car opacity, wheel transforms, suspension morph targets, name labels, shadows, and transparent sorting. It should group compatible primitives and upload per-car transforms/styles in bulk rather than replacing cars with simplified meshes.

This layer requires visual parity images and renderer-call measurements before activation. Until that is verified, PolyViewer keeps the native full-quality car path. Thousands of cars remain the engineering target, not a completed performance claim.
