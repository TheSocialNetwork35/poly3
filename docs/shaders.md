# Shader looks

Click **✦ Shaders** in the top-left PolyViewer panel (also available before entering the editor), or press **Home**. Choose Cinematic, Soft daylight, Night glow, or PolyProcessing defaults. Changes are saved locally. Reset look restores Cinematic.

**Live preview starts off on every page load.** Editing settings while it is off does not import the renderer or create GPU resources. Turning it on installs the additional rendering passes; turning it off releases them and restores the original rendering methods and settings. A look can be expensive while enabled, especially at high resolutions.

For a PNG or MP4, open **Render**, choose the output, and enable **Use shader settings**. The current look is snapshotted for that export. Live preview is suspended during all exports, including Blender, and restored afterward. Screen-space effects are not baked into Blender geometry or animation.

## Effects

The feature set follows [Jade's PolyProcessing](https://git.polymodloader.com/Jade/PolyProcessing), inspected at commit `9469c5f6128306604f82731352e20cc51a19d655` (0.1.1). This is a new integration for PolyViewer, using the same MIT-licensed `postprocessing` library, pinned to 6.39.5; it does not load the mod loader or copy its UI.

- Bloom: strength, threshold and radius.
- All nine tone operators: Linear, Reinhard, Reinhard 2, adaptive Reinhard 2, Uncharted 2, Cineon, ACES Filmic, AgX and Neutral. Exposure, opacity, all blend modes, white point, middle grey, luminance and adaptation controls.
- Colour: brightness, contrast, hue, saturation, greyscale and sepia.
- Depth of field: focus distance/range in world units, bokeh, opacity, resolution and blur kernel. Focus stays at the selected distance; it does not automatically track a car.
- SMAA quality, FXAA samples and MSAA (clamped to the GPU's capability).
- Invert, ASCII, vehicle wireframe and vehicle outlines.
- Additional contact shadows through screen-space ambient occlusion, with strength and radius controls.

These are raster postprocessing effects, not hardware ray tracing, path tracing, or a replacement for the scene's physical lighting. Geometry, replay movement and native dust/smoke remain the game's own.

## Camera and capture

Only while shaders are active, the native update method prepares the final editor camera before fitting cascaded shadows. All colour, normal, depth and lens passes then share a frozen canonical Three.js camera, copied in the same frame. This also avoids camera type checks failing between PolyTrack's embedded Three.js bundle and the effect library. Projection matrices, near/far values, FOV and drawing-buffer size update immediately; scene callbacks cannot move the camera between passes.

Capture waits for SMAA lookup images and advances adaptive exposure with the selected FPS, including pre-roll before a trimmed start. Native CSM setup still runs, but the intermediate native beauty draw is suppressed so each exported frame has a single composed beauty render. Cleanup restores renderer state on completion, cancellation or failure. The ordinary rendering path has no shader hooks or extra camera updates when preview is off.

## Verification

Unit coverage includes validated persisted settings, every preset, disabled preview, asynchronous enable/disable races, preview/capture isolation and error cleanup. Browser checks on Summer 1 exercise all nine tone operators, depth of field, combined creative effects, a changed FOV, capture dimensions, native state restoration and WebGL errors. Production build verification retains the original simulation worker and runtime asset checks.
