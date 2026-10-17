"""
Verifica GLBs do pipeline GoE: float32, materiais, um skeleton por arquivo, ossos das peças dentro do corpo, hierarquia FK.

Uso:
    python tools/goe/verify_goe.py <pasta-ou-arquivo.glb> [...]

Sai com código 1 se qualquer regra falhar. Não lê texturas em pixel: confere tamanho declarado.
"""

import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fk_hierarchy import FK_PARENTS  # noqa: E402
from glb_tools import read_glb  # noqa: E402

HAIR = re.compile(r"GoE_[MF]_Hair\d\d$")


def gender_of(path):
    base = os.path.basename(path).lower()
    return "female" if base.startswith(("goe_female", "goe_f_")) else "male"


def item_kind(path):
    base = os.path.splitext(os.path.basename(path))[0]
    if base.lower().startswith(("pose", "sex")):
        return "pose"
    if base in ("GoE_Male", "GoE_Female"):
        return "body"
    if HAIR.match(base):
        return "hair"
    return "clothing"


def body_file(gender):
    """Corpo de referência do gênero (nome de catálogo, mesma pasta ou pasta acima)."""
    return "GoE_Female.glb" if gender == "female" else "GoE_Male.glb"


def joint_names(gltf):
    """Nomes dos ossos do primeiro skin (o skeleton da peça)."""
    skins = gltf.get("skins", [])
    if not skins:
        return set()
    nodes = gltf.get("nodes", [])
    return {nodes[index].get("name", "") for index in skins[0].get("joints", [])}


def check(path):
    failures = []
    gltf, binary = read_glb(path)
    kind = item_kind(path)
    size_mb = os.path.getsize(path) / 1e6
    # Sem orçamento de tamanho: export completo, sem compressão (pedido explícito).
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            # Posição quantizada (int16 normalizado) perde o fator de decode em malha skinned: olhos/roupas
            # ficam em escala errada no Babylon. Tem que ser float32.
            if gltf["accessors"][primitive["attributes"]["POSITION"]]["componentType"] != 5126:
                failures.append(f"posições não float32 em {mesh.get('name')}")
                break

    skins = gltf.get("skins", [])
    if len(skins) > 1:
        failures.append(f"{len(skins)} skins (esperado 1: um skeleton por GLB)")

    for mat in gltf.get("materials", []):
        mode = mat.get("alphaMode", "OPAQUE")
        name = mat.get("name", "")
        if kind == "body" and mode != "OPAQUE" and ("Body" in name or "Eyes" in name):
            failures.append(f"material {name} com alpha {mode} (esperado OPAQUE)")
        if "Eyes" in name:
            if mat.get("pbrMetallicRoughness", {}).get("metallicFactor", 1) != 0:
                failures.append(f"olhos {name} com metal != 0")
        if ("Eyebrow" in name or "Hair" in name) and mode != "MASK":
            failures.append(f"{name} com alpha {mode} (esperado MASK)")

    if kind == "pose":
        if gltf.get("meshes"):
            failures.append("pose não pode ter malha")
        body_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(path))), body_file("female"))
        body_joints = joint_names(read_glb(body_path)[0]) if os.path.exists(body_path) else set()
        for anim in gltf.get("animations", []):
            targets = {gltf["nodes"][c["target"]["node"]].get("name", "") for c in anim["channels"]}
            outside = targets - body_joints
            if outside:
                failures.append(f"canais fora do skeleton do corpo: {sorted(outside)[:5]}")
        return kind, size_mb, failures

    own_joints = joint_names(gltf)
    # Sem a hierarquia FK (fk_hierarchy.py) as poses e os clipes (transform local no pai FK) deformam a peça errado: a
    # anatomia masculina chegou assim e ficou com a ponta virada para cima.
    nodes = gltf.get("nodes", [])
    names = [node.get("name", "") for node in nodes]
    parent_of = {names[child]: names[i] for i, node in enumerate(nodes) for child in node.get("children", [])}
    wrong = sorted(
        f"{bone}<-{parent_of.get(bone)} (esperado {parent})"
        for bone, parent in FK_PARENTS.items()
        if bone in own_joints and parent_of.get(bone) != parent
    )
    if wrong:
        failures.append(f"hierarquia FK não aplicada (rode fk_hierarchy.py): {wrong[:3]}")
    if kind == "body" and len(own_joints) > 150:
        failures.append(f"{len(own_joints)} ossos no skeleton (orçamento: 150)")
    if kind != "body" and own_joints:
        body_path = os.path.join(os.path.dirname(path), body_file(gender_of(path)))
        if not os.path.exists(body_path):
            failures.append(f"corpo de referência não encontrado: {os.path.basename(body_path)}")
        else:
            body_gltf, _ = read_glb(body_path)
            extra = own_joints - joint_names(body_gltf)
            if extra:
                failures.append(f"ossos fora do skeleton do corpo: {sorted(extra)[:5]}")

    return kind, size_mb, failures


def main():
    targets = []
    for arg in sys.argv[1:] or ["."]:
        if os.path.isdir(arg):
            targets.extend(sorted(glob.glob(os.path.join(arg, "*.glb"))))
        else:
            targets.append(arg)
    if not targets:
        raise SystemExit("nenhum GLB para verificar")

    bad = 0
    for path in targets:
        kind, size_mb, failures = check(path)
        status = "OK " if not failures else "FALHA"
        print(f"{status} {os.path.basename(path)} ({kind}, {size_mb:.2f} MB)")
        for failure in failures:
            print(f"     - {failure}")
        bad += bool(failures)
    print(f"{len(targets) - bad}/{len(targets)} aprovados")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
