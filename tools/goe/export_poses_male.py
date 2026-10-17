"""
Exporta as poses do pacote GoE como GLB no rig MASCULINO (uma animação de 1 frame por arquivo).

Uso (modo background, no .blend do corpo masculino; NÃO salva o .blend):

    blender -b Male_Basemesh_*.blend --factory-startup --python tools/goe/export_poses_male.py -- \
        --poses <Poses.blend> --out <pasta>

As poses do pacote são ações do rig de controle (c_*, mesmos nomes nos dois gêneros) gravadas no Poses.blend com as
proporções do corpo feminino. Aplicadas como estão ao esqueleto masculino (posição + rotação por osso), os braços, os
dedos e a coluna ganhavam as medidas femininas. Aqui as MESMAS ações são aplicadas ao rig masculino e amostradas nele:
os ossos de deformação saem com as medidas do corpo masculino. Os ids e a tabela de ações vêm de export_poses_goe.SOURCES.
Depois: `python tools/goe/poses_to_json.py <pasta> goe-poses-male.json`.
"""

import argparse
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from export_poses_goe import SOURCES  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--poses", required=True, help="Poses.blend do pacote")
    parser.add_argument("--out", required=True)
    return parser.parse_args(argv)


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE" and "Rig" in o.name), None)
    if arm is None:
        raise SystemExit("Armature do rig não encontrado no .blend")

    wanted = set(SOURCES.values())
    before = set(bpy.data.actions.keys())
    with bpy.data.libraries.load(args.poses, link=False) as (src, dst):
        dst.actions = [name for name in src.actions if name in wanted]
    loaded = {a.name: a for a in bpy.data.actions if a.name not in before}
    missing = [name for name in wanted if name not in loaded]
    if missing:
        raise SystemExit(f"Ações não encontradas no Poses.blend: {sorted(missing)}")

    arm.animation_data_create()
    exported = []
    for pose_id, action_name in SOURCES.items():
        action = loaded[action_name]
        for bone in arm.pose.bones:
            bone.location = (0.0, 0.0, 0.0)
            bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
            bone.rotation_euler = (0.0, 0.0, 0.0)
            bone.scale = (1.0, 1.0, 1.0)
        arm.animation_data.action = action
        # Blender 5: a ação traz o slot do objeto de origem (o rig feminino); aponta para o slot dela no rig masculino.
        if getattr(action, "slots", None) and len(action.slots):
            arm.animation_data.action_slot = action.slots[0]
        bpy.context.scene.frame_set(int(action.frame_range[0]))
        bpy.context.view_layer.update()

        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm

        out_path = os.path.join(args.out, f"{pose_id}.glb")
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_skins=True,
            export_def_bones=True,
            export_morph=False,
            export_normals=False,
            export_materials="NONE",
            export_yup=True,
            export_animations=True,
            export_animation_mode="ACTIVE_ACTIONS",
            export_frame_range=False,
            export_force_sampling=True,
        )
        exported.append((action.name, out_path))

    for name, path in exported:
        print(f"POSE_OK {name} -> {path}")
    print(f"POSES_EXPORTED {len(exported)}")


if __name__ == "__main__":
    main()
