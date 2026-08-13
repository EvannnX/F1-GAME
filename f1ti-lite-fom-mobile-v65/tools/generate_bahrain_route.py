#!/usr/bin/env python3
"""Extract Bahrain's closed driving route from the GLB road surfaces."""

from __future__ import annotations

import argparse
import base64
import json
import re
import struct
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree


COMPONENT_DTYPE = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
COMPONENT_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def load_glb(path: Path):
    payload = path.read_bytes()
    offset = 12
    chunks = {}
    while offset < len(payload):
        length, chunk_type = struct.unpack_from("<II", payload, offset)
        offset += 8
        chunks[chunk_type] = payload[offset : offset + length]
        offset += length
    return json.loads(chunks[0x4E4F534A]), chunks[0x004E4942]


def accessor(document, binary, index):
    item = document["accessors"][index]
    view = document["bufferViews"][item["bufferView"]]
    dtype = np.dtype(COMPONENT_DTYPE[item["componentType"]]).newbyteorder("<")
    width = COMPONENT_COUNT[item["type"]]
    offset = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    stride = view.get("byteStride", dtype.itemsize * width)
    return np.ndarray(
        (item["count"], width), dtype=dtype, buffer=binary, offset=offset,
        strides=(stride, dtype.itemsize),
    ).copy()


def quaternion_matrix(value):
    x, y, z, w = value
    return np.array([
        [1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w, 0],
        [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w, 0],
        [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y, 0],
        [0, 0, 0, 1],
    ], dtype=float)


def local_matrix(node):
    if "matrix" in node:
        return np.asarray(node["matrix"], dtype=float).reshape(4, 4).T
    translation = np.eye(4)
    translation[:3, 3] = node.get("translation", [0, 0, 0])
    scale = np.diag([*node.get("scale", [1, 1, 1]), 1])
    return translation @ quaternion_matrix(node.get("rotation", [0, 0, 0, 1])) @ scale


def world_matrices(document):
    parents = {}
    for index, node in enumerate(document["nodes"]):
        for child in node.get("children", []):
            parents[child] = index
    cache = {}
    def resolve(index):
        if index not in cache:
            parent = parents.get(index)
            cache[index] = (resolve(parent) if parent is not None else np.eye(4)) @ local_matrix(document["nodes"][index])
        return cache[index]
    return [resolve(index) for index in range(len(document["nodes"]))]


def mesh_world_vertices(document, binary, matrices, mesh_index):
    node_index = next(index for index, node in enumerate(document["nodes"]) if node.get("mesh") == mesh_index)
    primitive = document["meshes"][mesh_index]["primitives"][0]
    positions = accessor(document, binary, primitive["attributes"]["POSITION"])
    positions = np.column_stack((positions, np.ones(len(positions)))) @ matrices[node_index].T
    positions = positions[:, :3] / positions[:, 3, None]
    triangles = accessor(document, binary, primitive["indices"]).ravel().astype(int).reshape(-1, 3)
    return positions, triangles


def scene_recenter_offset(document, binary, matrices):
    """Match cA(): center the loaded GLB in X/Z and place its lowest Y at zero."""
    lower = np.full(3, np.inf)
    upper = np.full(3, -np.inf)
    for node_index, node in enumerate(document.get("nodes", [])):
        mesh_index = node.get("mesh")
        if mesh_index is None:
            continue
        for primitive in document["meshes"][mesh_index].get("primitives", []):
            position_index = primitive.get("attributes", {}).get("POSITION")
            if position_index is None:
                continue
            positions = accessor(document, binary, position_index)
            positions = np.column_stack((positions, np.ones(len(positions)))) @ matrices[node_index].T
            valid = np.isfinite(positions).all(axis=1) & (np.abs(positions[:, 3]) > 1e-12)
            positions = positions[valid, :3] / positions[valid, 3, None]
            valid = np.isfinite(positions).all(axis=1) & (np.abs(positions) < 1e7).all(axis=1)
            positions = positions[valid]
            if not len(positions):
                continue
            lower = np.minimum(lower, positions.min(axis=0))
            upper = np.maximum(upper, positions.max(axis=0))
    if not np.isfinite(lower).all() or not np.isfinite(upper).all():
        raise RuntimeError("Could not calculate Bahrain scene bounds")
    return np.array((-(lower[0] + upper[0]) * 0.5, -lower[1], -(lower[2] + upper[2]) * 0.5))


def rasterize(document, binary, mesh_indices, metres_per_pixel):
    matrices = world_matrices(document)
    surfaces = [mesh_world_vertices(document, binary, matrices, index) for index in mesh_indices]
    vertices = np.vstack([positions[:, (0, 2)] for positions, _ in surfaces])
    lower = vertices.min(axis=0) - 10
    upper = vertices.max(axis=0) + 10
    width = int((upper[0] - lower[0]) / metres_per_pixel) + 1
    height = int((upper[1] - lower[1]) / metres_per_pixel) + 1
    mask = np.zeros((height, width), dtype=np.uint8)
    for positions, triangles in surfaces:
        pixels = np.column_stack((
            ((positions[:, 0] - lower[0]) / metres_per_pixel).astype(int),
            (height - 1 - (positions[:, 2] - lower[1]) / metres_per_pixel).astype(int),
        ))
        for triangle in triangles:
            cv2.fillConvexPoly(mask, pixels[triangle], 255)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return mask, lower, surfaces


def thin_mask(mask):
    """Zhang-Suen thinning which preserves the single closed circuit loop."""
    image = (mask > 0).astype(np.uint8)
    for _ in range(256):
        changed = False
        for step in (0, 1):
            padded = np.pad(image, 1)
            p2 = padded[:-2, 1:-1]
            p3 = padded[:-2, 2:]
            p4 = padded[1:-1, 2:]
            p5 = padded[2:, 2:]
            p6 = padded[2:, 1:-1]
            p7 = padded[2:, :-2]
            p8 = padded[1:-1, :-2]
            p9 = padded[:-2, :-2]
            neighbours = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            transitions = sum(item.astype(np.uint8) for item in (
                (p2 == 0) & (p3 == 1), (p3 == 0) & (p4 == 1),
                (p4 == 0) & (p5 == 1), (p5 == 0) & (p6 == 1),
                (p6 == 0) & (p7 == 1), (p7 == 0) & (p8 == 1),
                (p8 == 0) & (p9 == 1), (p9 == 0) & (p2 == 1),
            ))
            if step == 0:
                topology = (p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)
            else:
                topology = (p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0)
            remove = (image == 1) & (neighbours >= 2) & (neighbours <= 6) & (transitions == 1) & topology
            if remove.any():
                image[remove] = 0
                changed = True
        if not changed:
            break
    return image * 255


def skeleton_contour(mask):
    skeleton = thin_mask(mask)
    contours, _ = cv2.findContours(skeleton, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        raise RuntimeError("No Bahrain road skeleton was found")
    return skeleton, max(contours, key=lambda item: cv2.arcLength(item, True))[:, 0, :]


def resample_closed(points, spacing=4.0):
    segments = np.linalg.norm(np.roll(points, -1, axis=0) - points, axis=1)
    cumulative = np.r_[0.0, np.cumsum(segments)]
    total = cumulative[-1]
    count = max(16, int(round(total / spacing)))
    distances = np.linspace(0.0, total, count, endpoint=False)
    closed = np.vstack((points, points[0]))
    result = np.column_stack((
        np.interp(distances, cumulative, closed[:, 0]),
        np.interp(distances, cumulative, closed[:, 1]),
    ))
    result[:, 0] = ndimage.gaussian_filter1d(result[:, 0], 2.2, mode="wrap")
    result[:, 1] = ndimage.gaussian_filter1d(result[:, 1], 2.2, mode="wrap")
    return result


def interpolate_heights(points, surfaces):
    vertices = np.vstack([positions for positions, _ in surfaces])
    tree = cKDTree(vertices[:, (0, 2)])
    distances, indices = tree.query(points, k=12)
    weights = 1.0 / np.maximum(distances, 0.08) ** 2
    heights = np.sum(vertices[indices, 1] * weights, axis=1) / np.sum(weights, axis=1)
    return ndimage.gaussian_filter1d(heights, 2.5, mode="wrap")


def pack_route(points):
    quantized = np.rint(points * 10).astype("<i2")
    return base64.b64encode(quantized.tobytes()).decode()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", type=Path, default=Path("assets/bahrain.glb"))
    parser.add_argument("--selector", type=Path, default=Path("track-selector.js"))
    parser.add_argument("--meshes", default="98")
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    mesh_indices = [int(value) for value in args.meshes.split(",") if value.strip()]
    document, binary = load_glb(args.glb)
    matrices = world_matrices(document)
    mask, lower, surfaces = rasterize(document, binary, mesh_indices, 0.45)
    skeleton, contour = skeleton_contour(mask)
    raw = np.column_stack((
        lower[0] + contour[:, 0] * 0.45,
        lower[1] + (mask.shape[0] - 1 - contour[:, 1]) * 0.45,
    ))
    route_xz = resample_closed(raw)
    heights = interpolate_heights(route_xz, surfaces)
    raw_route = np.column_stack((route_xz[:, 0], heights, route_xz[:, 1]))
    recenter = scene_recenter_offset(document, binary, matrices)
    route = raw_route + recenter
    encoded = pack_route(route)

    if args.preview:
        preview = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
        pixels = np.column_stack((
            ((raw_route[:, 0] - lower[0]) / 0.45).astype(int),
            (mask.shape[0] - 1 - (raw_route[:, 2] - lower[1]) / 0.45).astype(int),
        ))
        cv2.polylines(preview, [pixels], True, (0, 0, 255), 5)
        cv2.imwrite(str(args.preview), preview)

    if args.write:
        source = args.selector.read_text()
        updated, replacements = re.subn(
            r"(BAHRAIN_ROUTE_DATA = ')[^']*(')",
            lambda match: match.group(1) + encoded + match.group(2), source, count=1,
        )
        if replacements != 1:
            raise RuntimeError("BAHRAIN_ROUTE_DATA replacement failed")
        args.selector.write_text(updated)

    length = np.linalg.norm(np.roll(route_xz, -1, axis=0) - route_xz, axis=1).sum()
    print(json.dumps({"meshes": mesh_indices, "points": len(route), "length_m": round(float(length), 2), "recenter": recenter.round(4).tolist(), "base64": encoded}, separators=(",", ":")))


if __name__ == "__main__":
    main()
