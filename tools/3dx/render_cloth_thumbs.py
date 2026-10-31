"""Miniaturas das peças de roupa para o painel "Roupa" do mundo.

Importa o corpo publicado uma vez, veste cada peça do catálogo (mesmo rig, rest pose) e renderiza um
quadrado 256×256 recortado na peça — o mesmo espírito das miniaturas do 3DXChat, mas sem depender de
capturas externas.

Uso::

    python tools/3dx/run_blender.py render_cloth_thumbs.py -- \
        --out apps/web/public/assets/3dx/clothes/thumbs

Só algumas peças::

    python tools/3dx/run_blender.py render_cloth_thumbs.py -- \
        --only 3dx_m_top_shirt,3dx_m_bottom_jeans --out "$env:TEMP\\thumbs"
"""

from __future__ import annotations

import argparse
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "packages/contracts/src/avatar.ts"
ASSETS = ROOT / "apps/web/public/assets"

# Só as peças que aparecem no painel de roupa do mundo (cabelo fica no vestiário).
SLOTS = ("top", "outerwear", "bottom", "underwear", "hat", "glasses", "mask")

# Cor ilustrativa por peça (o material do GLB é branco: o jogo recolore pela luminância). Serve só
# para o menu não ficar uma fileira de roupas brancas.
TINTS = {
    "top": ((0.42, 0.5, 0.62), (0.55, 0.3, 0.32), (0.32, 0.36, 0.4), (0.65, 0.65, 0.68)),
    "outerwear": ((0.22, 0.24, 0.3), (0.4, 0.28, 0.22), (0.5, 0.5, 0.54)),
    "bottom": ((0.22, 0.3, 0.5), (0.45, 0.42, 0.36), (0.2, 0.2, 0.22), (0.32, 0.2, 0.24)),
    "underwear": ((0.6, 0.6, 0.62), (0.35, 0.35, 0.38), (0.55, 0.28, 0.34), (0.3, 0.3, 0.34)),
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ASSETS / "3dx/clothes/thumbs"))
    ap.add_argument("--body-male", default=str(ASSETS / "3dx/character_male.glb"))
    ap.add_argument("--body-female", default=str(ASSETS / "3dx/character_female.glb"))
    ap.add_argument("--only", default="", help="ids separados por vírgula")
    ap.add_argument("--size", type=int, default=256)
    ap.add_argument("--azimuth", type=float, default=18.0)
    ap.add_argument("--elevation", type=float, default=10.0)
    return ap.parse_args(argv)


def catalog_parts():
    """Lê `PART_CATALOG` do contrato: (id, slot, arquivo) das peças com GLB."""
    source = CONTRACT.read_text(encoding="utf-8")
    start = source.index("export const PART_CATALOG")
    end = source.index("] as const satisfies", start)
    body = source[start:end]
    parts = []
    for block in re.finditer(r"\{([^{}]*)\}", body):
        fields = block.group(1)
        slot = re.search(r"slot:\s*'([\w]+)'", fields)
        part_id = re.search(r"id:\s*'([\w]+)'", fields)
        file = re.search(r"file:\s*'([^']+)'", fields)
        if slot and part_id and file and slot.group(1) in SLOTS:
            parts.append((part_id.group(1), slot.group(1), file.group(1)))
    return parts


args = parse_args()
only = {item.strip() for item in args.only.split(",") if item.strip()}
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)

import bpy  # noqa: E402  (só existe dentro do Blender)
from mathutils import Vector  # noqa: E402


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.engine = (
        "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in dir(bpy.types) else "BLENDER_EEVEE"
    )
    scn.render.resolution_x = args.size
    scn.render.resolution_y = args.size
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("thumb-world")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs[0].default_value = (0.06, 0.07, 0.09, 1)
        background.inputs[1].default_value = 0.6
    scn.world = world
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    key.data.energy = 4.0
    key.rotation_euler = (math.radians(50), 0, math.radians(25))
    scn.collection.objects.link(key)
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 1.6
    fill.rotation_euler = (math.radians(65), 0, math.radians(-110))
    scn.collection.objects.link(fill)
    rim = bpy.data.objects.new("rim", bpy.data.lights.new("rim", "SUN"))
    rim.data.energy = 1.2
    rim.rotation_euler = (math.radians(70), 0, math.radians(160))
    scn.collection.objects.link(rim)

    camera = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scn.collection.objects.link(camera)
    camera.data.lens = 60
    scn.camera = camera
    return scn, camera


def import_glb(path: Path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.data.objects if obj not in before]


def rest_pose(objects):
    for obj in objects:
        if obj.type == "ARMATURE":
            obj.data.pose_position = "REST"
            if obj.animation_data:
                obj.animation_data.action = None


def skinned_meshes(objects):
    return [
        obj
        for obj in objects
        if obj.type == "MESH" and any(mod.type == "ARMATURE" for mod in obj.modifiers)
    ]


def bounds(meshes):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        for vertex in mesh.vertices:
            world = evaluated.matrix_world @ vertex.co
            for axis in range(3):
                low[axis] = min(low[axis], world[axis])
                high[axis] = max(high[axis], world[axis])
        evaluated.to_mesh_clear()
    return low, high


def aim_camera(camera, center: Vector, radius: float) -> None:
    az = math.radians(args.azimuth)
    el = math.radians(args.elevation)
    # O glTF +Z vira -Y no Blender: o corpo olha para -Y, então a câmera fica desse lado.
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    distance = max(0.4, radius * 2.7 + 0.18)
    camera.location = center + direction * distance
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()


def tint(objects, color: tuple[float, float, float], factor: float = 0.85) -> None:
    """Multiplica a cor do material (o GLB é branco e o jogo recolore por cima)."""
    for obj in objects:
        for material in obj.data.materials if obj.type == "MESH" else []:
            if material is None or not material.use_nodes:
                continue
            principled = next(
                (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None
            )
            if principled is None:
                continue
            base = principled.inputs.get("Base Color")
            if base is None:
                continue
            link = base.links[0] if base.links else None
            if link is None:
                base.default_value = (*color, 1.0)
                continue
            mix = material.node_tree.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = factor
            mix.inputs[6].default_value = (*color, 1.0)
            material.node_tree.links.new(link.from_socket, mix.inputs[7])
            material.node_tree.links.new(mix.outputs[2], base)


scn, camera = reset_scene()

male = args.body_male
female = args.body_female
bodies = {}
for model, path in (("male", male), ("female", female)):
    if not Path(path).exists():
        continue
    objects = import_glb(Path(path))
    rest_pose(objects)
    bodies[model] = objects
    for obj in objects:
        obj.hide_render = True

parts = [part for part in catalog_parts() if not only or part[0] in only]
print(f"{len(parts)} peças", flush=True)
rendered = 0
for part_id, slot, file in parts:
    model = "female" if part_id.startswith("3dx_f_") else "male"
    if model not in bodies:
        print("SKIP sem corpo", part_id, flush=True)
        continue
    path = ASSETS / file
    if not path.exists():
        print("SKIP sem GLB", part_id, flush=True)
        continue
    objects = import_glb(path)
    rest_pose(objects)
    meshes = skinned_meshes(objects)
    if not meshes:
        print("SKIP sem malha", part_id, flush=True)
        continue
    palette = TINTS.get(slot)
    if palette:
        color = palette[sum(part_id.encode()) % len(palette)]
        tint(meshes, color)
    low, high = bounds(meshes)
    center = (low + high) * 0.5
    radius = max(0.18, (high - low).length / 2)
    aim_camera(camera, center, radius)
    scn.render.filepath = str(out / f"{part_id}.png")
    bpy.ops.render.render(write_still=True)
    rendered += 1
    print("THUMB", part_id, round(radius, 2), flush=True)
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)

print(f"OK {rendered} miniaturas em {out}")
