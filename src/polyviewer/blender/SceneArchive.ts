import { Color, Matrix4, Vector3, type Scene, type Mesh, type Material, type Texture, type BufferAttribute, type PerspectiveCamera, type InstancedMesh, type DirectionalLight } from "three";

/** World-space snapshots preserve hierarchy, suspension and camera constraints
 * after the native evaluator has resolved them, rather than re-solving physics. */
export class SceneArchive {
  geometries: Record<string, unknown> = {};
  materials: Record<string, unknown> = {};
  textures: Record<string, { data: string; colorSpace: string }> = {};
  warnings = new Set<string>();
  private geometryKeys = new WeakMap<object, { signature: string; key: string }>();
  private serial = 0;
  private bakedTransforms = new Map<string, string>();

  snapshot(scene: Scene, camera: PerspectiveCamera) {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const objects: { id: string; name: string; geometry: string; materials: string[]; matrix: number[] }[] = [];
    const record = (mesh: Mesh, id: string, geometry: string, materials: string[], matrix: Matrix4) => {
      const e = matrix.elements;
      const x = new Vector3(e[0], e[1], e[2]), y = new Vector3(e[4], e[5], e[6]), z = new Vector3(e[8], e[9], e[10]);
      const scale = Math.max(1, x.length() * y.length(), y.length() * z.length(), x.length() * z.length());
      // Native projected shadows use singular/projective matrices, which
      // Blender's location/rotation/scale channels cannot represent. Bake the
      // exact homogeneous transform into their vertices instead of distorting it.
      if (Math.abs(matrix.determinant()) < 1e-10 || Math.abs(e[15]! - 1) > 1e-7
        || e[3] !== 0 || e[7] !== 0 || e[11] !== 0
        || Math.max(Math.abs(x.dot(y)), Math.abs(y.dot(z)), Math.abs(x.dot(z))) > 1e-6 * scale) {
        const signature = `${geometry}:${e.join(",")}`;
        let baked = this.bakedTransforms.get(signature);
        if (!baked) {
          const data = this.geometries[geometry] as { position: number[]; [key: string]: unknown };
          const position: number[] = [];
          for (let i = 0; i < data.position.length; i += 3) {
            const p = new Vector3(data.position[i], data.position[i+1], data.position[i+2]).applyMatrix4(matrix);
            if (![p.x,p.y,p.z].every(Number.isFinite)) throw new Error("A projective scene vertex lies at infinity and cannot be exported.");
            position.push(p.x,p.y,p.z);
          }
          baked = `${geometry}-baked-${this.serial++}`;
          this.geometries[baked] = { ...data, position, normal: undefined };
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
      if (!mesh.layers.test(camera.layers)) return;
      const single = Array.isArray(mesh.material) ? null : mesh.material;
      if (single && !single.visible) return;
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
        const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: position.count }, (_, i) => i);
        const start = geometry.drawRange.start;
        const end = Math.min(indices.length, start + geometry.drawRange.count);
        this.geometries[key] = {
          position: morphed ? Array.from({ length: position.count }, (_, i) => mesh.getVertexPosition(i, new Vector3()).toArray()).flat() : readAttribute(position, 3),
          normal: geometry.getAttribute("normal") ? readAttribute(geometry.getAttribute("normal"), 3) : undefined,
          uv: geometry.getAttribute("uv") ? readAttribute(geometry.getAttribute("uv"), 2) : undefined,
          color: geometry.getAttribute("color") ? readAttribute(geometry.getAttribute("color"), geometry.getAttribute("color").itemSize) : undefined,
          colorSize: geometry.getAttribute("color")?.itemSize,
          indices: indices.slice(start, end),
          groups: geometry.groups.map(g => ({ start: Math.max(start, g.start) - start, end: Math.min(end, g.start + g.count) - start, material: g.materialIndex ?? 0 })),
        };
        cached = { signature, key };
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
          record(mesh, `${mesh.uuid}:${i}`, cached.key, instanceMaterials, new Matrix4().multiplyMatrices(mesh.matrixWorld, matrix));
        }
      } else record(mesh, mesh.uuid, cached.key, materials, mesh.matrixWorld.clone());
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
    if (map && !this.textures[map.uuid]) {
      try {
        const image = map.image as HTMLImageElement;
        const canvas = document.createElement("canvas");
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context || !canvas.width || !canvas.height) throw new Error("No image");
        context.drawImage(image, 0, 0);
        this.textures[map.uuid] = { data: canvas.toDataURL("image/png"), colorSpace: map.colorSpace };
      } catch { this.warnings.add(`Texture unavailable: ${map.name || map.uuid}`); }
    }
    const baseColor = m.color?.toArray() ?? [1,1,1];
    const data = { name: m.name, color: tint ? baseColor.map((v, i) => v * tint.toArray()[i]!) : baseColor, opacity: m.opacity, roughness: m.roughness ?? 0.75, metalness: m.metalness ?? 0, texture: map?.uuid, flipY: map?.flipY, textureMatrix: map ? (map.matrixAutoUpdate && map.updateMatrix(), map.matrix.toArray()) : undefined, vertexColors: m.vertexColors, unlit: m.type === "MeshBasicMaterial", emissive: m.emissive?.toArray(), emissiveIntensity: m.emissiveIntensity, transmission: m.transmission, ior: m.ior, alphaTest: m.alphaTest };
    const key = `${m.uuid}:${JSON.stringify(data)}`;
    this.materials[key] = data;
    return key;
  }
}

function readAttribute(attribute: ReturnType<Mesh["geometry"]["getAttribute"]>, size: number): number[] {
  const result: number[] = [];
  const vector = new Vector3();
  for (let i = 0; i < attribute.count; i++) {
    vector.set(attribute.getX(i), attribute.getY(i), size === 3 ? attribute.getZ(i) : 0);
    result.push(vector.x, vector.y);
    if (size >= 3) result.push(attribute.getZ(i));
    if (size === 4) result.push(attribute.getW(i));
  }
  return result;
}
