#!/usr/bin/env python3
"""Extract Red Bull Ring's closed main-course centreline from road material 8."""

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
    triangles = []
    for material, primitive in COMMON.transformed_primitives(document, binary, matrices):
        if material != material_index:
            continue
        cross = np.cross(primitive[:, 1] - primitive[:, 0], primitive[:, 2] - primitive[:, 0])
        upward = np.abs(cross[:, 1]) / np.maximum(np.linalg.norm(cross, axis=1), 1e-9)
        triangles.extend(primitive[upward > 0.72])
    triangles = np.asarray(triangles)
    if not len(triangles):
        raise RuntimeError(f"No upward road triangles found for material {material_index}")
    minimum = triangles.reshape(-1, 3).min(axis=0)
    maximum = triangles.reshape(-1, 3).max(axis=0)
    padding = 12.0
    origin = (minimum[0] - padding, minimum[2] - padding)
    width = int(math.ceil((maximum[0] - minimum[0] + 2 * padding) / resolution)) + 1
    height = int(math.ceil((maximum[2] - minimum[2] + 2 * padding) / resolution)) + 1
    mask = np.zeros((height, width), dtype=np.uint8)
    for triangle in triangles:
        pixels = np.column_stack(
            ((triangle[:, 0] - origin[0]) / resolution, (triangle[:, 2] - origin[1]) / resolution)
        )
        cv2.fillConvexPoly(mask, np.rint(pixels).astype(np.int32), 255)
    return mask, origin


def closed_cycle(mask, origin, resolution):
    closed = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)),
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
        raise RuntimeError("Red Bull Ring road did not produce a closed course")
    graph = graph.subgraph(components[0]).copy()
    if any(degree != 2 for _, degree in graph.degree()):
        raise RuntimeError("Red Bull Ring main course is ambiguous")
    start = next(iter(graph.nodes))
    ordered = [start]
    previous = None
    current = start
    while True:
        following = next(node for node in graph.neighbors(current) if node != previous)
        if following == start:
            break
        ordered.append(following)
        previous, current = current, following
    route = np.asarray(
        [[origin[0] + x * resolution, origin[1] + y * resolution] for y, x in ordered],
        dtype=float,
    )
    return closed, skeleton, route


def smooth_and_resample(route, spacing):
    route = COMMON.resample_closed(route, spacing * 0.5)
    for _ in range(4):
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
    parser.add_argument("--material", type=int, default=8)
    parser.add_argument("--resolution", type=float, default=0.5)
    parser.add_argument("--spacing", type=float, default=6.0)
    args = parser.parse_args()

    document, binary = COMMON.read_glb(args.glb)
    matrices = COMMON.world_matrices(document)
    mask, origin = road_mask(document, binary, matrices, args.material, args.resolution)
    course, skeleton, route = closed_cycle(mask, origin, args.resolution)
    route = smooth_and_resample(route, args.spacing)

    # cA() recentres the complete GLB, then the saved tuner placement is applied.
    center, minimum = COMMON.model_origin(document, binary, matrices)
    placement = np.asarray([-790.16, -112.0])
    route = route - center[[0, 2]] + placement

    anchor = np.asarray([168.13, -0.39])
    start_index = int(np.argmin(np.linalg.norm(route - anchor, axis=1)))
    route = np.concatenate((route[start_index:], route[:start_index]))
    heading = math.radians(105.0)
    forward = np.asarray([math.sin(heading), math.cos(heading)])
    if np.dot(route[-1] - route[0], forward) > np.dot(route[1] - route[0], forward):
        route = np.concatenate((route[:1], route[:0:-1]))
    # The user-saved grid is authoritative. The first centreline sample is the
    # finish line and must coincide exactly with that saved player position.
    delta = anchor - route[0]
    route += delta

    payload = {
        "source": args.glb.name,
        "roadMaterialIndices": [args.material],
        "roadMaterialNames": [document["materials"][args.material].get("name", "")],
        "modelCenterXZ": [round(float(center[0]), 6), round(float(center[2]), 6)],
        "modelMinY": round(float(minimum[1]), 6),
        "placement": {"x": -790.16, "y": -350.0, "z": -112.0, "scale": 1.0},
        "spacing": args.spacing,
        "surfaceY": 50.0,
        "alignmentDeltaXZ": [round(float(delta[0]), 6), round(float(delta[1]), 6)],
        "routeXZ": [[round(float(x), 3), round(float(z), 3)] for x, z in route],
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    args.output.write_text(
        "(function(){globalThis.__F1TI_RED_BULL_RING_BASELINE__=" + encoded + ";})();\n",
        encoding="utf-8",
    )

    if args.debug:
        debug = cv2.cvtColor(course, cv2.COLOR_GRAY2BGR)
        debug[skeleton > 0] = (255, 255, 255)
        raw = route - placement + center[[0, 2]] - delta
        points = np.rint(
            np.column_stack(((raw[:, 0] - origin[0]) / args.resolution, (raw[:, 1] - origin[1]) / args.resolution))
        ).astype(np.int32)
        cv2.polylines(debug, [points], True, (0, 0, 255), 2, cv2.LINE_AA)
        cv2.imwrite(str(args.debug), debug)


if __name__ == "__main__":
    main()
