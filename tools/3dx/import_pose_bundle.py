"""Import one authored pose from a 3DX animation bundle as a GLB action JSON.

Sit clips (``sofa_sit``, ``chair_sit_1``, ``barstool_sit_1``...) live in
``AssetBundles/animation/{f,m}/...``. Unlike the base ``resources.assets`` clips,
their bundle skeleton is already stored in the authored pose and the curve data
only adds subtle motion, so the importer runs ``animation_frames(..., source_pose=True)``:
it copies the source's absolute world rotations (aligned to the target rest root)
and takes the seated root height from the bundle.

The output has the same contract as ``extract_character.py --anim`` and is consumed by
``export_glb.py --extra-anim <json> <action>``:

    py -3.11 tools/3dx/import_pose_bundle.py --gender female \\
        --bones-json tools/3dx/build/baseline/character_female.json \\
        --bundle "E:/dev/New folder/Mv444R/AssetBundles/animation/f/sofa/woman@sofa_sit" \\
        --out tools/3dx/build/project/sit_sofa_female.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import extract_character as X


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gender", choices=["male", "female"], required=True)
    ap.add_argument("--bones-json", required=True, help="body JSON whose bone order the output must keep")
    ap.add_argument("--bundle", required=True, help="animation bundle that contains the clip")
    ap.add_argument("--clip", help="clip name inside the bundle (default: the bundle's first clip)")
    ap.add_argument(
        "--anim-root",
        help="optional character root inside the bundle (default: use the bundle hierarchy as-is)",
    )
    ap.add_argument("--out", required=True)
    ap.add_argument(
        "--animated",
        action="store_true",
        help="clipe animado (dança): usa as curvas de movimento em vez do modo pose",
    )
    args = ap.parse_args()

    bundle = Path(args.bundle)
    body = json.loads(Path(args.bones_json).read_text(encoding="utf-8"))
    bones = body["bones"]

    print(f"[pose] bundle={bundle.name} clip={args.clip or '<first>'} gender={args.gender}")
    frames, world, fps, clip_name = X.animation_frames(
        str(bundle),
        bones,
        args.clip,
        args.anim_root,
        source_pose=not args.animated,
    )

    out = {
        "gender": args.gender,
        "source": {"kind": "bundle", "bundle": str(bundle)},
        "skeleton": body.get("skeleton", body.get("source")),
        "bones": bones,
        "frames": frames,
        "fps": fps,
        "animName": clip_name,
        "world": world,
    }
    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out), encoding="utf-8")
    print(f"[pose] wrote {dest} ({dest.stat().st_size} bytes), frames={frames}, fps={fps:g}")


if __name__ == "__main__":
    main()
