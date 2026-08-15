#!/usr/bin/env python3
"""Extract Marina Bay's closed main-course centreline from GLB material 15."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
from pathlib import Path

import cv2
import networkx as nx
import numpy as np


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("route_common", HERE / "extract-barcelona-route.py")
COMMON = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COMMON)


def road_mask(document, binary, matrices, material_index, resolution):
    primitives = list(COMMON.transformed_primitives(document, binary, matrices))
    points = np.concatenate([triangles.reshape(-1, 3) for _, triangles in primitives])
    minimum = np.nanmin(points, axis=0)
    maximum = np.nanmax(points, axis=0)
    padding = 20.0
    x_min, z_min = minimum[0] - padding, minimum[2] - padding
    width = int(math.ceil((maximum[0] - minimum[0] + 2 * padding) / resolution)) + 1
    height = int(math.ceil((maximum[2] - minimum[2] + 2 * padding) / resolution)) + 1
    mask = np.zeros((height, width), dtype=np.uint8)
    for material, triangles in primitives:
        if material != material_index:
            continue
        cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
        upward = np.abs(cross[:, 1]) / np.maximum(np.linalg.norm(cross, axis=1), 1e-9)
        for triangle in triangles[upward > 0.72]:
            pixels = np.column_stack(
                ((triangle[:, 0] - x_min) / resolution, (triangle[:, 2] - z_min) / resolution)
            )
            if np.isfinite(pixels).all():
                cv2.fillConvexPoly(mask, np.rint(pixels).astype(np.int32), 255)
    return mask, (x_min, z_min), minimum, maximum


def unique_closed_cycle(mask, origin, resolution):
    # The asphalt has small texture seams. Closing them before thinning yields
    # one degree-2 loop and discards open pit/service branches.
    kernel_size = max(5, int(round(21.0 / resolution)) | 1)
    closed = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size)),
    )
    skeleton = COMMON.zhang_suen(closed)
    ys, xs = np.nonzero(skeleton)
    pixels = set(zip(ys.tolist(), xs.tolist()))
    graph = nx.Graph()
    graph.add_nodes_from(pixels)
    for y, x in pixels:
        for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            neighbour = (y + dy, x + dx)
            if neighbour not in pixels:
                continue
            if dx and dy and ((y, x + dx) in pixels or (y + dy, x) in pixels):
                continue
            graph.add_edge((y, x), neighbour)
    while True:
        endpoints = [node for node, degree in graph.degree() if degree <= 1]
        if not endpoints:
            break
        graph.remove_nodes_from(endpoints)
    components = sorted(nx.connected_components(graph), key=len, reverse=True)
    if not components:
        raise RuntimeError("Marina Bay asphalt did not produce a closed course")
    graph = graph.subgraph(components[0]).copy()
    if any(degree != 2 for _, degree in graph.degree()):
        raise RuntimeError("Marina Bay course is ambiguous after pit/service-road pruning")
    start = min(graph, key=lambda node: (origin[0] + node[1] * resolution + 590) ** 2 + (origin[1] + node[0] * resolution - 240) ** 2)
    ordered = [start]
    previous = None
    current = start
    while True:
        choices = [node for node in graph.neighbors(current) if node != previous]
        following = choices[0]
        if following == start:
            break
        ordered.append(following)
        previous, current = current, following
        if len(ordered) > len(graph) + 1:
            raise RuntimeError("Marina Bay cycle traversal failed")
    return closed, skeleton, np.asarray(
        [[origin[0] + x * resolution, origin[1] + y * resolution] for y, x in ordered],
        dtype=float,
    )


def resample_and_smooth(route, spacing):
    route = COMMON.resample_closed(route, spacing * 0.5)
    for _ in range(5):
        route = (
            np.roll(route, 2, axis=0)
            + 4 * np.roll(route, 1, axis=0)
            + 6 * route
            + 4 * np.roll(route, -1, axis=0)
            + np.roll(route, -2, axis=0)
        ) / 16.0
    return COMMON.resample_closed(route, spacing)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("glb", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--debug", type=Path)
    parser.add_argument("--material", type=int, default=15)
    parser.add_argument("--resolution", type=float, default=1.0)
    parser.add_argument("--spacing", type=float, default=6.0)
    parser.add_argument("--placement-scale", type=float, default=0.5)
    args = parser.parse_args()

    document, binary = COMMON.read_glb(args.glb)
    matrices = COMMON.world_matrices(document)
    mask, origin, model_minimum, model_maximum = road_mask(
        document, binary, matrices, args.material, args.resolution
    )
    course, skeleton, route = unique_closed_cycle(mask, origin, args.resolution)
    route = resample_and_smooth(route, args.spacing)

    # The runtime recentres the loaded GLB in X/Z before applying placement
    # scale (see cA()). Reproduce that transform here. The previous extractor
    # omitted this centre subtraction, shifting the guide about 48 m in X and
    # 100 m in Z away from the user-calibrated grid.
    model_center_xz = np.asarray(
        [
            0.5 * (model_minimum[0] + model_maximum[0]),
            0.5 * (model_minimum[2] + model_maximum[2]),
        ]
    )
    route = (route - model_center_xz) * args.placement_scale

    # Rotate to the user-confirmed grid on the west start/finish straight and
    # choose the direction matching its 7.3 degree forward heading.
    anchor = np.asarray([-348.58, 49.88])
    index = int(np.argmin(np.linalg.norm(route - anchor, axis=1)))
    route = np.concatenate((route[index:], route[:index]))
    heading = math.radians(7.3)
    forward = np.asarray([math.sin(heading), math.cos(heading)])
    if np.dot(route[-1] - route[0], forward) > np.dot(route[1] - route[0], forward):
        route = np.concatenate((route[:1], route[:0:-1]))

    payload = {
        "source": args.glb.name,
        "roadMaterialIndices": [args.material],
        "roadMaterialNames": [document["materials"][args.material].get("name", "")],
        "placementScale": args.placement_scale,
        "modelCenterXZ": [round(float(model_center_xz[0]), 6), round(float(model_center_xz[1]), 6)],
        "spacing": args.spacing * args.placement_scale,
        "surfaceY": 47.1 * args.placement_scale,
        "routeXZ": [[round(float(x), 3), round(float(z), 3)] for x, z in route],
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if args.output.suffix == ".js":
        args.output.write_text(
            "(function(){globalThis.__F1TI_MARINA_BAY_BASELINE__="
            + encoded
            + ";})();\n"
        )
    else:
        args.output.write_text(encoded + "\n")

    if args.debug:
        debug = cv2.cvtColor(course, cv2.COLOR_GRAY2BGR)
        debug[skeleton > 0] = (255, 255, 255)
        unscaled = route / args.placement_scale + model_center_xz
        points = np.rint(
            np.column_stack(((unscaled[:, 0] - origin[0]) / args.resolution, (unscaled[:, 1] - origin[1]) / args.resolution))
        ).astype(np.int32)
        cv2.polylines(debug, [points], True, (0, 0, 255), 2, cv2.LINE_AA)
        cv2.imwrite(str(args.debug), debug)


if __name__ == "__main__":
    main()
