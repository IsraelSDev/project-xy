"""Import one native animation clip from the exported Unity project as a GLB action JSON.

The output has the same contract as ``extract_character.py --anim``: ``bones`` (copied from the body
JSON, so the joint order matches the body GLB), ``frames``, ``fps``, ``animName`` and ``world``.
``export_glb.py --extra-anim <json> <action>`` consumes it unchanged.

Examples
--------
Male half of the native ``slowdance`` pair, on the male body skeleton::

    py -3.11 tools/3dx/import_anim_project.py --gender male \\
        --bones-json tools/3dx/build/baseline/character_male.json \\
        --anim "C:/dev/exported/ExportedProject/Assets/AnimationClip/slowdance_man.anim" \\
        --out tools/3dx/build/project/slowdance_man_male.json

``--prefab`` defaults to the project character prefab of the gender (``Resources/man/man.prefab``
or ``Resources/woman/woman.prefab``) and provides the transform hierarchy the clip is applied to.
``--anim-root`` defaults to ``man``/``woman`` (the ``*_bone_POSE_PIVOT`` subtree of that prefab).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import extract_character as X
from project_env import ProjectEnv

PROJECT = Path(r"C:\dev\exported\ExportedProject")
PREFABS = {"male": PROJECT / "Assets/Resources/man/man.prefab", "female": PROJECT / "Assets/Resources/woman/woman.prefab"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gender", choices=["male", "female"], required=True)
    ap.add_argument("--bones-json", required=True, help="body JSON whose bone order the output must keep")
    ap.add_argument("--anim", required=True, help=".anim file of the project")
    ap.add_argument("--prefab", help="character prefab with the transform hierarchy (default: by gender)")
    ap.add_argument("--anim-root", help="prefab root whose POSE_PIVOT is the skeleton (default: man/woman)")
    ap.add_argument("--anim-clip", help="clip name inside --anim (default: the file's clip)")
    ap.add_argument(
        "--from-prefab",
        action="store_true",
        help="use the clip the prefab Animation component references (keeps the published variant)",
    )
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    prefab = Path(args.prefab) if args.prefab else PREFABS[args.gender]
    anim_root = args.anim_root or ("man" if args.gender == "male" else "woman")
    body = json.loads(Path(args.bones_json).read_text(encoding="utf-8"))
    bones = body["bones"]

    print(f"[import] prefab={prefab.name} anim={Path(args.anim).name} root={anim_root}")
    env = ProjectEnv.from_prefab(prefab, [args.anim])
    # The prefab's Animation component points at its default clip (e.g. ``walk``): select the
    # clip of the imported file by name, not the component's default.
    selector = args.anim_clip or Path(args.anim).stem
    frames, world, fps, clip_name = X.animation_frames(
        args.anim,
        bones,
        selector,
        anim_root,
        aenv=env,
        anim_file=None if args.from_prefab else args.anim,
    )

    out = {
        "gender": args.gender,
        "source": {"kind": "project", "prefab": str(prefab), "anim": args.anim},
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
    print(f"[import] wrote {dest} ({dest.stat().st_size} bytes), frames={frames}, fps={fps:g}")


if __name__ == "__main__":
    main()
