# PolyViewer replay scaling

## Verified bottlenecks before this stage

The original bridge inherited PolyTrack's small-replay assumptions:

- import and UI paths hard-stopped at 20 cars;
- every millisecond step applied `Car.setCarState` to every replay;
- every visible frame updated two native cameras for every car even though PolyViewer consumes only the main and selected target cameras;
- every imported `Car` allocated native particles and four skidmark trails;
- hidden cars still consumed replay and camera update work;
- `listReplays()` allocated a complete summary array on every animation frame;
- timeline loading used the slowest imported worker, freezing the whole edit while one new replay prepared;
- audio was encoded to Opus, decoded, then encoded again into the MP4.

At 100 cars, a 60 FPS preview with roughly 16–17 one-millisecond states per display frame could therefore request around 100,000 native replay-state applications per second before renderer draw work.

## Adaptive policy

| Visible cars | Mode | Cars retaining one-millisecond visual history |
| ---: | --- | ---: |
| 1–20 | Full | all |
| 21–100 | Balanced | 12 |
| 101–250 | Crowd | 6 |
| 251–500 | Massive | 2 |

Priority order is main replay, current camera target, enabled name-label runs, then remaining visible runs. Non-priority cars are still real PolyTrack Cars evaluated from real worker-produced replay states at the exact master timestamp. They omit history-dependent transient effects, per-car replay-camera work, and shadow passes. Cars created after the first 20 do not allocate particle/skidmark systems at all.

Large array imports construct four Cars per task and then yield to the browser. Replay summaries are revision-cached, the 500-row panel uses CSS rendering containment, and invisible cars are skipped by visual evaluation.

## Render and audio behavior

The editor timeline follows the main replay's loaded state. Deterministic Render becomes available once the main replay and every visible imported replay have completed worker preparation. Hidden unfinished replays do not block an export they cannot appear in.

Audio is captured from PolyTrack's native master graph at 1.0× into PCM with an AudioWorklet, then encoded once by Mediabunny. The AudioContext is resumed from the Render click before asynchronous codec checks. A failed or interrupted audio device produces a warning and video-only MP4 instead of hanging the completed timeline.

## Next scaling steps

The 500-car ceiling is intentional. Raising it toward thousands requires measurement on representative integrated/discrete GPUs and likely a second rendering layer that batches the real PolyTrack car geometry/material variants with instancing or another draw-call reduction strategy. It must preserve exact replay transforms and priority-car fidelity; merely raising the number again would trade a visible crash for an advertised number and is not considered complete.
