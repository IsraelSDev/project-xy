"""
Exporta as poses neutras do pacote GoE como GLB (uma animação de 1 frame por arquivo).

Uso (modo background; NÃO salva o Poses.blend):

    blender -b Poses.blend --factory-startup --python tools/goe/export_poses_goe.py -- --out <pasta>

Escopo: só as ações `Goe_F_Pose01..10` (poses neutras). As ações de sexo explícito
(`Sex*`, `*_Sex*`, `sex*`) não são exportadas: ver docs/guides/goe-pipeline.md, seção "Exclusões".
A exportação usa o exporter glTF (que converte o espaço dos ossos), com só ossos de deformação,
para casar com o skeleton do corpo.
"""

import argparse
import os
import re
import sys

import bpy

ARMATURE = "Goe_F_Pose"
NEUTRAL = re.compile(r"^Goe_F_Pose(\d{2})$")
EXPLICIT_ACTION = re.compile(r"sex", re.IGNORECASE)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    return parser.parse_args(argv)


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    arm = bpy.data.objects.get(ARMATURE)
    if arm is None or arm.type != "ARMATURE":
        raise SystemExit(f"Armature {ARMATURE} não encontrado no Poses.blend")
    arm.animation_data_create()

    exported = []
    for action in sorted(bpy.data.actions, key=lambda a: a.name):
        match = NEUTRAL.match(action.name)
        if not match or EXPLICIT_ACTION.search(action.name):
            continue
        arm.animation_data.action = action
        bpy.context.scene.frame_set(int(action.frame_range[0]))

        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm

        out_path = os.path.join(args.out, f"pose{match.group(1)}.glb")
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
            # Só a action ativa: sem isto o exporter leva todas as actions do arquivo (inclusive
            # as de conteúdo explícito), mesmo as que não estão em uso.
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
