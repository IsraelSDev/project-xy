"""Build a GLB from an ``extract_character.py`` JSON, rest pose or with embedded animation.

Run through Blender 5.2 (headless)::

    python tools/3dx/run_blender.py export_glb.py -- --json <in.json> --out <out.glb>
    python tools/3dx/run_blender.py export_glb.py -- --json <in.json> --out <out.glb> --anim
    python tools/3dx/run_blender.py export_glb.py -- --json <idle.json> --out <out.glb> \
        --anim --anim-name idle --extra-anim <walk.json> walk

When ``--anim`` is given (and the JSON has ``world``), the clip is written as
per-bone TRS keyframes. ``--extra-anim JSON NAME`` adds more clips on the same
skeleton; each becomes a separate action/animation in the GLB. Rules frozen in
the plan: bones are parented *before* ``length`` and both *before* ``matrix``
(rule 5); ``to_bl = P @ M`` (rule 1).
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
    "--anim-name",
    help="name of the exported animation clip (default: JSON animName or 'idle')",
)
ap.add_argument(
    "--extra-anim",
    nargs=2,
    action="append",
    default=[],
    metavar=("JSON", "NAME"),
    help="additional animation JSON (same skeleton as --json) and its clip name; repeatable",
)
ap.add_argument(
    "--color",
    default="0.78,0.6,0.48",
    help="base color as r,g,b in 0..1 (clothes use 1,1,1 and are tinted in game)",
)
ap.add_argument("--roughness", type=float, default=0.65)
ap.add_argument("--texture", help="PNG used as the base-color/alpha texture (hair atlases)")
ap.add_argument(
    "--materials",
    help="JSON mapping mesh name -> {texture, normal, alphaMode, cutoff, doubleSided, roughness}; "
    "paths are relative to the JSON",
)
ap.add_argument(
    "--alpha-mode",
    choices=["opaque", "cutout", "blend"],
    default="opaque",
    help="how the texture alpha is exported (hair cards use cutout)",
)
ap.add_argument("--cutoff", type=float, default=0.5, help="alpha cutoff for --alpha-mode cutout")
ap.add_argument(
    "--double-sided",
    action="store_true",
    help="render both faces (hair cards); glTF doubleSided=true",
)
ap.add_argument(
    "--tangents",
    action="store_true",
    help="export tangents (needed by normal maps in some viewers)",
)
args = ap.parse_args(argv)

data = json.loads(Path(args.json).read_text(encoding="utf-8"))
OUT = Path(args.out)
bones = data["bones"]
meshes = data.get("meshes") or [data["mesh"]]
N = len(bones)

# Animation clips baked from `extract_character.py` JSONs. The base JSON may carry
# one (`--anim`); `--extra-anim` adds more on the same skeleton (e.g. walk beside
# idle). All clips are exported as separate actions in the same GLB.
animations: list[tuple[str, dict, int, float]] = []
if args.anim and "world" in data:
    animations.append((
        args.anim_name or data.get("animName") or "idle",
        data,
        data.get("frames", 0),
        float(data.get("fps", 30)),
    ))
for extra_path, extra_name in args.extra_anim:
    extra = json.loads(Path(extra_path).read_text(encoding="utf-8"))
    if "world" not in extra:
        raise SystemExit(f"{extra_path}: no 'world' animation data")
    if len(extra["bones"]) != N:
        raise SystemExit(
            f"{extra_path}: {len(extra['bones'])} bones, base JSON has {N}"
        )
    for i, (a, b) in enumerate(zip(bones, extra["bones"])):
        if (
            a.get("parent") != b.get("parent")
            or a.get("rest") != b.get("rest")
            or a.get("pos") != b.get("pos")
        ):
            raise SystemExit(
                f"{extra_path}: bone {i} rest/parent differs from the base JSON"
            )
    animations.append((
        extra_name,
        extra,
        extra.get("frames", 0),
        float(extra.get("fps", 30)),
    ))

do_anim = bool(animations)
NF = max((nf for _name, _clip, nf, _fps in animations), default=0)
if do_anim:
    fps = animations[0][3]
    for name, _clip, _nf, clip_fps in animations:
        if abs(clip_fps - fps) > 1e-6:
            raise SystemExit(
                f"clip {name!r} is {clip_fps:g} fps but the first clip is {fps:g} fps"
            )
    data = {**data, "frames": NF, "fps": fps}

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
    scn.render.fps = int(round(data.get("fps", 30)))
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

material_dir: Path | None = None
material_specs: dict[str, dict] = {}
if args.materials:
    materials_path = Path(args.materials).resolve()
    material_dir = materials_path.parent
    material_specs = json.loads(materials_path.read_text(encoding="utf-8"))


def parse_color(value) -> tuple[float, float, float]:
    parts = value if isinstance(value, (list, tuple)) else str(value).split(",")
    color = tuple(float(part) for part in parts)
    if len(color) != 3:
        raise SystemExit("--color must be r,g,b")
    return color  # type: ignore[return-value]


def resolve_texture(path: str | None) -> Path | None:
    if not path:
        return None
    candidate = Path(path)
    if not candidate.is_absolute() and material_dir is not None:
        candidate = material_dir / candidate
    return candidate.resolve()


def make_material(name: str, spec: dict) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    base_color = parse_color(spec.get("color", args.color))
    alpha_mode = spec.get("alphaMode", args.alpha_mode)
    cutoff = float(spec.get("cutoff", args.cutoff))
    double_sided = bool(spec.get("doubleSided", args.double_sided))
    if alpha_mode not in ("opaque", "cutout", "blend"):
        raise SystemExit(f"material {name!r}: invalid alphaMode {alpha_mode!r}")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = float(
                spec.get("roughness", args.roughness)
            )
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0
        texture_path = resolve_texture(spec.get("texture", args.texture))
        if texture_path:
            image = bpy.data.images.load(str(texture_path), check_existing=True)
            image.colorspace_settings.name = "sRGB"
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = image
            tex.interpolation = "Linear"
            tex.location = (-500, 300)
            links = mat.node_tree.links
            links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            if alpha_mode != "opaque" and "Alpha" in bsdf.inputs:
                if alpha_mode == "cutout":
                    # The glTF exporter detects MASK from an explicit alpha >= cutoff
                    # comparison node (Blender 5 no longer reads blend_method for this).
                    alpha_cut = mat.node_tree.nodes.new("ShaderNodeMath")
                    alpha_cut.operation = "GREATER_THAN"
                    alpha_cut.inputs[1].default_value = cutoff
                    alpha_cut.location = (-220, 120)
                    links.new(tex.outputs["Alpha"], alpha_cut.inputs[0])
                    links.new(alpha_cut.outputs["Value"], bsdf.inputs["Alpha"])
                else:
                    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        normal_path = resolve_texture(spec.get("normal"))
        if normal_path and "Normal" in bsdf.inputs:
            normal_image = bpy.data.images.load(str(normal_path), check_existing=True)
            normal_image.colorspace_settings.name = "Non-Color"
            normal_tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            normal_tex.image = normal_image
            normal_tex.location = (-700, 0)
            normal_map = mat.node_tree.nodes.new("ShaderNodeNormalMap")
            normal_map.location = (-350, 0)
            mat.node_tree.links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
            mat.node_tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    mat.use_backface_culling = not double_sided
    if alpha_mode == "cutout":
        mat.blend_method = "CLIP"
        mat.alpha_threshold = cutoff
    elif alpha_mode == "blend":
        mat.blend_method = "BLEND"
    else:
        mat.blend_method = "OPAQUE"
    return mat


default_material = make_material("skin", {})

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
    spec = material_specs.get(mesh["name"])
    if spec and spec.get("smooth"):
        for poly in me.polygons:
            poly.use_smooth = True
        normals = mesh.get("normals")
        if normals and len(normals) == len(mesh["verts"]):
            try:
                me.normals_split_custom_set_from_vertices([tuple(n) for n in normals])
            except Exception as error:
                print(f"  ! {mesh['name']}: custom normals skipped ({error})")
        me.update()
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
    spec = material_specs.get(mesh["name"])
    me.materials.append(make_material(mesh["name"], spec) if spec else default_material)
if do_anim:
    rest_local = []
    for i in range(N):
        par = bones[i]["parent"]
        rest_local.append((bRW[par].inverted() @ bRW[i]) if par >= 0 else bRW[i])

    arm.animation_data_create()
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"

    def build_action(name: str, clip: dict, nf: int) -> None:
        """Bake one clip into its own action; the exporter emits one animation per action."""
        bPW = [
            [to_bl(world_mat(clip["world"][f][i]["rot"], clip["world"][f][i]["pos"])) for i in range(N)]
            for f in range(nf)
        ]
        basis = [[I] * N for _ in range(nf)]
        moving = [False] * N
        for i in range(N):
            par = bones[i]["parent"]
            rli = rest_local[i].inverted()
            for f in range(nf):
                parw = bPW[f][par] if par >= 0 else I
                b = rli @ parw.inverted() @ bPW[f][i]
                basis[f][i] = b
                if sum(abs(b[r][c] - I[r][c]) for r in range(4) for c in range(4)) > 1e-4:
                    moving[i] = True
        print("clip", name, "moving bones", sum(moving), "of", N, "frames", nf)

        # Start a fresh action and rest pose: bones that this clip does not key must
        # not inherit the previous clip's last frame when the game switches clips.
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.matrix_basis = I
        for f in range(nf):
            for i in range(N):
                if not moving[i]:
                    continue
                pb = arm.pose.bones[f"b{i}"]
                pb.matrix_basis = basis[f][i]
                pb.keyframe_insert("location", frame=f)
                pb.keyframe_insert("rotation_quaternion", frame=f)
                pb.keyframe_insert("scale", frame=f)
        action = arm.animation_data.action
        if action is None:
            raise SystemExit(f"clip {name!r}: Blender did not create an action")
        action.name = name
        action.use_fake_user = True

    for name, clip, nf, _fps in animations:
        build_action(name, clip, nf)

    # Leave no active action: `ACTIONS` + `export_anim_single_armature` exports every
    # action on the armature (idle, walk, ...), each with its own frame range.
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis = I

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
    export_animation_mode="ACTIONS",
    export_anim_single_armature=True,
    export_reset_pose_bones=True,
    export_frame_range=do_anim,
    export_force_sampling=do_anim,
    export_optimize_animation_size=False,
    export_tangents=args.tangents,
)
print("EXPORTED", OUT, OUT.stat().st_size)
