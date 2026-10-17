"""Independent skinning check: read a GLB back and deform it the way a runtime would.

This never trusts the exporter. It rebuilds node world matrices, applies the
embedded animation at a frame, multiplies by ``inverseBindMatrices`` and skins
every vertex, then reports the maximum displacement (rest pose must be ~0).

    py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/character_male.glb
    py -3.11 tools/3dx/verify_glb.py --glb <glb> --frame 80
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

CT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path: Path):
    raw = path.read_bytes()
    off = 12
    j = binc = None
    while off < len(raw):
        clen, ctype = struct.unpack("<II", raw[off:off + 8])
        off += 8
        chunk = raw[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            j = json.loads(chunk)
        elif ctype == 0x004E4942:
            binc = chunk
    return j, binc


def make_reader(j, binc):
    def read_acc(i):
        a = j["accessors"][i]
        bv = j["bufferViews"][a["bufferView"]]
        fmt, size = CT[a["componentType"]]
        n = NC[a["type"]]
        base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride", size * n)
        return [struct.unpack_from("<" + fmt * n, binc, base + k * stride) for k in range(a["count"])]
    return read_acc


def qmul(a, b):
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
            a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
            a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]


def qmat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def mm(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def trs(t, r, s):
    R = qmat(r)
    return [[R[0][0] * s[0], R[0][1] * s[1], R[0][2] * s[2], t[0]],
            [R[1][0] * s[0], R[1][1] * s[1], R[1][2] * s[2], t[1]],
            [R[2][0] * s[0], R[2][1] * s[1], R[2][2] * s[2], t[2]],
            [0, 0, 0, 1]]


def m4flat(f):
    return [[f[0], f[4], f[8], f[12]], [f[1], f[5], f[9], f[13]],
            [f[2], f[6], f[10], f[14]], [f[3], f[7], f[11], f[15]]]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--glb", required=True)
    ap.add_argument("--frame", type=int, default=80)
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--rest", action="store_true", help="force rest pose (ignore animation)")
    args = ap.parse_args()

    path = Path(args.glb)
    j, binc = read_glb(path)
    read_acc = make_reader(j, binc)
    nodes = j["nodes"]
    N = len(nodes)
    T = [list(n.get("translation", [0, 0, 0])) for n in nodes]
    R = [list(n.get("rotation", [0, 0, 0, 1])) for n in nodes]
    S = [list(n.get("scale", [1, 1, 1])) for n in nodes]
    parent = [-1] * N
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i

    animated = False
    if not args.rest and j.get("animations"):
        animated = True
        anim = j["animations"][0]
        t = args.frame / args.fps
        for ch in anim["channels"]:
            s = anim["samplers"][ch["sampler"]]
            times = [x[0] for x in read_acc(s["input"])]
            vals = read_acc(s["output"])
            if t <= times[0]:
                v = list(vals[0])
            elif t >= times[-1]:
                v = list(vals[-1])
            else:
                v = None
                for k in range(len(times) - 1):
                    if times[k] <= t <= times[k + 1]:
                        f = (t - times[k]) / (times[k + 1] - times[k]) if times[k + 1] > times[k] else 0
                        a, b = list(vals[k]), list(vals[k + 1])
                        if ch["target"]["path"] == "rotation" and sum(x * y for x, y in zip(a, b)) < 0:
                            b = [-x for x in b]
                        v = [a[i] + (b[i] - a[i]) * f for i in range(len(a))]
                        if ch["target"]["path"] == "rotation":
                            n2 = math.sqrt(sum(x * x for x in v)) or 1
                            v = [x / n2 for x in v]
                        break
            p = ch["target"]["path"]
            tgt = ch["target"]["node"]
            if p == "translation":
                T[tgt] = v
            elif p == "rotation":
                R[tgt] = v
            elif p == "scale":
                S[tgt] = v

    G = [None] * N

    def glob(i):
        if G[i] is not None:
            return G[i]
        local = trs(T[i], R[i], S[i])
        G[i] = mm(glob(parent[i]), local) if parent[i] >= 0 else local
        return G[i]

    for i in range(N):
        glob(i)

    print(f"GLB {path.name}: nodes={N} meshes={len(j.get('meshes', []))} "
          f"animations={len(j.get('animations', []))} "
          f"{'@ frame ' + str(args.frame) if animated else '(rest)'}")

    for mi, mesh in enumerate(j.get("meshes", [])):
        skin = j["skins"][0] if j.get("skins") else None
        if skin is None:
            continue
        joints = skin["joints"]
        ibm = [m4flat(x) for x in read_acc(skin["inverseBindMatrices"])]
        JM = [mm(G[joints[k]], ibm[k]) for k in range(len(joints))]
        for pi, pr in enumerate(mesh["primitives"]):
            attrs = pr["attributes"]
            if "JOINTS_0" not in attrs:
                continue
            POS = read_acc(attrs["POSITION"])
            JNT = read_acc(attrs["JOINTS_0"])
            WGT = read_acc(attrs["WEIGHTS_0"])
            lo = [1e9] * 3
            hi = [-1e9] * 3
            mx = 0.0
            for i in range(len(POS)):
                x, y, z = POS[i]
                acc = [0.0, 0.0, 0.0]
                for k in range(4):
                    w = WGT[i][k]
                    if w == 0:
                        continue
                    M = JM[JNT[i][k]]
                    acc[0] += w * (M[0][0] * x + M[0][1] * y + M[0][2] * z + M[0][3])
                    acc[1] += w * (M[1][0] * x + M[1][1] * y + M[1][2] * z + M[1][3])
                    acc[2] += w * (M[2][0] * x + M[2][1] * y + M[2][2] * z + M[2][3])
                mx = max(mx, math.dist(acc, POS[i]))
                for a in range(3):
                    lo[a] = min(lo[a], acc[a])
                    hi[a] = max(hi[a], acc[a])
            print(f"  mesh[{mi}].prim[{pi}]: verts={len(POS)} maxdisp={mx:.4f} "
                  f"bounds={[round(x, 3) for x in lo]}..{[round(x, 3) for x in hi]}")


if __name__ == "__main__":
    main()
