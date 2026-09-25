"""Run with: blender --background --factory-startup --python scripts/verify-blender-export.py -- /path/to/extracted/archive
Checks every sampled frame after importing into Blender. Raises on mismatch.
"""
import sys
import json
import math
from pathlib import Path
import bpy
from mathutils import Matrix

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
manifest = json.loads((root / 'scene.json').read_text())
importer = root / 'import_scene.py'
exec(compile(importer.read_text(), str(importer), 'exec'), {'__file__': str(importer)})
scene = bpy.context.scene
basis = Matrix.Rotation(math.pi / 2, 4, 'X')
current = {}
count, maximum_error = 0, 0
for frame in range(1, manifest['frameCount'] + 1):
    scene.frame_set(frame)
    data = json.loads((root / 'frames' / ('%06d.json' % (frame - 1))).read_text())
    if not manifest.get('deltaFrames'):
        current = {}
    for key in data.get('removed', []):
        current.pop(key, None)
    for item in data['objects']:
        current[item['id']] = item
    objects = {obj.get('polyviewer_id'): obj for obj in scene.objects if obj.type == 'MESH' and not obj.hide_render}
    assert len(objects) == len(current), ('Visible object count differs', frame)
    for item in current.values():
        expected = basis @ Matrix([item['matrix'][i::4] for i in range(4)])
        obj = objects[item['id']]
        error = max(abs(obj.matrix_world[i][j] - expected[i][j]) for i in range(4) for j in range(4))
        assert error < 0.001, (frame, item['id'], error)
        maximum_error = max(maximum_error, error)
        positions = manifest['geometries'][item['geometry']]['position']
        assert len(obj.data.vertices) * 3 == len(positions)
        for i, vertex in enumerate(obj.data.vertices):
            assert max(abs(vertex.co[j] - positions[i * 3 + j]) for j in range(3)) < 0.001
        count += 1
    expected = basis @ Matrix([data['camera']['matrix'][i::4] for i in range(4)])
    assert max(abs(scene.camera.matrix_world[i][j] - expected[i][j]) for i in range(4) for j in range(4)) < 0.001
    fov = math.degrees(2 * math.atan(scene.camera.data.sensor_height / (2 * scene.camera.data.lens)))
    assert abs(fov - data['camera']['fov']) < 0.0001
print('Validated', count, 'object samples, vertices, visibility and camera FOV; maximum matrix error:', maximum_error)
