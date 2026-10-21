"""Render a GLB (with or without animation) or a folder of posed OBJs, to eyeball it.

Run through Blender 5.2::

    python tools/3dx/run_blender.py render_check.py -- --glb <out.glb> --outdir %TEMP%/render
    python tools/3dx/run_blender.py render_check.py -- --objdir %TEMP%/skin --outdir %TEMP%/render
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
import argparse

ap = argparse.ArgumentParser()
ap.add_argument("--glb")
ap.add_argument("--objdir")
ap.add_argument("--outdir", required=True)
ap.add_argument("--frames", type=int, nargs="*", default=[0, 80, 160])
ap.add_argument("--action", help="action/animation name to play (default: first action)")
ap.add_argument(
    "--azimuth",
    type=float,
    default=0,
    help="camera azimuth in degrees (0=front, 90=right/side, 180=back)",
)
ap.add_argument("--width", type=int, default=600)
ap.add_argument("--height", type=int, default=900)
args = ap.parse_args(argv)

outdir = Path(args.outdir)
outdir.mkdir(parents=True, exist_ok=True)


def setup_scene():
    scn = bpy.context.scene
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scn.collection.objects.link(cam)
    scn.camera = cam
    light = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    light.data.energy = 4
    light.rotation_euler = (math.radians(55), 0, math.radians(40))
    scn.collection.objects.link(light)
    try:
        scn.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scn.render.engine = "BLENDER_EEVEE"
    scn.render.resolution_x = args.width
    scn.render.resolution_y = args.height
    return scn, cam


def frame_camera(scn, cam, objs):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    ctr = (lo + hi) * 0.5
    size = (hi - lo).length
    angle = math.radians(args.azimuth)
    cam.location = ctr + Vector(
        (math.sin(angle) * size * 1.2, -math.cos(angle) * size * 1.2, size * 0.05)
    )
    cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()


if args.glb:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn, cam = setup_scene()
    scn.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=args.glb)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if arm and bpy.data.actions:
        if arm.animation_data is None:
            arm.animation_data_create()
        try:
            action = (
                bpy.data.actions.get(args.action)
                if args.action
                else bpy.data.actions[0]
            )
            if action is None:
                names = ", ".join(a.name for a in bpy.data.actions)
                raise SystemExit(f"action {args.action!r} not found (have: {names})")
            arm.animation_data.action = action
        except Exception as e:
            print("action assign failed:", e)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    frame_camera(scn, cam, meshes)
    for f in args.frames:
        scn.frame_set(f)
        scn.render.filepath = str(outdir / f"glb_f{f:03d}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", f)
elif args.objdir:
    for obj_path in sorted(Path(args.objdir).glob("*.obj")):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scn, cam = setup_scene()
        bpy.ops.wm.obj_import(filepath=str(obj_path), forward_axis="Y", up_axis="Z")
        objs = [o for o in bpy.context.selected_objects if o.type == "MESH"]
        if not objs:
            continue
        frame_camera(scn, cam, objs)
        scn.render.filepath = str(outdir / f"{obj_path.stem}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", obj_path.name)
else:
    raise SystemExit("pass --glb or --objdir")
print("DONE")
