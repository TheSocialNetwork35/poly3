# Cinematic capture / Blender validation

Validated on 2026-09-25 with the real PolyTrack 0.6.2 runtime, Brave/Chromium and Blender 5.2.1.

- 131 tests passed, including ordinary-capture isolation, failure cleanup, instancing, changing geometry, suspension morphs and projective shadow matrices.
- TypeScript checks, Vite production build and the existing runtime/asset verification passed in a fully local copy of the workspace (the Documents workspace contains iCloud-offloaded dependencies). The upstream runtime bundle was checked against the workspace SHA-256 before using hydrated assets.
- Native and cinematic PNG captures were visually inspected at 1280×720.
- A six-frame cinematic AVC/MP4 capture completed. Cancellation during a second capture released capture mode and restored tone mapping (0), exposure (1) and shadow-map type (1).
- Dialog output switching was checked in the browser: PNG hides the unused End field; Blender disables the cinematic checkbox.
- Exported Summer 1 with two native replay cars, 2.0–2.5 seconds, 30 FPS. Blender imported all 15 frames; 20,785 object samples were checked for world matrices, vertex coordinates, visibility and camera/FOV. Largest world-matrix component error: 6.556510925292969e-7.
- The imported scene was saved as a `.blend` and rendered with Cycles. Smoke remains animated textured cards. Procedural sky and game lighting are approximations, documented in the archive.

To reproduce the Blender round-trip check after extracting an exported ZIP:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/verify-blender-export.py -- /absolute/path/to/extracted/archive
```

The large-car resource ceiling is not established by this two-car test. Normal navigation keeps its existing renderer path; cinematic passes are dynamically imported and allocated only during requested capture. This is a structural isolation guarantee, not a claim of identical measured FPS on every device.
