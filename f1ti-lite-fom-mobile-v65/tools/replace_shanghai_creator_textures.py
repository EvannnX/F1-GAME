#!/usr/bin/env python3
"""Replace every embedded douyin_ai_* texture in the Shanghai GLB."""

from __future__ import annotations

import argparse
import copy
import io
import json
import struct
from pathlib import Path

from PIL import Image


JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def align4(value: int) -> int:
    return (value + 3) & ~3


def read_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    magic, version, _ = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67 or version != 2:
        raise ValueError(f"Not a glTF 2.0 GLB: {path}")

    document = None
    binary = None
    offset = 12
    while offset < len(raw):
        length, chunk_type = struct.unpack_from("<II", raw, offset)
        data = raw[offset + 8 : offset + 8 + length]
        if chunk_type == JSON_CHUNK:
            document = json.loads(data.rstrip(b" \t\r\n\0"))
        elif chunk_type == BIN_CHUNK:
            binary = bytes(data)
        offset += 8 + length

    if document is None or binary is None:
        raise ValueError("GLB is missing JSON or BIN chunk")
    return document, binary


def png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Target embedded image is not PNG")
    return struct.unpack_from(">II", data, 16)


def black_master(source: Path) -> Image.Image:
    foreground = Image.open(source).convert("RGBA")
    background = Image.new("RGBA", foreground.size, (0, 0, 0, 255))
    background.alpha_composite(foreground)
    return background.convert("RGB")


def contain_on_black(master: Image.Image, width: int, height: int) -> Image.Image:
    scale = min(width / master.width, height / master.height)
    size = (
        max(1, round(master.width * scale)),
        max(1, round(master.height * scale)),
    )
    resized = master.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (width, height), "black")
    canvas.paste(resized, ((width - size[0]) // 2, (height - size[1]) // 2))
    return canvas


def make_replacement(master: Image.Image, name: str, width: int, height: int) -> bytes:
    # The old PIT texture is a horizontal animation atlas. It must not be
    # filled frame-by-frame: doing so produces visible copies on both sides of
    # the oval display. One contained image in the full atlas leaves every
    # surrounding sample black and keeps only the centre artwork visible.
    image = contain_on_black(master, width, height)

    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def write_glb(path: Path, document: dict, binary: bytes) -> None:
    json_data = json.dumps(
        document, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    json_data += b" " * (align4(len(json_data)) - len(json_data))
    binary += b"\0" * (align4(len(binary)) - len(binary))
    total = 12 + 8 + len(json_data) + 8 + len(binary)

    with path.open("wb") as handle:
        handle.write(struct.pack("<III", 0x46546C67, 2, total))
        handle.write(struct.pack("<II", len(json_data), JSON_CHUNK))
        handle.write(json_data)
        handle.write(struct.pack("<II", len(binary), BIN_CHUNK))
        handle.write(binary)


def replace(source_glb: Path, artwork: Path, output_glb: Path, master_png: Path) -> int:
    document, binary = read_glb(source_glb)
    master = black_master(artwork)
    master.save(master_png, format="PNG", optimize=True)

    samplers = document.setdefault("samplers", [])
    repeat_sampler = len(samplers)
    samplers.append(
        {
            "magFilter": 9729,
            "minFilter": 9987,
            "wrapS": 10497,
            "wrapT": 10497,
        }
    )
    clamp_sampler = len(samplers)
    samplers.append(
        {
            "magFilter": 9729,
            "minFilter": 9987,
            "wrapS": 33071,
            "wrapT": 33071,
        }
    )

    replacements: dict[tuple[str, int, int], int] = {}
    replaced = 0
    for image in document.get("images", []):
        name = str(image.get("name", ""))
        if not name.lower().startswith("douyin_ai_"):
            continue

        view = document["bufferViews"][image["bufferView"]]
        start = int(view.get("byteOffset", 0))
        original = binary[start : start + int(view["byteLength"])]
        width, height = png_size(original)
        key = (name if name == "douyin_ai_PIT_animato" else "static", width, height)

        if key not in replacements:
            replacement = make_replacement(master, name, width, height)
            offset = align4(len(binary))
            binary += b"\0" * (offset - len(binary)) + replacement
            view_index = len(document["bufferViews"])
            document["bufferViews"].append(
                {"buffer": 0, "byteOffset": offset, "byteLength": len(replacement)}
            )
            replacements[key] = view_index

        image["bufferView"] = replacements[key]
        image["mimeType"] = "image/png"
        image_index = document["images"].index(image)
        for texture in document.get("textures", []):
            if texture.get("source") == image_index:
                # Ordinary wall advertising repeats. The source artwork is
                # letterboxed before this point, so repetition never distorts
                # its native aspect ratio.
                texture["sampler"] = repeat_sampler
        replaced += 1

    # The two materials below are the front/back faces of the geometrically
    # highest Shanghai display. Give them private clamped texture slots so the
    # runtime can place one complete image on the broad centre panel while the
    # rounded end caps remain black. Their source images are shared by lower
    # wall ads, so changing the shared texture would also disable wall tiling.
    for material in document.get("materials", []):
        if material.get("name") not in {"Heinek_BIG", "NeverD"}:
            continue
        info = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if not info:
            continue
        original_texture = document["textures"][info["index"]]
        original_image = document["images"][original_texture["source"]]
        private_image = copy.deepcopy(original_image)
        private_image["name"] = f"shanghai_highest_single_{material['name']}"
        private_image_index = len(document["images"])
        document["images"].append(private_image)
        private_texture = copy.deepcopy(original_texture)
        private_texture["name"] = f"shanghai_highest_single_{material['name']}"
        private_texture["source"] = private_image_index
        private_texture["sampler"] = clamp_sampler
        private_texture_index = len(document["textures"])
        document["textures"].append(private_texture)
        info["index"] = private_texture_index

    document["buffers"][0]["byteLength"] = len(binary)
    write_glb(output_glb, document, binary)
    return replaced


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_glb", type=Path)
    parser.add_argument("artwork", type=Path)
    parser.add_argument("output_glb", type=Path)
    parser.add_argument("master_png", type=Path)
    args = parser.parse_args()
    count = replace(args.source_glb, args.artwork, args.output_glb, args.master_png)
    print(f"Replaced {count} embedded douyin_ai_* textures")


if __name__ == "__main__":
    main()
