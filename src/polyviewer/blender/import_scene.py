"""PolyViewer archive importer. Blender: Scripting > Open > Run Script.
Keep this script beside scene.json and frames/. Saves no files automatically.
"""
import bpy
import json
import math
import base64
import re
from pathlib import Path
from mathutils import Matrix, Vector

# Explicit, editable lighting controls. No hidden environment fill by default.
WORLD_STRENGTH = 0.0
HEADLIGHT_POWER = 1500.0  # watts per front spotlight
BRAKE_LIGHT_POWER = 300.0  # watts, keyed to the recorded brake input
ADD_CAR_LIGHTS = True

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
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = WORLD_STRENGTH
scene.world.node_tree.nodes['Background'].label = 'Environment fill (0 = off)'
lighting = bpy.data.collections.new('PolyViewer Lighting')
scene.collection.children.link(lighting)
car_lighting = bpy.data.collections.new('PolyViewer Car Lights')
scene.collection.children.link(car_lighting)
# Material Preview otherwise uses Blender's studio HDRI instead of scene lighting.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.use_scene_world = True
            area.spaces.active.shading.use_scene_lights = True
# A single rigid rotation maps Three.js Y-up to Blender Z-up for all objects,
# including cameras. No per-object axis swaps or Euler reconstruction.
BASIS = Matrix.Rotation(math.pi / 2, 4, 'X')

def matrix(values):
    return BASIS @ Matrix([values[i::4] for i in range(4)])

def resource(kind, key):
    path = DATA.get('resourceFiles', {}).get(kind, {}).get(key)
    if path:
        resolved = (ROOT / path).resolve()
        if not resolved.is_relative_to(ROOT):
            raise RuntimeError('Archive resource must be inside the extracted folder')
        return json.loads(resolved.read_text())
    return DATA[kind][key]

def resources(kind):
    for key in DATA.get('resourceFiles', {}).get(kind, DATA.get(kind, {})):
        yield key, resource(kind, key)

textures = {}
for key, texture in resources('textures'):
    data = texture if isinstance(texture, str) else texture['data']
    path = ROOT / ('texture-' + key + '.png')
    path.write_bytes(base64.b64decode(data.split(',', 1)[1]))
    image = bpy.data.images.load(str(path), check_existing=False)
    if isinstance(texture, dict):
        image.colorspace_settings.name = 'sRGB' if texture.get('colorSpace') == 'srgb' else 'Non-Color'
    image.pack()
    textures[key] = image

materials = {}
for key, data in resources('materials'):
    mat = bpy.data.materials.new(data.get('name') or 'PolyTrack Material')
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
    if DATA.get('carLightsVersion') and data.get('name') == 'BrakeLight':
        bsdf.inputs['Emission Strength'].default_value = 0  # the named brake lamp owns illumination
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
        # MeshBasicMaterial means unlit in the game, not an invisible area lamp.
        ray = nodes.new('ShaderNodeLightPath')
        camera_mix = nodes.new('ShaderNodeMixShader')
        links.new(ray.outputs['Is Camera Ray'], camera_mix.inputs[0])
        links.new(bsdf.outputs[0], camera_mix.inputs[1])
        links.new(mix.outputs[0], camera_mix.inputs[2])
        links.new(camera_mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    materials[key] = mat

meshes = {}
def get_mesh(key, slots, flat=False):
    cache_key = (key, tuple(slots), flat)
    if cache_key in meshes:
        return meshes[cache_key]
    data = resource('geometries', key)
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
    if data.get('normal') and not flat:
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

# The verified 0.6.2 Body mesh uses +Z forward and Y up. These mounts sit
# just outside the nose and the model's existing single rear BrakeLight strip.
# Parent coordinates stay in Three.js axes; BASIS is applied once to the chassis.
FRONT_MOUNTS = ((-0.235, -0.285, 1.65), (0.235, -0.285, 1.65))
# Actual BrakeLight surface from the shipped car.glb, in chassis coordinates.
# Offset along its outward normal, rather than placing a rectangle behind it.
REAR_SURFACE = (
    (-0.2519213, -0.0887070, -1.8526173),
    (0.2519213, -0.0887070, -1.8526173),
    (0.2519213, -0.1314953, -1.8680754),
    (0.1259610, -0.1492632, -1.8744944),
    (-0.1259610, -0.1492632, -1.8744944),
    (-0.2519213, -0.1314953, -1.8680754),
)
REAR_NORMAL = Vector((0.0, 0.339777, -0.940506)).normalized()
REAR_CENTER = Vector((0.0, -0.1189851, -1.86355585))
REAR_MOUNT = REAR_CENTER + REAR_NORMAL * 0.001
car_rigs = {}
light_animation = []

def lens(collection, parent, lamp, name, width, height):
    mesh = bpy.data.meshes.new(name + ' Lens')
    if lamp.data.type == 'AREA':
        mesh.from_pydata([Vector(point) - REAR_CENTER for point in REAR_SURFACE], [],
                         [tuple(range(len(REAR_SURFACE)))])
    else:
        mesh.from_pydata([(-width/2,-height/2,0), (width/2,-height/2,0),
                          (width/2,height/2,0), (-width/2,height/2,0)], [], [(0,1,2,3)])
    obj = bpy.data.objects.new(name + ' Lens', mesh)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = lamp.location
    mat = bpy.data.materials.new(name + ' Glow')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*lamp.data.color, 1)
    if lamp.data.type == 'AREA':
        # Rear lens stays a plain, unanimated red material. Brake animation
        # belongs exclusively to the actual Area light's energy channel.
        mesh.materials.append(mat)
        light_animation.append(obj)
        return obj
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (*lamp.data.color, 1)
    driver = emit.inputs['Strength'].driver_add('default_value').driver
    driver.expression = 'min(power, 1.0) * 6.0 * (1.0 - hidden)'
    for name, owner, path, id_type in [('power', lamp.data, 'energy', 'LIGHT'), ('hidden', lamp, 'hide_render', 'OBJECT')]:
        variable = driver.variables.new(); variable.name = name; variable.type = 'SINGLE_PROP'
        variable.targets[0].id_type = id_type; variable.targets[0].id = owner; variable.targets[0].data_path = path
    # Visible lens glow, with all actual illumination owned by the named lamp.
    ray = nodes.new('ShaderNodeLightPath'); mix = nodes.new('ShaderNodeMixShader')
    links.new(ray.outputs['Is Camera Ray'], mix.inputs[0])
    links.new(bsdf.outputs[0], mix.inputs[1]); links.new(emit.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    mesh.materials.append(mat)
    light_animation.append(obj)
    return obj

def make_car_rig(car):
    name = '%s [%s]' % (car['name'], car['id'])
    collection = bpy.data.collections.new(name)
    car_lighting.children.link(collection)
    root = bpy.data.objects.new(name + ' Light Rig', None)
    root.empty_display_type = 'PLAIN_AXES'; root.empty_display_size = 0.2
    root['polyviewer_car_id'] = car['id']
    collection.objects.link(root)
    light_animation.append(root)
    lamps, lenses = [], []
    for index, position in enumerate((*FRONT_MOUNTS, REAR_MOUNT)):
        rear = index == 2
        title = name + (' Brake Light' if rear else (' Headlight Left' if index == 0 else ' Headlight Right'))
        data = bpy.data.lights.new(title, 'AREA' if rear else 'SPOT')
        data.color = (1.0, 0.0, 0.0) if rear else (1.0, 0.94, 0.82)
        data.energy = 0.0
        if rear:
            data.shape = 'RECTANGLE'; data.size = 0.48; data.size_y = 0.055
            data.spread = math.radians(120)
        else:
            data.spot_size = math.radians(52); data.spot_blend = 0.55
            data.shadow_soft_size = 0.025
        lamp = bpy.data.objects.new(title, data)
        collection.objects.link(lamp); lamp.parent = root; lamp.location = position
        direction = REAR_NORMAL if rear else Vector((0, -0.035, 1))
        lamp.rotation_mode = 'QUATERNION'
        lamp.rotation_quaternion = direction.to_track_quat('-Z', 'Y')
        lamps.append(lamp)
        lenses.append(lens(collection, root, lamp, title, 0.48 if rear else 0.11, 0.055))
        light_animation.extend([lamp, data])
    return root, lamps, lenses

def update_car_lights(cars, frame):
    seen = set()
    for car in cars:
        key = car['id']; seen.add(key)
        if key not in car_rigs:
            car_rigs[key] = make_car_rig(car)
            if frame > 1:
                for obj in [*car_rigs[key][1], *car_rigs[key][2]]:
                    visible(obj, False, 1)
                for lamp in car_rigs[key][1]:
                    lamp.data.keyframe_insert(data_path='energy', frame=1)
        root, lamps, lenses = car_rigs[key]
        pose(root, car['matrix'], frame)
        for index, lamp in enumerate(lamps):
            visible(lamp, True, frame); visible(lenses[index], True, frame)
            lamp.data.energy = (BRAKE_LIGHT_POWER if car.get('braking') else 0.0) if index == 2 else HEADLIGHT_POWER
            lamp.data.energy *= max(0.0, min(1.0, car.get('opacity', 1.0)))
            lamp.data.keyframe_insert(data_path='energy', frame=frame)
    for key in car_rigs.keys() - seen:
        for lamp, glass in zip(car_rigs[key][1], car_rigs[key][2]):
            visible(lamp, False, frame); visible(glass, False, frame)
            lamp.data.energy = 0; lamp.data.keyframe_insert(data_path='energy', frame=frame)

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
            lighting.objects.link(sun)
            sun.data.color = light['color']
            sun.data.energy = light['intensity']
            sun.data.angle = math.radians(2)
            direction = BASIS.to_3x3() @ (Vector(light['target']) - Vector(light['position']))
            if direction.length > 0:
                sun.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    if ADD_CAR_LIGHTS:
        update_car_lights(snapshot.get('cars', []), frame)
    seen = set()
    for item in snapshot['objects']:
        key = (item['id'], item['geometry'], tuple(item['materials']))
        seen.add(key)
        if key not in objects:
            # Native car parts retain these model names, including wheel/exhaust styles.
            flat = re.fullmatch(r'(Body|Suspension|Wheel\d*|Exhaust\d*)(?:[._]\d+)?', item['name']) is not None
            obj = bpy.data.objects.new(item['name'], get_mesh(item['geometry'], item['materials'], flat))
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
imported_actions = {obj.animation_data.action for obj in [*objects.values(), camera, camera.data, *light_animation]
                    if obj.animation_data and obj.animation_data.action}
for action in imported_actions:
    curves = list(getattr(action, 'fcurves', []))
    for layer in getattr(action, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                curves.extend(bag.fcurves)
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = 'CONSTANT' if curve.data_path in ('hide_render','hide_viewport','energy') else 'LINEAR'

scene['polyviewer_start_microseconds'] = DATA['startMicroseconds']
scene['polyviewer_camera_path'] = json.dumps(DATA['cameraPoints'])
scene['polyviewer_export_warnings'] = '\n'.join(DATA['warnings'])
notes = bpy.data.texts.new('PolyViewer Export Notes')
notes.write('Environment: PolyViewer World > Background > Strength (default 0).\n'
            'Sun: PolyViewer Lighting. Vehicle lamps: PolyViewer Car Lights.\n'
            'Brake energy uses CONSTANT keyframes from replay brake input.\n'
            'Material Preview: enable Scene World and Scene Lights, or use Rendered mode.\n\n')
if not DATA.get('carLightsVersion'):
    notes.write('This older archive has no car/brake metadata. Re-export with the updated website to add vehicle lights.\n')
notes.write('\n'.join(DATA['warnings']))
scene.frame_set(1)
print('PolyViewer import complete. Save as .blend to keep the editable scene and packed textures.')
