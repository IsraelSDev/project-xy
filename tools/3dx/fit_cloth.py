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
from mathutils.interpolate import poly_3d_calc

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--body", required=True, help="body JSON with the native idle")
ap.add_argument("--cloth", required=True, help="retargeted clothing JSON")
ap.add_argument("--out", required=True, help="output clothing JSON")
ap.add_argument("--base-offset", type=float, default=0.006, help="normal offset applied first (m)")
ap.add_argument("--clearance", type=float, default=0.005, help="distance to keep outside the body (m)")
ap.add_argument("--sigma", type=float, default=0.012, help="diffusion radius of the local push (m)")
ap.add_argument("--global-push", type=float, default=0.0, help="extra body-normal offset (m)")
ap.add_argument(
    "--fill-holes",
    type=float,
    default=0.0,
    help="fecha vãos entre painéis com leque; valor = área máxima do buraco em cm² (0 = não fecha)",
)
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

    # Copy the body's skinning at the closest surface point: barycentric interpolation over the
    # nearest triangle (not just its closest vertex) keeps the garment deforming with the skin
    # under it in the idle, which is where the body used to poke through.
    weights = np.empty((n, 4))
    indices = np.empty((n, 4), dtype=np.int64)
    for i, p in enumerate(v):
        tri = body_tris[int(face_of[i])]
        bary = poly_3d_calc([body_v[c] for c in tri], p)
        total = sum(bary) or 1.0
        bary = [b / total for b in bary]
        combined: dict[int, float] = {}
        for corner, body_index in enumerate(tri):
            for slot in range(4):
                bone = int(body_j[body_index][slot])
                w = float(body_w[body_index][slot]) * bary[corner]
                if w > 1e-5:
                    combined[bone] = combined.get(bone, 0.0) + w
        top = sorted(combined.items(), key=lambda item: -item[1])[:4]
        total = sum(w for _bone, w in top) or 1.0
        for slot in range(4):
            if slot < len(top):
                indices[i, slot] = top[slot][0]
                weights[i, slot] = top[slot][1] / total
            else:
                indices[i, slot] = 0
                weights[i, slot] = 0.0
    mesh["boneIdx"] = [int(x) for x in indices.reshape(-1)]
    mesh["weights"] = [round(float(x), 6) for x in weights.reshape(-1)]

    # Vãos entre painéis: o pano do 3DX é uma superfície de uma camada montada em várias peças e
    # algumas ficam com frestas (o casaco mostra o fundo da sala nas costas). Fecha com um leque no
    # centro do contorno os buracos pequenos; hems, punhos e decotes ficam abertos (área grande).
    if args.fill_holes > 0:
        index = [int(x) for x in mesh["indices"]]
        edges: dict[tuple[int, int], int] = {}
        for i in range(0, len(index), 3):
            a, b, c = index[i], index[i + 1], index[i + 2]
            for e in ((a, b), (b, c), (c, a)):
                key = (min(e), max(e))
                edges[key] = edges.get(key, 0) + 1
        boundary = [e for e, count in edges.items() if count == 1]
        adj: dict[int, list[int]] = {}
        for a, b in boundary:
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
        seen: set[int] = set()
        filled = 0
        verts = [list(map(float, p)) for p in mesh["verts"]]
        normals = [list(n) for n in mesh["normals"]]
        uvs = [list(t) for t in mesh["uvs"]]
        bone_idx = [int(x) for x in mesh["boneIdx"]]
        weights_list = [float(x) for x in mesh["weights"]]
        for start in adj:
            if start in seen:
                continue
            order = [start]
            seen.add(start)
            prev, cur = None, start
            while True:
                nxt = next((y for y in adj[cur] if y != prev and y not in seen), None)
                if nxt is None:
                    break
                order.append(nxt)
                seen.add(nxt)
                prev, cur = cur, nxt
            if len(order) < 3 or len(order) > 40:
                continue
            pts = np.array([verts[i] for i in order])
            centre = pts.mean(axis=0)
            normal = np.cross(pts[1] - pts[0], pts[2] - pts[0])
            length = np.linalg.norm(normal)
            area_cm2 = 0.0
            if length > 0:
                normal = normal / length
                for i in range(len(order)):
                    a1 = pts[i] - centre
                    b1 = pts[(i + 1) % len(order)] - centre
                    area_cm2 += np.dot(np.cross(a1, b1), normal) / 2 * 1e4
            if abs(area_cm2) > args.fill_holes:
                continue
            # Punhos ficam nas pontas do eixo X (|x| grande): fechar ali viraria um disco na mão.
            if abs(centre[0]) > 0.35:
                continue
            new_index = len(verts)
            verts.append([float(c) for c in centre])
            avg_normal = np.mean([normals[i] for i in order], axis=0)
            normals.append([float(c) for c in avg_normal])
            uvs.append([float(np.mean([uvs[i][0] for i in order])),
                        float(np.mean([uvs[i][1] for i in order]))])
            # pesos médios do contorno (top 4)
            acc: dict[int, float] = {}
            for i in order:
                for slot in range(4):
                    bone = bone_idx[i * 4 + slot]
                    w = weights_list[i * 4 + slot]
                    if w > 0:
                        acc[bone] = acc.get(bone, 0.0) + w
            total = sum(acc.values()) or 1.0
            top = sorted(acc.items(), key=lambda item: -item[1])[:4]
            for slot in range(4):
                bone = top[slot][0] if slot < len(top) else 0
                weight = top[slot][1] / total if slot < len(top) else 0.0
                weights_list.append(weight)
                bone_idx.append(bone)
            for i in range(len(order)):
                a = order[i]
                b = order[(i + 1) % len(order)]
                index.extend([a, b, new_index])
            filled += 1
        if filled:
            mesh["verts"] = [[round(c, 5) for c in p] for p in verts]
            mesh["normals"] = [[round(c, 6) for c in n] for n in normals]
            mesh["uvs"] = [[round(c, 6) for c in t] for t in uvs]
            mesh["indices"] = index
            mesh["boneIdx"] = bone_idx
            mesh["weights"] = [round(w, 6) for w in weights_list]
            print(f"  {mesh['name']}: {filled} vão(ões) fechados (≤{args.fill_holes} cm²)")

    print(
        f"{mesh['name']}: {n} verts, inside={int((signed < 0).sum())}, "
        f"deepest={min(0.0, signed.min())*1000:.2f}mm, pushed={len(sources)} verts "
        f"(max {push.max()*1000:.2f}mm), clearance={args.clearance*1000:.1f}mm "
        f"sigma={args.sigma*1000:.0f}mm base={args.base_offset*1000:.1f}mm"
    )

Path(args.out).parent.mkdir(parents=True, exist_ok=True)
Path(args.out).write_text(json.dumps(cloth), encoding="utf-8")
print("wrote", args.out, Path(args.out).stat().st_size)
