"""
Converte os clipes GLB (retarget.py) em `clips-male.json` / `clips-female.json`, lidos por goe-clips.ts.

Uso:
    python tools/goe/anim/clips_to_json.py <pasta-com-os-glb> apps/web/public/assets/goe/clips

Para cada clipe e cada osso: `frames * 7` números `[x, y, z, qx, qy, qz, qw]` em sequência, o transform LOCAL do osso em
relação ao pai FK do jogo (mesma convenção das poses, ver poses_to_json.py), um bloco por quadro. O clipe é um ciclo
de `frames` quadros em `fps` (o último volta ao primeiro).
"""

import glob
import json
import os
import struct
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fk_hierarchy import FK_PARENTS  # noqa: E402
from glb_tools import decompose_trs, mat_inverse, mat_mul, read_glb, world_matrices  # noqa: E402

FLOAT = 5126
COMPONENTS = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}
SCALE_TOLERANCE = 1e-3


def read_all(gltf, binary, accessor_index):
    accessor = gltf["accessors"][accessor_index]
    if accessor["componentType"] != FLOAT:
        raise ValueError("só float32 é suportado")
    view = gltf["bufferViews"][accessor["bufferView"]]
    width = COMPONENTS[accessor["type"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    flat = struct.unpack_from(f"<{accessor['count'] * width}f", binary, offset)
    return [list(flat[i * width:(i + 1) * width]) for i in range(accessor["count"])]


def clip_frames(path, frames_wanted):
    gltf, binary = read_glb(path)
    base = [dict(node) for node in gltf["nodes"]]
    names = [node.get("name", "") for node in base]
    index = {name: i for i, name in enumerate(names)}
    parent = {}
    for i, node in enumerate(base):
        for child in node.get("children", []):
            parent[child] = i
    animation = gltf["animations"][0]
    tracks = {}
    for channel in animation["channels"]:
        path_name = channel["target"]["path"]
        if path_name not in ("translation", "rotation"):
            continue
        sampler = animation["samplers"][channel["sampler"]]
        tracks[(channel["target"]["node"], path_name)] = read_all(gltf, binary, sampler["output"])
    count = max(len(v) for v in tracks.values())
    if count != frames_wanted:
        raise ValueError(f"{os.path.basename(path)}: {count} quadros, esperava {frames_wanted}")
    joints = gltf["skins"][0]["joints"]
    bones = {names[j]: [] for j in joints}
    for f in range(count):
        nodes = [dict(node) for node in base]
        for (node_index, path_name), samples in tracks.items():
            nodes[node_index][path_name] = samples[min(f, len(samples) - 1)]
            nodes[node_index].pop("matrix", None)
        world = world_matrices(nodes)
        for joint in joints:
            name = names[joint]
            if name in FK_PARENTS:
                parent_index = index[FK_PARENTS[name]]
            else:
                parent_index = parent.get(joint)
            local = world[joint] if parent_index is None else mat_mul(mat_inverse(world[parent_index]), world[joint])
            translation, rotation, scale = decompose_trs(local)
            if any(abs(abs(s) - 1.0) > SCALE_TOLERANCE for s in scale):
                raise ValueError(f"{os.path.basename(path)}: escala não unitária em {name}: {scale}")
            previous = bones[name][-4:] if bones[name] else None
            if previous and sum(a * b for a, b in zip(previous, rotation)) < 0:
                rotation = [-v for v in rotation]
            bones[name].extend(round(v, 5) for v in translation + rotation)
    return bones


def main():
    src = sys.argv[1]
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    for gender in ("male", "female"):
        meta_path = os.path.join(src, f"{gender}_meta.json")
        if not os.path.exists(meta_path):
            continue
        meta = json.load(open(meta_path, encoding="utf-8"))
        clips = {}
        for name, info in meta["clips"].items():
            bones = clip_frames(os.path.join(src, f"{gender}_{name}.glb"), info["frames"])
            clips[name] = {"frames": info["frames"], "stride": info["stride"], "bones": bones}
            print(f"CLIP_JSON {gender}/{name}: {info['frames']} quadros, {len(bones)} ossos")
        target = os.path.join(out, f"clips-{gender}.json")
        with open(target, "w", encoding="utf-8") as handle:
            json.dump({"fps": meta["fps"], "clips": clips}, handle, separators=(",", ":"))
        print(f"WROTE {target} ({os.path.getsize(target) // 1024} KB)")


if __name__ == "__main__":
    main()
