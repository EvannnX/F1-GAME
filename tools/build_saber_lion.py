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

    for i in range(22):
        angle = math.tau * i / 22
        x = math.cos(angle) * 0.93
        z = math.sin(angle) * 0.76
        clump = ico(
            f'ManeClump_{i:02d}',
            (x, 0.05, z),
            (0.33 + 0.05 * (i % 2), 0.27, 0.27),
            M['mane'] if i % 2 else M['mane_light'],
            2,
        )
        clump.rotation_euler[1] = angle
        parent(clump, head)
        tip = pointed_clump(
            f'ManeTip_{i:02d}',
            (math.cos(angle) * 1.11, 0.04, math.sin(angle) * 0.91),
            0.2,
            0.32,
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


def build_driver(root):
    driver = empty('SaberDriver', (0, 0.02, 1.54))
    parent(driver, root)

    # Skirt and the white ruffle sit over the lion body rather than inside it.
    skirt = cone('BlueSkirt', (0, 0.25, -0.03), 1.31, 0.52, 0.68, M['blue'], vertices=64)
    skirt.scale.y = 1.05
    parent(skirt, driver)
    ruffle = cylinder('WhiteSkirtHem', (0, 0.28, -0.39), 1.32, 0.11, M['ivory'], vertices=64)
    ruffle.scale.y = 1.05
    parent(ruffle, driver)
    for i in range(18):
        angle = math.tau * i / 18
        x, y = math.cos(angle) * 1.31, 0.28 + math.sin(angle) * 1.31
        point = cone(f'Ruffle_{i:02d}', (x, y, -0.47), 0.02, 0.105, 0.18, M['ivory'], vertices=24)
        parent(point, driver)

    torso = uv('TorsoBlue', (0, -0.12, 0.43), (0.42, 0.31, 0.5), M['blue'], 40, 26)
    parent(torso, driver)
    chest = cone('ChestArmor', (0, -0.43, 0.45), 0.36, 0.29, 0.56, M['silver'], vertices=48)
    chest.scale.y = 0.26
    parent(chest, driver)
    center_seam = rounded_cube('ChestCenterSeam', (0, -0.528, 0.45), (0.018, 0.012, 0.25), M['armor_dark'], 0.01)
    parent(center_seam, driver)
    for side in (-1, 1):
        seam = rounded_cube(
            f'ChestSeam_{side}',
            (side * 0.13, -0.522, 0.47),
            (0.018, 0.015, 0.27),
            M['armor_dark'],
            0.01,
            rotation=(0, side * 0.2, side * 0.45),
        )
        parent(seam, driver)
    belt = rounded_cube('WaistBelt', (0, -0.24, 0.08), (0.48, 0.22, 0.07), M['silver'], 0.045)
    parent(belt, driver)

    # Head uses a softened anime proportion and a shallow face plane.
    head = rounded_cube('SaberHead', (0, -0.08, 1.2), (0.41, 0.36, 0.43), M['skin'], 0.2)
    parent(head, driver)
    hair_cap = uv('HairCap', (0, -0.005, 1.32), (0.55, 0.48, 0.51), M['hair'], 56, 36)
    parent(hair_cap, driver)
    forehead_hair = uv('ForeheadHair', (0, -0.425, 1.48), (0.43, 0.055, 0.22), M['hair'], 48, 24)
    parent(forehead_hair, driver)
    for side in (-1, 1):
        side_hair = cone(f'SideHair_{side}', (side * 0.4, -0.1, 1.08), 0.1, 0.17, 0.58, M['hair'], vertices=40)
        side_hair.scale.y = 0.72
        parent(side_hair, driver)
        shoulder = uv(f'BlueShoulder_{side}', (side * 0.43, -0.08, 0.66), (0.22, 0.23, 0.22), M['blue'], 32, 20)
        parent(shoulder, driver)

    # Seven individually shaped fringe locks reproduce the reference silhouette.
    fringe = [
        (-0.31, 1.25, 0.18), (-0.21, 1.23, 0.11), (-0.105, 1.21, 0.05),
        (0.0, 1.2, 0.0), (0.105, 1.21, -0.05), (0.21, 1.23, -0.11), (0.31, 1.25, -0.18),
    ]
    for i, (x, z, tilt) in enumerate(fringe):
        lock = build_hair_clump(
            f'Fringe_{i}',
            (x, -0.43, z),
            0.12 if i in (0, 6) else 0.105,
            0.47 - abs(x) * 0.25,
            tilt,
        )
        parent(lock, driver)
    for i, x in enumerate((-0.265, -0.16, -0.053, 0.053, 0.16, 0.265)):
        lean = (i - 2.5) * 0.012
        divider = curve(
            f'FringeDivider_{i}',
            [(x, -0.495, 1.45), (x + lean, -0.5, 1.36), (x + lean * 1.45, -0.496, 1.27)],
            0.0045,
            M['hair_dark'],
        )
        parent(divider, driver)

    for side in (-1, 1):
        sclera = rounded_cube(
            f'EyeWhite_{side}',
            (side * 0.17, -0.452, 1.15),
            (0.078, 0.011, 0.095),
            M['white'],
            0.06,
        )
        parent(sclera, driver)
        iris = rounded_cube(
            f'Iris_{side}',
            (side * 0.17, -0.478, 1.14),
            (0.062, 0.009, 0.087),
            M['teal'],
            0.05,
        )
        parent(iris, driver)
        pupil = rounded_cube(
            f'Pupil_{side}',
            (side * 0.17, -0.49, 1.13),
            (0.021, 0.008, 0.068),
            M['eye_dark'],
            0.02,
        )
        parent(pupil, driver)
        highlight = uv(f'EyeHighlight_{side}', (side * 0.145, -0.5, 1.2), (0.02, 0.009, 0.03), M['white'], 20, 12)
        parent(highlight, driver)
        upper_lash = curve(
            f'UpperLash_{side}',
            [
                (side * 0.27, -0.505, 1.285),
                (side * 0.17, -0.512, 1.27),
                (side * 0.07, -0.505, 1.245),
            ],
            0.014,
            M['eye_dark'],
        )
        parent(upper_lash, driver)
        outer_x = side * 0.265
        outer_lash = curve(
            f'OuterLash_{side}',
            [(outer_x, -0.506, 1.275), (outer_x + side * 0.008, -0.51, 1.18), (outer_x - side * 0.006, -0.506, 1.08)],
            0.011,
            M['eye_dark'],
        )
        parent(outer_lash, driver)
        lower_lash = curve(
            f'LowerLash_{side}',
            [(side * 0.255, -0.505, 1.075), (side * 0.17, -0.51, 1.055), (side * 0.09, -0.505, 1.075)],
            0.007,
            M['eye_dark'],
        )
        parent(lower_lash, driver)
        eyebrow = curve(
            f'Eyebrow_{side}',
            [(side * 0.26, -0.485, 1.37), (side * 0.17, -0.491, 1.345), (side * 0.08, -0.485, 1.31)],
            0.012,
            M['hair_dark'],
        )
        parent(eyebrow, driver)

    mouth = curve('SaberMouth', [(-0.047, -0.486, 0.99), (0, -0.49, 0.988), (0.047, -0.486, 0.99)], 0.007, M['eye_dark'])
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
        upper = uv(f'UpperArm_{side}', (side * 0.49, -0.17, 0.5), (0.15, 0.14, 0.28), M['blue'], 28, 18)
        parent(upper, driver)
        forearm_root = empty(f'Gauntlet_{side}', (side * 0.54, -0.45, 0.32))
        forearm_root.rotation_euler = (math.radians(70), 0, side * math.radians(7))
        parent(forearm_root, driver)
        for segment in range(4):
            plate = cylinder(
                f'GauntletPlate_{side}_{segment}',
                (0, 0, segment * 0.115),
                0.125 - segment * 0.008,
                0.105,
                M['silver'] if segment % 2 == 0 else M['armor_light'],
                vertices=24,
            )
            parent(plate, forearm_root)
        hand = uv(f'Glove_{side}', (side * 0.54, -0.72, 0.18), (0.13, 0.15, 0.12), M['silver'], 28, 18)
        parent(hand, driver)

    # Blue bow, visible in the rear reference.
    knot = uv('BowKnot', (0, 0.59, 1.05), (0.12, 0.08, 0.12), M['blue_dark'], 28, 18)
    parent(knot, driver)
    for side in (-1, 1):
        loop = uv(f'BowLoop_{side}', (side * 0.24, 0.61, 1.05), (0.25, 0.07, 0.14), M['blue_dark'], 32, 20)
        loop.rotation_euler[1] = side * 0.35
        parent(loop, driver)
        ribbon = rounded_cube(
            f'BowRibbon_{side}',
            (side * 0.16, 0.63, 0.78),
            (0.09, 0.035, 0.28),
            M['blue_dark'],
            0.05,
            rotation=(0, side * 0.18, side * 0.42),
        )
        parent(ribbon, driver)
    back_armor = tapered_panel('BackArmor', (0, 0.34, 0.45), 0.52, 0.42, 0.55, 0.08, M['silver'], 0.06)
    parent(back_armor, driver)


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
        'skin': mat('Saber skin', (1.0, 0.8, 0.71), 0.55),
        'hair': mat('Saber blonde', (0.95, 0.56, 0.17), 0.55),
        'hair_light': mat('Saber hair light', (1.0, 0.72, 0.29), 0.5),
        'hair_dark': mat('Saber hair line', (0.3, 0.18, 0.06), 0.6),
        'blue': mat('Saber dress blue', (0.008, 0.07, 0.36), 0.6),
        'blue_dark': mat('Saber ribbon navy', (0.004, 0.025, 0.18), 0.62),
        'silver': mat('Saber armor', (0.66, 0.69, 0.7), 0.4, 0.38),
        'armor_light': mat('Armor highlight', (0.84, 0.86, 0.86), 0.38, 0.32),
        'armor_dark': mat('Armor seams', (0.21, 0.23, 0.24), 0.38, 0.5),
        'eye_dark': mat('Anime eye outline', (0.025, 0.04, 0.035), 0.4),
        'teal': mat('Saber teal iris', (0.002, 0.12, 0.085), 0.42),
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
