"""
Compõe as poses de par (interações a dois) juntando duas poses solo do pacote GoE.

O pacote não traz nenhuma animação/pose de dois atores: `sex01..10` e `pose01..10` são de um ator só
(ver `export_poses_goe.py`). Este tool monta cada par colocando dois rigs na cena (o corpo do `--body`),
aplicando uma pose solo em cada um e posicionando o parceiro por um offset/rotação autorais. Serve para
calibrar visualmente a colocação: renderiza uma prévia por par e escreve `pair-poses.json` (o formato que
o cliente lê), deixando o `.blend` intacto.

Uso:

    blender -b Male_Basemesh_CCGOE_V1.4_Blender_5.2.blend --factory-startup \
        --python tools/goe/pair_poses_goe.py -- \
        --poses <Poses.blend> --table <tabela.json> --out <saída.json> [--previews <pasta>] [--only <id>]

A tabela é o arquivo de autoria: por interação, a pose de cada ator e o offset do parceiro em relação ao
ator, no espaço do jogo (o ator olha para +Z; `offset` é [x, z] em metros e `yaw` é o giro do parceiro em
graus, relativo ao ator). O tool converte para o espaço do Blender (jogo +Z = Blender -Y) só para a prévia.
"""

import argparse
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from export_poses_goe import SOURCES  # noqa: E402  (pose id -> ação do Poses.blend)

ACTION_BY_POSE = dict(SOURCES)

# Tabela inicial (autoria): por interação, pose de cada ator e offset do parceiro no espaço do jogo.
# `offset` = [x, z] do parceiro relativo ao ator (o ator olha +Z), `yaw` = giro do parceiro em graus.
# Ajustar olhando a prévia de cada par.
DEFAULT_TABLE = {
    "pairs": {
        "hug": {"actor": "pose04", "partner": "pose04", "offset": [0.0, 0.35], "yaw": 180},
        "pose-intimate": {"actor": "sex01", "partner": "pose08", "offset": [0.0, 0.0], "yaw": 0},
    }
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--poses", required=True)
    parser.add_argument("--table")
    parser.add_argument("--out", required=True)
    parser.add_argument("--previews")
    parser.add_argument("--only")
    parser.add_argument("--body-object", default="M_Basemesh_B_GOE_Body")
    parser.add_argument("--genitals-object", default="M_Basemesh_B_GOE_Genitals")
    return parser.parse_args(argv)


def to_blender(offset, yaw_deg):
    """Offset/giro do jogo (ator em +Z) para o espaço do Blender (ator em -Y)."""
    x, z = offset
    return (x, -z, 0.0), -yaw_deg


def load_table(path):
    if not path:
        return DEFAULT_TABLE
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def pose_actions(poses_blend):
    with bpy.data.libraries.load(poses_blend, link=False) as (src, dst):
        dst.actions = list(src.actions)
    return {action.name: action for action in dst.actions if action}


def assign_action(armature, action):
    armature.animation_data_create()
    armature.animation_data.action = action
    slots = getattr(action, "slots", None)
    if slots:
        armature.animation_data.action_slot = slots[0]
    bpy.context.scene.frame_set(int(round(action.frame_range[0])))
    bpy.context.view_layer.update()


def duplicate_actor(arm, body, extra):
    """Segundo ator: cópia do rig e do corpo (geometria compartilhada) presa ao rig novo."""
    rig = arm.copy()
    rig.data = arm.data
    rig.hide_render = False
    bpy.context.scene.collection.objects.link(rig)
    copies = [rig]
    for source in [body, *extra]:
        if source is None:
            continue
        mesh = source.copy()
        mesh.hide_render = False
        bpy.context.scene.collection.objects.link(mesh)
        mesh.parent = rig
        for mod in mesh.modifiers:
            if mod.type == "ARMATURE":
                mod.object = rig
        copies.append(mesh)
    return rig, copies


def setup_camera(center, width, out):
    cam_data = bpy.data.cameras.new("pair-cam")
    cam = bpy.data.objects.new("pair-cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (center[0] + 2.0, center[1] - 3.2, 1.5)
    bpy.context.scene.camera = cam
    target = bpy.data.objects.new("pair-target", None)
    bpy.context.scene.collection.objects.link(target)
    target.location = (center[0], center[1], 0.85)
    con = cam.constraints.new("TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (0.8, 0.8, 0.8)
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 480
    scene.render.resolution_y = 560
    scene.render.filepath = out
    scene.render.image_settings.file_format = "PNG"
    return cam, target


def render_preview(path):
    bpy.ops.render.render(write_still=True)
    print("PREVIEW_OK", path)


def main():
    args = parse_args()
    table = load_table(args.table)["pairs"]
    actions = pose_actions(args.poses)

    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if arm is None:
        raise SystemExit("nenhum armature no --body")
    body = bpy.data.objects.get(args.body_object)
    if body is None:
        raise SystemExit(f"corpo {args.body_object} não encontrado")
    genitals = bpy.data.objects.get(args.genitals_object)

    for other in bpy.data.objects:
        if other.type == "MESH":
            other.hide_render = True
    arm.hide_render = True

    out_pairs = {}
    for pair_id, spec in table.items():
        if args.only and pair_id != args.only:
            continue
        actor_action = actions.get(ACTION_BY_POSE.get(spec["actor"], spec["actor"]))
        partner_action = actions.get(ACTION_BY_POSE.get(spec["partner"], spec["partner"]))
        if actor_action is None or partner_action is None:
            raise SystemExit(f"pose ausente no par {pair_id}: {spec}")

        actor_body = body.copy()
        actor_body.hide_render = False
        bpy.context.scene.collection.objects.link(actor_body)
        actor_body.parent = arm
        for mod in actor_body.modifiers:
            if mod.type == "ARMATURE":
                mod.object = arm
        assign_action(arm, actor_action)

        rig, copies = duplicate_actor(arm, body, [genitals])
        loc, yaw = to_blender(spec["offset"], spec["yaw"])
        rig.location = loc
        rig.rotation_euler = (0.0, 0.0, yaw * 3.141592653589793 / 180.0)
        assign_action(rig, partner_action)
        bpy.context.view_layer.update()

        if args.previews:
            center = (loc[0] / 2.0, loc[1] / 2.0)
            setup_camera(center, 1.2, os.path.join(args.previews, f"{pair_id}.png"))
            render_preview(os.path.join(args.previews, f"{pair_id}.png"))
            for cam in list(bpy.data.objects):
                if cam.name.startswith("pair-cam") or cam.name.startswith("pair-target"):
                    bpy.data.objects.remove(cam, do_unlink=True)

        out_pairs[pair_id] = {
            "actor": spec["actor"],
            "partner": spec["partner"],
            "offset": spec["offset"],
            "yaw": spec["yaw"],
        }

        for obj in copies:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.objects.remove(actor_body, do_unlink=True)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump({"pairs": out_pairs}, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"PAIRS_JSON {args.out} ({len(out_pairs)} pares)")


if __name__ == "__main__":
    main()
