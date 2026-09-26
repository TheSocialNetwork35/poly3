import { Color, Matrix4, Vector3, type Scene, type Mesh, type Material, type Texture, type BufferAttribute, type PerspectiveCamera, type InstancedMesh, type DirectionalLight } from "three";

type GeometryData = { position: number[]; [key: string]: unknown };
export type ResourceKind = "geometries" | "materials" | "textures";
export type ResourceSink = (kind: ResourceKind, key: string, data: unknown) => void;

/** World-space snapshots preserve hierarchy, suspension and camera constraints
 * after the native evaluator has resolved them, rather than re-solving physics. */
export class SceneArchive {
  geometries: Record<string, unknown> = {};
  materials: Record<string, unknown> = {};
  textures: Record<string, { data: string; colorSpace: string }> = {};
  warnings = new Set<string>();
  private geometryKeys = new WeakMap<object, { signature: string; key: string; data: GeometryData }>();
  private materialKeys = new Map<string, string>();
  private textureKeys = new Set<string>();
  constructor(private sink?: ResourceSink) {}
  private resource(kind: ResourceKind, key: string, data: any): void {
    if (this.sink) this.sink(kind, key, data);
    else this[kind][key] = data;
  }
  private serial = 0;
  private bakedTransforms = new Map<string, string>();

  snapshot(scene: Scene, camera: PerspectiveCamera) {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const objects: { id: string; name: string; geometry: string; materials: string[]; matrix: number[] }[] = [];
    const record = (mesh: Mesh, id: string, geometry: string, materials: string[], matrix: Matrix4, geometryData: GeometryData) => {
      const e = matrix.elements;
      const x = new Vector3(e[0], e[1], e[2]), y = new Vector3(e[4], e[5], e[6]), z = new Vector3(e[8], e[9], e[10]);
      const scale = Math.max(1, x.length() * y.length(), y.length() * z.length(), x.length() * z.length());
      // Bake transforms that Blender's location/rotation/scale channels cannot
      // represent, including shear and singular/projective matrices.
      if (Math.abs(matrix.determinant()) < 1e-10 || Math.abs(e[15]! - 1) > 1e-7
        || e[3] !== 0 || e[7] !== 0 || e[11] !== 0
        || Math.max(Math.abs(x.dot(y)), Math.abs(y.dot(z)), Math.abs(x.dot(z))) > 1e-6 * scale) {
        const signature = `${geometry}:${e.join(",")}`;
        let baked = this.bakedTransforms.get(signature);
        if (!baked) {
          const data = geometryData;
          const position: number[] = [];
          for (let i = 0; i < data.position.length; i += 3) {
            const p = new Vector3(data.position[i], data.position[i+1], data.position[i+2]).applyMatrix4(matrix);
            if (![p.x,p.y,p.z].every(Number.isFinite)) throw new Error("A projective scene vertex lies at infinity and cannot be exported.");
            position.push(p.x,p.y,p.z);
          }
          baked = `${geometry}-baked-${this.serial++}`;
          this.resource("geometries", baked, { ...data, position, normal: undefined });
          this.bakedTransforms.set(signature, baked);
        }
        geometry = baked;
        matrix = new Matrix4();
      }
      objects.push({ id, name: mesh.name || mesh.type, geometry, materials, matrix: matrix.toArray() });
    };
    scene.traverseVisible(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) {
        if ((object as unknown as { isPoints: boolean }).isPoints) this.warnings.add("GPU point particles require a Blender particle material; not exported as volume simulation.");
        return;
      }
      // PolyTrack's projected shadow copies are render tricks, not geometry.
      // Blender computes real light shadows; importing these causes z-fighting.
      if ("meshMatrix" in mesh || (mesh as unknown as { isShadowMesh?: boolean }).isShadowMesh) return;
      if (!mesh.layers.test(camera.layers)) return;
      const single = Array.isArray(mesh.material) ? null : mesh.material;
      if (single && (!single.visible || single.type === "ShadowMaterial")) return;
      if (single && 'uniforms' in single && (single as {uniforms: Record<string, unknown>}).uniforms.cloudDensity) {
        this.warnings.add("Procedural sky/cloud shader is replaced by a Blender world; track and building geometry are unchanged.");
        return;
      }
      const geometry = mesh.geometry;
      const position = geometry.getAttribute("position");
      if (!position) return;
      if (geometry.isBufferGeometry && "isInstancedBufferGeometry" in geometry) this.warnings.add("Custom GPU instanced shader geometry is exported as its base mesh; shader-driven smoke is not a Blender volume.");
      if ((mesh as unknown as { isSkinnedMesh: boolean }).isSkinnedMesh) throw new Error("Skeletal mesh encountered; this runtime export supports PolyTrack morph suspension, not arbitrary bone rigs.");
      const morphed = !!mesh.morphTargetInfluences?.length;
      const cacheOwner = morphed ? mesh : geometry;
      const signature = (morphed ? mesh.morphTargetInfluences!.join(",") : "") + Object.values(geometry.attributes).map(a => `${a.count}:${(a as BufferAttribute).version ?? (a as unknown as {data: {version: number}}).data?.version}`).join("/") + `/${geometry.index?.version}/${geometry.drawRange.start}/${geometry.drawRange.count}`;
      let cached = this.geometryKeys.get(cacheOwner);
      if (!cached || cached.signature !== signature) {
        const key = `${geometry.uuid}-${this.serial++}`;
        const start = Math.max(0, geometry.drawRange.start);
        const end = Math.min(geometry.index?.count ?? position.count, start + geometry.drawRange.count);
        if (end - start < 3) return;
        // Particle/skid buffers reserve far more vertices than they draw.
        // Store only referenced vertices and remap indices, preserving UVs/colour.
        const vertices: number[] = [], remap = new Map<number, number>(), indices: number[] = [];
        for (let i = start; i < end; i++) {
          const old = geometry.index ? geometry.index.getX(i) : i;
          let next = remap.get(old);
          if (next === undefined) { next = vertices.length; vertices.push(old); remap.set(old, next); }
          indices.push(next);
        }
        const data: GeometryData = {
          position: morphed ? vertices.flatMap(i => mesh.getVertexPosition(i, new Vector3()).toArray()) : readAttribute(position, 3, vertices),
          normal: geometry.getAttribute("normal") ? readAttribute(geometry.getAttribute("normal"), 3, vertices) : undefined,
          uv: geometry.getAttribute("uv") ? readAttribute(geometry.getAttribute("uv"), 2, vertices) : undefined,
          color: geometry.getAttribute("color") ? readAttribute(geometry.getAttribute("color"), geometry.getAttribute("color").itemSize, vertices) : undefined,
          colorSize: geometry.getAttribute("color")?.itemSize,
          indices,
          groups: geometry.groups.map(g => ({ start: Math.max(start, g.start) - start, end: Math.min(end, g.start + g.count) - start, material: g.materialIndex ?? 0 })),
        };
        this.resource("geometries", key, data);
        cached = { signature, key, data };
        this.geometryKeys.set(cacheOwner, cached);
      }
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => this.material(m));
      const instanced = mesh as InstancedMesh;
      if (instanced.isInstancedMesh) {
        for (let i = 0; i < instanced.count; i++) {
          const matrix = new Matrix4();
          instanced.getMatrixAt(i, matrix);
          const instanceMaterials = instanced.instanceColor
            ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => {
              const tint = new Color(); instanced.getColorAt(i, tint); return this.material(m, tint);
            }) : materials;
          record(mesh, `${mesh.uuid}:${i}`, cached.key, instanceMaterials, new Matrix4().multiplyMatrices(mesh.matrixWorld, matrix), cached.data);
        }
      } else record(mesh, mesh.uuid, cached.key, materials, mesh.matrixWorld.clone(), cached.data);
    });
    const lights: unknown[] = [];
    scene.traverseVisible(object => {
      const light = object as DirectionalLight;
      if (light.isDirectionalLight && lights.length === 0) {
        lights.push({ color: light.color.toArray(), intensity: light.intensity,
          position: new Vector3().setFromMatrixPosition(light.matrixWorld).toArray(),
          target: new Vector3().setFromMatrixPosition(light.target.matrixWorld).toArray() });
      }
    });
    return { objects, lights, camera: { matrix: camera.matrixWorld.toArray(), fov: camera.fov, near: camera.near, far: camera.far } };
  }

  private material(material: Material, tint?: Color): string {
    const m = material as Material & { color?: {toArray(): number[]}; map?: Texture; roughness?: number; metalness?: number; emissive?: { toArray(): number[] }; emissiveIntensity?: number; transmission?: number; ior?: number; uniforms?: Record<string, {value: unknown}> };
    if (m.type === "ShaderMaterial" || m.type === "RawShaderMaterial") this.warnings.add("PolyTrack custom GLSL materials are approximated with Principled BSDF; lighting, smoke and shader vertex displacement are not pixel-identical.");
    const map = m.map;
    if (map && !this.textureKeys.has(map.uuid)) {
      this.textureKeys.add(map.uuid);
      let texture: { data: string; colorSpace: string } | undefined;
      try {
        const image = map.image as HTMLImageElement;
        const canvas = document.createElement("canvas");
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context || !canvas.width || !canvas.height) throw new Error("No image");
        context.drawImage(image, 0, 0);
        texture = { data: canvas.toDataURL("image/png"), colorSpace: map.colorSpace };
      } catch { this.warnings.add(`Texture unavailable: ${map.name || map.uuid}`); }
      if (texture) this.resource("textures", map.uuid, texture);
    }
    const baseColor = m.color?.toArray() ?? [1,1,1];
    const data = { name: m.name, color: tint ? baseColor.map((v, i) => v * tint.toArray()[i]!) : baseColor, opacity: m.opacity, roughness: m.roughness ?? 0.75, metalness: m.metalness ?? 0, texture: map?.uuid, flipY: map?.flipY, textureMatrix: map ? (map.matrixAutoUpdate && map.updateMatrix(), map.matrix.toArray()) : undefined, vertexColors: m.vertexColors, unlit: m.type === "MeshBasicMaterial", emissive: m.name === "BrakeLight" ? [0,0,0] : m.emissive?.toArray(), emissiveIntensity: m.name === "BrakeLight" ? 0 : m.emissiveIntensity, transmission: m.transmission, ior: m.ior, alphaTest: m.alphaTest };
    const signature = `${m.uuid}:${JSON.stringify(data)}`;
    let key = this.materialKeys.get(signature);
    if (!key) {
      key = `material-${this.serial++}`;
      this.resource("materials", key, data);
      this.materialKeys.set(signature, key);
    }
    return key;
  }
}

function readAttribute(attribute: ReturnType<Mesh["geometry"]["getAttribute"]>, size: number, vertices: number[]): number[] {
  const result: number[] = [];
  const vector = new Vector3();
  for (const i of vertices) {
    vector.set(attribute.getX(i), attribute.getY(i), size === 3 ? attribute.getZ(i) : 0);
    result.push(vector.x, vector.y);
    if (size >= 3) result.push(attribute.getZ(i));
    if (size === 4) result.push(attribute.getW(i));
  }
  return result;
}
