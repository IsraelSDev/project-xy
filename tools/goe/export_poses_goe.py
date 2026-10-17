"""
Exporta as poses do pacote GoE como GLB (uma animação de 1 frame por arquivo).

Uso (modo background; NÃO salva o Poses.blend):

    blender -b Poses.blend --factory-startup --python tools/goe/export_poses_goe.py -- --out <pasta>

Escopo: as 20 poses da prévia do pacote, `pose01..10` e `sex01..10` (ver SOURCES). O Poses.blend tem dois conjuntos de
ações com as mesmas poses (diferença ~1 mm nos ossos de deformação; só os dedos indicadores mudam): `Goe_F_Pose*`, usado
desde o início, e o sem prefixo (`Pose*`, `Sex*`), que casa com os nomes da prévia. Para não mexer nas poses já
publicadas, fica o conjunto `Goe_F_*` onde ele serve; o sem prefixo entra só onde ele falha:
- `Goe_F_Pose05` é idêntica à `Goe_F_Pose01` (cópia): a Pose01 de verdade só existe sem prefixo;
- não há `Goe_F_Pose_Sex02`: usa-se `Sex02`.
Ficam de fora as ações fora da prévia: `sex08` (minúscula, pose diferente da `Sex08`) e as cópias `.002`.
A exportação usa o exporter glTF (que converte o espaço dos ossos), com só ossos de deformação,
para casar com o skeleton do corpo.
"""

import argparse
import os
import sys

import bpy

ARMATURE = "Goe_F_Pose"
# id da pose no jogo -> ação do Poses.blend.
SOURCES = {
    "pose01": "Pose01",
    **{f"pose{n:02d}": f"Goe_F_Pose{n:02d}" for n in range(2, 11)},
    "sex01": "Goe_F_Pose_Sex01",
    "sex02": "Sex02",
    "sex03": "Goe_F_Pose_Sex03",
    "sex04": "Goe_F_Pose_Sex04",
    "sex05": "Goe_F_Pose_Sex05.001",
    **{f"sex{n:02d}": f"Goe_F_Pose_Sex{n:02d}" for n in range(6, 11)},
}


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
    for pose_id, action_name in SOURCES.items():
        action = bpy.data.actions.get(action_name)
        if action is None:
            raise SystemExit(f"Ação {action_name} (pose {pose_id}) não encontrada no Poses.blend")
        # Osso sem canal na ação manteria a pose da ação anterior: volta tudo ao repouso antes de cada uma, para
        # o resultado não depender da ordem.
        for bone in arm.pose.bones:
            bone.location = (0.0, 0.0, 0.0)
            bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
            bone.rotation_euler = (0.0, 0.0, 0.0)
            bone.scale = (1.0, 1.0, 1.0)
        arm.animation_data.action = action
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
            # Só a action ativa: sem isto o exporter leva todas as actions do arquivo (inclusive as
            # duplicadas e as fora da prévia), mesmo as que não estão em uso.
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
