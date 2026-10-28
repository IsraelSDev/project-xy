"""Renderiza os dois corpos de um par na colocacao do jogo (pivo compartilhado).

    python tools/3dx/run_blender.py render_pair.py -- \
        --male apps/web/public/assets/3dx/character_male.glb \
        --female apps/web/public/assets/3dx/character_female.glb \
        --action pair16 --frames 40 --azimuth 35 --outdir %TEMP%/pair

Os dois avatares vão para o mesmo ponto (o pivô do móvel) e o corpo de cada um já vem separado
pelo clipe; `--heading` gira os dois juntos (heading do assento + facing).
"""

from __future__ import annotations

import argparse
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

ap = argparse.ArgumentParser()
ap.add_argument("--male", required=True)
ap.add_argument("--female", required=True)
ap.add_argument("--action", required=True)
ap.add_argument("--heading", type=float, default=180.0, help="graus, aplicado aos dois")
ap.add_argument("--azimuth", type=float, default=35.0)
ap.add_argument("--elevation", type=float, default=28.0)
ap.add_argument("--frames", type=int, nargs="*", default=[40])
ap.add_argument("--width", type=int, default=900)
ap.add_argument("--height", type=int, default=700)
ap.add_argument("--only", choices=["male", "female"], help="renderiza só um corpo")
ap.add_argument("--zoom", type=float, default=1.0, help="<1 aproxima (multiplica a distância)")
ap.add_argument(
    "--center",
    type=float,
    nargs=3,
    help="ponto de mira em metros (x y z); padrão: centro do conjunto",
)
ap.add_argument("--outdir", required=True)
args = ap.parse_args(argv)

outdir = Path(args.outdir)
outdir.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in dir(bpy.types) else "BLENDER_EEVEE"
scn.render.resolution_x = args.width
scn.render.resolution_y = args.height
scn.render.fps = 30

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scn.collection.objects.link(cam)
scn.camera = cam
light = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
light.data.energy = 4
light.rotation_euler = (math.radians(50), 0, math.radians(35))
scn.collection.objects.link(light)

paths = {"male": args.male, "female": args.female}
for key in ("male", "female"):
    if args.only and args.only != key:
        continue
    path = paths[key]
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    # Cada GLB traz a própria armature e as próprias actions; os ossos são renomeados para
    # `b0..bN` nos dois corpos, então procurar por nome de osso não distingue os lados. Fica com
    # o que este import criou.
    new_objects = [o for o in bpy.data.objects if o not in before_objects]
    new_actions = [a for a in bpy.data.actions if a not in before_actions]
    arm = next((o for o in new_objects if o.type == "ARMATURE"), None)
    if arm is None:
        raise SystemExit(f"armature not found in {path}")
    if arm.animation_data is None:
        arm.animation_data_create()
    pattern = re.compile(rf"{re.escape(args.action)}(\.\d+)?$")
    action = next(
        (a for a in new_actions if pattern.match(a.name.split("|")[-1])),
        None,
    )
    if action is None:
        names = ", ".join(a.name for a in new_actions)
        raise SystemExit(f"action {args.action!r} not found (have: {names})")
    print("ACTION", path, "->", action.name, "bones", len(arm.data.bones))
    arm.animation_data.action = action
    # Ambos no mesmo ponto (o pivô), girados pelo heading do par.
    for root in {arm, arm.parent}:
        if root is not None:
            root.location = (0.0, 0.0, 0.0)
            root.rotation_euler = (root.rotation_euler.x, root.rotation_euler.y,
                                   root.rotation_euler.z + math.radians(args.heading))

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
lo = Vector((1e9,) * 3)
hi = Vector((-1e9,) * 3)
for o in meshes:
    for corner in o.bound_box:
        w = o.matrix_world @ Vector(corner)
        for i in range(3):
            lo[i] = min(lo[i], w[i])
            hi[i] = max(hi[i], w[i])
center = (lo + hi) * 0.5
if args.center:
    center = Vector(args.center)
size = (hi - lo).length * args.zoom
az = math.radians(args.azimuth)
el = math.radians(args.elevation)
cam.location = center + Vector(
    (
        math.sin(az) * math.cos(el) * size * 1.1,
        -math.cos(az) * math.cos(el) * size * 1.1,
        math.sin(el) * size * 1.1,
    )
)
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

for f in args.frames:
    scn.frame_set(f)
    scn.render.filepath = str(outdir / f"pair_f{f:03d}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scn.render.filepath)
print("DONE")
