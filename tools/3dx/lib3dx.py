"""Shared helpers for the 3DXChat native asset pipeline (``tools/3dx``).

Conventions come from the pilot and are frozen in
``docs/roadmap/migracao-3dxchat-exportado.md`` (section 2). Do not "improve" the math here
without re-reading that section: the mesh lives in Z-up space, the rig lives in
Y-up space, and ``P`` is the only allowed bridge.

Requires Python 3.11 + UnityPy 1.25.4 (see ``requirements.txt``).
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

# Y-up -> Z-up bridge (mesh is Z-up, rig is Y-up). See plan section 2, rule 1.
P = [[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]
P_inv = [[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]]
I4 = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


# --- vectors / quaternions -------------------------------------------------

def v3(v: Any) -> list[float]:
    return [round(float(v.x), 6), round(float(v.y), 6), round(float(v.z), 6)]


def qv(q: Any) -> list[float]:
    return [round(float(q.x), 6), round(float(q.y), 6), round(float(q.z), 6), round(float(q.w), 6)]


def mat_from_q(q: Any) -> list[list[float]]:
    x, y, z, w = q
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]


def quat_from_mat(m: list[list[float]]) -> list[float]:
    tr = m[0][0] + m[1][1] + m[2][2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        w = 0.25 * s
        x = (m[2][1] - m[1][2]) / s
        y = (m[0][2] - m[2][0]) / s
        z = (m[1][0] - m[0][1]) / s
    elif m[0][0] > m[1][1] and m[0][0] > m[2][2]:
        s = math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2
        w = (m[2][1] - m[1][2]) / s
        x = 0.25 * s
        y = (m[0][1] + m[1][0]) / s
        z = (m[0][2] + m[2][0]) / s
    elif m[1][1] > m[2][2]:
        s = math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2
        w = (m[0][2] - m[2][0]) / s
        x = (m[0][1] + m[1][0]) / s
        y = 0.25 * s
        z = (m[1][2] + m[2][1]) / s
    else:
        s = math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2
        w = (m[1][0] - m[0][1]) / s
        x = (m[0][2] + m[2][0]) / s
        y = (m[1][2] + m[2][1]) / s
        z = 0.25 * s
    return [x, y, z, w]


def qmul(a: list[float], b: list[float]) -> list[float]:
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


def qconj(a: list[float]) -> list[float]:
    return [-a[0], -a[1], -a[2], a[3]]


# --- 3x3 / 4x4 matrices ----------------------------------------------------

def matmul(A: list[list[float]], B: list[list[float]]) -> list[list[float]]:
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def matvec(A: list[list[float]], v: list[float]) -> list[float]:
    return [sum(A[i][k] * v[k] for k in range(3)) for i in range(3)]


def m4(R: list[list[float]], t: list[float]) -> list[list[float]]:
    return [
        [R[0][0], R[0][1], R[0][2], t[0]],
        [R[1][0], R[1][1], R[1][2], t[1]],
        [R[2][0], R[2][1], R[2][2], t[2]],
        [0, 0, 0, 1],
    ]


def mm4(A: list[list[float]], B: list[list[float]]) -> list[list[float]]:
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def inv4(M: list[list[float]]) -> list[list[float]]:
    """Inverse of a rigid (R|t) 4x4 matrix: R^T | -R^T t."""
    Rt = [[M[j][i] for j in range(3)] for i in range(3)]
    t = [M[0][3], M[1][3], M[2][3]]
    it = [-sum(Rt[i][k] * t[k] for k in range(3)) for i in range(3)]
    return [
        [Rt[0][0], Rt[0][1], Rt[0][2], it[0]],
        [Rt[1][0], Rt[1][1], Rt[1][2], it[1]],
        [Rt[2][0], Rt[2][1], Rt[2][2], it[2]],
        [0, 0, 0, 1],
    ]


def qm4(q: list[float]) -> list[list[float]]:
    R = mat_from_q(q)
    return [
        [R[0][0], R[0][1], R[0][2], 0],
        [R[1][0], R[1][1], R[1][2], 0],
        [R[2][0], R[2][1], R[2][2], 0],
        [0, 0, 0, 1],
    ]


# --- Unity scene graph -----------------------------------------------------

def load_env(path: str | Path):
    if Path(path).suffix.lower() == ".prefab":
        from project_env import ProjectEnv

        return ProjectEnv.from_prefab(path)
    return UnityPy.load(str(path))


def find_mesh(env, name: str, path_id: int | None = None):
    """Mesh object (path_id, data) by name, optionally pinned by object id."""
    found = []
    for o in env.objects:
        if o.type.name != "Mesh":
            continue
        d = o.read()
        if d.m_Name == name and (path_id is None or o.path_id == path_id):
            found.append((o.path_id, d))
    if not found:
        raise SystemExit(f"mesh {name!r} not found (path_id={path_id})")
    if len(found) > 1 and path_id is None:
        print(f"  ! {len(found)} meshes named {name!r}; using path_id={found[0][0]} (pin with --path-id)")
    return found[0]


def build_transforms(env):
    """``{path_id: transform_data}`` for every Transform, keyed by object id."""
    tmap = {}
    for o in env.objects:
        if o.type.name == "Transform":
            tmap[o.path_id] = o.read()
    info = {}
    for pid, t in tmap.items():
        go = t.m_GameObject.read()
        p = t.m_Father
        par = p.path_id if (p is not None and p.path_id != 0 and p.path_id in tmap) else None
        info[pid] = {
            "name": go.m_Name,
            "parent": par,
            "pos": v3(t.m_LocalPosition),
            "rot": qv(t.m_LocalRotation),
            "scale": v3(t.m_LocalScale),
        }
    return tmap, info


def name_path(info: dict, pid: int) -> str:
    parts, cur, seen = [], pid, 0
    while cur is not None and cur in info and seen < 200:
        parts.append(info[cur]["name"])
        cur = info[cur]["parent"]
        seen += 1
    return "/".join(reversed(parts))


def norm_path(p: str) -> str:
    """Wear names use underscores, clips use spaces; strip the POSE_PIVOT prefix."""
    parts = p.replace(" ", "_").split("/")
    idx = None
    for i, seg in enumerate(parts):
        if seg.endswith("_bone_POSE_PIVOT"):
            idx = i
    if idx is not None:
        parts = parts[idx + 1:]
    if parts and parts[0] in ("man_1", "woman_1"):
        parts[0] = parts[0][:-2]
    return "/".join(parts)


def bone_key(p: str) -> str:
    """Match key for a bone: its own name, spaces normalized.

    Robust to each bundle's wrapper root (``man_1/``, ``item/item_1/``...) which
    is why matching by the full path failed on some female wear bundles.
    """
    return p.replace(" ", "_").split("/")[-1]


def rest_world(info: dict, pid: int, memo: dict) -> tuple[list[list[float]], list[float]]:
    """World (R, t) of a transform in the Unity rig (Y-up), walking the real parents."""
    if pid in memo:
        return memo[pid]
    i = info[pid]
    R = mat_from_q(i["rot"])
    t = list(i["pos"])
    par = i["parent"]
    if par is not None and par in info:
        PR, pt = rest_world(info, par, memo)
        R = matmul(PR, R)
        t = [pt[k] + sum(PR[k][j] * i["pos"][j] for j in range(3)) for k in range(3)]
    memo[pid] = (R, t)
    return memo[pid]


# --- mesh / skeleton extraction -------------------------------------------

def extract_mesh(mesh) -> dict:
    if hasattr(mesh, "_data"):  # project_env.Node
        from project_env import extract_mesh_project

        return extract_mesh_project(mesh)
    mh = MeshHandler(mesh)
    mh.process()
    indices: list[int] = []
    for sub in mh.get_triangles():
        for tri in sub:
            indices.extend(tri)
    skin_idx, skin_w = [], []
    for bi, bw in zip(mh.m_BoneIndices, mh.m_BoneWeights):
        skin_idx.extend(int(x) for x in bi)
        skin_w.extend(round(float(x), 5) for x in bw)
    bindposes = [
        [round(float(getattr(bp, f"e{r}{c}")), 6) for r in range(4) for c in range(4)]
        for bp in mesh.m_BindPose
    ]
    return {
        "name": mesh.m_Name,
        "verts": [[round(float(v), 5) for v in p] for p in mh.m_Vertices],
        "normals": [[round(float(v), 5) for v in p] for p in mh.m_Normals],
        "uvs": [[round(float(v), 5) for v in p] for p in mh.m_UV0],
        "indices": indices,
        "boneIdx": skin_idx,
        "weights": skin_w,
        "bindposes": bindposes,
    }


def skeleton_from_smr(env, info: dict, smr) -> list[dict]:
    """Bones in the SkinnedMeshRenderer order (bone index == mesh skin index)."""
    bone_pids = [b.path_id for b in smr.m_Bones]
    memo: dict = {}
    bones = []
    for pid in bone_pids:
        i = info[pid]
        par = i["parent"]
        par_i = bone_pids.index(par) if par in bone_pids else -1
        R, t = rest_world(info, pid, memo)
        bones.append({
            "pid": pid,
            "parent": par_i,
            "path": name_path(info, pid),
            "pos": [round(c, 6) for c in t],
            "rest": [round(c, 6) for c in quat_from_mat(R)],
        })
    return bones


def widest_skeleton_smr(env):
    smrs = [o.read() for o in env.objects if o.type.name == "SkinnedMeshRenderer"]
    if not smrs:
        raise SystemExit("no SkinnedMeshRenderer in the skeleton source (pass a wear/animation bundle)")
    return max(smrs, key=lambda s: len(s.m_Bones))


def remap_bindposes(bindposes: list[list[float]], bones: list[dict]) -> tuple[dict[int, int], float]:
    """Map a mesh-local skin index to the global skeleton bone index.

    The character meshes carry their own bindposes but no renderer, so we match
    ``P_inv @ inverse(bindpose)`` against the skeleton rest world (see the plan).
    Selection uses position + rotation; the returned value is the worst
    *translation* miss, which is exact and is what proves the mapping.
    """
    worlds = []
    for b in bones:
        M = m4(mat_from_q(b["rest"]), b["pos"])
        worlds.append((M[0][3], M[1][3], M[2][3], M))
    mapping: dict[int, int] = {}
    worst_t = 0.0
    for k, bp in enumerate(bindposes):
        M = [[bp[r * 4 + c] for c in range(4)] for r in range(4)]
        YW = mm4(P_inv, inv4(M))
        tt = (YW[0][3], YW[1][3], YW[2][3])
        dists = []
        for j, (wx, wy, wz, WM) in enumerate(worlds):
            dt = (tt[0] - wx) ** 2 + (tt[1] - wy) ** 2 + (tt[2] - wz) ** 2
            dr = sum((YW[a][c] - WM[a][c]) ** 2 for a in range(3) for c in range(3))
            dists.append((dt, dr, j))
        min_dt = min(d[0] for d in dists)
        # position is exact and (almost always) unique; rotation only breaks ties
        candidates = [d for d in dists if d[0] <= min_dt + 1e-9]
        best = min(candidates, key=lambda d: d[1])
        mapping[k] = best[2]
        worst_t = max(worst_t, min_dt)
    return mapping, worst_t


def remap_mesh_bones(mesh: dict, mapping: dict[int, int]) -> None:
    """Rewrite ``mesh['boneIdx']`` in place from local to global bone indices."""
    mesh["boneIdx"] = [mapping[i] for i in mesh["boneIdx"]]
