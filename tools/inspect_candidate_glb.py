import bpy
import math
import os
from mathutils import Vector


SOURCE = os.environ.get("CANDIDATE_GLB", r"C:\Users\njh\Downloads\chibi armored rider 3d model.glb")
OUTPUT = os.environ.get("CANDIDATE_RENDER_DIR", r"C:\Users\njh\Desktop\academic document\artifacts\candidate-chibi-rider")


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SOURCE)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
corners = []
for obj in meshes:
    corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)

minimum = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
maximum = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
center = (minimum + maximum) * 0.5
size = maximum - minimum
poly_count = sum(len(obj.data.polygons) for obj in meshes)
print(f"BOUNDS min={tuple(round(v, 4) for v in minimum)} max={tuple(round(v, 4) for v in maximum)}")
print(f"SIZE {tuple(round(v, 4) for v in size)} center={tuple(round(v, 4) for v in center)}")
print(f"MESHES {len(meshes)} POLYGONS {poly_count} MATERIALS {len(bpy.data.materials)}")

os.makedirs(OUTPUT, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world.color = (0.65, 0.65, 0.65)

bpy.ops.mesh.primitive_plane_add(size=max(size.x, size.y) * 3, location=(center.x, center.y, minimum.z - 0.01))
ground = bpy.context.object
ground_mat = bpy.data.materials.new("Ground")
ground_mat.diffuse_color = (0.7, 0.7, 0.7, 1)
ground.data.materials.append(ground_mat)

for name, location, energy, size_value in (
    ("Key", center + Vector((-size.x * 1.5, -size.y * 2, size.z * 2)), 1200, 5),
    ("Fill", center + Vector((size.x * 2, size.y, size.z * 1.2)), 700, 4),
):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size_value
    light = bpy.data.objects.new(name, data)
    light.location = location
    bpy.context.collection.objects.link(light)

camera_data = bpy.data.cameras.new("Camera")
camera_data.type = "ORTHO"
camera_data.ortho_scale = max(size.x, size.y, size.z) * 1.25
camera = bpy.data.objects.new("Camera", camera_data)
bpy.context.collection.objects.link(camera)
scene.camera = camera


def aim(location):
    camera.location = location
    camera.rotation_euler = (center - location).to_track_quat("-Z", "Y").to_euler()


distance = max(size.x, size.y, size.z) * 3
views = {
    "front_neg_y": center + Vector((0, -distance, size.z * 0.12)),
    "front_pos_y": center + Vector((0, distance, size.z * 0.12)),
    "right_front": center + Vector((distance * 0.7, -distance * 0.7, size.z * 0.3)),
    "left": center + Vector((-distance, 0, size.z * 0.12)),
}
for name, location in views.items():
    aim(location)
    scene.render.filepath = os.path.join(OUTPUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)
