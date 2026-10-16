"""
Aplica a hierarquia FK do jogo a um GLB de corpo, roupa ou cabelo do pipeline GoE.

Uso:
    python tools/goe/fk_hierarchy.py <entrada.glb> <saida.glb>

O export do .blend (export_goe.py) segue a hierarquia de deformação do rig, que passa por ossos de controle
(c_*) e deixa vários ossos deform soltos na raiz. O jogo espera a cadeia FK do pacote de referência:
ombro -> arm_stretch -> forearm_stretch -> mão, coluna -> pescoço -> cabeça, raiz -> thigh_stretch -> leg_stretch -> pé.
Este passo reparenta esses ossos e recalcula o transform local de cada um a partir do repouso no mundo, que
não muda (a skinning e as IBM continuam valendo). A verificação interna falha se o repouso mudar.

A tabela FK_PARENTS é a mesma para o corpo masculino e o feminino: foi lida do GLB de referência do pacote.
O pacote original não é redistribuído; só os nomes dos pares de ossos estão aqui.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from glb_tools import decompose_trs, mat_inverse, mat_mul, read_glb, world_matrices, write_glb  # noqa: E402

FK_PARENTS = {
    "arm_stretch.l": "shoulder.l",
    "arm_stretch.r": "shoulder.r",
    "c_arm_twist_offset.l": "arm_stretch.l",
    "c_arm_twist_offset.r": "arm_stretch.r",
    "foot.l": "leg_stretch.l",
    "foot.r": "leg_stretch.r",
    "forearm_stretch.l": "arm_stretch.l",
    "forearm_stretch.r": "arm_stretch.r",
    "hand.l": "forearm_stretch.l",
    "hand.r": "forearm_stretch.r",
    "head.x": "neck.x",
    "leg_stretch.l": "thigh_stretch.l",
    "leg_stretch.r": "thigh_stretch.r",
    "spine_01.x": "root.x",
    "spine_02.x": "spine_01.x",
    "spine_03.x": "spine_02.x",
    "thigh_stretch.l": "spine_01.x",
    "thigh_stretch.r": "spine_01.x",
    "thigh_twist.l": "thigh_stretch.l",
    "thigh_twist.r": "thigh_stretch.r",
}
TOLERANCE = 1e-4


def apply_fk(gltf):
    """Reparenta, in place, os ossos de FK_PARENTS que existem nos joints. Devolve (aplicados, ignorados)."""
    nodes = gltf["nodes"]
    names = [node.get("name", "") for node in nodes]
    index = {name: i for i, name in enumerate(names)}
    joints = {names[i] for i in gltf["skins"][0]["joints"]}
    before = world_matrices(nodes)
    parent = {}
    for i, node in enumerate(nodes):
        for child in node.get("children", []):
            parent[child] = i

    plan, skipped = [], []
    for child_name, parent_name in FK_PARENTS.items():
        if child_name in joints and parent_name in joints:
            plan.append((index[child_name], index[parent_name]))
        else:
            skipped.append(child_name)

    new_parent = dict(parent)
    for child, new in plan:
        new_parent[child] = new
    for child, _ in plan:  # sem ciclo: subindo de qualquer pai novo não pode chegar ao próprio filho
        cursor = new_parent.get(child)
        while cursor is not None:
            if cursor == child:
                raise ValueError(f"ciclo ao reparentar {names[child]}")
            cursor = new_parent.get(cursor)

    for child, new in plan:
        old = parent.get(child)
        if old is not None:
            nodes[old]["children"].remove(child)
        nodes[new].setdefault("children", []).append(child)
        local = mat_mul(mat_inverse(before[new]), before[child])
        translation, rotation, scale = decompose_trs(local)
        node = nodes[child]
        node.pop("matrix", None)
        node["translation"], node["rotation"], node["scale"] = translation, rotation, scale

    after = world_matrices(nodes)
    worst = max(
        (max(abs(before[i][r][3] - after[i][r][3]) for r in range(3)) for i in range(len(nodes))
         if names[i] in joints),
        default=0.0,
    )
    if worst > TOLERANCE:
        raise ValueError(f"repouso no mundo mudou ({worst:.6f} > {TOLERANCE}): não gravar")
    return [names[child] for child, _ in plan], skipped


def main():
    if len(sys.argv) != 3:
        raise SystemExit("uso: fk_hierarchy.py <entrada.glb> <saida.glb>")
    source, target = sys.argv[1], sys.argv[2]
    gltf, binary = read_glb(source)
    applied, skipped = apply_fk(gltf)
    write_glb(target, gltf, binary)
    print(f"FK_OK {target} ({len(applied)} ossos reparentados, ignorados: {len(skipped)})")


if __name__ == "__main__":
    main()
