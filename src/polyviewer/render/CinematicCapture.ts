import { ACESFilmicToneMapping, PCFSoftShadowMap, Color, Vector2, type Scene, type PerspectiveCamera, type Mesh, type Material, type WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/** Imported and allocated only inside an explicit offline cinematic capture. */
export class CinematicCapture {
  private composer: EffectComposer;
  private renderer: WebGLRenderer;
  private restore: () => void;
  private projectedShadows: Mesh[] = [];
  private shadowObjects: { mesh: Mesh; cast: boolean; receive: boolean }[] = [];
  private materials: { mesh: Mesh; original: Material | Material[]; cinematic: Material }[] = [];

  constructor(bridge: PolyTrackRenderer, width: number, height: number) {
    const renderer = bridge.polyviewerWebGLRenderer;
    if (!renderer) throw new Error("This runtime does not expose cinematic capture.");
    this.renderer = renderer;
    const toneMapping = renderer.toneMapping;
    const exposure = renderer.toneMappingExposure;
    const target = renderer.getRenderTarget();
    const shadowType = renderer.shadowMap.type;
    const clearColor = renderer.getClearColor(new Color());
    const clearAlpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    const scene = bridge.scene as unknown as Scene;
    const override = scene.overrideMaterial;
    this.restore = () => {
      renderer.toneMapping = toneMapping;
      renderer.toneMappingExposure = exposure;
      renderer.setRenderTarget(target);
      renderer.shadowMap.type = shadowType;
      renderer.shadowMap.needsUpdate = true;
      renderer.autoClear = autoClear;
      renderer.setClearColor(clearColor, clearAlpha);
      scene.overrideMaterial = override;
    };
    this.composer = new EffectComposer(renderer);
    try {
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.type = PCFSoftShadowMap;
      renderer.shadowMap.needsUpdate = true;
      this.composer.renderTarget1.samples = Math.min(4, renderer.capabilities.maxSamples);
      this.composer.renderTarget2.samples = Math.min(4, renderer.capabilities.maxSamples);
      this.composer.setSize(width, height);
      (bridge.scene as unknown as Scene).traverse(object => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        if ("meshMatrix" in mesh && mesh.visible) {
          this.projectedShadows.push(mesh); mesh.visible = false;
        }
        const opaque = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(m => !m.transparent && m.type !== "ShaderMaterial");
        if (opaque) {
          this.shadowObjects.push({ mesh, cast: mesh.castShadow, receive: mesh.receiveShadow });
          mesh.castShadow = true; mesh.receiveShadow = true;
        }
        if (Array.isArray(mesh.material)) return;
        const original = mesh.material as Material & { map?: { image?: { src?: string } } };
        if (!original.map?.image?.src?.includes("smoke")) return;
        const material = original.clone();
        // Give the native animated smoke billboards a rounded light response.
        // Keep their texture, instancing, lifetime and world movement intact.
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
            #include <map_fragment>
            #ifdef USE_MAP
              vec2 smokeXY = vMapUv * 2.0 - 1.0;
              float smokeZ = sqrt(max(0.0, 1.0 - dot(smokeXY, smokeXY)));
              float smokeLight = 0.68 + 0.42 * max(0.0, dot(normalize(vec3(smokeXY, smokeZ)), normalize(vec3(-0.4, 0.8, 0.6))));
              diffuseColor.rgb *= smokeLight;
              diffuseColor.a = pow(diffuseColor.a, 1.12);
            #endif
          `);
        };
        material.customProgramCacheKey = () => "polyviewer-cinematic-smoke-v1";
        this.materials.push({ mesh, original, cinematic: material });
        mesh.material = material;
      });
      // Native lighting, material shaders, particles and skidmarks are rendered
      // unchanged; the normal/depth pass adds contact occlusion to real geometry.
      this.composer.addPass(new RenderPass(bridge.scene as unknown as Scene, bridge.camera as unknown as PerspectiveCamera));
      const ao = new SSAOPass(bridge.scene as unknown as Scene, bridge.camera as unknown as PerspectiveCamera, width, height, 32);
      this.composer.addPass(ao);
      const renderAO = ao.render.bind(ao);
      ao.render = (...args) => {
        const hidden: Mesh[] = [];
        scene.traverseVisible(object => {
          const mesh = object as Mesh;
          if (mesh.isMesh && (Array.isArray(mesh.material) ? mesh.material.every(m => m.transparent) : mesh.material.transparent)) {
            hidden.push(mesh); mesh.visible = false;
          }
        });
        try { renderAO(...args); } finally { for (const mesh of hidden) mesh.visible = true; }
      };
      ao.kernelRadius = 1.4;
      ao.minDistance = 0.001;
      ao.maxDistance = 0.08;
      const bloom = new UnrealBloomPass(new Vector2(width, height), 0.18, 0.45, 1.1);
      this.composer.addPass(bloom);
      this.composer.addPass(new OutputPass());
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  render(shadows = true): void {
    for (const pass of this.composer.passes) {
      if (pass instanceof SSAOPass) {
        const u = pass.ssaoMaterial.uniforms;
        u.cameraNear!.value = (pass.camera as PerspectiveCamera).near;
        u.cameraFar!.value = (pass.camera as PerspectiveCamera).far;
        u.cameraProjectionMatrix!.value.copy(pass.camera.projectionMatrix);
        u.cameraInverseProjectionMatrix!.value.copy(pass.camera.projectionMatrixInverse);
      }
    }
    const enabled = this.renderer.shadowMap.enabled;
    if (!shadows) this.renderer.shadowMap.enabled = false;
    try { this.composer.render(0); } finally { this.renderer.shadowMap.enabled = enabled; }
  }

  dispose(): void {
    try {
      for (const pass of this.composer.passes) {
        pass.dispose();
        // r181 SSAOPass.dispose omits these two owned resources.
        if (pass instanceof SSAOPass) { pass.ssaoMaterial.dispose(); pass.noiseTexture.dispose(); }
      }
      this.composer.dispose();
      for (const { mesh, original, cinematic } of this.materials) {
        mesh.material = original;
        cinematic.dispose();
      }
      this.materials.length = 0;
      for (const { mesh, cast, receive } of this.shadowObjects) {
        mesh.castShadow = cast; mesh.receiveShadow = receive;
      }
      this.shadowObjects.length = 0;
      for (const mesh of this.projectedShadows) mesh.visible = true;
      this.projectedShadows.length = 0;
    } finally { this.restore(); }
  }
}
