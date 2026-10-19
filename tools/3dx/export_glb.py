"""Build a GLB from an ``extract_character.py`` JSON, rest pose or with embedded animation.

Run through Blender 5.2 (headless)::

    python tools/3dx/run_blender.py export_glb.py -- --json <in.json> --out <out.glb>
    python tools/3dx/run_blender.py export_glb.py -- --json <in.json> --out <out.glb> --anim

When ``--anim`` is given (and the JSON has ``world``), the clip is written as
per-bone TRS keyframes. Rules frozen in the plan: bones are parented *before*
``length`` and both *before* ``matrix`` (rule 5); ``to_bl = P @ M`` (rule 1).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
import argparse

ap = argparse.ArgumentParser()
ap.add_argument("--json", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--anim", action="store_true")
ap.add_argument(
    "--color",
    default="0.78,0.6,0.48",
    help="base color as r,g,b in 0..1 (clothes use 1,1,1 and are tinted in game)",
)
ap.add_argument("--roughness", type=float, default=0.65)
args = ap.parse_args(argv)

data = json.loads(Path(args.json).read_text(encoding="utf-8"))
OUT = Path(args.out)
bones = data["bones"]
meshes = data.get("meshes") or [data["mesh"]]
N = len(bones)
do_anim = args.anim and "world" in data
NF = data.get("frames", 0)

P = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
I = Matrix.Identity(4)


def to_bl(M):
    return P @ M


def quat_mat(q):
    x, y, z, w = q
    return Quaternion((w, x, y, z)).to_matrix().to_4x4()


def world_mat(q, t):
    m = quat_mat(q)
    m.translation = Vector(t)
    return m


depth = [0] * N
for i in range(N):
    d, p = 0, bones[i]["parent"]
    while p >= 0:
        d += 1
        p = bones[p]["parent"]
    depth[i] = d
order = sorted(range(N), key=lambda i: depth[i])

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
if do_anim:
    scn.render.fps = 30
    scn.frame_start = 0
    scn.frame_end = NF - 1
vl = bpy.context.view_layer

arm_data = bpy.data.armatures.new("3dx_rig")
arm = bpy.data.objects.new("3dx_rig", arm_data)
scn.collection.objects.link(arm)
vl.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")

# rest world matrices in Blender space (P applied to bone rest)
bRW = [to_bl(world_mat(bones[i]["rest"], bones[i]["pos"])) for i in range(N)]

ebs = {}
for i in order:
    ebs[i] = arm_data.edit_bones.new(f"b{i}")
    ebs[i].use_deform = True
for i in order:                       # parents first
    par = bones[i]["parent"]
    if par >= 0:
        ebs[i].parent = ebs[par]
        ebs[i].use_connect = False
for i in order:                       # then length
    ebs[i].length = 0.02
for i in order:                       # matrix last (plan rule 5)
    ebs[i].matrix = bRW[i]
bpy.ops.object.mode_set(mode="OBJECT")

mat = bpy.data.materials.new("skin")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
base_color = tuple(float(part) for part in args.color.split(","))
if len(base_color) != 3:
    raise SystemExit("--color must be r,g,b")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (*base_color, 1)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = args.roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = 0.0

for mesh in meshes:
    me = bpy.data.meshes.new(mesh["name"])
    verts = [tuple(v) for v in mesh["verts"]]
    faces = [tuple(mesh["indices"][i:i + 3]) for i in range(0, len(mesh["indices"]), 3)]
    me.from_pydata(verts, [], faces)
    me.update()
    uv = me.uv_layers.new(name="UV")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = mesh["uvs"][me.loops[li].vertex_index]
    obj = bpy.data.objects.new(mesh["name"], me)
    scn.collection.objects.link(obj)
    groups = [obj.vertex_groups.new(name=f"b{i}") for i in range(N)]
    for vi in range(len(mesh["verts"])):
        base = vi * 4
        for j in range(4):
            w = mesh["weights"][base + j]
            if w > 1e-5:
                groups[mesh["boneIdx"][base + j]].add([vi], w, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm
    me.materials.append(mat)

if do_anim:
    rest_local = []
    for i in range(N):
        par = bones[i]["parent"]
        rest_local.append((bRW[par].inverted() @ bRW[i]) if par >= 0 else bRW[i])
    bPW = [[to_bl(world_mat(data["world"][f][i]["rot"], data["world"][f][i]["pos"])) for i in range(N)]
           for f in range(NF)]
    basis = [[I] * N for _ in range(NF)]
    moving = [False] * N
    for i in range(N):
        par = bones[i]["parent"]
        rli = rest_local[i].inverted()
        for f in range(NF):
            parw = bPW[f][par] if par >= 0 else I
            b = rli @ parw.inverted() @ bPW[f][i]
            basis[f][i] = b
            if sum(abs(b[r][c] - I[r][c]) for r in range(4) for c in range(4)) > 1e-4:
                moving[i] = True
    print("moving bones", sum(moving), "of", N, "frames", NF)
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for f in range(NF):
        for i in range(N):
            if not moving[i]:
                continue
            pb = arm.pose.bones[f"b{i}"]
            pb.matrix_basis = basis[f][i]
            pb.keyframe_insert("location", frame=f)
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.keyframe_insert("scale", frame=f)

OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format="GLB",
    use_selection=False,
    export_apply=False,
    export_yup=True,
    export_skins=True,
    export_animations=do_anim,
    export_frame_range=do_anim,
    export_force_sampling=do_anim,
    export_optimize_animation_size=False,
)
print("EXPORTED", OUT, OUT.stat().st_size)
