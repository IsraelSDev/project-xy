"""Miniaturas das cenas de par (uma PNG por tipo de interação), para o painel de poses.

Importa os dois corpos uma vez e, por entrada do manifesto, aplica o clipe de cada lado e a
colocação do parceiro (`offset`/`yaw` do `PAIR_POSES`, igual ao jogo). O enquadramento é automático
na pose (o clipe de móvel coloca o casal longe da origem) e a câmera mantém o mesmo ângulo em todas.

Uso (uma chamada por composição: mf, ff, mm)::

    python tools/3dx/run_blender.py render_pair_thumbs.py -- \
        --actor-body "$env:TEMP\\old_male.glb" \
        --partner-body "$env:TEMP\\old_female.glb" \
        --manifest tools/3dx/build/pair-thumbs/mf.json \
        --out apps/web/public/assets/3dx/pairs

Os corpos precisam ter os clipes de par **assados** (os GLB publicados hoje só têm a base); use os
do commit anterior ao `split_clips.py` (`git show <rev>:apps/web/public/assets/3dx/character_male.glb`).
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_DIR = ROOT / "tools/3dx/build/pair-thumbs"
PAIR_POSES_FILE = ROOT / "packages/game-core/src/pair-poses.ts"


def write_manifests() -> None:
    """Lê `PAIR_POSES` do game-core e grava um manifesto por composição (mf/ff/mm)."""
    source = PAIR_POSES_FILE.read_text(encoding="utf-8")
    body = source[source.index("export const PAIR_POSES"):]
    entries = {}
    for match in re.finditer(r"(?:'([\w-]+)'|([\w-]+)):\s*\{", body):
        key = match.group(1) or match.group(2)
        index = match.end() - 1
        depth = 0
        end = index
        for pos in range(index, len(body)):
            char = body[pos]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = pos
                    break
        block = body[index : end + 1]
        actor = re.search(r"actor:\s*'([^']+)'", block)
        partner = re.search(r"partner:\s*'([^']+)'", block)
        if not (actor and partner):
            continue
        pairing = re.search(r"pairing:\s*'(\w+)'", block)
        offset = re.search(r"offset:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]", block)
        yaw = re.search(r"yaw:\s*(-?[\d.]+)", block)
        seat = re.search(r"seat:\s*'(\w+)'", block)
        entries[key] = {
            "type": key,
            "actor": actor.group(1),
            "partner": partner.group(1),
            "pairing": pairing.group(1) if pairing else "mf",
            "offset": [float(offset.group(1)), float(offset.group(2))] if offset else [0.0, 0.0],
            "yaw": float(yaw.group(1)) if yaw else 0.0,
            "seat": seat.group(1) if seat else None,
        }
    manifests: dict[str, list] = {"mf": [], "ff": [], "mm": []}
    for entry in entries.values():
        manifests[entry["pairing"]].append(entry)
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    for name, items in manifests.items():
        (MANIFEST_DIR / f"{name}.json").write_text(json.dumps(items, indent=1), encoding="utf-8")
        print(f"{name}: {len(items)} cenas")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--actor-body")
    ap.add_argument("--partner-body")
    ap.add_argument("--manifest")
    ap.add_argument("--out")
    ap.add_argument("--width", type=int, default=256)
    ap.add_argument("--height", type=int, default=192)
    ap.add_argument("--azimuth", type=float, default=32.0)
    ap.add_argument("--elevation", type=float, default=16.0)
    ap.add_argument("--frame", type=int, default=30)
    ap.add_argument(
        "--manifest-only",
        action="store_true",
        help="só grava os manifestos (não precisa do Blender nem dos corpos)",
    )
    return ap.parse_args(argv)


args = parse_args()
if args.manifest_only:
    write_manifests()
    raise SystemExit(0)
if not (args.actor_body and args.partner_body and args.manifest and args.out):
    raise SystemExit("faltou --actor-body/--partner-body/--manifest/--out (ou use --manifest-only)")

import bpy  # noqa: E402  (só existe dentro do Blender)
from mathutils import Vector  # noqa: E402

out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = (
    "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in dir(bpy.types) else "BLENDER_EEVEE"
)
scn.render.resolution_x = args.width
scn.render.resolution_y = args.height
scn.render.image_settings.file_format = "PNG"
scn.render.film_transparent = False
world = bpy.data.worlds.new("thumb-world")
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
if background:
    background.inputs[0].default_value = (0.045, 0.05, 0.06, 1)
    background.inputs[1].default_value = 1.0
scn.world = world

# Luz principal + preenchimento, para o corpo aparecer sem depender da orientação do clipe.
key = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
key.data.energy = 4.5
key.rotation_euler = (math.radians(55), 0, math.radians(35))
scn.collection.objects.link(key)
fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
fill.data.energy = 1.4
fill.rotation_euler = (math.radians(65), 0, math.radians(-120))
scn.collection.objects.link(fill)

camera = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scn.collection.objects.link(camera)
scn.camera = camera
az = math.radians(args.azimuth)
el = math.radians(args.elevation)


def camera_direction() -> Vector:
    return Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))


def frame_camera(center: Vector, radius: float) -> None:
    distance = max(2.2, radius * 4.2)
    camera.location = center + camera_direction() * distance
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()


def import_body(path: str):
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    new_objects = [o for o in bpy.data.objects if o not in before_objects]
    new_actions = [a for a in bpy.data.actions if a not in before_actions]
    armature = next((o for o in new_objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise SystemExit(f"armature not found in {path}")
    if armature.animation_data is None:
        armature.animation_data_create()
    # Só as malhas deformadas pelo esqueleto: o import do glTF também cria icospheres auxiliares
    # (formas de osso) que inflariam o enquadramento.
    meshes = [
        obj
        for obj in new_objects
        if obj.type == "MESH" and any(mod.type == "ARMATURE" for mod in obj.modifiers)
    ]
    return armature, new_actions, meshes


def top_of(obj):
    node = obj
    while node.parent is not None:
        node = node.parent
    return node


def set_placement(root, location: tuple[float, float, float], yaw_degrees: float) -> None:
    """Posiciona/rotaciona a raiz preservando a conversão de eixo do glTF.

    O import usa quaternion (corpo em Y-up com rotação em X); escrever `rotation_euler` direto
    pode zerar essa conversão. Força o modo XYZ (o Blender converte a orientação) e troca só o Z.
    """
    if root.rotation_mode != "XYZ":
        root.rotation_mode = "XYZ"
    base = root.rotation_euler.copy()
    root.rotation_euler = (base.x, base.y, math.radians(yaw_degrees))
    root.location = location


def find_action(actions, name: str):
    pattern = re.compile(rf"{re.escape(name)}(\.\d+)?$")
    return next((a for a in actions if pattern.match(a.name.split("|")[-1])), None)


def posed_bounds(meshes) -> tuple[Vector, float]:
    """Caixa do casal **na pose atual** (malhas skinned avaliadas, não a caixa de repouso)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    low_box = Vector((1e9, 1e9, 1e9))
    high_box = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        for vertex in mesh.vertices:
            world = evaluated.matrix_world @ vertex.co
            for axis in range(3):
                low_box[axis] = min(low_box[axis], world[axis])
                high_box[axis] = max(high_box[axis], world[axis])
        evaluated.to_mesh_clear()
    return (low_box + high_box) * 0.5, (high_box - low_box).length / 2


actor_arm, actor_actions, actor_meshes = import_body(args.actor_body)
partner_arm, partner_actions, partner_meshes = import_body(args.partner_body)
actor_root = top_of(actor_arm)
partner_root = top_of(partner_arm)

manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8-sig"))
rendered = 0
skipped: list[str] = []
for entry in manifest:
    actor_action = find_action(actor_actions, entry["actor"])
    partner_action = find_action(partner_actions, entry["partner"])
    if actor_action is None or partner_action is None:
        skipped.append(entry["type"])
        continue
    actor_arm.animation_data.action = actor_action
    partner_arm.animation_data.action = partner_action

    # Mesma colocação do jogo: o parceiro no referencial do iniciador (`offset` = [direita, frente])
    # e girado por `yaw`. Pares de móvel têm offset 0 (o clipe separa os corpos).
    right, forward = entry.get("offset", [0.0, 0.0])
    # O corpo importado olha para -Y no Blender (glTF +Z → Blender -Y); `forward` do jogo é para a
    # frente do iniciador, então anda em -Y.
    set_placement(actor_root, (0.0, 0.0, 0.0), 0.0)
    set_placement(partner_root, (right, -forward, 0.0), entry.get("yaw", 0.0))

    # Avança para um quadro onde a pose já está montada (o clipe começa em repouso/transição).
    scn.frame_set(args.frame)
    center, radius = posed_bounds(actor_meshes + partner_meshes)
    frame_camera(center, radius)
    scn.render.filepath = str(out / f"{entry['type']}.png")
    bpy.ops.render.render(write_still=True)
    rendered += 1
    print("THUMB", entry["type"], round(radius, 2), flush=True)

print(f"OK {rendered} miniaturas, {len(skipped)} sem clipe: {', '.join(skipped) or '-'}")
