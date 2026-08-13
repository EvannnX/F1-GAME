#!/usr/bin/env python3
"""Regenerate Spa's closed AI route from the GLB groove surfaces.

The existing route is used only as an ordered topology guide.  Every point is
re-centred inside the same continuous groove strip, then the result is
arc-length resampled and smoothed.  This avoids selecting pit-lane branches or
isolated texture triangles at tight corners.
"""

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


COMPONENT_DTYPE = {
    5121: np.uint8,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
COMPONENT_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
GROOVE_MESHES = (32, 33, 34, 35)
RASTER_METRES = 0.35
WORLD_CENTER_XZ = np.array([-245.06573486, -463.86840820])
WORLD_MIN_Y = -51.09717941


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
        (item["count"], width),
        dtype=dtype,
        buffer=binary,
        offset=offset,
        strides=(stride, dtype.itemsize),
    ).copy()


def read_seed(track_selector: Path):
    source = track_selector.read_text()
    match = re.search(r"SPA_ROUTE_DATA = '([^']+)'", source)
    if not match:
        raise RuntimeError("SPA_ROUTE_DATA was not found")
    packed = base64.b64decode(match.group(1))
    points = np.array(
        [struct.unpack_from("<hhh", packed, index) for index in range(0, len(packed), 6)],
        dtype=float,
    ) / 10.0
    return points


def rasterize_grooves(document, binary):
    vertices = []
    for mesh_index in GROOVE_MESHES:
        primitive = document["meshes"][mesh_index]["primitives"][0]
        vertices.append(accessor(document, binary, primitive["attributes"]["POSITION"]))
    bounds = np.vstack([item[:, :2] for item in vertices])
    lower = bounds.min(axis=0) - 10
    upper = bounds.max(axis=0) + 10
    width = int((upper[0] - lower[0]) / RASTER_METRES) + 1
    height = int((upper[1] - lower[1]) / RASTER_METRES) + 1
    mask = np.zeros((height, width), dtype=np.uint8)
    for mesh_index, positions in zip(GROOVE_MESHES, vertices):
        primitive = document["meshes"][mesh_index]["primitives"][0]
        triangles = accessor(document, binary, primitive["indices"]).ravel().astype(int).reshape(-1, 3)
        pixels = np.column_stack(
            (
                ((positions[:, 0] - lower[0]) / RASTER_METRES).astype(int),
                (height - 1 - (positions[:, 1] - lower[1]) / RASTER_METRES).astype(int),
            )
        )
        for triangle in triangles:
            cv2.fillConvexPoly(mask, pixels[triangle], 255)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return mask, lower, vertices


def mask_runs(mask, lower, point, normal):
    offsets = np.arange(-80.0, 80.001, RASTER_METRES)
    samples = point + offsets[:, None] * normal
    px = ((samples[:, 0] - lower[0]) / RASTER_METRES).astype(int)
    py = (mask.shape[0] - 1 - (samples[:, 1] - lower[1]) / RASTER_METRES).astype(int)
    valid = (px >= 0) & (px < mask.shape[1]) & (py >= 0) & (py < mask.shape[0])
    inside = np.zeros(len(offsets), dtype=bool)
    inside[valid] = mask[py[valid], px[valid]] > 0
    changes = np.diff(np.r_[False, inside, False].astype(int))
    starts = np.where(changes == 1)[0]
    ends = np.where(changes == -1)[0]
    runs = []
    for start, end in zip(starts, ends):
        middle = 0.5 * (offsets[start] + offsets[end - 1])
        width = offsets[end - 1] - offsets[start] + RASTER_METRES
        if width >= 0.7:
            runs.append((middle, width))
    return runs or [(0.0, 0.0)]


def choose_continuous_centres(seed_xy, mask, lower):
    count = len(seed_xy)
    normals = []
    candidates = []
    for index, point in enumerate(seed_xy):
        tangent = seed_xy[(index + 4) % count] - seed_xy[(index - 4) % count]
        tangent /= max(1e-9, np.linalg.norm(tangent))
        normal = np.array([-tangent[1], tangent[0]])
        normals.append(normal)
        candidates.append(mask_runs(mask, lower, point, normal))
    normals = np.array(normals)

    best = None
    for start_index, (start_offset, start_width) in enumerate(candidates[0]):
        costs = np.full(len(candidates[0]), np.inf)
        costs[start_index] = 0.018 * start_offset**2 - 0.08 * min(start_width, 10)
        previous_offsets = np.array([item[0] for item in candidates[0]])
        backtracks = []
        for index in range(1, count):
            offsets = np.array([item[0] for item in candidates[index]])
            widths = np.array([item[1] for item in candidates[index]])
            matrix = (
                costs[:, None]
                + 0.35 * (previous_offsets[:, None] - offsets[None, :]) ** 2
                + 0.018 * offsets[None, :] ** 2
                - 0.08 * np.minimum(widths[None, :], 10)
            )
            choices = np.argmin(matrix, axis=0)
            costs = matrix[choices, np.arange(len(offsets))]
            backtracks.append(choices)
            previous_offsets = offsets
        last_offsets = np.array([item[0] for item in candidates[-1]])
        total = costs + 0.35 * (last_offsets - start_offset) ** 2
        end_index = int(np.argmin(total))
        path = [end_index]
        for choices in reversed(backtracks):
            path.append(int(choices[path[-1]]))
        path.reverse()
        result = (float(total[end_index]), path)
        if best is None or result[0] < best[0]:
            best = result

    path = best[1]
    offsets = np.array([candidates[i][path[i]][0] for i in range(count)])
    widths = np.array([candidates[i][path[i]][1] for i in range(count)])
    missing = widths == 0
    if missing.any():
        good = np.where(~missing)[0]
        offsets[missing] = np.interp(np.where(missing)[0], good, offsets[good], period=count)
    return seed_xy + normals * offsets[:, None]


def remove_small_self_loops(points):
    """Drop short mesh-spur loops that leave and rejoin the same junction."""
    from scipy.spatial import cKDTree

    result = points.copy()
    for _ in range(8):
        if len(result) < 20:
            break
        pairs = cKDTree(result).query_pairs(2.2)
        candidates = []
        for first, last in pairs:
            gap = last - first
            if not 5 <= gap <= min(90, len(result) // 8):
                continue
            arc = np.linalg.norm(np.diff(result[first : last + 1], axis=0), axis=1).sum()
            chord = np.linalg.norm(result[last] - result[first])
            if arc >= 25 and arc >= 8 * max(chord, 0.25):
                candidates.append((arc, first, last))
        if not candidates:
            break
        _, first, last = max(candidates)
        result = np.vstack((result[: first + 1], result[last:]))
    return result


def resample_closed(points, spacing=5.0):
    points = remove_small_self_loops(points)
    segments = np.linalg.norm(np.roll(points, -1, axis=0) - points, axis=1)
    cumulative = np.r_[0.0, np.cumsum(segments)]
    total = cumulative[-1]
    sample_count = max(8, int(round(total / spacing)))
    distances = np.linspace(0.0, total, sample_count, endpoint=False)
    closed = np.vstack((points, points[0]))
    x = np.interp(distances, cumulative, closed[:, 0])
    y = np.interp(distances, cumulative, closed[:, 1])
    result = np.column_stack((x, y))
    result[:, 0] = ndimage.gaussian_filter1d(result[:, 0], 1.8, mode="wrap")
    result[:, 1] = ndimage.gaussian_filter1d(result[:, 1], 1.8, mode="wrap")
    # Remove isolated texture-spur turns. Real Spa corners bend over several
    # samples; a one- or two-sample turn above 24 degrees is a mesh branch.
    for _ in range(18):
        incoming = result - np.roll(result, 1, axis=0)
        outgoing = np.roll(result, -1, axis=0) - result
        denominator = np.maximum(1e-9, np.linalg.norm(incoming, axis=1) * np.linalg.norm(outgoing, axis=1))
        cosine = np.clip(np.sum(incoming * outgoing, axis=1) / denominator, -1.0, 1.0)
        spikes = np.arccos(cosine) > np.deg2rad(24)
        if not spikes.any():
            break
        neighbour_average = 0.5 * (np.roll(result, 1, axis=0) + np.roll(result, -1, axis=0))
        result[spikes] = 0.25 * result[spikes] + 0.75 * neighbour_average[spikes]
    return remove_small_self_loops(result)


def interpolate_heights(points_raw_xy, groove_vertices):
    vertices = np.vstack(groove_vertices)
    # The groove surfaces are densely sampled; inverse-distance interpolation
    # from the nearest vertices keeps elevation continuous across material seams.
    from scipy.spatial import cKDTree

    tree = cKDTree(vertices[:, :2])
    distances, indices = tree.query(points_raw_xy, k=8)
    weights = 1.0 / np.maximum(distances, 0.05) ** 2
    raw_z = np.sum(vertices[indices, 2] * weights, axis=1) / np.sum(weights, axis=1)
    return -raw_z - WORLD_MIN_Y


def pack_route(game_xyz):
    quantized = np.rint(game_xyz * 10).astype(np.int16)
    return base64.b64encode(quantized.astype("<i2").tobytes()).decode()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", type=Path, default=Path("assets/spa-francorchamps-2022.glb"))
    parser.add_argument("--selector", type=Path, default=Path("track-selector.js"))
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    document, binary = load_glb(args.glb)
    seed = read_seed(args.selector)
    mask, lower, groove_vertices = rasterize_grooves(document, binary)
    seed_raw_xy = seed[:, (0, 2)] + WORLD_CENTER_XZ
    centred = choose_continuous_centres(seed_raw_xy, mask, lower)
    centred = resample_closed(centred)
    heights = interpolate_heights(centred, groove_vertices)
    game_xyz = np.column_stack((centred[:, 0] - WORLD_CENTER_XZ[0], heights, centred[:, 1] - WORLD_CENTER_XZ[1]))

    if args.preview:
        preview = np.dstack([mask // 5] * 3)
        pixels = np.column_stack(
            (
                ((centred[:, 0] - lower[0]) / RASTER_METRES).astype(int),
                (mask.shape[0] - 1 - (centred[:, 1] - lower[1]) / RASTER_METRES).astype(int),
            )
        )
        cv2.polylines(preview, [pixels], True, (0, 0, 255), 2)
        cv2.imwrite(str(args.preview), preview)

    segment_lengths = np.linalg.norm(np.roll(game_xyz[:, (0, 2)], -1, axis=0) - game_xyz[:, (0, 2)], axis=1)
    encoded = pack_route(game_xyz)
    if args.write:
        source = args.selector.read_text()
        updated, replacements = re.subn(
            r"(SPA_ROUTE_DATA = ')[^']+(')",
            lambda match: match.group(1) + encoded + match.group(2),
            source,
            count=1,
        )
        if replacements != 1:
            raise RuntimeError("SPA_ROUTE_DATA replacement failed")
        args.selector.write_text(updated)

    print(
        json.dumps(
            {
                "points": len(game_xyz),
                "length_m": round(float(segment_lengths.sum()), 2),
                "max_segment_m": round(float(segment_lengths.max()), 2),
                "base64": encoded,
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
