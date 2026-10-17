"""Extract a 3DXChat character mesh + skeleton (+ optional animation) to JSON.

Examples
--------
Body + head from the installed client's serial file, with a wear bundle as the
skeleton source (the ``character`` file has meshes only, no renderer)::

    py -3.11 tools/3dx/extract_character.py \
        --source "C:/.../3DXChat_Data/character" \
        --skeleton "C:/.../AssetBundles/wear/male/HZmalelatexsuit" \
        --mesh man_body man_head --gender male \
        --out tools/3dx/build/character_male.json

A wear bundle on its own (mesh and skeleton in the same file)::

    py -3.11 tools/3dx/extract_character.py --source <bundle> --mesh man_body --gender male --out <json>

Add a test animation (embeds per-frame world transforms of the skeleton)::

    ... --anim "C:/.../AssetBundles/animation/m/djpult/man@dj"

See ``docs/roadmap/migracao-3dxchat.md`` (sections 2, 3, 4).
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import lib3dx as L


def accumulate(info: dict, overrides: dict[int, list[float]] | None = None):
    """World rotation (R) per transform; position accumulated too.

    ``overrides`` replaces the *local* rotation of a transform (by path_id).
    """
    Wr: dict[int, list[list[float]]] = {}
    Wp: dict[int, list[float]] = {}

    def rec(pid):
        if pid in Wr:
            return
        i = info[pid]
        par = i["parent"]
        if par is not None and par in info:
            rec(par)
        R = L.mat_from_q(i["rot"])
        if overrides is not None and pid in overrides:
            R = L.mat_from_q(overrides[pid])
        t = i["pos"]
        if par is None or par not in info:
            Wr[pid], Wp[pid] = R, list(t)
        else:
            Wr[pid] = L.matmul(Wr[par], R)
            off = L.matvec(Wr[par], t)
            Wp[pid] = [Wp[par][k] + off[k] for k in range(3)]

    for pid in info:
        rec(pid)
    return Wr, Wp


def animation_frames(anim_path: str, bones: list[dict]) -> tuple[int, list]:
    """Per-frame world transforms of the skeleton for one native clip."""
    aenv = L.load_env(anim_path)
    _, ainfo = L.build_transforms(aenv)
    clip = next((o.read() for o in aenv.objects if o.type.name == "AnimationClip"), None)
    if clip is None:
        raise SystemExit(f"no AnimationClip in {anim_path}")

    rotcurves = {c.path: c for c in clip.m_RotationCurves}
    dur = 0.0
    for c in clip.m_RotationCurves:
        for k in c.curve.m_Curve:
            dur = max(dur, k.time)
    fps = clip.m_SampleRate or 30
    nf = int(round(dur * fps)) + 1

    clip_by_norm: dict[str, list] = {}
    for p, c in rotcurves.items():
        keys = c.curve.m_Curve
        seq = []
        for i in range(nf):
            t = i / fps
            val = keys[-1].value
            for k in keys:
                if k.time >= t:
                    val = k.value
                    break
            seq.append([round(val.x, 6), round(val.y, 6), round(val.z, 6), round(val.w, 6)])
        clip_by_norm[L.bone_key(p)] = seq

    anim_pids = list(ainfo.keys())
    anim_norm = {pid: L.bone_key(L.name_path(ainfo, pid)) for pid in anim_pids}
    a_rest_R, _ = accumulate(ainfo)

    # skeleton bone index -> animation transform id (matched by the bone's own name)
    bone_to_anim: dict[int, int] = {}
    for i, b in enumerate(bones):
        np = L.bone_key(b["path"])
        for apid in anim_pids:
            if anim_norm[apid] == np and np in clip_by_norm:
                bone_to_anim[i] = apid
                break

    n = len(bones)
    bRW = {i: L.m4(L.mat_from_q(bones[i]["rest"]), bones[i]["pos"]) for i in range(n)}
    bRWi = {i: L.inv4(bRW[i]) for i in range(n)}
    lrest: dict[int, list[list[float]]] = {}
    for i in range(n):
        par = bones[i]["parent"]
        lrest[i] = L.mm4(bRWi[par], bRW[i]) if par in bRWi else bRW[i]

    def depth(i):
        d, p = 0, bones[i]["parent"]
        while p >= 0:
            d += 1
            p = bones[p]["parent"]
        return d

    order = sorted(range(n), key=depth)

    world = []
    for f in range(nf):
        ov = {}
        for apid in bone_to_anim.values():
            np = anim_norm[apid]
            if np in clip_by_norm:
                ov[apid] = clip_by_norm[np][f]
        a_pose_R, _ = accumulate(ainfo, ov)
        delta_q = {}
        for i, apid in bone_to_anim.items():
            d = L.qmul(L.qconj(L.quat_from_mat(a_rest_R[apid])), L.quat_from_mat(a_pose_R[apid]))
            # a 180-degree flip is noise from the near-zero rest bone; drop it
            if 2 * math.degrees(math.acos(min(1.0, abs(d[3])))) > 175.0:
                d = [0.0, 0.0, 0.0, 1.0]
            delta_q[i] = d
        wm: dict[int, list[list[float]]] = {}
        for i in order:
            dl = L.qm4(delta_q[i]) if i in delta_q else L.I4
            par = bones[i]["parent"]
            if par >= 0 and par in wm:
                wm[i] = L.mm4(L.mm4(wm[par], lrest[i]), dl)
            else:
                wm[i] = L.mm4(lrest[i], dl)
        frame = []
        for i in range(n):
            M = wm[i]
            R = [[M[r][c] for c in range(3)] for r in range(3)]
            frame.append({
                "rot": [round(c, 6) for c in L.quat_from_mat(R)],
                "pos": [round(M[0][3], 6), round(M[1][3], 6), round(M[2][3], 6)],
            })
        world.append(frame)

    print(f"  animation {Path(anim_path).name}: {nf} frames @ {fps:g} fps, "
          f"{len(bone_to_anim)}/{n} bones matched")
    return nf, world


def pick_smr_for_mesh(env, mesh_path_id: int):
    smrs = [o for o in env.objects if o.type.name == "SkinnedMeshRenderer"]
    for o in smrs:
        s = o.read()
        try:
            if s.m_Mesh.path_id == mesh_path_id:
                return s
        except Exception:
            continue
    if smrs:
        return max((o.read() for o in smrs), key=lambda s: len(s.m_Bones))
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, help="bundle or serial file that contains the mesh")
    ap.add_argument("--mesh", required=True, nargs="+", help="mesh name(s), e.g. man_body man_head")
    ap.add_argument("--skeleton", help="bundle that provides the rig (defaults to --source)")
    ap.add_argument("--gender", choices=["male", "female"], default="male")
    ap.add_argument("--anim", help="animation bundle to embed")
    ap.add_argument("--path-id", type=int, help="pin a mesh by object id when names collide")
    ap.add_argument("--out", required=True, help="output JSON")
    args = ap.parse_args()

    source = Path(args.source)
    print(f"[extract] source={source.name} meshes={args.mesh} gender={args.gender}")
    src_env = L.load_env(source)

    # --- skeleton ---
    if args.skeleton and Path(args.skeleton).resolve() != source.resolve():
        skel_env = L.load_env(args.skeleton)
        _, skel_info = L.build_transforms(skel_env)
        bones = L.skeleton_from_smr(skel_env, skel_info, L.widest_skeleton_smr(skel_env))
        print(f"  skeleton {Path(args.skeleton).name}: {len(bones)} bones")
        remap = True
    else:
        _, skel_info = L.build_transforms(src_env)
        remap = False
        bones = []

    # --- meshes ---
    meshes = []
    for name in args.mesh:
        obj_pid, mesh = L.find_mesh(src_env, name, args.path_id)
        data = L.extract_mesh(mesh)
        if remap:
            mapping, worst = L.remap_bindposes(data["bindposes"], bones)
            L.remap_mesh_bones(data, mapping)
            status = "ok" if worst < 1e-3 else f"WARN worst_t={worst:.4g}"
            print(f"  {name}: {len(data['verts'])} verts, bone remap {len(mapping)} -> {status}")
        else:
            smr = pick_smr_for_mesh(src_env, obj_pid)
            if not bones and smr is not None:
                bones = L.skeleton_from_smr(src_env, skel_info, smr)
                print(f"  skeleton: {len(bones)} bones (from {name})")
            print(f"  {name}: {len(data['verts'])} verts (skeleton indices kept)")
        meshes.append(data)

    if not bones:
        raise SystemExit("no skeleton resolved: pass --skeleton or use a source with a SkinnedMeshRenderer")

    out = {
        "gender": args.gender,
        "source": str(source),
        "skeleton": str(args.skeleton) if args.skeleton else str(source),
        "bones": bones,
        "meshes": meshes,
    }

    if args.anim:
        nf, world = animation_frames(args.anim, bones)
        out["frames"] = nf
        out["world"] = world

    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out), encoding="utf-8")
    print(f"[extract] wrote {dest} ({dest.stat().st_size} bytes), bones={len(bones)}, meshes={len(meshes)}")


if __name__ == "__main__":
    main()
