import {
  Color, HalfFloatType, NoToneMapping, PerspectiveCamera, Vector2,
  type Material, type Mesh, type Scene, type WebGLRenderer,
} from "three";
import {
  ASCIIEffect, BlendFunction, BloomEffect, BrightnessContrastEffect, ColorAverageEffect,
  DepthOfFieldEffect, Effect, EffectComposer, EffectPass, FXAAEffect, HueSaturationEffect,
  KernelSize, NormalPass, OutlineEffect, PredicationMode, RenderPass, SepiaEffect,
  SMAAEffect, SMAAPreset, SSAOEffect, ToneMappingEffect, ToneMappingMode,
} from "postprocessing";
import { DEFAULT_SHADERS, normalizeShaderSettings, type ShaderSettings } from "../shaders/ShaderSettings";

/** Lazily loaded PolyProcessing feature set. All passes use one frozen camera per frame. */
export class CinematicCapture {
  ready: Promise<void> = Promise.resolve();
  private releaseReady?: () => void;
  private composer!: EffectComposer;
  private camera = new PerspectiveCamera();
  private scene: Scene;
  private renderer: WebGLRenderer;
  private restore: () => void;
  private disposed = false;
  private rendering = false;
  private outline?: OutlineEffect;
  private wireframes = new Map<Material & { wireframe: boolean }, boolean>();
  private settings: ShaderSettings;
  private size = new Vector2();
  private width = 0;
  private height = 0;


  constructor(private bridge: PolyTrackRenderer, width: number, height: number, settings: ShaderSettings = DEFAULT_SHADERS, live = false, onError?: (error: unknown) => void) {
    const renderer = bridge.polyviewerWebGLRenderer;
    if (!renderer) throw new Error("The runtime does not expose the shader renderer.");
    this.renderer = renderer;
    this.scene = bridge.scene as unknown as Scene;
    this.settings = normalizeShaderSettings(settings);
    const s = this.settings;
    const originalRender = renderer.render;
    const originalUpdate = bridge.update;
    const toneMapping = renderer.toneMapping;
    const exposure = renderer.toneMappingExposure;
    const target = renderer.getRenderTarget();
    const clearColor = renderer.getClearColor(new Color());
    const clearAlpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    this.restore = () => {
      renderer.render = originalRender;
      if (originalUpdate) bridge.update = originalUpdate;
      renderer.toneMapping = toneMapping;
      renderer.toneMappingExposure = exposure;
      renderer.setRenderTarget(target);
      renderer.autoClear = autoClear;
      renderer.setClearColor(clearColor, clearAlpha);
    };
    try {
      renderer.toneMapping = NoToneMapping;
      renderer.toneMappingExposure = s.toneMappingExposure;
      this.camera.copy(bridge.camera as unknown as PerspectiveCamera, false);
      this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType,
        multisampling: Math.min(s.msaaSamples, renderer.capabilities.maxSamples) });
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      // Native custom materials may produce invalid HDR pixels. Bound these
      // before bloom/adaptation so one pixel cannot poison an entire frame.
      this.add(new Effect("FiniteHDR", `void mainImage(const in vec4 c, const in vec2 uv, out vec4 o) {
        o = vec4(c.r >= 0.0 ? min(c.r, 64.0) : 0.0,
                 c.g >= 0.0 ? min(c.g, 64.0) : 0.0,
                 c.b >= 0.0 ? min(c.b, 64.0) : 0.0, c.a);
      }`, { blendFunction: BlendFunction.SRC }));
      if (s.aoEnabled) {
        const normals = new NormalPass(this.scene, this.camera);
        const renderNormals = normals.render.bind(normals);
        normals.render = (...args) => {
          const hidden: Mesh[] = [];
          this.scene.traverseVisible(object => {
            const mesh = object as Mesh;
            if (mesh.isMesh && ("meshMatrix" in mesh || (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(m => m.transparent))) {
              hidden.push(mesh); mesh.visible = false;
            }
          });
          try { renderNormals(...args); } finally { for (const mesh of hidden) mesh.visible = true; }
        };
        this.composer.addPass(normals);
        this.add(new SSAOEffect(this.camera, normals.texture, { samples: 24, rings: 7,
          intensity: s.aoIntensity, radius: s.aoRadius, worldDistanceThreshold: 250,
          worldDistanceFalloff: 100, worldProximityThreshold: 0.5, worldProximityFalloff: 1 }));
      }
      if (s.outlineEnabled) {
        this.outline = new OutlineEffect(this.scene, this.camera, { edgeStrength: s.outlineStrength });
        this.add(this.outline);
      }
      if (s.dofEnabled) {
        const dof = new DepthOfFieldEffect(this.camera, { focusDistance: s.dofFocusDistance,
          focusRange: s.dofFocusRange, bokehScale: s.dofBokehScale, resolutionScale: Number(s.dofResolutionScale) });
        dof.blurPass.kernelSize = KernelSize[s.dofKernelSize as keyof typeof KernelSize];
        dof.blendMode.opacity.value = s.dofOpacity;
        // PolyTrack's sky can write depth zero. Keep it outside the focus plane.
        const coc = dof.circleOfConfusionMaterial;
        coc.fragmentShader = coc.fragmentShader.replace("float depth=readDepth(vUv);", "float depth=readDepth(vUv);if(depth<=0.0){gl_FragColor=vec4(0.0,1.0,0.0,1.0);return;}");
        this.add(dof);
      }
      if (s.bloomEnabled) this.add(new BloomEffect({ intensity: s.bloomIntensity,
        luminanceThreshold: s.bloomThreshold, luminanceSmoothing: 0.15, mipmapBlur: true, radius: s.bloomRadius }));
      const tone = new ToneMappingEffect({ mode: ToneMappingMode[s.toneMappingMode as keyof typeof ToneMappingMode],
        blendFunction: BlendFunction[s.toneMappingBlendMode as keyof typeof BlendFunction],
        whitePoint: s.toneMappingWhitePoint, middleGrey: s.toneMappingMiddleGrey,
        minLuminance: s.toneMappingMinLuminance, averageLuminance: s.toneMappingAverageLuminance,
        adaptationRate: s.toneMappingAdaptationRate });
      tone.blendMode.opacity.value = s.toneMappingOpacity;
      this.add(tone);
      const grey = new ColorAverageEffect(); grey.blendMode.opacity.value = s.greyscale;
      const sepia = new SepiaEffect(); sepia.blendMode.opacity.value = s.sepia;
      this.add(new HueSaturationEffect({ hue: s.hue * Math.PI / 180, saturation: s.saturation }), sepia, grey,
        new BrightnessContrastEffect({ brightness: s.brightness, contrast: s.contrast }));
      if (s.invertEnabled) this.add(new Effect("Invert", "void mainImage(const in vec4 c, const in vec2 uv, out vec4 o) { o = vec4(1.0-c.rgb,c.a); }", { blendFunction: BlendFunction.SRC }));
      if (s.smaaEnabled) {
        const smaa = new SMAAEffect({ preset: SMAAPreset[s.smaaPreset as keyof typeof SMAAPreset], predicationMode: PredicationMode.DEPTH });
        // The package emits "load" but its declaration only lists "change".
        const events = smaa as unknown as {
          addEventListener(type: "load", listener: () => void): void;
          removeEventListener(type: "load", listener: () => void): void;
        };
        this.ready = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("SMAA lookup textures did not load.")), 10_000);
          this.releaseReady = () => { clearTimeout(timeout); resolve(); };
          const loaded = () => {
            events.removeEventListener("load", loaded);
            // A rapid preset change can dispose the effect before its images load.
            if (this.disposed) smaa.dispose();
            this.releaseReady?.();
          };
          events.addEventListener("load", loaded);
        });
        this.add(smaa);
      }
      if (s.fxaaEnabled) { const fxaa = new FXAAEffect(); fxaa.samples = s.fxaaSamples; this.add(fxaa); }
      if (s.asciiEnabled) this.add(new ASCIIEffect());
      this.resize(width, height);
      // Install hooks only while shaders are enabled. Prepare the actual native
      // camera BEFORE CSM fits its light frusta, not in scene.onBeforeRender.
      if (originalUpdate) bridge.update = (...args) => {
        bridge.polyviewerPrepareCamera?.();
        return originalUpdate.apply(bridge, args);
      };
      let lastFrame = performance.now();
      renderer.render = (scene, camera) => {
        if (this.rendering || scene !== this.scene || camera !== bridge.camera as unknown || renderer.getRenderTarget() !== null) {
          originalRender.call(renderer, scene, camera); return;
        }
        // Offline capture updates native CSM here, then renders the composer
        // exactly once from render(). No duplicate beauty pass is needed.
        if (!live) return;
        const now = performance.now();
        try { this.render(true, Math.min(0.1, Math.max(0, (now - lastFrame) / 1000))); }
        catch (error) {
          this.dispose();
          onError?.(error);
          originalRender.call(renderer, scene, camera);
        } finally { lastFrame = now; }
      };
    } catch (error) { this.dispose(); throw error; }
  }

  private add(...effects: Effect[]): void { this.composer.addPass(new EffectPass(this.camera, ...effects)); }
  private resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    const ratio = this.renderer.getPixelRatio();
    this.composer.setSize(width / ratio, height / ratio, false);
  }

  render(shadows = true, delta = 1 / 60): void {
    if (this.disposed) return;
    this.bridge.polyviewerPrepareCamera?.();
    this.camera.copy(this.bridge.camera as unknown as PerspectiveCamera, false);
    // Canonical Three camera avoids cross-bundle instanceof failures in effects.
    this.composer.setMainCamera(this.camera);
    this.renderer.getDrawingBufferSize(this.size);
    this.resize(this.size.x, this.size.y);
    if (this.outline || this.settings.wireframeEnabled) {
      this.outline?.selection.clear();
      for (const group of this.scene.children) {
        if (group.type !== "Group") continue;
        group.traverse(object => {
          const mesh = object as Mesh;
          if (!mesh.isMesh) return;
          this.outline?.selection.add(mesh);
          if (this.settings.wireframeEnabled) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (!("wireframe" in material)) continue;
            const wire = material as Material & { wireframe: boolean };
            if (!this.wireframes.has(wire)) this.wireframes.set(wire, wire.wireframe);
            wire.wireframe = true;
          }
        });
      }
    }
    const enabled = this.renderer.shadowMap.enabled;
    const before = this.scene.onBeforeRender;
    const override = this.scene.overrideMaterial;
    const target = this.renderer.getRenderTarget();
    // Depth, normals, colour and bokeh must see exactly the same camera. Native
    // hooks run before the snapshot; never mutate it between individual passes.
    this.scene.onBeforeRender = () => {};
    if (!shadows) this.renderer.shadowMap.enabled = false;
    this.rendering = true;
    try { this.composer.render(delta); }
    finally {
      this.rendering = false;
      this.scene.onBeforeRender = before;
      this.scene.overrideMaterial = override;
      this.renderer.shadowMap.enabled = enabled;
      this.renderer.setRenderTarget(target);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseReady?.();
    try { this.composer?.dispose(); }
    finally {
      for (const [material, original] of this.wireframes) material.wireframe = original;
      this.wireframes.clear();
      this.restore();
    }
  }
}
