"""Reference skinning in pure Python (no Blender). Cross-checks the GLB.

Deforms the raw (Z-up) vertices with ``D = P @ (pose_world @ rest_world^-1) @ P^-1``
(plan section 2, rule 1) and writes an OBJ per frame, printing the max
displacement so ``verify_glb.py`` can be compared against a known number.

    py -3.11 tools/3dx/skin_export.py --json tools/3dx/build/character_male.json --outdir %TEMP%/skin
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import lib3dx as L


def skin_mesh(mesh, deform):
    verts = mesh["verts"]
    bi = mesh["boneIdx"]
    bw = mesh["weights"]
    out = []
    for vi in range(len(verts)):
        x, y, z = verts[vi]
        ax = ay = az = 0.0
        for k in range(4):
            w = bw[vi * 4 + k]
            if w == 0:
                continue
            M = deform(bi[vi * 4 + k])
            ax += w * (M[0][0] * x + M[0][1] * y + M[0][2] * z + M[0][3])
            ay += w * (M[1][0] * x + M[1][1] * y + M[1][2] * z + M[1][3])
            az += w * (M[2][0] * x + M[2][1] * y + M[2][2] * z + M[2][3])
        out.append((ax, ay, az))
    return out


def write_obj(path, vs, indices):
    lines = [f"v {v[0]:.5f} {v[1]:.5f} {v[2]:.5f}" for v in vs]
    for i in range(0, len(indices), 3):
        lines.append(f"f {indices[i] + 1} {indices[i + 1] + 1} {indices[i + 2] + 1}")
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--frames", type=int, nargs="*", default=[0, 40, 80, 120, 160, 200])
    ap.add_argument("--no-obj", action="store_true")
    args = ap.parse_args()

    data = json.loads(Path(args.json).read_text(encoding="utf-8"))
    bones = data["bones"]
    meshes = data.get("meshes") or [data["mesh"]]
    world = data.get("world")
    nf = data.get("frames", 0)
    n = len(bones)
    Mrest = [L.m4(L.mat_from_q(b["rest"]), b["pos"]) for b in bones]

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    frames = [f for f in args.frames if world is None or f < nf] or [0]
    for f in frames:
        if world is None:
            D = [L.mm4(L.mm4(L.P, L.mm4(Mrest[i], L.inv4(Mrest[i]))), L.P_inv) for i in range(n)]
        else:
            D = []
            for i in range(n):
                w = world[f][i]
                Mp = L.m4(L.mat_from_q(w["rot"]), w["pos"])
                D.append(L.mm4(L.mm4(L.P, L.mm4(Mp, L.inv4(Mrest[i]))), L.P_inv))
        for mesh in meshes:
            vs = skin_mesh(mesh, lambda i: D[i])
            mx = max(math.dist(vs[i], mesh["verts"][i]) for i in range(len(vs)))
            print(f"frame {f} {mesh['name']}: maxdisp {mx:.4f}")
            if not args.no_obj:
                write_obj(outdir / f"{mesh['name']}_f{f:03d}.obj", vs, mesh["indices"])
    print("done")


if __name__ == "__main__":
    main()
