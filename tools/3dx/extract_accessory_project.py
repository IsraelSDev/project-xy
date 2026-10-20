"""Extrai um acessório rígido (óculos, máscara) do projeto exportado.

O prefab traz um ``MeshFilter``/``MeshRenderer`` sem skin. O jogo precisa que a
peça siga a cabeça, então assamos a malha no espaço do corpo e atribuímos 100%
do peso ao osso da cabeça. A translação da raiz do prefab é um offset de
preview; usamos só rotação/escala e ancoramos na posição de rest do osso.

Exemplo::

    py -3.11 tools/3dx/extract_accessory_project.py \
        --source ".../Resources/man/cloth/glasses_1.prefab" \
        --rig tools/3dx/rigs/3dx_male.json --gender male \
        --out tools/3dx/build/project/accessories/3dx_m_glasses_1.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import lib3dx as L
import project_env as P

I4 = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]]


def find_bone(bones: list[dict], gender: str, bone: str) -> int:
    target = f"{'man' if gender == 'male' else 'woman'}_bone_{bone}"
    for i, item in enumerate(bones):
        if L.bone_key(item["path"]) == target:
            return i
    raise SystemExit(f"bone {target!r} not found in rig")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", required=True, help="prefab do acessório rígido")
    ap.add_argument("--rig", required=True, help="JSON do contrato de esqueleto")
    ap.add_argument("--gender", choices=["male", "female"], required=True)
    ap.add_argument("--bone", default="Head", help="osso de encaixe (Head, Neck, ...)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    source = Path(args.source)
    env = P.ProjectEnv.from_prefab(source)
    _, info = L.build_transforms(env)
    root = next((item for item in info.values() if item["parent"] is None), None)
    if root is None:
        raise SystemExit(f"{source}: no root transform")

    mesh = None
    for obj in env.objects:
        if obj.type.name != "MeshFilter":
            continue
        candidate = obj.read().m_Mesh.read()
        if "LOD" not in candidate.m_Name:
            mesh = candidate
            break
    if mesh is None:
        raise SystemExit(f"{source}: no LOD0 MeshFilter")

    data = P.extract_mesh_project(mesh)
    rig = json.loads(Path(args.rig).read_text(encoding="utf-8"))
    bones = rig["bones"]
    bone_index = find_bone(bones, args.gender, args.bone)
    # `pos`/`rest` in the rig JSON are world-space rest transforms.
    bx, by, bz = bones[bone_index]["pos"]

    rotation = L.mat_from_q(root["rot"])
    sx, sy, sz = root.get("scale", [1.0, 1.0, 1.0])

    def to_blender(v: list[float]) -> list[float]:
        vx, vy, vz = v[0] * sx, v[1] * sy, v[2] * sz
        x = rotation[0][0] * vx + rotation[0][1] * vy + rotation[0][2] * vz
        y = rotation[1][0] * vx + rotation[1][1] * vy + rotation[1][2] * vz
        z = rotation[2][0] * vx + rotation[2][1] * vy + rotation[2][2] * vz
        return [round(bx + x, 5), round(-(bz + z), 5), round(by + y, 5)]

    def normal_to_blender(n: list[float]) -> list[float]:
        x = rotation[0][0] * n[0] + rotation[0][1] * n[1] + rotation[0][2] * n[2]
        y = rotation[1][0] * n[0] + rotation[1][1] * n[1] + rotation[1][2] * n[2]
        z = rotation[2][0] * n[0] + rotation[2][1] * n[1] + rotation[2][2] * n[2]
        return [round(x, 5), round(-z, 5), round(y, 5)]

    verts = [to_blender(v) for v in data["verts"]]
    normals = [normal_to_blender(n) for n in data["normals"]]
    count = len(verts)
    payload = {
        "gender": args.gender,
        "source": str(source),
        "skeleton": str(args.rig),
        "bones": bones,
        "meshes": [
            {
                "name": mesh.m_Name,
                "verts": verts,
                "normals": normals,
                "uvs": data["uvs"],
                "indices": data["indices"],
                "boneIdx": [bone_index, 0, 0, 0] * count,
                "weights": [1.0, 0.0, 0.0, 0.0] * count,
                "bindposes": [I4],
            }
        ],
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(
        f"[rigid] {source.stem}: {count} verts, bone {args.bone} ({bone_index}) "
        f"at {tuple(round(v, 3) for v in (bx, by, bz))} -> {out}"
    )


if __name__ == "__main__":
    main()
