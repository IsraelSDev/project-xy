"""Adiciona um normal map a um GLB já exportado, sem reexportar a malha.

Útil quando o GLB publicado já tem a malha/esqueleto bons, mas o pipeline antigo
não levou o `_BumpMap` do material original. O normal map usa as mesmas UVs do
albedo; se o mesh não tiver TANGENT, o PBR do Babylon calcula a tangente na tela.

    py -3.11 tools/3dx/add_normal_texture.py --glb <in.glb> --normal <normal.png> --out <out.glb>
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise SystemExit(f"{path}: não é um GLB 2.0")
    offset = 12
    doc = None
    binary = b""
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8 : offset + 8 + length]
        if kind == JSON_CHUNK:
            doc = json.loads(payload.decode("utf-8"))
        elif kind == BIN_CHUNK:
            binary = payload
        offset += 8 + length
    if doc is None:
        raise SystemExit(f"{path}: GLB sem chunk JSON")
    return doc, binary


def write_glb(path: Path, doc: dict, binary: bytes) -> None:
    json_bytes = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    payload = (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(json_bytes), JSON_CHUNK)
        + json_bytes
        + struct.pack("<II", len(binary), BIN_CHUNK)
        + binary
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--glb", required=True, type=Path)
    ap.add_argument("--normal", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--material", type=int, default=0)
    args = ap.parse_args()

    doc, binary = read_glb(args.glb)
    image = args.normal.read_bytes()
    offset = len(binary)
    binary += image

    doc.setdefault("bufferViews", []).append(
        {"buffer": 0, "byteOffset": offset, "byteLength": len(image)}
    )
    view = len(doc["bufferViews"]) - 1
    doc.setdefault("images", []).append({"bufferView": view, "mimeType": "image/png"})
    image_index = len(doc["images"]) - 1
    if not doc.get("samplers"):
        doc["samplers"] = [
            {"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}
        ]
    doc.setdefault("textures", []).append({"sampler": 0, "source": image_index})
    texture_index = len(doc["textures"]) - 1
    doc["materials"][args.material]["normalTexture"] = {"index": texture_index}
    if doc.get("buffers"):
        doc["buffers"][0]["byteLength"] = len(binary)
    else:
        doc["buffers"] = [{"byteLength": len(binary)}]

    write_glb(args.out, doc, binary)
    print(f"[normal] {args.glb.name} + {args.normal.name} -> {args.out} ({args.out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
