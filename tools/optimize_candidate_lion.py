import bpy
import os
from mathutils import Matrix, Vector


SOURCE = r"C:\Users\njh\Downloads\chibi armored rider 3d model.glb"
OUTPUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src", "assets", "models", "SaberLionCandidate.opt.glb"))


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SOURCE)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if len(meshes) != 1:
    raise RuntimeError(f"Expected one mesh, found {len(meshes)}")

mesh = meshes[0]
print(f"INPUT vertices={len(mesh.data.vertices)} polygons={len(mesh.data.polygons)}")
for image in bpy.data.images:
    print(f"IMAGE {image.name} {image.size[0]}x{image.size[1]}")
    if image.size[0] > 2048 or image.size[1] > 2048:
        image.scale(2048, 2048)
        image.update()
        print(f"IMAGE_RESIZED {image.name} 2048x2048")

# Preserve silhouette and textured details while reducing the generated dense surface.
decimate = mesh.modifiers.new("Mobile H5 decimation", "DECIMATE")
decimate.decimate_type = "COLLAPSE"
decimate.ratio = 0.16
decimate.use_collapse_triangulate = True
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.modifier_apply(modifier=decimate.name)

for polygon in mesh.data.polygons:
    polygon.use_smooth = True

mesh.name = "SaberLionComplete"
mesh.data.name = "SaberLionCompleteMesh"
print(f"OUTPUT vertices={len(mesh.data.vertices)} polygons={len(mesh.data.polygons)}")

# Split disconnected geometry islands, then regroup low wheel islands by position.
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
parts = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]


def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector((min(v.x for v in points), min(v.y for v in points), min(v.z for v in points))),
        Vector((max(v.x for v in points), max(v.y for v in points), max(v.z for v in points))),
    )


wheel_parts = {"LF": [], "RF": [], "LR": [], "RR": []}
body_parts = []
for part in parts:
    minimum, maximum = bounds(part)
    side = "L" if maximum.x < -0.07 else "R" if minimum.x > 0.07 else None
    axle = "F" if maximum.y < -0.07 else "R" if minimum.y > 0.07 else None
    is_low_wheel_island = minimum.z < 0.012 and maximum.z < 0.195
    if side and axle and is_low_wheel_island:
        wheel_parts[f"{side}{axle}"].append(part)
    else:
        body_parts.append(part)


def join_objects(objects, name):
    if not objects:
        raise RuntimeError(f"No geometry found for {name}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    result = bpy.context.view_layer.objects.active
    result.name = name
    result.data.name = f"{name}Mesh"
    return result


body = join_objects(body_parts, "SaberLionBody")
wheels = {
    key: join_objects(group, f"LionWheel{key}_VISIBLE")
    for key, group in wheel_parts.items()
}
print("WHEEL_PARTS " + " ".join(f"{key}={len(group)}" for key, group in wheel_parts.items()))

root = bpy.data.objects.new("SaberLionRoot", None)
bpy.context.collection.objects.link(root)
body.parent = root

for key, wheel in wheels.items():
    bpy.ops.object.select_all(action="DESELECT")
    wheel.select_set(True)
    bpy.context.view_layer.objects.active = wheel
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    wheel_world = wheel.matrix_world.copy()
    pivot = wheel.matrix_world.translation.copy()

    steer = bpy.data.objects.new(f"LionWheel{key}_STEER", None)
    spin = bpy.data.objects.new(f"LionWheel{key}_SPIN", None)
    bpy.context.collection.objects.link(steer)
    bpy.context.collection.objects.link(spin)
    steer.matrix_world = Matrix.Translation(pivot)
    steer.parent = root
    spin.parent = steer
    spin.matrix_world = Matrix.Translation(pivot)
    wheel.parent = spin
    wheel.matrix_world = wheel_world

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for child in root.children_recursive:
    child.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_materials="EXPORT",
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=9,
)
print(f"OUTPUT_FILE {OUTPUT}")
