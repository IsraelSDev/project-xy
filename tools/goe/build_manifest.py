"""
Gera apps/web/public/assets/goe/manifest.json: origem, licença, hash e contagens de cada GLB.

Uso:
    python tools/goe/build_manifest.py apps/web/public/assets/goe

Cada entrada tem id, caminho, bytes, sha256, triângulos, materiais e texturas (conta lida do GLB),
além de origem e licença. Roda de novo sempre que um GLB mudar.
"""

import glob
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from glb_tools import read_glb  # noqa: E402

BODIES = {"GoE_Male", "GoE_Female"}
HAIR = re.compile(r"GoE_[MF]_Hair\d\d$")

LICENSE = "GoE Character Creator Bundle (DanilGOE), licença Comercial, proprietária: uso e exportação no próprio projeto; sem redistribuição do material-fonte"
ORIGIN = "GoE Character Creator (DanilGOE), basemesh V1.4 (Male/Female_Basemesh_CCGOE_V1.4_Blender_5.2.blend), pacote 'personagem'"


def triangles(gltf):
    total = 0
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            index = primitive.get("indices")
            if index is not None:
                total += gltf["accessors"][index]["count"] // 3
    return total


def entry_for(path, root):
    gltf, _ = read_glb(path)
    rel = os.path.relpath(path, root).replace(os.sep, "/")
    name = os.path.splitext(os.path.basename(path))[0]
    # id = id de catálogo (packages/contracts/src/avatar.ts) ou id de pose (pose01..pose10, sex01..sex10).
    asset_id = name
    if rel.startswith("poses/"):
        kind = "pose"
    elif name in BODIES:
        kind = "body"
    elif HAIR.match(name):
        kind = "hair"
    else:
        kind = "clothing"
    with open(path, "rb") as handle:
        digest = hashlib.sha256(handle.read()).hexdigest()
    return {
        "id": asset_id,
        "kind": kind,
        "path": rel,
        "bytes": os.path.getsize(path),
        "sha256": digest,
        "version": "basemesh-v1.4",
        "triangles": triangles(gltf),
        "materials": len(gltf.get("materials", [])),
        "textures": len(gltf.get("images", [])),
        "origin": ORIGIN,
        "license": LICENSE,
        "author": "DanilGOE",
    }


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "apps/web/public/assets/goe"
    files = sorted(glob.glob(os.path.join(root, "*.glb")) + glob.glob(os.path.join(root, "poses", "*.glb")))
    if not files:
        raise SystemExit(f"nenhum GLB em {root}")
    manifest = {
        "schema": 1,
        # Nada do pacote fica de fora: malhas, shape keys (exceto as sem efeito visível, ver export_goe.py) e poses.
        "exclusions": [],
        "assets": [entry_for(path, root) for path in files],
    }
    out = os.path.join(root, "manifest.json")
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"MANIFEST {out} ({len(manifest['assets'])} assets)")


if __name__ == "__main__":
    main()
