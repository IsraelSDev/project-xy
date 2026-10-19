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

A wear item authored on its own copy of the rig (A-pose/wrapper root) is
retargeted onto the base character skeleton **by bone name**, which bakes the
item into the base rest pose and rewrites its skin indices::

    py -3.11 tools/3dx/extract_character.py --source <wear-bundle> --mesh item \
        --skeleton <body-skeleton-bundle> --retarget --gender female --out <json>

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


def _key_variants(key: str):
    """Name candidates for a bone key (some wear rigs use a ``_1`` suffix)."""
    yield key
    if key.endswith("_1") or key.endswith("_2"):
        yield key[:-2]
    yield key + "_1"
    yield key + "_2"


def ref_index_for(key: str, ref_by: dict[str, int]) -> int | None:
    for candidate in _key_variants(key):
        if candidate in ref_by:
            return ref_by[candidate]
    return None


def retarget_mesh(data: dict, own_bones: list[dict], ref_worlds: list, ref_by: dict[str, int]):
    """Bake a wear mesh into the reference rest pose, matching bones by name.

    A wear bundle may be authored on its own copy of the rig with a rotated /
    translated wrapper root (and an A-pose bind). ``Sm * inverse(bindpose)`` is
    that copy's bone world; the mesh itself lives in the bind pose. Skinning it
    with the *reference* bone world and its own bindpose (``refWorld * bp * v``)
    puts it in the reference rest pose with the reference joint order, which is
    what the game's body uses. ``P`` then turns the Y-up result into Blender's
    Z-up space, exactly like the body mesh.
    """
    mapping: dict[int, int] = {}
    missing: list[str] = []
    for k, bone in enumerate(own_bones):
        found = ref_index_for(L.bone_key(bone["path"]), ref_by)
        if found is None:
            # Missing in the reference (e.g. an extra finger): inherit the
            # nearest mapped ancestor so the weights stay on the same limb.
            parent = bone["parent"]
            while parent >= 0:
                if parent in mapping:
                    found = mapping[parent]
                    break
                parent = own_bones[parent]["parent"]
        if found is None:
            missing.append(bone["path"])
            found = 0
        mapping[k] = found

    # One world*inverse-bind matrix per source bone, indexed by source bone.
    worlds = []
    for k, bp in enumerate(data["bindposes"]):
        M = [[bp[r * 4 + c] for c in range(4)] for r in range(4)]
        worlds.append(L.mm4(ref_worlds[mapping[k]], M))

    verts = []
    for vi, v in enumerate(data["verts"]):
        base = vi * 4
        acc = [0.0, 0.0, 0.0]
        total = 0.0
        for j in range(4):
            w = data["weights"][base + j]
            if w <= 0:
                continue
            local = data["boneIdx"][base + j]
            M = worlds[local] if local < len(worlds) else L.I4
            total += w
            for r in range(3):
                acc[r] += w * (
                    M[r][0] * v[0] + M[r][1] * v[1] + M[r][2] * v[2] + M[r][3]
                )
        if total > 0 and abs(total - 1.0) > 1e-6:
            acc = [c / total for c in acc]
        # Y-up reference world -> Blender Z-up (P), same convention as the body.
        verts.append([round(acc[0], 5), round(-acc[2], 5), round(acc[1], 5)])
    data["verts"] = verts
    if data.get("normals"):
        data["normals"] = [
            [round(n[0], 5), round(-n[2], 5), round(n[1], 5)] for n in data["normals"]
        ]
    data["boneIdx"] = [mapping[i] for i in data["boneIdx"]]
    return mapping, missing


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, help="bundle or serial file that contains the mesh")
    ap.add_argument("--mesh", required=True, nargs="+", help="mesh name(s), e.g. man_body man_head")
    ap.add_argument("--skeleton", help="bundle that provides the rig (defaults to --source)")
    ap.add_argument("--gender", choices=["male", "female"], default="male")
    ap.add_argument("--anim", help="animation bundle to embed")
    ap.add_argument("--retarget", action="store_true", help="bake a wear item onto --skeleton by bone name")
    ap.add_argument("--path-id", type=int, help="pin a mesh by object id when names collide")
    ap.add_argument("--out", required=True, help="output JSON")
    args = ap.parse_args()

    source = Path(args.source)
    print(f"[extract] source={source.name} meshes={args.mesh} gender={args.gender}")
    src_env = L.load_env(source)
    _, src_info = L.build_transforms(src_env)

    # --- skeleton ---
    if args.retarget:
        if not args.skeleton:
            raise SystemExit("--retarget needs --skeleton (the base character rig)")
        if Path(args.skeleton).resolve() != source.resolve():
            skel_env = L.load_env(args.skeleton)
            _, skel_info = L.build_transforms(skel_env)
        else:
            skel_env = src_env
            skel_info = src_info
        bones = L.skeleton_from_smr(skel_env, skel_info, L.widest_skeleton_smr(skel_env))
        ref_worlds = [L.m4(L.mat_from_q(b["rest"]), b["pos"]) for b in bones]
        ref_by: dict[str, int] = {}
        for i, b in enumerate(bones):
            ref_by.setdefault(L.bone_key(b["path"]), i)
        print(f"  skeleton {Path(args.skeleton).name}: {len(bones)} bones (retarget by name)")
        remap = False
    elif args.skeleton and Path(args.skeleton).resolve() != source.resolve():
        skel_env = L.load_env(args.skeleton)
        _, skel_info = L.build_transforms(skel_env)
        bones = L.skeleton_from_smr(skel_env, skel_info, L.widest_skeleton_smr(skel_env))
        print(f"  skeleton {Path(args.skeleton).name}: {len(bones)} bones")
        remap = True
    else:
        skel_info = src_info
        remap = False
        bones = []

    # --- meshes ---
    meshes = []
    for name in args.mesh:
        obj_pid, mesh = L.find_mesh(src_env, name, args.path_id)
        data = L.extract_mesh(mesh)
        if args.retarget:
            smr = pick_smr_for_mesh(src_env, obj_pid)
            if smr is None:
                raise SystemExit(f"no SkinnedMeshRenderer for mesh {name!r}")
            own_bones = L.skeleton_from_smr(src_env, src_info, smr)
            if len(own_bones) != len(data["bindposes"]):
                raise SystemExit(
                    f"mesh {name!r}: {len(data['bindposes'])} bindposes but "
                    f"{len(own_bones)} SMR bones"
                )
            mapping, missing = retarget_mesh(data, own_bones, ref_worlds, ref_by)
            print(
                f"  {name}: {len(data['verts'])} verts, retargeted {len(mapping)} bones"
                + (f" (unmatched: {missing})" if missing else "")
            )
        elif remap:
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
    if args.retarget:
        out["retargeted"] = True

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
