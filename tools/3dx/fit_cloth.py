"""Fit a 3DX clothing mesh to the body used by the idle.

Clothing bundles are authored on a copy of the rig and retargeted by name, but they keep their
own skin weights. In the native idle those weights make the garment deform slightly differently
from the body at the shoulders, armpits and bust, so the body pokes through. The garment is also
modelled a fraction of a millimetre inside the body at some seams (collar, nipples).

This step:
1. Offsets the whole piece by ``--base-offset`` along its normals (the usual small clearance).
2. Copies the nearest body vertex's four skin influences so both surfaces deform together.
3. Pushes only the vertices that are still inside (or within ``--clearance``) out along the
   body normal. The push is diffused with a Gaussian and mirrored across X so a contact on one
   side also clears its pair (nipples, collar).

Run through Blender (needs ``mathutils``/numpy), from the repository root::

    python tools/3dx/run_blender.py fit_cloth.py -- \
        --body tools/3dx/build/character_male_idle.json \
        --cloth tools/3dx/build/outfit_male_top.json \
        --out tools/3dx/build/outfit_male_top_fit.json \
        --base-offset 0.006 --clearance 0.006 --sigma 0.020

Then export the JSON as usual with ``export_glb.py --color 1,1,1 --roughness 0.8``.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--body", required=True, help="body JSON with the native idle")
ap.add_argument("--cloth", required=True, help="retargeted clothing JSON")
ap.add_argument("--out", required=True, help="output clothing JSON")
ap.add_argument("--base-offset", type=float, default=0.006, help="normal offset applied first (m)")
ap.add_argument("--clearance", type=float, default=0.005, help="distance to keep outside the body (m)")
ap.add_argument("--sigma", type=float, default=0.012, help="diffusion radius of the local push (m)")
ap.add_argument("--global-push", type=float, default=0.0, help="extra body-normal offset (m)")
ap.add_argument("--no-mirror", action="store_true", help="do not mirror contact sources across X")
args = ap.parse_args(argv)

body = json.loads(Path(args.body).read_text(encoding="utf-8"))
cloth = json.loads(Path(args.cloth).read_text(encoding="utf-8"))
body_mesh = next(m for m in body["meshes"] if m["name"].endswith("body"))

body_v = np.asarray(body_mesh["verts"], dtype=np.float64).reshape((-1, 3))
body_idx = np.asarray(body_mesh["indices"], dtype=np.int64).reshape(-1)
body_j = np.asarray(body_mesh["boneIdx"], dtype=np.int64).reshape((-1, 4))
body_w = np.asarray(body_mesh["weights"], dtype=np.float64).reshape((-1, 4))
body_tris = [tuple(int(x) for x in body_idx[i : i + 3]) for i in range(0, len(body_idx), 3)]
tree = BVHTree.FromPolygons(body_v.tolist(), body_tris, all_triangles=True)

for mesh in cloth["meshes"]:
    v = np.asarray(mesh["verts"], dtype=np.float64).reshape((-1, 3))
    n = len(v)
    if args.base_offset:
        normals = np.asarray(mesh["normals"], dtype=np.float64).reshape((-1, 3))
        v = v + normals * args.base_offset

    # Nearest point on the body surface, its outward normal, and the signed distance.
    body_normals = np.empty((n, 3))
    signed = np.empty(n)
    face_of = np.empty(n, dtype=np.int64)
    for i, p in enumerate(v):
        loc, normal, face, _dist = tree.find_nearest(p)
        body_normals[i] = normal
        face_of[i] = face
        signed[i] = np.dot(p - np.asarray(loc), np.asarray(normal))

    required = np.maximum(0.0, args.clearance - signed)
    sources = np.flatnonzero(required > 0.0)
    if len(sources):
        src = v[sources]
        req = required[sources]
        if not args.no_mirror:
            src = np.concatenate([src, src * np.array([-1.0, 1.0, 1.0])])
            req = np.concatenate([req, req])
        delta = v[:, None, :] - src[None, :, :]
        d2 = np.einsum("ijk,ijk->ij", delta, delta)
        kernel = np.exp(-d2 / (2.0 * args.sigma * args.sigma))
        push = (req[None, :] * kernel).max(axis=1)
        push = np.maximum(push, required)
    else:
        push = np.zeros(n)

    mesh["verts"] = [
        [round(float(x), 5) for x in p]
        for p in v + body_normals * (push + args.global_push)[:, None]
    ]

    # Copy the nearest body triangle vertex's body influences (same four-bone skinning).
    nearest = np.empty(n, dtype=np.int64)
    for i, p in enumerate(v):
        cand = body_tris[int(face_of[i])]
        d2 = [((p - body_v[c]) ** 2).sum() for c in cand]
        nearest[i] = cand[int(np.argmin(d2))]
    mesh["boneIdx"] = [int(x) for x in body_j[nearest].reshape(-1)]
    mesh["weights"] = [round(float(x), 6) for x in body_w[nearest].reshape(-1)]

    print(
        f"{mesh['name']}: {n} verts, inside={int((signed < 0).sum())}, "
        f"deepest={min(0.0, signed.min())*1000:.2f}mm, pushed={len(sources)} verts "
        f"(max {push.max()*1000:.2f}mm), clearance={args.clearance*1000:.1f}mm "
        f"sigma={args.sigma*1000:.0f}mm base={args.base_offset*1000:.1f}mm"
    )

Path(args.out).parent.mkdir(parents=True, exist_ok=True)
Path(args.out).write_text(json.dumps(cloth), encoding="utf-8")
print("wrote", args.out, Path(args.out).stat().st_size)
