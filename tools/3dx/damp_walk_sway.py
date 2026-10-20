"""Damp the lateral sway of a native 3DX walk clip.

The male ``walk`` clip rotates the upper-spine control chain sideways much more
than the female one: the head travels ~14.6 cm side to side, versus ~3.4 cm in
the female clip. This script keeps the forward bend and leg motion but scales
the lateral (local Y/Z) component of the selected control bones by ``--factor``.

Instead of editing the GLB, it rewrites the animation JSON's world transforms
and recomputes positions for the affected subtree; ``export_glb.py`` then bakes
the corrected clip as usual.

Example::

    py -3.11 tools/3dx/damp_walk_sway.py \
        --json tools/3dx/build/character_male_walk.json \
        --out tools/3dx/build/character_male_walk_sway.json \
        --bones man_Spine1 man_Spine2 man_Neck man_Head --factor 0.25
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import lib3dx as L


def qnorm(q: list[float]) -> list[float]:
    length = math.sqrt(sum(c * c for c in q))
    return [c / length for c in q] if length > 1e-12 else [0.0, 0.0, 0.0, 1.0]


def rotation_vector(q: list[float]) -> list[float]:
    q = qnorm(q)
    if q[3] < 0:
        q = [-c for c in q]
    w = max(-1.0, min(1.0, q[3]))
    angle = 2 * math.acos(w)
    sin_half = math.sqrt(max(0.0, 1 - w * w))
    if sin_half < 1e-9:
        return [0.0, 0.0, 0.0]
    return [q[0] / sin_half * angle, q[1] / sin_half * angle, q[2] / sin_half * angle]


def from_rotation_vector(r: list[float]) -> list[float]:
    angle = math.sqrt(sum(c * c for c in r))
    if angle < 1e-9:
        return [0.0, 0.0, 0.0, 1.0]
    s = math.sin(angle / 2) / angle
    return [r[0] * s, r[1] * s, r[2] * s, math.cos(angle / 2)]


def depth(bones: list[dict], index: int) -> int:
    d, parent = 0, bones[index]["parent"]
    while parent >= 0:
        d += 1
        parent = bones[parent]["parent"]
    return d


def descendants(bones: list[dict], roots: set[int]) -> set[int]:
    children: dict[int, list[int]] = {}
    for index, bone in enumerate(bones):
        children.setdefault(bone["parent"], []).append(index)
    out: set[int] = set()
    stack = list(roots)
    while stack:
        index = stack.pop()
        if index in out:
            continue
        out.add(index)
        stack.extend(children.get(index, []))
    return out


def head_sway(world: list, head: int) -> float:
    xs = [frame[head]["pos"][0] for frame in world]
    return max(xs) - min(xs)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", required=True, help="walk JSON from extract_character.py")
    ap.add_argument("--out", required=True)
    ap.add_argument(
        "--bones",
        nargs="+",
        default=["man_Spine1", "man_Spine2", "man_Neck", "man_Head"],
        help="control bones whose local Y/Z rotation is damped",
    )
    ap.add_argument("--factor", type=float, default=0.25, help="0 = no lateral rotation, 1 = original")
    ap.add_argument("--head", default="man_bone_Head", help="bone used to report the sway")
    args = ap.parse_args()

    data = json.loads(Path(args.json).read_text(encoding="utf-8"))
    bones = data["bones"]
    world = data["world"]
    n = len(bones)
    selected = {
        index
        for index, bone in enumerate(bones)
        if bone["path"].split("/")[-1] in set(args.bones)
    }
    if not selected:
        raise SystemExit(f"none of the bones {args.bones} exist in {args.json}")
    affected = descendants(bones, selected)

    rest_world = {i: L.m4(L.mat_from_q(bone["rest"]), bone["pos"]) for i, bone in enumerate(bones)}
    rest_inv = {i: L.inv4(rest_world[i]) for i in range(n)}
    local = {
        i: (L.mm4(rest_inv[bones[i]["parent"]], rest_world[i]) if bones[i]["parent"] >= 0 else rest_world[i])
        for i in range(n)
    }
    local_q = {i: L.quat_from_mat(local[i]) for i in range(n)}
    local_t = {i: [local[i][0][3], local[i][1][3], local[i][2][3]] for i in range(n)}
    order = sorted(range(n), key=lambda i: depth(bones, i))

    frames = len(world)
    corrected = []
    for frame_index in range(frames):
        q_world: list[list[float] | None] = [None] * n
        t_world: list[list[float] | None] = [None] * n
        for i in order:
            parent = bones[i]["parent"]
            original = world[frame_index][i]
            local_q_pose = (
                L.qmul(L.qconj(world[frame_index][parent]["rot"]), original["rot"])
                if parent >= 0
                else original["rot"]
            )
            local_q_new = local_q_pose
            if i in selected:
                delta = qnorm(L.qmul(local_q_pose, L.qconj(local_q[i])))
                r = rotation_vector(delta)
                r[1] *= args.factor
                r[2] *= args.factor
                local_q_new = L.qmul(from_rotation_vector(r), local_q[i])
            q_world[i] = L.qmul(q_world[parent], local_q_new) if parent >= 0 else local_q_new
            if i in affected:
                if parent >= 0 and t_world[parent] is not None:
                    rotation = L.mat_from_q(q_world[parent])
                    t_world[i] = [
                        t_world[parent][k]
                        + sum(rotation[k][j] * local_t[i][j] for j in range(3))
                        for k in range(3)
                    ]
                else:
                    t_world[i] = list(original["pos"])
            else:
                t_world[i] = list(original["pos"])
        corrected.append(
            [
                {
                    "rot": [round(c, 6) for c in q_world[i]],
                    "pos": [round(c, 6) for c in t_world[i]],
                }
                for i in range(n)
            ]
        )

    head = next(
        (i for i, bone in enumerate(bones) if bone["path"].split("/")[-1] == args.head),
        None,
    )
    if head is not None:
        before = head_sway(world, head)
        after = head_sway(corrected, head)
        print(
            f"[sway] {args.json}: head {args.head} {before*100:.2f} cm -> {after*100:.2f} cm "
            f"(factor {args.factor:g}, bones {sorted(args.bones)})"
        )

    data["world"] = corrected
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data), encoding="utf-8")
    print(f"[sway] wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
