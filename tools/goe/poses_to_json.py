"""
Converte as poses GLB (export_poses_goe.py) em goe-poses.json, o formato lido por goe-poses.ts.

Uso:
    python tools/goe/poses_to_json.py apps/web/public/assets/goe/poses

Para cada pose e cada osso: transform local `[x, y, z, qx, qy, qz, qw]` no primeiro quadro, relativo ao PAI FK
do jogo (fk_hierarchy.FK_PARENTS; ossos fora da tabela ficam com o pai do próprio GLB). A pose GLB traz a
hierarquia de deformação do rig; o cálculo parte do transform de mundo de cada osso nessa pose e o converte
para o local em relação ao pai FK, então o jogo reproduz a mesma pose na hierarquia FK.
"""

import glob
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fk_hierarchy import FK_PARENTS  # noqa: E402
from glb_tools import decompose_trs, mat_inverse, mat_mul, read_glb, world_matrices  # noqa: E402

FLOAT = 5126
COMPONENTS = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}
SCALE_TOLERANCE = 1e-3


def read_first(gltf, binary, accessor_index):
    accessor = gltf["accessors"][accessor_index]
    if accessor["componentType"] != FLOAT:
        raise ValueError("só float32 é suportado nas poses")
    view = gltf["bufferViews"][accessor["bufferView"]]
    width = COMPONENTS[accessor["type"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return list(struct.unpack_from(f"<{width}f", binary, offset))


def pose_nodes(gltf, binary):
    """Cópia dos nós com o primeiro quadro aplicado (canal de translation/rotation sobrepõe o repouso)."""
    nodes = [dict(node) for node in gltf["nodes"]]
    animation = gltf["animations"][0]
    for channel in animation["channels"]:
        path_name = channel["target"]["path"]
        if path_name not in ("translation", "rotation"):
            continue
        sampler = animation["samplers"][channel["sampler"]]
        node = nodes[channel["target"]["node"]]
        node[path_name] = read_first(gltf, binary, sampler["output"])
        node.pop("matrix", None)
    return nodes


def pose_bones(path):
    gltf, binary = read_glb(path)
    nodes = pose_nodes(gltf, binary)
    names = [node.get("name", "") for node in nodes]
    index = {name: i for i, name in enumerate(names)}
    world = world_matrices(nodes)
    parent = {}
    for i, node in enumerate(nodes):
        for child in node.get("children", []):
            parent[child] = i
    bones = {}
    for joint in gltf["skins"][0]["joints"]:
        name = names[joint]
        if name in FK_PARENTS:
            if FK_PARENTS[name] not in index:
                raise ValueError(f"{os.path.basename(path)}: pai FK {FK_PARENTS[name]} de {name} ausente")
            parent_index = index[FK_PARENTS[name]]
        else:
            parent_index = parent.get(joint)
        local = world[joint] if parent_index is None else mat_mul(mat_inverse(world[parent_index]), world[joint])
        translation, rotation, scale = decompose_trs(local)
        if any(abs(abs(s) - 1.0) > SCALE_TOLERANCE for s in scale):
            raise ValueError(f"{os.path.basename(path)}: escala não unitária em {name}: {scale}")
        bones[name] = [round(v, 6) for v in translation + rotation]
    return bones


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else "apps/web/public/assets/goe/poses"
    files = sorted(glob.glob(os.path.join(folder, "pose*.glb")))
    if not files:
        raise SystemExit(f"nenhuma pose em {folder}")
    poses = {}
    for path in files:
        key = os.path.splitext(os.path.basename(path))[0]  # pose01
        poses[key] = pose_bones(path)
    out = os.path.join(folder, "goe-poses.json")
    with open(out, "w", encoding="utf-8") as handle:
        json.dump({"rig": "GoE female basemesh V1.4 (Goe_F_Pose), hierarquia FK", "poses": poses}, handle,
                  ensure_ascii=False, separators=(",", ":"))
    print(f"POSES_JSON {out} ({len(poses)} poses, ~{sum(len(v) for v in poses.values())} bones)")


if __name__ == "__main__":
    main()
