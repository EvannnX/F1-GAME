#!/usr/bin/env python3
"""Extract the Yas Marina main racing loop from tentrail_32 in the track GLB."""

import json
import math
import struct
import sys
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
COMPONENT_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load_glb(path):
    with path.open("rb") as handle:
        magic, version, _ = struct.unpack("<4sII", handle.read(12))
        if magic != b"glTF" or version != 2:
            raise RuntimeError("Expected a glTF 2.0 binary file")
        json_length, _ = struct.unpack("<II", handle.read(8))
        document = json.loads(handle.read(json_length))
        binary_length, _ = struct.unpack("<II", handle.read(8))
        binary = handle.read(binary_length)
    return document, binary


def accessor(document, binary, index):
    item = document["accessors"][index]
    view = document["bufferViews"][item["bufferView"]]
    dtype = np.dtype(COMPONENT_TYPES[item["componentType"]]).newbyteorder("<")
    count = COMPONENT_COUNTS[item["type"]]
    offset = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    stride = view.get("byteStride", dtype.itemsize * count)
    result = np.ndarray(
        (item["count"], count),
        dtype=dtype,
        buffer=binary,
        offset=offset,
        strides=(stride, dtype.itemsize),
    ).copy()
    return result[:, 0] if count == 1 else result


def node_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype=float).reshape(4, 4).T
    matrix = np.eye(4)
    matrix[:3, 3] = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    matrix[:3, :3] = [
        [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * z * w, 2 * x * z + 2 * y * w],
        [2 * x * y + 2 * z * w, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * x * w],
        [2 * x * z - 2 * y * w, 2 * y * z + 2 * x * w, 1 - 2 * x * x - 2 * y * y],
    ]
    return matrix @ np.diag([*node.get("scale", [1, 1, 1]), 1])


def world_matrices(document):
    result = {}

    def visit(index, parent):
        world = parent @ node_matrix(document["nodes"][index])
        result[index] = world
        for child in document["nodes"][index].get("children", []):
            visit(child, world)

    scene = document["scenes"][document.get("scene", 0)]
    for root in scene["nodes"]:
        visit(root, np.eye(4))
    return result


def thin_zhang_suen(mask):
    image = mask.astype(np.uint8).copy()
    for _ in range(512):
        changed = False
        for second_step in (False, True):
            p2 = np.roll(image, -1, axis=0)
            p3 = np.roll(p2, -1, axis=1)
            p4 = np.roll(image, -1, axis=1)
            p5 = np.roll(np.roll(image, 1, axis=0), -1, axis=1)
            p6 = np.roll(image, 1, axis=0)
            p7 = np.roll(p6, 1, axis=1)
            p8 = np.roll(image, 1, axis=1)
            p9 = np.roll(p2, 1, axis=1)
            neighbours = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            ring = (p2, p3, p4, p5, p6, p7, p8, p9, p2)
            transitions = sum(
                ((ring[i] == 0) & (ring[i + 1] == 1)).astype(np.uint8)
                for i in range(8)
            )
            common = (image == 1) & (neighbours >= 2) & (neighbours <= 6) & (transitions == 1)
            if second_step:
                remove = common & ((p2 * p4 * p8) == 0) & ((p2 * p6 * p8) == 0)
            else:
                remove = common & ((p2 * p4 * p6) == 0) & ((p4 * p6 * p8) == 0)
            remove[[0, -1], :] = False
            remove[:, [0, -1]] = False
            if remove.any():
                image[remove] = 0
                changed = True
        if not changed:
            break
    return image


def simplify_closed(points, minimum_spacing=3.2):
    kept = [points[0]]
    for point in points[1:]:
        if math.dist(point, kept[-1]) >= minimum_spacing:
            kept.append(point)
    if len(kept) > 2 and math.dist(kept[-1], kept[0]) < minimum_spacing:
        kept.pop()
    # Two circular smoothing passes remove one-pixel stair steps without cutting corners.
    for _ in range(2):
        source = kept
        kept = []
        for i, point in enumerate(source):
            previous = source[(i - 1) % len(source)]
            following = source[(i + 1) % len(source)]
            kept.append(
                (
                    previous[0] * 0.18 + point[0] * 0.64 + following[0] * 0.18,
                    previous[1] * 0.18 + point[1] * 0.64 + following[1] * 0.18,
                )
            )
    return kept


def longest_road_cycle(pixel_graph, candidate_index=None, reference_path=None):
    """Contract degree-2 pixel chains, then enumerate the real road-network loops."""
    core = nx.k_core(pixel_graph, k=2)
    junctions = {node for node, degree in core.degree if degree != 2}
    if not junctions:
        component = max(nx.connected_components(core), key=len)
        start = next(iter(component))
        ordered = [start]
        previous = None
        current = start
        while True:
            following = next(node for node in core[current] if node != previous)
            if following == start:
                return ordered
            ordered.append(following)
            previous, current = current, following

    chains = []
    visited_edges = set()
    for junction in junctions:
        for neighbour in core[junction]:
            edge_key = frozenset((junction, neighbour))
            if edge_key in visited_edges:
                continue
            path = [junction, neighbour]
            visited_edges.add(edge_key)
            previous, current = junction, neighbour
            while current not in junctions:
                following = next(node for node in core[current] if node != previous)
                visited_edges.add(frozenset((current, following)))
                path.append(following)
                previous, current = current, following
            chains.append(path)

    # Subdivide every contracted edge with a unique node. This preserves parallel
    # road branches while allowing NetworkX to enumerate undirected simple cycles.
    contracted = nx.Graph()
    for index, path in enumerate(chains):
        edge_node = ("edge", index)
        contracted.add_edge(("junction", path[0]), edge_node)
        contracted.add_edge(edge_node, ("junction", path[-1]))
    cycles = list(nx.simple_cycles(contracted))
    if not cycles:
        raise RuntimeError("No closed road loop found after road-network contraction")

    def contracted_length(cycle):
        return sum(
            sum(math.dist(path[i], path[i + 1]) for i in range(len(path) - 1))
            for kind, index in cycle
            if kind == "edge"
            for path in (chains[index],)
        )

    ordered_cycles = []
    for cycle in cycles:
        first_junction = next(i for i, node in enumerate(cycle) if node[0] == "junction")
        cycle = cycle[first_junction:] + cycle[:first_junction]
        pixels = []
        for index in range(0, len(cycle), 2):
            junction = cycle[index][1]
            edge_index = cycle[(index + 1) % len(cycle)][1]
            following_junction = cycle[(index + 2) % len(cycle)][1]
            path = chains[edge_index]
            if path[0] != junction or path[-1] != following_junction:
                path = list(reversed(path))
            pixels.extend(path[:-1])
        ordered_cycles.append(pixels)
    ordered_cycles.sort(
        key=lambda points: sum(
            math.dist(points[i], points[(i + 1) % len(points)]) for i in range(len(points))
        ),
        reverse=True,
    )
    if candidate_index is None and reference_path is None:
        # The race course is the outer face of the connected road network.
        # Inner cycles are pit lanes, shortcuts, and service roads even when
        # they happen to be long or resemble the reference diagram.
        def enclosed_area(points):
            return abs(
                sum(
                    points[i][0] * points[(i + 1) % len(points)][1]
                    - points[(i + 1) % len(points)][0] * points[i][1]
                    for i in range(len(points))
                )
                * .5
            )

        selected_index, selected = max(
            enumerate(ordered_cycles), key=lambda item: enclosed_area(item[1])
        )
        print(
            f"outer-face candidate {selected_index}: area={enclosed_area(selected):.1f}",
            file=sys.stderr,
        )
        return selected
    if reference_path:
        reference = cv2.imread(str(reference_path), cv2.IMREAD_GRAYSCALE)
        if reference is None:
            raise RuntimeError(f"Cannot read reference image: {reference_path}")
        reference_mask = (reference < 70).astype(np.uint8)
        component_count, labels, stats, _ = cv2.connectedComponentsWithStats(reference_mask)
        component = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        component_mask = (labels == component).astype(np.uint8)
        reference_contour = max(
            cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0],
            key=cv2.contourArea,
        )
        scores = []
        for index, points in enumerate(ordered_cycles):
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            # The race layout uses the start/finish straight, the waterfront
            # hairpin, and the far-right T5 hairpin. Local pit/service loops do not.
            if not (min(xs) <= 20 and min(ys) <= 20 and max(xs) >= 1100 and max(ys) >= 700):
                continue
            contour = np.asarray(points, dtype=np.float32).reshape(-1, 1, 2)
            score = cv2.matchShapes(reference_contour, contour, cv2.CONTOURS_MATCH_I2, 0)
            scores.append((score, index, points))
        scores.sort(key=lambda item: item[0])
        for score, index, points in scores[:24]:
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            print(
                f"reference match candidate {index}: score={score:.6f} "
                f"bounds=({min(xs)},{min(ys)})-({max(xs)},{max(ys)})",
                file=sys.stderr,
            )
        return scores[0][2]
    shown = 0
    for index, points in enumerate(ordered_cycles):
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        length = sum(math.dist(points[i], points[(i + 1) % len(points)]) for i in range(len(points)))
        if not (min(xs) <= 20 and min(ys) <= 20 and max(ys) >= 700 and length >= 2500):
            continue
        print(
            f"candidate {index}: pixels={len(points)} length={length:.1f} "
            f"bounds=({min(xs)},{min(ys)})-({max(xs)},{max(ys)})",
            file=sys.stderr,
        )
        shown += 1
        if shown >= 400:
            break
    return ordered_cycles[max(0, min(candidate_index, len(ordered_cycles) - 1))]


def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "assets/yas-marina-2021.glb")
    document, binary = load_glb(source)
    material_index = next(
        i for i, material in enumerate(document["materials"]) if material.get("name") == "tentrail_32"
    )
    matrices = world_matrices(document)
    mesh_node = {
        node["mesh"]: matrices[index]
        for index, node in enumerate(document["nodes"])
        if "mesh" in node
    }
    triangles = []
    for mesh_index, mesh in enumerate(document["meshes"]):
        for primitive in mesh.get("primitives", []):
            if primitive.get("material") != material_index:
                continue
            positions = accessor(document, binary, primitive["attributes"]["POSITION"])
            world = mesh_node.get(mesh_index, np.eye(4))
            positions = (np.c_[positions, np.ones(len(positions))] @ world.T)[:, :3]
            indices = accessor(document, binary, primitive["indices"]).astype(int).reshape(-1, 3)
            triangles.append(positions[indices])
    triangles = np.concatenate(triangles)

    resolution = 1.5
    bounds_min = np.floor(triangles[:, :, [0, 2]].reshape(-1, 2).min(axis=0) - 4)
    bounds_max = np.ceil(triangles[:, :, [0, 2]].reshape(-1, 2).max(axis=0) + 4)
    mask = np.zeros(
        (
            int((bounds_max[1] - bounds_min[1]) * resolution + 1),
            int((bounds_max[0] - bounds_min[0]) * resolution + 1),
        ),
        dtype=np.uint8,
    )
    for triangle in triangles:
        polygon = np.round(
            np.c_[
                (triangle[:, 0] - bounds_min[0]) * resolution,
                (triangle[:, 2] - bounds_min[1]) * resolution,
            ]
        ).astype(np.int32)
        cv2.fillConvexPoly(mask, polygon, 1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    skeleton = thin_zhang_suen(mask)

    pixels = set(zip(*np.nonzero(skeleton)[::-1]))
    graph = nx.Graph()
    for x, y in pixels:
        for dx, dy in ((1, 0), (0, 1)):
            neighbour = (x + dx, y + dy)
            if neighbour in pixels:
                graph.add_edge((x, y), neighbour, weight=math.hypot(dx, dy) / resolution)
        # Keep a diagonal only when it bridges a genuinely diagonal skeleton
        # step. Adding all diagonals creates thousands of artificial 3-pixel loops.
        for dx, dy in ((1, 1), (1, -1)):
            neighbour = (x + dx, y + dy)
            if neighbour in pixels and (x + dx, y) not in pixels and (x, y + dy) not in pixels:
                graph.add_edge((x, y), neighbour, weight=math.hypot(dx, dy) / resolution)
    # Candidate 49 is the user-confirmed full course shown by the in-game map.
    selection = sys.argv[2] if len(sys.argv) > 2 else "49"
    reference_path = None if selection == "outermost" or selection.lstrip("-").isdigit() else Path(selection)
    # A numeric argument remains available for deterministic inspection. Passing
    # the supplied circuit diagram selects the closest GLB road-network loop.
    candidate_index = None if selection == "outermost" else int(selection) if reference_path is None else 128
    cycle = longest_road_cycle(graph, candidate_index, reference_path)

    def cycle_length(cycle_pixels):
        return sum(
            math.dist(cycle_pixels[i], cycle_pixels[(i + 1) % len(cycle_pixels)]) / resolution
            for i in range(len(cycle_pixels))
        )
    points = [
        (pixel[0] / resolution + bounds_min[0], pixel[1] / resolution + bounds_min[1])
        for pixel in cycle
    ]
    points = simplify_closed(points)
    print(json.dumps([[round(x, 3), round(z, 3)] for x, z in points], separators=(",", ":")))
    print(
        f"tentrail_32 main loop: {cycle_length(cycle):.1f} world units, {len(points)} route points",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
