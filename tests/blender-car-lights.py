"""Run with Blender --background --factory-startup --python tests/blender-car-lights.py.
Real Blender integration test; temporary fixture, no edits to an existing .blend.
"""
import bpy
import json
import math
import runpy
import tempfile
from pathlib import Path
from mathutils import Matrix, Vector

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(tempfile.mkdtemp(prefix='polyviewer-lights-'))
BASIS = Matrix.Rotation(math.pi / 2, 4, 'X')
def columns(m):
    return [m[row][col] for col in range(4) for row in range(4)]
def chassis(x, angle=0):
    return Matrix.Translation((x, .65, 0)) @ Matrix.Rotation(angle, 4, 'Z')

# Test against the shipped car model, not a guessed bounding box.
bpy.ops.import_scene.gltf(filepath=str(REPO / 'vendor/polytrack-0.6.2/models/car.glb'))
body = bpy.data.objects['Body']
body.data.calc_loop_triangles()
positions = [c for v in body.data.vertices for c in (BASIS.inverted() @ body.matrix_world @ v.co)]
indices, groups = [], []
for tri in body.data.loop_triangles:
    start = len(indices); indices.extend(tri.vertices)
    groups.append({'start': start, 'end': start+3, 'material': tri.material_index})
materials = {}
slots = []
for index, mat in enumerate(body.data.materials):
    key = str(index); slots.append(key)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    materials[key] = dict(name=mat.name, color=list(bsdf.inputs['Base Color'].default_value[:3]), opacity=1, roughness=.5, metalness=0,
                          emissive=[1, .4, .3] if mat.name == 'BrakeLight' else [0,0,0], emissiveIntensity=1)
materials['unlit'] = dict(color=[1,1,1], opacity=1, roughness=1, metalness=0, unlit=True)
materials['ground'] = dict(color=[.2,.2,.2], opacity=1, roughness=1, metalness=0)
data = dict(version=1, carLightsVersion=1, deltaFrames=True, fps=30, width=640, height=360, frameCount=4,
            startMicroseconds=0, cameraPoints=[], warnings=[], textures={}, materials=materials,
            geometries={'body': dict(position=positions, normal=[0,1,0]*(len(positions)//3), indices=indices, groups=groups),
                        'floor': dict(position=[-20,0,-20,20,0,-20,20,0,20,-20,0,20], indices=[0,2,1,0,3,2], groups=[])})
# Exercise split resource files, which replace the giant monolithic scene JSON.
resource_files = {}
for kind in ('geometries', 'materials', 'textures'):
    resource_files[kind] = {}
    for index, (key, value) in enumerate(data.pop(kind).items()):
        path = Path('resources') / kind / ('%d.json' % index)
        (ROOT/path).parent.mkdir(parents=True, exist_ok=True)
        (ROOT/path).write_text(json.dumps(value))
        resource_files[kind][key] = str(path)
data['resourceFiles'] = resource_files
(ROOT/'scene.json').write_text(json.dumps(data)); (ROOT/'frames').mkdir()
for frame in range(1,5):
    cars = [dict(id='a',name='Car A',matrix=columns(chassis(0, math.pi if frame==2 else 0)),braking=frame==2,opacity=1)]
    if frame != 3:
        cars.append(dict(id='b',name='Car B',matrix=columns(chassis(3)),braking=frame!=2,opacity=.5))
    objects = [dict(id=car['id'], name='Body', geometry='body', materials=slots, matrix=car['matrix']) for car in cars]
    objects.append(dict(id='floor',name='Ground',geometry='floor',materials=['ground'],matrix=columns(Matrix.Identity(4))))
    objects.append(dict(id='unlit',name='Unlit ceiling',geometry='floor',materials=['unlit'],matrix=columns(Matrix.Translation((0,6,0)) @ Matrix.Diagonal((.1,1,.1,1)))))
    snapshot = dict(objects=objects,cars=cars,removed=['b'] if frame==3 else [],lights=[],
                    camera=dict(matrix=columns(Matrix.Translation((4,3,7))),fov=55,near=.05,far=500))
    (ROOT/'frames'/('%06d.json'%(frame-1))).write_text(json.dumps(snapshot))
script = ROOT/'import_scene.py'; script.write_text((REPO/'src/polyviewer/blender/import_scene.py').read_text())
ns = runpy.run_path(str(script)); scene=ns['scene']; rigs=ns['car_rigs']
assert scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value == 0
assert len(rigs)==2
for obj in scene.objects:
    if obj.get('polyviewer_id') in ('a', 'b'):
        assert not any(p.use_smooth for p in obj.data.polygons), 'Car must use flat shading'
        assert not obj.data.has_custom_normals, 'Car must not retain smooth custom normals'
# Check actual distance to the shipped mesh, independently of importer constants.
from mathutils.bvhtree import BVHTree
brake_polygons = [tuple(p.vertices) for p in body.data.polygons if body.data.materials[p.material_index].name == 'BrakeLight']
body_vertices = [BASIS.inverted() @ body.matrix_world @ v.co for v in body.data.vertices]
brake_surface = BVHTree.FromPolygons(body_vertices, brake_polygons)
for rig in rigs.values():
    rear_lens = rig[2][2]
    for vertex in rear_lens.data.vertices:
        location = rear_lens.location + vertex.co
        nearest, normal, _, distance = brake_surface.find_nearest(location)
        assert abs(distance - .001) < 2e-6, ('Rear lens clearance', distance)
        assert (location-nearest).dot(normal) > 0, 'Lens must sit outside the body'
    _, _, _, distance = brake_surface.find_nearest(rig[1][2].location)
    assert abs(distance - .001) < 2e-6, ('Rear lamp clearance', distance)
for rig in rigs.values():
    rear_material = rig[2][2].data.materials[0]
    assert abs(rig[1][2].data.spread - math.radians(120)) < 1e-6
    assert rear_material.node_tree.animation_data is None, 'Rear material must not animate'
assert len([o for o in scene.objects if o.type=='LIGHT'])==6
for frame, brake_a, brake_b, visible_b in [(1,0,150,True),(1.5,0,150,True),(2,300,0,True),(2.5,300,0,True),(3,0,0,False),(4,0,150,True)]:
    scene.frame_set(int(frame), subframe=frame%1)
    assert rigs['a'][1][2].data.energy == brake_a, (frame, 'brake A')
    assert rigs['b'][1][2].data.energy == brake_b, (frame, 'brake B')
    assert all(o.hide_render != visible_b for o in [*rigs['b'][1],*rigs['b'][2]])
scene.frame_set(2)
root,lamps,lenses=rigs['a']
expected=BASIS @ chassis(0,math.pi)
bpy.context.view_layer.update()
for lamp,mount in zip(lamps,(*ns['FRONT_MOUNTS'],ns['REAR_MOUNT'])):
    assert (lamp.matrix_world.translation - expected @ Vector(mount)).length < 1e-5
front_direction=(lamps[0].matrix_world.to_quaternion() @ Vector((0,0,-1))).normalized()
assert front_direction.dot((expected.to_3x3() @ Vector((0,-.035,1))).normalized()) > .99999
rear_direction=(lamps[2].matrix_world.to_quaternion() @ Vector((0,0,-1))).normalized()
assert rear_direction.dot((expected.to_3x3() @ ns['REAR_NORMAL']).normalized()) > .99999
assert all(lamp.data.energy == 1500 for lamp in lamps[:2])
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'verified-car-lights.blend'))
# One-off render checks on the imported scene. Use a small CPU render.
scene.cycles.samples=16
scene.render.dither_intensity=0
scene.render.resolution_x=640; scene.render.resolution_y=360
camera=scene.camera
camera.animation_data_clear();camera.data.animation_data_clear()
def aim(position,target):
    camera.location=position;camera.rotation_mode='QUATERNION'
    camera.rotation_quaternion=(Vector(target)-camera.location).to_track_quat('-Z','Y')
    camera.data.lens=38
    bpy.context.view_layer.update()
def render(name):
    scene.render.filepath=str(ROOT/name)
    bpy.ops.render.render(write_still=True)
aim((4,-6,3),(0,-.2,.5))
# Explicit test fill to inspect where the new mounts sit on the real body.
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.12
render('front.png')
scene.frame_set(4);aim((4,6,2.7),(1,.2,.5));render('rear.png')
# With the lighting collection disabled, there must be no secret world/mesh fill.
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=0
ns['car_lighting'].hide_render=True
render('all-lights-off.png')
image=bpy.data.images.load(str(ROOT/'all-lights-off.png'),check_existing=False)
pixels=list(image.pixels)
assert max(v for i,v in enumerate(pixels) if i%4 != 3) < .001, ('Unexpected hidden illumination', max(pixels[0::4]), max(pixels[1::4]), max(pixels[2::4]))
# Old archive compatibility is explicit: no guessed brake animation.
data.pop('carLightsVersion')
for kind, files in data.pop('resourceFiles').items():
    data[kind] = {key: json.loads((ROOT/path).read_text()) for key, path in files.items()}
(ROOT/'scene.json').write_text(json.dumps(data))
for f in (ROOT/'frames').glob('*.json'):
    snapshot=json.loads(f.read_text());snapshot.pop('cars');f.write_text(json.dumps(snapshot))
legacy=runpy.run_path(str(script))
assert not legacy['car_rigs']
print('POLYVIEWER_LIGHTS_PASS',ROOT)
