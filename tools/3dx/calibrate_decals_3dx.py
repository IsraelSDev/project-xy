"""Calibra as âncoras de decalque 3DX por raycast na malha do corpo/cabeça.

Uso (roda dentro do Blender):

    python tools/3dx/run_blender.py calibrate_decals_3dx.py -- \
        --body apps/web/public/assets/3dx/character_male.glb \
        --gender male --out "$env:TEMP/anchors_male.json"

O JSON gerado tem `bone`, `position`, `quaternion` e `size` por slot; copie os
valores para `DECAL_ANCHORS_3DX_{MALE,FEMALE}` em `decals-3dx.ts` se recalibrar.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
ap = argparse.ArgumentParser()
ap.add_argument("--body", required=True)
ap.add_argument("--gender", choices=["male", "female"], required=True)
ap.add_argument("--out", required=True)
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.body)

arm = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
suffix = "man" if args.gender == "male" else "woman"
body = bpy.data.objects[f"{suffix}_body"]
head = bpy.data.objects[f"{suffix}_head"]

BONES = {
    "male": {
        "head": "b148",
        "neck": "b144",
        "chest": "b81",
        "armLeft": "b90",
        "armRight": "b269",
        "thighLeft": "b23",
        "thighRight": "b49",
    },
    "female": {
        "head": "b156",
        "neck": "b325",
        "chest": "b421",
        "armLeft": "b78",
        "armRight": "b332",
        "thighLeft": "b3",
        "thighRight": "b39",
    },
}[args.gender]

SLOT_BONE = {
    "face": "head",
    "neck": "neck",
    "chest": "chest",
    "back": "chest",
    "armLeft": "armLeft",
    "armRight": "armRight",
    "thighLeft": "thighLeft",
    "thighRight": "thighRight",
}

# slot: (mesh, origin, direction, size)
RAYS = {
    "male": {
        "face": (head, (0.0, -1.0, 1.66), (0.0, 1.0, 0.0), 0.11),
        "neck": (body, (0.0, -1.0, 1.49), (0.0, 1.0, 0.0), 0.08),
        "chest": (body, (0.0, -1.0, 1.30), (0.0, 1.0, 0.0), 0.22),
        "back": (body, (0.0, 1.0, 1.30), (0.0, -1.0, 0.0), 0.22),
        "armLeft": (body, (-1.0, 0.0, 1.35), (1.0, 0.0, 0.0), 0.10),
        "armRight": (body, (1.0, 0.0, 1.35), (-1.0, 0.0, 0.0), 0.10),
        "thighLeft": (body, (-0.12, -1.0, 0.76), (0.0, 1.0, 0.0), 0.14),
        "thighRight": (body, (0.12, -1.0, 0.76), (0.0, 1.0, 0.0), 0.14),
    },
    "female": {
        "face": (head, (0.0, -1.0, 1.62), (0.0, 1.0, 0.0), 0.11),
        "neck": (body, (0.0, -1.0, 1.45), (0.0, 1.0, 0.0), 0.08),
        "chest": (body, (0.0, -1.0, 1.25), (0.0, 1.0, 0.0), 0.22),
        "back": (body, (0.0, 1.0, 1.25), (0.0, -1.0, 0.0), 0.22),
        "armLeft": (body, (-1.0, 0.0, 1.35), (1.0, 0.0, 0.0), 0.10),
        "armRight": (body, (1.0, 0.0, 1.35), (-1.0, 0.0, 0.0), 0.10),
        "thighLeft": (body, (-0.12, -1.0, 0.76), (0.0, 1.0, 0.0), 0.14),
        "thighRight": (body, (0.12, -1.0, 0.76), (0.0, 1.0, 0.0), 0.14),
    },
}[args.gender]


def quat_from_basis(x: Vector, y: Vector, z: Vector):
    return Matrix((x, y, z)).transposed().to_4x4().to_quaternion()


anchors = {}
for slot, (mesh, origin, direction, size) in RAYS.items():
    inv = mesh.matrix_world.inverted()
    origin_local = inv @ Vector(origin)
    direction_local = (inv.to_3x3() @ Vector(direction)).normalized()
    hit, location, _normal, _face = mesh.ray_cast(origin_local, direction_local)
    if not hit:
        raise SystemExit(f"{slot}: ray missed {mesh.name}")
    point = mesh.matrix_world @ location
    # Use a predictable outward axis per slot. Ray hit face normals on the
    # low-poly body tilt the plane too much; the front/back/side planes are a
    # good tangent approximation and keep left/right symmetric.
    SLOT_NORMAL = {
        "face": Vector((0.0, -1.0, 0.0)),
        "neck": Vector((0.0, -1.0, 0.0)),
        "chest": Vector((0.0, -1.0, 0.0)),
        "back": Vector((0.0, 1.0, 0.0)),
        "armLeft": Vector((-1.0, 0.0, 0.0)),
        "armRight": Vector((1.0, 0.0, 0.0)),
        "thighLeft": Vector((0.0, -1.0, 0.0)),
        "thighRight": Vector((0.0, -1.0, 0.0)),
    }
    normal = SLOT_NORMAL[slot]

    up = Vector((0.0, 0.0, 1.0))
    if abs(normal.dot(up)) > 0.95:
        up = Vector((0.0, 1.0, 0.0))
    right = up.cross(normal).normalized()
    up2 = normal.cross(right).normalized()
    world_quat = quat_from_basis(right, up2, -normal)

    bone = arm.data.bones[BONES[SLOT_BONE[slot]]]
    bone_matrix = arm.matrix_world @ bone.matrix_local
    local = bone_matrix.inverted() @ point
    local_quat = bone_matrix.to_quaternion().inverted() @ world_quat
    local_quat.normalize()

    anchors[slot] = {
        "bone": BONES[SLOT_BONE[slot]],
        "position": [round(local.x, 6), round(local.y, 6), round(local.z, 6)],
        "quaternion": [
            round(local_quat.x, 6),
            round(local_quat.y, 6),
            round(local_quat.z, 6),
            round(local_quat.w, 6),
        ],
        "size": size,
        "target": [round(v, 4) for v in point],
    }
    print(slot, "hit", tuple(round(v, 3) for v in point), "normal", tuple(round(v, 3) for v in normal))

Path(args.out).write_text(json.dumps(anchors, indent=2) + "\n", encoding="utf-8")
print("wrote", args.out)
