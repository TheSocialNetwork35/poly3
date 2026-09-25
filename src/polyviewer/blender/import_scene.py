"""PolyViewer archive importer. Blender: Scripting > Open > Run Script.
Keep this script beside scene.json and frames/. Saves no files automatically.
"""
import bpy
import json
import math
import base64
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / 'scene.json').read_text())
if DATA.get('version') != 1:
    raise RuntimeError('Unsupported PolyViewer scene archive version')
scene = bpy.data.scenes.new('PolyViewer Shot')
bpy.context.window.scene = scene
scene.render.fps = DATA['fps']
scene.render.resolution_x = DATA['width']
scene.render.resolution_y = DATA['height']
scene.render.resolution_percentage = 100
scene.frame_start = 1
scene.frame_end = DATA['frameCount']
scene.render.engine = 'CYCLES'
scene.cycles.samples = 128
scene.cycles.use_denoising = True
scene.world = bpy.data.worlds.new('PolyViewer World')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.3, 0.4, 0.55, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5
# A single rigid rotation maps Three.js Y-up to Blender Z-up for all objects,
# including cameras. No per-object axis swaps or Euler reconstruction.
BASIS = Matrix.Rotation(math.pi / 2, 4, 'X')

def matrix(values):
    return BASIS @ Matrix([values[i::4] for i in range(4)])

textures = {}
for key, texture in DATA['textures'].items():
    data = texture if isinstance(texture, str) else texture['data']
    path = ROOT / ('texture-' + key + '.png')
    path.write_bytes(base64.b64decode(data.split(',', 1)[1]))
    image = bpy.data.images.load(str(path), check_existing=False)
    if isinstance(texture, dict):
        image.colorspace_settings.name = 'sRGB' if texture.get('colorSpace') == 'srgb' else 'Non-Color'
    image.pack()
    textures[key] = image

materials = {}
for key, data in DATA['materials'].items():
    mat = bpy.data.materials.new('PolyTrack Material')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*data['color'], 1)
    bsdf.inputs['Alpha'].default_value = data['opacity']
    bsdf.inputs['Roughness'].default_value = data['roughness']
    bsdf.inputs['Metallic'].default_value = data['metalness']
    bsdf.inputs['Transmission Weight'].default_value = data.get('transmission') or 0
    bsdf.inputs['IOR'].default_value = data.get('ior') or 1.5
    bsdf.inputs['Emission Color'].default_value = (*(data.get('emissive') or [0,0,0]), 1)
    bsdf.inputs['Emission Strength'].default_value = data.get('emissiveIntensity') or 0
    source = None
    if data.get('texture') in textures:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = textures[data['texture']]
        tex.extension = 'REPEAT'
        uv = nodes.new('ShaderNodeTexCoord')
        separate = nodes.new('ShaderNodeSeparateXYZ')
        links.new(uv.outputs['UV'], separate.inputs[0])
        t = data.get('textureMatrix') or [1,0,0,0,1,0,0,0,1]
        combine = nodes.new('ShaderNodeCombineXYZ')
        for axis in range(2):
            x = nodes.new('ShaderNodeMath'); x.operation = 'MULTIPLY'
            y = nodes.new('ShaderNodeMath'); y.operation = 'MULTIPLY'
            add = nodes.new('ShaderNodeMath'); add.operation = 'ADD'
            offset = nodes.new('ShaderNodeMath'); offset.operation = 'ADD'
            links.new(separate.outputs['X'], x.inputs[0]); x.inputs[1].default_value = t[axis]
            links.new(separate.outputs['Y'], y.inputs[0]); y.inputs[1].default_value = t[axis+3]
            links.new(x.outputs[0], add.inputs[0]); links.new(y.outputs[0], add.inputs[1])
            links.new(add.outputs[0], offset.inputs[0]); offset.inputs[1].default_value = t[axis+6]
            result = offset.outputs[0]
            if axis == 1 and not data.get('flipY', True):
                flip = nodes.new('ShaderNodeMath'); flip.operation = 'SUBTRACT'
                flip.inputs[0].default_value = 1; links.new(result, flip.inputs[1]); result = flip.outputs[0]
            links.new(result, combine.inputs[axis])
        links.new(combine.outputs[0], tex.inputs['Vector'])
        source = tex.outputs['Color']
        alpha = nodes.new('ShaderNodeMath'); alpha.operation = 'MULTIPLY'
        links.new(tex.outputs['Alpha'], alpha.inputs[0]); alpha.inputs[1].default_value = data['opacity']
        links.new(alpha.outputs[0], bsdf.inputs['Alpha'])
    if data.get('vertexColors'):
        color = nodes.new('ShaderNodeVertexColor'); color.layer_name = 'Color'
        if source:
            mix = nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1
            links.new(source, mix.inputs[1]); links.new(color.outputs['Color'], mix.inputs[2]); source = mix.outputs[0]
        else:
            source = color.outputs['Color']
    if data.get('vertexColors'):
        vertex_alpha = nodes.new('ShaderNodeMath'); vertex_alpha.operation = 'MULTIPLY'
        links.new(color.outputs['Alpha'], vertex_alpha.inputs[0])
        if bsdf.inputs['Alpha'].is_linked:
            links.new(bsdf.inputs['Alpha'].links[0].from_socket, vertex_alpha.inputs[1])
        else:
            vertex_alpha.inputs[1].default_value = data['opacity']
        links.new(vertex_alpha.outputs[0], bsdf.inputs['Alpha'])
    if source:
        tint = nodes.new('ShaderNodeMixRGB'); tint.blend_type = 'MULTIPLY'; tint.inputs[0].default_value = 1
        links.new(source, tint.inputs[1]); tint.inputs[2].default_value = (*data['color'], 1)
        links.new(tint.outputs[0], bsdf.inputs['Base Color'])
    if data.get('unlit'):
        emission = nodes.new('ShaderNodeEmission')
        if source:
            links.new(tint.outputs[0], emission.inputs['Color'])
        else:
            emission.inputs['Color'].default_value = (*data['color'], 1)
        transparent = nodes.new('ShaderNodeBsdfTransparent')
        mix = nodes.new('ShaderNodeMixShader')
        links.new(transparent.outputs[0], mix.inputs[1]); links.new(emission.outputs[0], mix.inputs[2])
        if bsdf.inputs['Alpha'].is_linked:
            links.new(bsdf.inputs['Alpha'].links[0].from_socket, mix.inputs[0])
        else:
            mix.inputs[0].default_value = data['opacity']
        links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    materials[key] = mat

meshes = {}
def get_mesh(key, slots):
    cache_key = (key, tuple(slots))
    if cache_key in meshes:
        return meshes[cache_key]
    data = DATA['geometries'][key]
    p, idx = data['position'], data['indices']
    mesh = bpy.data.meshes.new('PolyTrack Geometry')
    mesh.from_pydata([p[i:i+3] for i in range(0, len(p), 3)], [], [idx[i:i+3] for i in range(0, len(idx)-2, 3)])
    mesh.update()
    for slot in slots:
        mesh.materials.append(materials[slot])
    for group in data['groups']:
        for i in range(max(0, group['start']//3), min(len(mesh.polygons), group['end']//3)):
            mesh.polygons[i].material_index = group['material']
    if data.get('uv'):
        uv = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            i = loop.vertex_index * 2
            uv.data[loop.index].uv = data['uv'][i:i+2]
    if data.get('color'):
        attr = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
        size = data.get('colorSize') or 3
        for i, value in enumerate(attr.data):
            value.color = (*data['color'][i*size:i*size+3], data['color'][i*size+3] if size == 4 else 1)
    if data.get('normal'):
        n = data['normal']
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        mesh.normals_split_custom_set_from_vertices([n[i:i+3] for i in range(0,len(n),3)])
    meshes[cache_key] = mesh
    return mesh

camera = bpy.data.objects.new('PolyViewer Camera', bpy.data.cameras.new('PolyViewer Camera'))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.sensor_fit = 'VERTICAL'
camera.data.sensor_height = 24
objects, previous = {}, {}

def pose(obj, values, frame):
    transform = matrix(values)
    location, rotation, scale = transform.decompose()
    if obj.rotation_mode == 'QUATERNION' and obj.rotation_quaternion.dot(rotation) < 0:
        rotation.negate()
    obj.rotation_mode = 'QUATERNION'
    obj.location, obj.rotation_quaternion, obj.scale = location, rotation, scale
    for path in ('location', 'rotation_quaternion', 'scale'):
        obj.keyframe_insert(data_path=path, frame=frame)

def visible(obj, value, frame):
    obj.hide_render = not value
    obj.hide_viewport = not value
    obj.keyframe_insert(data_path='hide_render', frame=frame)
    obj.keyframe_insert(data_path='hide_viewport', frame=frame)

active = set()
current_objects = {}
for frame in range(1, DATA['frameCount'] + 1):
    snapshot = json.loads((ROOT / 'frames' / ('%06d.json' % (frame-1))).read_text())
    if DATA.get('deltaFrames'):
        for key in snapshot.get('removed', []):
            current_objects.pop(key, None)
        for item in snapshot['objects']:
            current_objects[item['id']] = item
        snapshot['objects'] = list(current_objects.values())
    if frame == 1:
        for light in snapshot.get('lights', []):
            sun = bpy.data.objects.new('PolyTrack Sun', bpy.data.lights.new('PolyTrack Sun', 'SUN'))
            scene.collection.objects.link(sun)
            sun.data.color = light['color']
            sun.data.energy = light['intensity']
            sun.data.angle = math.radians(2)
            direction = BASIS.to_3x3() @ (Vector(light['target']) - Vector(light['position']))
            if direction.length > 0:
                sun.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    seen = set()
    for item in snapshot['objects']:
        key = (item['id'], item['geometry'], tuple(item['materials']))
        seen.add(key)
        if key not in objects:
            obj = bpy.data.objects.new(item['name'], get_mesh(item['geometry'], item['materials']))
            scene.collection.objects.link(obj)
            obj['polyviewer_id'] = item['id']
            objects[key] = obj
            if frame > 1:
                visible(obj, False, 1)
        obj = objects[key]
        if key not in active:
            visible(obj, True, frame)
        # Keep a key at both ends of each stationary span to prevent drifting.
        if previous.get(key) != item['matrix']:
            if key in previous and frame > 1:
                pose(obj, previous[key], frame-1)
            pose(obj, item['matrix'], frame)
            previous[key] = item['matrix']
    for key in active - seen:
        visible(objects[key], False, frame)
    active = seen
    pose(camera, snapshot['camera']['matrix'], frame)
    camera.data.lens = 12 / math.tan(math.radians(snapshot['camera']['fov']) / 2)
    camera.data.clip_start = snapshot['camera']['near']
    camera.data.clip_end = snapshot['camera']['far']
    camera.data.keyframe_insert(data_path='lens', frame=frame)

# Blender 4.4+ layered actions and older legacy actions are both supported.
imported_actions = {obj.animation_data.action for obj in [*objects.values(), camera, camera.data]
                    if obj.animation_data and obj.animation_data.action}
for action in imported_actions:
    curves = list(getattr(action, 'fcurves', []))
    for layer in getattr(action, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                curves.extend(bag.fcurves)
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = 'CONSTANT' if curve.data_path in ('hide_render','hide_viewport') else 'LINEAR'

scene['polyviewer_start_microseconds'] = DATA['startMicroseconds']
scene['polyviewer_camera_path'] = json.dumps(DATA['cameraPoints'])
scene['polyviewer_export_warnings'] = '\n'.join(DATA['warnings'])
notes = bpy.data.texts.new('PolyViewer Export Notes')
notes.write('\n'.join(DATA['warnings']) or 'Geometry and transforms baked at the selected output FPS.')
scene.frame_set(1)
print('PolyViewer import complete. Save as .blend to keep the editable scene and packed textures.')
