import bpy
import math
import os
import sys
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUTPUT = os.path.join(ROOT, 'src', 'assets', 'models', 'SaberLion.glb')
RENDER_DIR = os.path.join(ROOT, 'artifacts', 'saber_lion_turntable')


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def mat(name, color, roughness=0.55, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return m


def softly_emissive_mat(name, color, roughness=0.55, emission_strength=0.18):
    m = mat(name, color, roughness)
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    emission_color = bsdf.inputs.get('Emission Color')
    emission_strength_input = bsdf.inputs.get('Emission Strength')
    if emission_color is not None:
        emission_color.default_value = (*color, 1)
    if emission_strength_input is not None:
        emission_strength_input.default_value = emission_strength
    return m


M = {}


def smooth(obj):
    if obj.type == 'MESH':
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def assign(obj, material):
    obj.data.materials.append(material)
    return obj


def uv(name, loc, scale, material, segments=48, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(smooth(obj), material)
    return obj


def ico(name, loc, scale, material, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    return obj


def rounded_cube(name, loc, scale, material, bevel=0.12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Soft molded edges', 'BEVEL')
    mod.width = bevel
    mod.segments = 4
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    assign(smooth(obj), material)
    return obj


def tapered_panel(name, loc, width_top, width_bottom, height, depth, material, bevel=0.025, rotation=(0, 0, 0)):
    wt, wb, h, d = width_top / 2, width_bottom / 2, height / 2, depth / 2
    verts = [
        (-wb, -d, -h), (wb, -d, -h), (-wt, -d, h), (wt, -d, h),
        (-wb, d, -h), (wb, d, -h), (-wt, d, h), (wt, d, h),
    ]
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
        (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rotation
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    mod = obj.modifiers.new('Soft panel edge', 'BEVEL')
    mod.width = bevel
    mod.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cylinder(name, loc, radius, depth, material, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(smooth(obj), material)
    bevel = obj.modifiers.new('Rounded rim', 'BEVEL')
    bevel.width = min(radius * 0.12, depth * 0.16)
    bevel.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def cone(name, loc, radius1, radius2, depth, material, rotation=(0, 0, 0), vertices=32):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=loc,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    assign(smooth(obj), material)
    return obj


def pointed_clump(name, loc, radius, length, direction, material):
    obj = cone(name, loc, 0.025, radius, length, material, vertices=32)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    return obj


def curve(name, points, bevel, material, cyclic=False):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 3
    data.bevel_depth = bevel
    data.bevel_resolution = 3
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    return obj


def flat_polygon(name, points_xz, y, material):
    """Create a zero-thickness X/Z decal that sits flush against the face."""
    verts = [(x, y, z) for x, z in points_xz]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [tuple(range(len(verts)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    return obj


def parent(child, root):
    child.parent = root
    return child


def empty(name, loc):
    obj = bpy.data.objects.new(name, None)
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    return obj


def build_wheel(name, x, y, steerable):
    steer = empty(f'{name}_STEER', (x, y, 0.47))
    spin = empty(f'{name}_SPIN', (0, 0, 0))
    parent(spin, steer)
    tire = cylinder(f'{name}_TIRE', (0, 0, 0), 0.37, 0.34, M['tire'], rotation=(0, math.pi / 2, 0))
    rim = cylinder(f'{name}_RIM', (0, 0, 0), 0.21, 0.355, M['rim'], rotation=(0, math.pi / 2, 0))
    hub = cylinder(f'{name}_HUB', (0, 0, 0), 0.09, 0.37, M['dark_orange'], rotation=(0, math.pi / 2, 0))
    parent(tire, spin)
    parent(rim, spin)
    parent(hub, spin)
    steer['steerable'] = steerable
    return steer


def build_lion(root):
    uv('LionBody', (0, 0.12, 0.95), (1.18, 1.54, 0.72), M['orange'])
    rounded_cube('FlatUnderside', (0, 0.18, 0.38), (1.0, 1.18, 0.13), M['dark_orange'], 0.09)

    for side in (-1, 1):
        for y in (-0.82, 0.88):
            paw = rounded_cube(
                f'Paw_{side}_{y}',
                (side * 0.93, y, 0.57),
                (0.4, 0.48, 0.36),
                M['light_orange'],
                0.25,
            )
            parent(paw, root)

    head = empty('LionHead', (0, -1.55, 1.19))
    parent(head, root)
    face = uv('LionFace', (0, -0.18, 0), (0.91, 0.62, 0.79), M['light_orange'])
    parent(face, head)

    mane_base = uv('ManeBase', (0, 0.10, 0), (1.08, 0.34, 0.92), M['mane'], 48, 32)
    parent(mane_base, head)
    for i in range(18):
        angle = math.tau * i / 18
        tip = pointed_clump(
            f'ManeTip_{i:02d}',
            (math.cos(angle) * 1.10, 0.02, math.sin(angle) * 0.92),
            0.25 if i % 2 else 0.22,
            0.43 if i % 2 else 0.37,
            (math.cos(angle), 0, math.sin(angle)),
            M['mane'] if i % 2 else M['mane_light'],
        )
        parent(tip, head)

    for side in (-1, 1):
        ear = cone(
            f'LionEar_{side}',
            (side * 0.72, -0.12, 0.58),
            0.15,
            0.06,
            0.28,
            M['orange'],
            rotation=(0, side * 0.18, 0),
        )
        parent(ear, head)
        eye = tapered_panel(
            f'LionEye_{side}',
            (side * 0.34, -0.735, 0.16),
            0.27,
            0.18,
            0.39,
            0.07,
            M['black'],
            0.035,
            rotation=(0, side * 0.03, side * 0.05),
        )
        parent(eye, head)
        brow = rounded_cube(
            f'LionBrow_{side}',
            (side * 0.34, -0.77, 0.4),
            (0.19, 0.024, 0.035),
            M['mane'],
            0.025,
            rotation=(0, 0, side * 0.12),
        )
        parent(brow, head)
        cheek = uv(f'Muzzle_{side}', (side * 0.22, -0.75, -0.2), (0.34, 0.18, 0.23), M['muzzle'], 32, 20)
        parent(cheek, head)

    nose = cone('LionNose', (0, -0.91, -0.08), 0.2, 0.1, 0.18, M['nose'], rotation=(math.pi / 2, 0, 0), vertices=3)
    parent(nose, head)
    mouth = curve('LionMouth', [(-0.29, -0.948, -0.33), (0, -0.97, -0.39), (0.29, -0.948, -0.33)], 0.015, M['nose'])
    parent(mouth, head)
    for side in (-1, 1):
        fang = cone(f'Fang_{side}', (side * 0.25, -0.955, -0.39), 0.055, 0, 0.15, M['ivory'])
        parent(fang, head)
        for row in range(3):
            whisker = curve(
                f'Whisker_{side}_{row}',
                [
                    (side * 0.29, -0.94, -0.22 - row * 0.09),
                    (side * 0.51, -0.98, -0.19 - row * 0.07),
                    (side * 0.72, -0.94, -0.14 - row * 0.04),
                ],
                0.009,
                M['nose'],
            )
            parent(whisker, head)

    tail = curve('LionTail', [(0, 1.48, 0.92), (0, 1.62, 0.63), (0, 1.61, 0.34)], 0.07, M['dark_orange'])
    parent(tail, root)
    tuft = uv('TailTuft', (0, 1.62, 0.27), (0.17, 0.13, 0.24), M['mane'], 28, 20)
    parent(tuft, root)
    rear_seam = curve('RearBodySeam', [(0, 1.645, 0.47), (0, 1.665, 0.88), (0, 1.64, 1.25)], 0.012, M['dark_orange'])
    parent(rear_seam, root)
    for side in (-1, 1):
        for index, z in enumerate((0.72, 0.87, 1.02)):
            panel = rounded_cube(
                f'RearPanel_{side}_{index}',
                (side * (0.12 + index * 0.025), 1.655, z),
                (0.095, 0.012, 0.018),
                M['dark_orange'],
                0.012,
            )
            parent(panel, root)

    wheels = [
        build_wheel('LionWheelLF', -1.02, -0.83, True),
        build_wheel('LionWheelRF', 1.02, -0.83, True),
        build_wheel('LionWheelLR', -1.02, 0.93, False),
        build_wheel('LionWheelRR', 1.02, 0.93, False),
    ]
    for wheel in wheels:
        parent(wheel, root)


def build_hair_clump(name, loc, radius, length, tilt=0.0):
    obj = cone(name, loc, 0.018, radius, length, M['hair_light'], rotation=(0, 0, tilt), vertices=32)
    obj.scale.y = 0.34
    return obj


def smooth_hair_lock(name, loc, width, height, tilt=0.0, depth_scale=0.42):
    ring_count = 22
    side_count = 32
    verts = []
    for ring in range(ring_count):
        t = ring / (ring_count - 1)
        z = height * (0.5 - t)
        # Broad root, a softly swollen upper third, then a continuous pointed taper.
        profile = (1.0 - t) ** 0.68 * (0.76 + 0.24 * math.sin(math.pi * t))
        radius_x = max(0.004, width * 0.5 * profile)
        radius_y = max(0.003, width * depth_scale * profile)
        center_y = -width * 0.85 * math.sin(t * math.pi / 2)
        for side_index in range(side_count):
            angle = math.tau * side_index / side_count
            verts.append((
                radius_x * math.cos(angle),
                center_y + radius_y * math.sin(angle),
                z,
            ))
    faces = []
    for ring in range(ring_count - 1):
        start = ring * side_count
        next_start = (ring + 1) * side_count
        for side_index in range(side_count):
            next_side = (side_index + 1) % side_count
            faces.append((start + side_index, start + next_side, next_start + next_side, next_start + side_index))
    faces.append(tuple(reversed(range(side_count))))
    last_start = (ring_count - 1) * side_count
    faces.append(tuple(last_start + i for i in range(side_count)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler[2] = tilt
    bpy.context.collection.objects.link(obj)
    assign(smooth(obj), M['hair'])
    return obj


def fringe_plate(name, x, z, width, height, tilt=0.0, front=-0.405):
    """A flattened, pointed anime hair lock with a clean illustrated silhouette."""
    lock = tapered_panel(
        name,
        (x, front, z),
        width,
        width * 0.22,
        height,
        0.075,
        M['hair_light'],
        0.022,
        rotation=(0, 0, tilt),
    )
    return lock


def build_driver(root):
    driver = empty('SaberDriver', (0, 0.02, 1.54))
    parent(driver, root)

    # Skirt and the white ruffle sit over the lion body rather than inside it.
    skirt_radius = 1.22
    skirt = cone('BlueSkirt', (0, 0.25, 0.08), skirt_radius, 0.50, 0.68, M['blue'], vertices=64)
    skirt.scale.y = 1.04
    parent(skirt, driver)
    gold_trim = cylinder('GoldSkirtTrim', (0, 0.28, -0.255), skirt_radius + 0.012, 0.035, M['gold'], vertices=64)
    gold_trim.scale.y = 1.04
    parent(gold_trim, driver)
    ruffle = cylinder('WhiteSkirtHem', (0, 0.28, -0.28), skirt_radius + 0.025, 0.10, M['ivory'], vertices=64)
    ruffle.scale.y = 1.04
    parent(ruffle, driver)
    for i in range(16):
        angle = math.tau * i / 16
        x, y = math.cos(angle) * skirt_radius, 0.28 + math.sin(angle) * skirt_radius * 1.04
        point = cone(f'Ruffle_{i:02d}', (x, y, -0.36), 0.02, 0.105, 0.18, M['ivory'], vertices=24)
        parent(point, driver)

    torso = uv('TorsoBlue', (0, -0.12, 0.43), (0.42, 0.31, 0.5), M['blue'], 40, 26)
    parent(torso, driver)
    chest = tapered_panel('ChestArmor', (0, -0.405, 0.48), 0.46, 0.55, 0.44, 0.085, M['silver'], 0.065)
    parent(chest, driver)
    for side in (-1, 1):
        seam = curve(
            f'ChestSeam_{side}',
            [
                (side * 0.19, -0.462, 0.65),
                (side * 0.08, -0.468, 0.50),
                (side * 0.18, -0.462, 0.30),
            ],
            0.012,
            M['armor_dark'],
        )
        parent(seam, driver)
        cross = curve(
            f'ChestCross_{side}',
            [
                (side * 0.19, -0.464, 0.61),
                (side * 0.05, -0.470, 0.47),
                (side * 0.15, -0.464, 0.34),
            ],
            0.008,
            M['armor_dark'],
        )
        parent(cross, driver)
    belt = rounded_cube('WaistBelt', (0, -0.24, 0.08), (0.48, 0.22, 0.07), M['silver'], 0.045)
    parent(belt, driver)

    # Smooth vinyl-figure head; facial colour layers sit almost flush on its curved surface.
    head = uv('SaberHead', (0, -0.08, 1.21), (0.405, 0.31, 0.405), M['skin_flat'], 72, 48)
    parent(head, driver)
    hair_cap = uv('HairCap', (0, 0.06, 1.35), (0.52, 0.37, 0.49), M['hair'], 72, 48)
    parent(hair_cap, driver)
    for side in (-1, 1):
        crown_line = curve(
            f'CrownPart_{side}',
            [
                (side * 0.035, -0.407, 1.74),
                (side * 0.15, -0.425, 1.67),
                (side * 0.27, -0.42, 1.58),
            ],
            0.005,
            M['hair_dark'],
        )
        parent(crown_line, driver)
    for side in (-1, 1):
        side_hair = uv(
            f'SideHair_{side}',
            (side * 0.385, -0.18, 1.18),
            (0.14, 0.18, 0.31),
            M['hair'],
            40,
            26,
        )
        parent(side_hair, driver)
        side_outline = curve(
            f'SideHairOutline_{side}',
            [
                (side * 0.425, -0.36, 1.37),
                (side * 0.44, -0.37, 1.15),
                (side * 0.40, -0.36, 0.96),
            ],
            0.005,
            M['hair_dark'],
        )
        parent(side_outline, driver)
        shoulder = uv(f'BlueShoulder_{side}', (side * 0.38, -0.08, 0.65), (0.17, 0.18, 0.17), M['blue'], 40, 24)
        parent(shoulder, driver)

    # Overlapping, rounded 3D fringe locks reproduce the smooth figure-reference hair.
    fringe = [
        (-0.275, 1.43, 0.23, 0.35, 0.15),
        (-0.145, 1.405, 0.22, 0.41, 0.07),
        (-0.005, 1.39, 0.23, 0.46, 0.0),
        (0.14, 1.41, 0.22, 0.40, -0.07),
        (0.275, 1.435, 0.23, 0.34, -0.15),
    ]
    for i, (x, z, width, height, tilt) in enumerate(fringe):
        lock = smooth_hair_lock(
            f'FringeLock_{i}',
            (x, -0.22, z),
            width,
            height,
            tilt,
            0.38,
        )
        parent(lock, driver)

    # Rounded face-framing locks sit in front of the voluminous side hair.
    for side in (-1, 1):
        side_lock = smooth_hair_lock(
            f'FaceFramingLock_{side}',
            (side * 0.35, -0.24, 1.18),
            0.21,
            0.55,
            -side * 0.035,
            0.48,
        )
        parent(side_lock, driver)

    # Eyes are layered decals separated by fractions of a millimetre, not solid geometry.
    outer_eye = [
        (0.073 * math.cos(math.tau * i / 20), 0.130 * math.sin(math.tau * i / 20))
        for i in range(20)
    ]
    inner_eye = [
        (0.054 * math.cos(math.tau * i / 20), 0.104 * math.sin(math.tau * i / 20))
        for i in range(20)
    ]
    for side in (-1, 1):
        cx, cz = side * 0.17, 1.16
        def mirror(points):
            return [(cx + side * x, cz + z) for x, z in points]
        eye_outline = flat_polygon(f'EyeOutline_{side}', mirror(outer_eye), -0.395, M['eye_dark'])
        parent(eye_outline, driver)
        iris = flat_polygon(f'Iris_{side}', mirror(inner_eye), -0.396, M['teal'])
        parent(iris, driver)
        upper_shade = flat_polygon(
            f'EyeUpperShade_{side}',
            mirror([(-0.050, 0.071), (0.028, 0.082), (0.052, 0.050), (0.044, 0.025), (-0.047, 0.028)]),
            -0.397,
            M['teal_dark'],
        )
        parent(upper_shade, driver)
        pupil = flat_polygon(
            f'Pupil_{side}',
            mirror([(-0.013, 0.052), (0.012, 0.052), (0.014, -0.058), (-0.012, -0.058)]),
            -0.398,
            M['eye_dark'],
        )
        parent(pupil, driver)
        highlight = flat_polygon(
            f'EyeHighlight_{side}',
            mirror([(-0.026, 0.044), (-0.012, 0.048), (-0.010, 0.030), (-0.024, 0.027)]),
            -0.399,
            M['white'],
        )
        parent(highlight, driver)
        eyebrow = flat_polygon(
            f'Eyebrow_{side}',
            [
                (side * 0.075, 1.305), (side * 0.255, 1.35),
                (side * 0.25, 1.325), (side * 0.078, 1.282),
            ],
            -0.400,
            M['eye_dark'],
        )
        parent(eyebrow, driver)

    nose_points = [
        (0.009 * math.cos(math.tau * i / 12), 1.035 + 0.010 * math.sin(math.tau * i / 12))
        for i in range(12)
    ]
    nose_dot = flat_polygon('SaberNoseDot', nose_points, -0.395, M['nose_soft'])
    parent(nose_dot, driver)
    mouth = flat_polygon(
        'SaberMouth',
        [(-0.030, 0.958), (0.030, 0.958), (0.027, 0.951), (-0.027, 0.951)],
        -0.395,
        M['eye_dark'],
    )
    parent(mouth, driver)

    # Braided bun: central coil plus two rings of interlocking braid segments.
    bun = uv('HairBun', (0, 0.39, 1.4), (0.32, 0.23, 0.32), M['hair'], 40, 28)
    parent(bun, driver)
    for ring, count, radius in ((0, 7, 0.14), (1, 12, 0.27)):
        for i in range(count):
            angle = math.tau * i / count + ring * 0.1
            braid = uv(
                f'Braid_{ring}_{i:02d}',
                (math.cos(angle) * radius, 0.59, 1.4 + math.sin(angle) * radius),
                (0.085, 0.06, 0.105),
                M['hair_light'],
                24,
                16,
            )
            braid.rotation_euler[1] = angle
            parent(braid, driver)

    ahoge = curve(
        'Ahoge',
        [(0.02, -0.03, 1.75), (0.03, -0.08, 1.99), (-0.11, -0.12, 2.12), (-0.23, -0.13, 2.02)],
        0.025,
        M['hair'],
    )
    parent(ahoge, driver)

    for side in (-1, 1):
        upper = uv(f'UpperArm_{side}', (side * 0.45, -0.16, 0.49), (0.12, 0.12, 0.25), M['blue'], 36, 22)
        parent(upper, driver)
        side_armor = tapered_panel(
            f'WaistArmor_{side}',
            (side * 0.39, -0.31, 0.22),
            0.18,
            0.24,
            0.34,
            0.075,
            M['silver'],
            0.035,
            rotation=(0, 0, -side * 0.08),
        )
        parent(side_armor, driver)
        forearm_root = empty(f'Gauntlet_{side}', (side * 0.49, -0.35, 0.42))
        forearm_root.rotation_euler = (math.radians(12), 0, side * math.radians(4))
        parent(forearm_root, driver)
        for segment in range(4):
            plate = cylinder(
                f'GauntletPlate_{side}_{segment}',
                (0, 0, -segment * 0.11),
                0.13 - segment * 0.006,
                0.10,
                M['silver'] if segment % 2 == 0 else M['armor_light'],
                vertices=24,
            )
            parent(plate, forearm_root)
        hand = uv(f'Glove_{side}', (side * 0.49, -0.30, 0.03), (0.12, 0.11, 0.10), M['armor_dark'], 32, 20)
        parent(hand, driver)

    # Blue bow, visible in the rear reference.
    knot = uv('BowKnot', (0, 0.61, 1.06), (0.13, 0.07, 0.13), M['blue_dark'], 28, 18)
    parent(knot, driver)
    for side in (-1, 1):
        loop = tapered_panel(
            f'BowLoop_{side}',
            (side * 0.25, 0.60, 1.07),
            0.30,
            0.12,
            0.46,
            0.08,
            M['blue_dark'],
            0.065,
            rotation=(0, 0, -side * math.pi / 2),
        )
        parent(loop, driver)
        ribbon = tapered_panel(
            f'BowRibbon_{side}',
            (side * 0.17, 0.61, 0.78),
            0.14,
            0.23,
            0.48,
            0.07,
            M['blue_dark'],
            0.04,
            rotation=(0, 0, side * 0.16),
        )
        parent(ribbon, driver)
    back_armor = tapered_panel('BackArmor', (0, 0.35, 0.48), 0.63, 0.52, 0.64, 0.09, M['silver'], 0.06)
    parent(back_armor, driver)
    back_center = rounded_cube('BackArmorCenter', (0, 0.405, 0.48), (0.012, 0.012, 0.27), M['armor_dark'], 0.007)
    parent(back_center, driver)
    for side in (-1, 1):
        back_seam = curve(
            f'BackArmorSeam_{side}',
            [
                (side * 0.25, 0.408, 0.70),
                (side * 0.11, 0.414, 0.50),
                (side * 0.23, 0.408, 0.24),
            ],
            0.009,
            M['armor_dark'],
        )
        parent(back_seam, driver)


def setup_materials():
    M.update({
        'orange': mat('Lion orange', (1.0, 0.25, 0.008), 0.48),
        'light_orange': mat('Lion face gold', (1.0, 0.3, 0.008), 0.5),
        'dark_orange': mat('Lion shadow orange', (0.58, 0.09, 0.006), 0.62),
        'mane': mat('Mane brown', (0.18, 0.025, 0.004), 0.72),
        'mane_light': mat('Mane highlight', (0.3, 0.065, 0.006), 0.68),
        'muzzle': mat('Muzzle gold', (1.0, 0.62, 0.12), 0.5),
        'nose': mat('Nose and line', (0.055, 0.035, 0.025), 0.7),
        'black': mat('Lion eyes', (0.025, 0.023, 0.02), 0.6),
        'tire': mat('Tire rubber', (0.018, 0.018, 0.022), 0.86),
        'rim': mat('Wheel hub orange', (0.58, 0.27, 0.05), 0.48, 0.08),
        'ivory': mat('Ruffle and fangs', (0.96, 0.92, 0.82), 0.5),
        'gold': mat('Dress gold trim', (0.85, 0.43, 0.045), 0.36, 0.18),
        'skin': mat('Saber skin', (1.0, 0.8, 0.71), 0.55),
        'skin_flat': softly_emissive_mat('Saber illustrated face', (1.0, 0.72, 0.58), 0.62, 0.22),
        'hair': mat('Saber blonde', (0.90, 0.50, 0.10), 0.42),
        'hair_light': mat('Saber hair light', (1.0, 0.72, 0.28), 0.38),
        'hair_dark': mat('Saber hair line', (0.3, 0.18, 0.06), 0.6),
        'blue': mat('Saber dress blue', (0.008, 0.07, 0.36), 0.6),
        'blue_dark': mat('Saber ribbon navy', (0.004, 0.025, 0.18), 0.62),
        'silver': mat('Saber armor', (0.66, 0.69, 0.7), 0.4, 0.38),
        'armor_light': mat('Armor highlight', (0.84, 0.86, 0.86), 0.38, 0.32),
        'armor_dark': mat('Armor seams', (0.21, 0.23, 0.24), 0.38, 0.5),
        'eye_dark': mat('Anime eye outline', (0.025, 0.04, 0.035), 0.4),
        'teal': softly_emissive_mat('Saber teal iris', (0.002, 0.34, 0.22), 0.42, 0.16),
        'teal_dark': mat('Saber iris upper shade', (0.002, 0.085, 0.060), 0.42),
        'nose_soft': mat('Saber tiny nose', (0.42, 0.055, 0.035), 0.5),
        'white': mat('Eye highlight', (1.0, 1.0, 0.98), 0.24),
    })


def point_camera(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def render_views(root):
    os.makedirs(RENDER_DIR, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world.color = (0.68, 0.68, 0.68)

    ground = cylinder('PreviewGround', (0, 0, -0.04), 4.5, 0.08, mat('Preview ground', (0.67, 0.67, 0.67), 0.82), vertices=96)
    key_data = bpy.data.lights.new('Key', 'AREA')
    key_data.energy = 1050
    key_data.shape = 'DISK'
    key_data.size = 5
    key = bpy.data.objects.new('Key', key_data)
    key.location = (-4, -5, 8)
    bpy.context.collection.objects.link(key)
    fill_data = bpy.data.lights.new('Fill', 'AREA')
    fill_data.energy = 700
    fill_data.size = 4
    fill = bpy.data.objects.new('Fill', fill_data)
    fill.location = (5, 1, 5)
    bpy.context.collection.objects.link(fill)

    camera_data = bpy.data.cameras.new('TurntableCamera')
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 5.6
    camera = bpy.data.objects.new('TurntableCamera', camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    views = {
        'front': (0, -7.5, 2.2),
        'left': (-7.5, 0, 2.2),
        'rear': (0, 7.5, 2.2),
        'right_front': (5.2, -5.2, 2.8),
        'right_rear': (5.2, 5.2, 2.8),
        'top': (0, 0, 9),
        'bottom': (0, 0, -7),
    }
    for name, location in views.items():
        ground.hide_render = name == 'bottom'
        camera.location = location
        point_camera(camera, (0, 0, 1.0 if name != 'bottom' else 0.7))
        scene.render.filepath = os.path.join(RENDER_DIR, f'{name}.png')
        bpy.ops.render.render(write_still=True)
    ground.hide_render = True
    camera.data.ortho_scale = 1.45
    camera.location = (0, -7.5, 2.78)
    point_camera(camera, (0, 0, 2.78))
    scene.render.filepath = os.path.join(RENDER_DIR, 'face_closeup.png')
    bpy.ops.render.render(write_still=True)
    ground.hide_render = True


def export_glb(root):
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
    )


def main():
    clear_scene()
    setup_materials()
    root = empty('SaberLionRoot', (0, 0, 0))
    build_lion(root)
    build_driver(root)
    render_views(root)
    export_glb(root)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'artifacts', 'SaberLion.blend'))
    print(f'GLB: {OUTPUT}')
    print(f'Renders: {RENDER_DIR}')


if __name__ == '__main__':
    main()
