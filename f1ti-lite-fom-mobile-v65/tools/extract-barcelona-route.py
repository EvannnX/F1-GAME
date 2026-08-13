#!/usr/bin/env python3
"""Extract the Barcelona main-course centre line from the GLB curb geometry."""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

import cv2
import networkx as nx
import numpy as np


COMPONENT_TYPES = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
COMPONENT_COUNTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT4": 16,
}


def read_glb(path: Path):
    with path.open("rb") as stream:
        magic, version, _ = struct.unpack("<4sII", stream.read(12))
        if magic != b"glTF" or version != 2:
            raise ValueError(f"Unsupported GLB: {path}")
        json_length, json_type = struct.unpack("<II", stream.read(8))
        if json_type != 0x4E4F534A:
            raise ValueError("Missing JSON chunk")
        document = json.loads(stream.read(json_length))
        binary_length, binary_type = struct.unpack("<II", stream.read(8))
        if binary_type != 0x004E4942:
            raise ValueError("Missing BIN chunk")
        binary = stream.read(binary_length)
    return document, binary


def accessor(document, binary, index):
    item = document["accessors"][index]
    view = document["bufferViews"][item["bufferView"]]
    dtype = np.dtype(COMPONENT_TYPES[item["componentType"]]).newbyteorder("<")
    width = COMPONENT_COUNTS[item["type"]]
    stride = view.get("byteStride", dtype.itemsize * width)
    offset = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    if stride == dtype.itemsize * width:
        return np.frombuffer(
            binary,
            dtype=dtype,
            count=item["count"] * width,
            offset=offset,
        ).reshape(item["count"], width)
    return np.ndarray(
        (item["count"], width),
        dtype=dtype,
        buffer=binary,
        offset=offset,
        strides=(stride, dtype.itemsize),
    ).copy()


def node_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype=float).reshape(4, 4, order="F")
    translation = np.array(node.get("translation", [0, 0, 0]), dtype=float)
    scale = np.array(node.get("scale", [1, 1, 1]), dtype=float)
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    rotation = np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1],
        ],
        dtype=float,
    )
    translate = np.eye(4)
    translate[:3, 3] = translation
    return translate @ rotation @ np.diag([*scale, 1])


def world_matrices(document):
    result = {}

    def visit(index, parent):
        matrix = parent @ node_matrix(document["nodes"][index])
        result[index] = matrix
        for child in document["nodes"][index].get("children", []):
            visit(child, matrix)

    for scene in document.get("scenes", []):
        for root in scene.get("nodes", []):
            visit(root, np.eye(4))
    return result


def transformed_primitives(document, binary, matrices):
    for node_index, node in enumerate(document["nodes"]):
        if "mesh" not in node:
            continue
        matrix = matrices[node_index]
        for primitive in document["meshes"][node["mesh"]]["primitives"]:
            positions = accessor(document, binary, primitive["attributes"]["POSITION"]).astype(float)
            positions = (np.c_[positions, np.ones(len(positions))] @ matrix.T)[:, :3]
            if "indices" in primitive:
                indices = accessor(document, binary, primitive["indices"]).reshape(-1).astype(int)
            else:
                indices = np.arange(len(positions))
            triangles = positions[indices[: len(indices) // 3 * 3]].reshape(-1, 3, 3)
            yield primitive.get("material", -1), triangles


def model_origin(document, binary, matrices):
    minimum = np.full(3, np.inf)
    maximum = np.full(3, -np.inf)
    for _, triangles in transformed_primitives(document, binary, matrices):
        finite = triangles[np.isfinite(triangles).all(axis=(1, 2))]
        if not len(finite):
            continue
        minimum = np.minimum(minimum, finite.min(axis=(0, 1)))
        maximum = np.maximum(maximum, finite.max(axis=(0, 1)))
    return (minimum + maximum) * 0.5, minimum


def curb_mask(document, binary, matrices, center, material_index, resolution):
    x_min, x_max = -450.0, 800.0
    z_min, z_max = -1050.0, 400.0
    width = int(math.ceil((x_max - x_min) / resolution)) + 1
    height = int(math.ceil((z_max - z_min) / resolution)) + 1
    mask = np.zeros((height, width), dtype=np.uint8)

    for material, triangles in transformed_primitives(document, binary, matrices):
        if material != material_index:
            continue
        cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
        norm = np.linalg.norm(cross, axis=1)
        upward = np.abs(cross[:, 1]) / np.maximum(norm, 1e-9)
        for triangle in triangles[upward > 0.72]:
            pixels = np.column_stack(
                (
                    (triangle[:, 0] - center[0] - x_min) / resolution,
                    (triangle[:, 2] - center[2] - z_min) / resolution,
                )
            )
            if np.isfinite(pixels).all():
                cv2.fillConvexPoly(mask, np.rint(pixels).astype(np.int32), 255)
    return mask, (x_min, z_min)


def road_surface_mask(document, binary, matrices, center, resolution):
    primary, origin = curb_mask(document, binary, matrices, center, 53, resolution)
    neighbouring = np.zeros_like(primary)
    # These two GLB material slots are the adjacent asphalt submeshes used at
    # seams and the start/finish straight. They are accepted only close to the
    # primary asphalt, so their unrelated paddock polygons cannot enter route
    # generation.
    for material_index in (54, 55):
        surface, _ = curb_mask(document, binary, matrices, center, material_index, resolution)
        neighbouring = cv2.bitwise_or(neighbouring, surface)
    radius = max(3, int(round(18.0 / resolution)))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
    nearby = cv2.dilate(primary, kernel, iterations=1)
    return cv2.bitwise_or(primary, cv2.bitwise_and(neighbouring, nearby)), origin


def zhang_suen(image):
    image = (image > 0).astype(np.uint8)
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            padded = np.pad(image, 1)
            neighbours = [
                padded[:-2, 1:-1],
                padded[:-2, 2:],
                padded[1:-1, 2:],
                padded[2:, 2:],
                padded[2:, 1:-1],
                padded[2:, :-2],
                padded[1:-1, :-2],
                padded[:-2, :-2],
            ]
            count = np.sum(neighbours, axis=0)
            transitions = np.sum(
                [
                    (neighbours[index] == 0) & (neighbours[(index + 1) % 8] == 1)
                    for index in range(8)
                ],
                axis=0,
            )
            common = (image == 1) & (count >= 2) & (count <= 6) & (transitions == 1)
            if step == 0:
                removable = common & (
                    (neighbours[0] * neighbours[2] * neighbours[4] == 0)
                    & (neighbours[2] * neighbours[4] * neighbours[6] == 0)
                )
            else:
                removable = common & (
                    (neighbours[0] * neighbours[2] * neighbours[6] == 0)
                    & (neighbours[0] * neighbours[4] * neighbours[6] == 0)
                )
            if removable.any():
                image[removable] = 0
                changed = True
    return image


def main_course_cycle(road, origin, resolution, start):
    road = cv2.morphologyEx(
        road,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
        iterations=1,
    )
    skeleton = zhang_suen(road)
    ys, xs = np.nonzero(skeleton)
    pixels = set(zip(ys.tolist(), xs.tolist()))
    graph = nx.Graph()
    graph.add_nodes_from(pixels)
    for y, x in pixels:
        for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            neighbour = (y + dy, x + dx)
            if neighbour not in pixels:
                continue
            # Avoid tiny triangular graph cycles at rasterised corners.
            if dx and dy and ((y, x + dx) in pixels or (y + dy, x) in pixels):
                continue
            graph.add_edge((y, x), neighbour)

    # Delete open service-road branches. Closed pit-lane alternatives remain as
    # separate cycles, from which the cycle through the saved start is selected.
    while True:
        endpoints = [node for node, degree in graph.degree() if degree <= 1]
        if not endpoints:
            break
        graph.remove_nodes_from(endpoints)
    if not graph:
        raise RuntimeError("Road skeleton has no closed course")

    sx = (start[0] - origin[0]) / resolution
    sy = (start[1] - origin[1]) / resolution
    start_node = min(graph, key=lambda node: math.hypot(node[1] - sx, node[0] - sy))
    if math.hypot(start_node[1] - sx, start_node[0] - sy) * resolution > 35:
        raise RuntimeError("Saved starting grid is not on the extracted road")

    component = nx.node_connected_component(graph, start_node)
    graph = graph.subgraph(component).copy()
    nx.set_edge_attributes(
        graph,
        {
            edge: math.hypot(edge[1][1] - edge[0][1], edge[1][0] - edge[0][0])
            for edge in graph.edges()
        },
        "weight",
    )

    # GLB asphalt also contains pit and service-lane junctions. These anchors
    # lie on unambiguous parts of the 2023 GP course and only select topology;
    # every point between them is still solved on the extracted GLB surface.
    anchors = [
        start,
        (560, -650), (590, -760), (520, -850), (390, -880),
        (310, -770), (350, -700),
        start,
    ]

    def nearest_node(point):
        px = (point[0] - origin[0]) / resolution
        py = (point[1] - origin[1]) / resolution
        return min(graph, key=lambda node: math.hypot(node[1] - px, node[0] - py))

    anchor_nodes = [nearest_node(anchor) for anchor in anchors]
    pixels_route = []
    for left, right in zip(anchor_nodes, anchor_nodes[1:]):
        section = nx.shortest_path(graph, left, right, weight="weight")
        pixels_route.extend(section[:-1])
    points = np.array([[x, y] for y, x in pixels_route], dtype=float)
    route = np.column_stack(
        (origin[0] + points[:, 0] * resolution, origin[1] + points[:, 1] * resolution)
    )
    return road, skeleton, route


def resample_closed(points, spacing):
    points = np.asarray(points, dtype=float)
    segments = np.roll(points, -1, axis=0) - points
    lengths = np.linalg.norm(segments, axis=1)
    cumulative = np.r_[0.0, np.cumsum(lengths)]
    total = cumulative[-1]
    samples = np.arange(0, total, spacing)
    result = []
    for distance in samples:
        index = min(np.searchsorted(cumulative, distance, side="right") - 1, len(points) - 1)
        amount = (distance - cumulative[index]) / max(lengths[index], 1e-9)
        result.append(points[index] + segments[index] * amount)
    return np.asarray(result)


def smooth_centre_line(mids):
    mids = np.asarray(mids, dtype=float)
    for _ in range(4):
        mids = (
            np.roll(mids, 2, axis=0)
            + 4 * np.roll(mids, 1, axis=0)
            + 6 * mids
            + 4 * np.roll(mids, -1, axis=0)
            + np.roll(mids, -2, axis=0)
        ) / 16.0
    return resample_closed(mids, 10.0)


def rotate_to_start(points, start):
    distances = np.linalg.norm(points - np.asarray(start), axis=1)
    index = int(np.argmin(distances))
    return np.concatenate((points[index:], points[:index]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("glb", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--debug", type=Path)
    parser.add_argument("--material", type=int, default=53)
    parser.add_argument("--resolution", type=float, default=1.0)
    parser.add_argument("--start-x", type=float, default=446.0)
    parser.add_argument("--start-z", type=float, default=-392.0)
    args = parser.parse_args()

    document, binary = read_glb(args.glb)
    matrices = world_matrices(document)
    center, minimum = model_origin(document, binary, matrices)
    if args.material == 53:
        curbs, origin = road_surface_mask(document, binary, matrices, center, args.resolution)
    else:
        curbs, origin = curb_mask(document, binary, matrices, center, args.material, args.resolution)
    course, skeleton, route = main_course_cycle(
        curbs,
        origin,
        args.resolution,
        (args.start_x, args.start_z),
    )
    route = smooth_centre_line(route)
    route = rotate_to_start(route, (args.start_x, args.start_z))

    payload = {
        "source": args.glb.name,
        "materialIndex": args.material,
        "materialName": document["materials"][args.material].get("name", ""),
        "modelCenter": [round(float(center[0]), 6), round(float(center[2]), 6)],
        "modelMinY": round(float(minimum[1]), 6),
        "spacing": 10.0,
        "route": [[round(float(x), 3), round(float(z), 3)] for x, z in route],
    }
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)

    if args.debug:
        debug = cv2.cvtColor(course, cv2.COLOR_GRAY2BGR)
        debug[skeleton > 0] = (255, 255, 255)
        points = np.rint(
            np.column_stack(
                (
                    (route[:, 0] - origin[0]) / args.resolution,
                    (route[:, 1] - origin[1]) / args.resolution,
                )
            )
        ).astype(np.int32)
        cv2.polylines(debug, [points], True, (0, 0, 255), 2, cv2.LINE_AA)
        cv2.imwrite(str(args.debug), debug)


if __name__ == "__main__":
    main()
