"""
Retarget da Universal Animation Library (Quaternius, CC0) para o rig do GoE, dentro do Blender.

Uso (modo background; NÃO salva o .blend):

    blender -b <Male|Female>_Basemesh_*.blend --factory-startup --python tools/goe/anim/retarget.py -- \
        --ual <UAL1_Standard.glb> --out <pasta> [--clips idle=Idle_Loop,walk=Walk_Formal_Loop,...] [--preview <pasta>]

A biblioteca vem num esqueleto de 65 ossos (Unreal) com a mesma convenção de eixos do GoE (esquerda +X, frente -Y, cima +Z) e em
T-pose, como o GoE. Para cada quadro de cada clipe, a pose do esqueleto da biblioteca vira pose nos CONTROLES FK do rig do GoE
(o rig então calcula os ossos de deformação, inclusive torção e esticamento, como nas poses do artista):
- bacia, coluna, pescoço, cabeça, coxas, canelas, pés e dedos dos pés: a rotação do osso em relação ao repouso (no mundo);
- braço, antebraço e mão: a DIREÇÃO do osso (o repouso do GoE tem o cotovelo dobrado e o da biblioteca não);
- bacia: a posição, escalada pela proporção das pernas.
Depois um ajuste de chão (a sola mais baixa fica em z = 0) corrige a diferença de proporção entre os dois esqueletos.
O clipe sai como GLB (ossos de deformação amostrados, igual às poses) para `clips_to_json.py`.
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

DEFAULT_CLIPS = (
    "idle=Idle_Loop,walk=Walk_Formal_Loop,sit=Sitting_Idle_Loop,sitTalk=Sitting_Talking_Loop,"
    "talk=Idle_Talking_Loop,interact=Interact,dance=Dance_Loop"
)
# animações em que o personagem está com os pés no chão o tempo todo (ajuste de chão)
GROUNDED = {"idle", "walk", "sit", "sitTalk", "dance", "talk"}
FPS = 24

ANIMATED = [
    "c_root_master.x", "c_spine_01.x", "c_spine_02.x", "c_spine_03.x", "c_neck.x", "c_head.x",
    "c_thigh_fk.l", "c_leg_fk.l", "c_foot_fk.l", "c_toes_fk.l",
    "c_thigh_fk.r", "c_leg_fk.r", "c_foot_fk.r", "c_toes_fk.r",
    "c_shoulder.l", "c_shoulder.r",
    "c_arm_fk.l", "c_forearm_fk.l", "c_hand_fk.l", "c_arm_fk.r", "c_forearm_fk.r", "c_hand_fk.r",
]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--ual", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--clips", default=DEFAULT_CLIPS)
    parser.add_argument("--preview", default="")
    return parser.parse_args(argv)


class Goe:
    """O rig de controle do GoE: pose por orientação absoluta (delta do repouso, no espaço do armature)."""

    def __init__(self, arm):
        self.arm = arm
        self.pb = arm.pose.bones
        self.rest = {}
        bpy.context.view_layer.update()

    def rest_of(self, name):
        if name not in self.rest:
            b = self.pb[name].bone
            self.rest[name] = (b.matrix_local.to_3x3(), b.head_local.copy(), (b.tail_local - b.head_local).normalized())
        return self.rest[name]

    def set_abs(self, name, delta=None, offset=None):
        pb = self.pb[name]
        rest_rot, rest_head, _ = self.rest_of(name)
        head = rest_head + offset if offset is not None else pb.head.copy()
        rot = (delta @ rest_rot) if delta is not None else rest_rot
        pb.rotation_mode = "QUATERNION"
        pb.matrix = Matrix.Translation(head) @ rot.to_4x4()
        bpy.context.view_layer.update()

    def aim(self, name, direction):
        _, _, rest_dir = self.rest_of(name)
        self.set_abs(name, rest_dir.rotation_difference(direction.normalized()).to_matrix())

    def head_of(self, name):
        return self.pb[name].head.copy()


class Source:
    """O esqueleto da biblioteca (importado): rotações e direções no mundo, em relação ao repouso."""

    def __init__(self, arm):
        self.arm = arm
        self.pb = arm.pose.bones
        self.world = arm.matrix_world
        self.rest_rot = {b.name: (self.world @ b.matrix_local).to_3x3().normalized() for b in arm.data.bones}
        self.rest_head = {b.name: (self.world @ b.head_local) for b in arm.data.bones}

    def rot(self, name):
        return (self.world @ self.pb[name].matrix).to_3x3().normalized()

    def delta(self, name):
        """Rotação do osso desde o repouso, no mundo."""
        return self.rot(name) @ self.rest_rot[name].inverted()

    def direction(self, name):
        return self.rot(name).col[1].normalized()

    def head(self, name):
        return self.world @ self.pb[name].head

    def tail(self, name):
        return self.world @ self.pb[name].tail


# controle do GoE -> (osso da biblioteca, modo): "delta" = rotação desde o repouso; "aim" = direção do osso
MAPPING = [
    ("c_spine_01.x", "spine_01", "delta"),
    ("c_spine_02.x", "spine_02", "delta"),
    ("c_spine_03.x", "spine_03", "delta"),
    ("c_neck.x", "neck_01", "delta"),
    ("c_head.x", "Head", "delta"),
    ("c_thigh_fk.l", "thigh_l", "delta"),
    ("c_leg_fk.l", "calf_l", "delta"),
    ("c_foot_fk.l", "foot_l", "delta"),
    ("c_toes_fk.l", "ball_l", "delta"),
    ("c_thigh_fk.r", "thigh_r", "delta"),
    ("c_leg_fk.r", "calf_r", "delta"),
    ("c_foot_fk.r", "foot_r", "delta"),
    ("c_toes_fk.r", "ball_r", "delta"),
    ("c_shoulder.l", "clavicle_l", "delta"),
    ("c_shoulder.r", "clavicle_r", "delta"),
    ("c_arm_fk.l", "upperarm_l", "aim"),
    ("c_forearm_fk.l", "lowerarm_l", "aim"),
    ("c_hand_fk.l", "hand_l", "aim"),
    ("c_arm_fk.r", "upperarm_r", "aim"),
    ("c_forearm_fk.r", "lowerarm_r", "aim"),
    ("c_hand_fk.r", "hand_r", "aim"),
]


def retarget_frame(goe, src, scale, ground_offset=0.0):
    """Põe o rig do GoE na pose atual da biblioteca. Devolve a sola mais baixa (z) dos dois pés."""
    rest_hip = goe.rest_of("c_root_master.x")[1]
    move = (src.head("pelvis") - src.rest_head["pelvis"]) * scale
    goe.set_abs("c_root_master.x", src.delta("pelvis"), offset=move + Vector((0.0, 0.0, ground_offset)))
    for control, bone, mode in MAPPING:
        if mode == "delta":
            goe.set_abs(control, src.delta(bone))
        else:
            goe.aim(control, src.direction(bone))
    soles = []
    for side in ("l", "r"):
        soles.append(goe.pb[f"toes_01.{side}"].tail.z)
        soles.append(goe.pb[f"foot.{side}"].head.z - GROUND_ANKLE)
    return min(soles)


GROUND_ANKLE = 0.095


def keyframe(goe, frame_no, previous):
    for name in ANIMATED:
        pb = goe.pb[name]
        q = pb.rotation_quaternion.copy()
        prev = previous.get(name)
        if prev is not None and prev.dot(q) < 0.0:
            q.negate()
            pb.rotation_quaternion = q
        previous[name] = q
        pb.keyframe_insert("rotation_quaternion", frame=frame_no, group=name)
        if name == "c_root_master.x":
            pb.keyframe_insert("location", frame=frame_no, group=name)


def stride_of(src, frames):
    """Distância percorrida por ciclo (m, na escala da biblioteca): o pé de apoio desliza para trás em relação à bacia."""
    samples = []
    for f in frames:
        bpy.context.scene.frame_set(f)
        samples.append((src.head("foot_l") - src.head("pelvis"), src.head("foot_r") - src.head("pelvis")))
    low = min(min(left.z, right.z) for left, right in samples)
    speeds = []
    for i in range(len(samples)):
        j = (i + 1) % len(samples)
        for side in (0, 1):
            a, b = samples[i][side], samples[j][side]
            if a.z < low + 0.06 and b.z < low + 0.06:
                speeds.append(abs(b.y - a.y) * FPS)
    if not speeds:
        return 0.0
    return sum(speeds) / len(speeds) * len(frames) / FPS


def loop_frames(src, action):
    """Quadros do clipe; se o último repete o primeiro (ciclo fechado em N), ele sai."""
    first = int(round(action.frame_range[0]))
    last = int(math.floor(action.frame_range[1] + 1e-6))
    frames = list(range(first, last + 1))
    bpy.context.scene.frame_set(frames[0])
    a = [src.head(n) for n in ("hand_l", "foot_r", "Head")]
    bpy.context.scene.frame_set(frames[-1])
    b = [src.head(n) for n in ("hand_l", "foot_r", "Head")]
    if max((x - y).length for x, y in zip(a, b)) < 2e-3 and len(frames) > 2:
        frames = frames[:-1]
    return frames


def export_clip(goe, action, path):
    goe.arm.animation_data.action = action
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    goe.arm.select_set(True)
    bpy.context.view_layer.objects.active = goe.arm
    bpy.context.scene.render.fps = FPS
    bpy.ops.export_scene.gltf(
        filepath=path,
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
        export_optimize_animation_size=False,
    )
    bpy.ops.object.mode_set(mode="POSE")


def force_fk(goe):
    """Põe os braços e as pernas no modo FK (o `ik_fk_switch` do Auto-Rig Pro): sem isso os controles FK não movem os
    ossos de deformação. O valor de FK varia entre os .blend do pacote; testa os dois e fica com o que move o osso."""
    pairs = (
        ("c_foot_ik.l", "c_thigh_fk.l", "thigh_stretch.l"),
        ("c_foot_ik.r", "c_thigh_fk.r", "thigh_stretch.r"),
        ("c_hand_ik.l", "c_arm_fk.l", "arm_stretch.l"),
        ("c_hand_ik.r", "c_arm_fk.r", "arm_stretch.r"),
    )
    for switch_bone, control, deform in pairs:
        holder = goe.pb[switch_bone]
        control_bone = goe.pb[control]
        control_bone.rotation_mode = "QUATERNION"
        rest = control_bone.rotation_quaternion.copy()
        chosen = None
        for value in (1.0, 0.0):
            holder["ik_fk_switch"] = value
            control_bone.rotation_quaternion = rest
            bpy.context.view_layer.update()
            before = goe.pb[deform].tail.copy()
            control_bone.rotation_quaternion = (0.9, 0.3, 0.0, 0.0)
            bpy.context.view_layer.update()
            moved = (goe.pb[deform].tail - before).length
            control_bone.rotation_quaternion = rest
            bpy.context.view_layer.update()
            if moved > 1e-3:
                chosen = value
                break
        if chosen is None:
            raise SystemExit(f"{control} não move {deform} em nenhum modo do {switch_bone}")
        holder["ik_fk_switch"] = chosen
        print(f"FK_MODE {switch_bone} = {chosen}")
    bpy.context.view_layer.update()


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    goe_arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    gender = "female" if "Female" in goe_arm.name else "male"
    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=args.ual)
    src_arm = next(o for o in bpy.data.objects if o.type == "ARMATURE" and o.name not in before)

    # o rig do GoE precisa estar ativo em modo pose
    bpy.context.view_layer.objects.active = goe_arm
    bpy.ops.object.mode_set(mode="POSE")
    # O .blend feminino vem com o armature em REST: sem POSE nenhum controle move os ossos (as animações saíam paradas).
    goe_arm.data.pose_position = "POSE"
    goe = Goe(goe_arm)
    force_fk(goe)
    goe_arm.animation_data_create()
    # a pose-base do .blend (a pose do artista) vale para os ossos que o retarget não toca
    src_arm.animation_data_create()
    # biblioteca em repouso para medir proporções
    tpose = bpy.data.actions.get("A_TPose")
    src_arm.animation_data.action = tpose
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    src = Source(src_arm)
    scale = goe.rest_of("c_root_master.x")[1].z / src.rest_head["pelvis"].z
    print(f"RETARGET {goe_arm.name} escala {scale:.3f}")

    meta_path = os.path.join(args.out, f"{gender}_meta.json")
    meta = {"fps": FPS, "clips": {}}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as handle:
            meta = json.load(handle)
    for pair in args.clips.split(","):
        name, action_name = pair.split("=")
        action = bpy.data.actions[action_name]
        src_arm.animation_data.action = action
        frames = loop_frames(src, action)
        stride = stride_of(src, frames) * scale if name in ("walk", "jog") else 0.0
        goe_action = bpy.data.actions.new(name)
        goe_arm.animation_data.action = goe_action
        previous = {}
        worst_ground = 0.0
        for index, f in enumerate(frames):
            bpy.context.scene.frame_set(f)
            bpy.context.view_layer.update()
            ground = 0.0
            if name in GROUNDED:
                low = retarget_frame(goe, src, scale)
                ground = -low
            retarget_frame(goe, src, scale, ground_offset=ground)
            worst_ground = max(worst_ground, abs(ground))
            keyframe(goe, index, previous)
        goe_action.use_frame_range = True
        goe_action.frame_start = 0
        goe_action.frame_end = len(frames) - 1
        export_clip(goe, goe_action, os.path.join(args.out, f"{gender}_{name}.glb"))
        meta["clips"][name] = {"frames": len(frames), "stride": round(stride, 4)}
        print(f"CLIP_OK {name} <- {action_name}: {len(frames)} quadros, ajuste de chão máx {worst_ground * 100:.1f} cm, passada {stride:.2f} m")
        if args.preview:
            preview(goe, goe_action, args.preview, len(frames))
    with open(meta_path, "w", encoding="utf-8") as handle:
        json.dump(meta, handle)


def preview(goe, action, folder, count):
    import numpy as np

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (0.85, 0.7, 0.6)
    scene.render.resolution_x = 360
    scene.render.resolution_y = 560
    scene.world = scene.world or bpy.data.worlds.new("w")
    scene.world.color = (0.12, 0.12, 0.15)
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.hide_render = obj.name not in ("M_Basemesh_B_GOE_Body", "F_Basemesh_B_GOE_Body")
            obj.hide_viewport = obj.hide_render
    if "preview" not in bpy.data.objects:
        cam_data = bpy.data.cameras.new("preview")
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = 2.15
        scene.collection.objects.link(bpy.data.objects.new("preview", cam_data))
    cam = bpy.data.objects["preview"]
    scene.camera = cam
    os.makedirs(folder, exist_ok=True)
    goe.arm.animation_data.action = action
    for view, loc, rot in (
        ("lado", (5.0, 0.0, 0.95), (math.radians(90), 0.0, math.radians(90))),
        ("frente", (0.0, -5.0, 0.95), (math.radians(90), 0.0, 0.0)),
    ):
        cam.location = loc
        cam.rotation_euler = rot
        strips = []
        for k in range(8):
            f = round(count * k / 8)
            scene.frame_set(f)
            path = os.path.join(folder, f"_{view}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            w, h = img.size
            strips.append(np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4))
            bpy.data.images.remove(img)
            os.remove(path)
        sheet = np.concatenate(strips, axis=1)
        out = bpy.data.images.new(f"sheet_{view}", sheet.shape[1], sheet.shape[0])
        out.pixels = sheet.reshape(-1).tolist()
        out.filepath_raw = os.path.join(folder, f"{action.name}_{view}.png")
        out.file_format = "PNG"
        out.save()
        bpy.data.images.remove(out)


if __name__ == "__main__":
    main()
