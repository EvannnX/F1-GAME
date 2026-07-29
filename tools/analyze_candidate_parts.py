import bpy
from collections import defaultdict
from mathutils import Vector


SOURCE = r"C:\Users\njh\Desktop\academic document\bytedance_hack_fate\src\assets\models\SaberLionCandidate.opt.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SOURCE)
mesh_object = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
mesh = mesh_object.data

parents = list(range(len(mesh.vertices)))


def find(index):
    while parents[index] != index:
        parents[index] = parents[parents[index]]
        index = parents[index]
    return index


def union(left, right):
    left_root = find(left)
    right_root = find(right)
    if left_root != right_root:
        parents[right_root] = left_root


for edge in mesh.edges:
    union(edge.vertices[0], edge.vertices[1])

component_vertices = defaultdict(list)
for vertex in mesh.vertices:
    component_vertices[find(vertex.index)].append(vertex.co)

component_faces = defaultdict(int)
for polygon in mesh.polygons:
    component_faces[find(polygon.vertices[0])] += 1

summaries = []
for root, vertices in component_vertices.items():
    minimum = Vector((min(v.x for v in vertices), min(v.y for v in vertices), min(v.z for v in vertices)))
    maximum = Vector((max(v.x for v in vertices), max(v.y for v in vertices), max(v.z for v in vertices)))
    summaries.append((component_faces[root], len(vertices), minimum, maximum))

summaries.sort(reverse=True, key=lambda item: item[0])
print(f"COMPONENTS {len(summaries)}")
for index, (faces, vertices, minimum, maximum) in enumerate(summaries[:80]):
    if faces < 80:
        break
    print(
        f"PART {index:02d} faces={faces} vertices={vertices} "
        f"min={tuple(round(v, 4) for v in minimum)} max={tuple(round(v, 4) for v in maximum)}"
    )
