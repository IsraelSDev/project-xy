"""Import every participant of the pair definitions in ``tools/3dx/pairs.json``.

The animation source is always the exported Unity project in ``C:\\dev\\exported``. The manifest
names an ``.anim`` file inside ``Assets/AnimationClip`` and the rig it was authored for
(``man``/``woman``). Each participant is baked onto its own body JSON with
``extract_character.animation_frames``; the result is exactly what
``export_glb.py --extra-anim <json> <action>`` expects.

The ``rig`` field is what makes cross-composition pairs possible without retargeting by hand:
an F/F pair uses one female body with the clip authored for the male half and another female body
with the clip authored for the female half. ``animation_frames`` maps the bone names (man/woman
aliases) onto the target body.

Adding the next pair is: append an entry to ``pairs.json``, run this script, then run
``export_pair_tests.py`` (or ``export_bodies.py`` after approval).

Examples
--------
Import all pairs::

    py -3.11 tools/3dx/import_pairs.py

Import only the F/F pilot::

    py -3.11 tools/3dx/import_pairs.py --pair ff_kiss

The project root can be overridden with ``--project`` or ``$THREEDX_PROJECT``. It must point at the
folder that contains ``Assets/`` (the same layout as ``C:\\dev\\exported\\ExportedProject``).
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import extract_character as X
from project_env import ProjectEnv

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROJECT = Path(os.environ.get("THREEDX_PROJECT", r"C:\dev\exported\ExportedProject"))
DEFAULT_MANIFEST = ROOT / "tools/3dx/pairs.json"
REPORT = ROOT / "tools/3dx/build/project/pairs.generated.json"
PREFABS = {
    "man": Path("Assets/Resources/man/man.prefab"),
    "woman": Path("Assets/Resources/woman/woman.prefab"),
}


def resolve(path: str | Path, base: Path = ROOT) -> Path:
    p = Path(path)
    return p if p.is_absolute() else base / p


def project_anim(project: Path, value: str) -> Path:
    p = Path(value)
    if p.is_absolute():
        return p
    return project / "Assets/AnimationClip" / p


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    ap.add_argument(
        "--project",
        default=str(DEFAULT_PROJECT),
        help="exported Unity project root (default: $THREEDX_PROJECT or C:/dev/exported/ExportedProject)",
    )
    ap.add_argument("--pair", action="append", help="pair id to import (repeatable; default: all)")
    args = ap.parse_args()

    manifest_path = Path(args.manifest)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    pairs = manifest.get("pairs", {})
    if not pairs:
        raise SystemExit(f"no pairs in {manifest_path}")

    selected = args.pair or list(pairs)
    missing = [pair_id for pair_id in selected if pair_id not in pairs]
    if missing:
        raise SystemExit(f"unknown pair(s): {', '.join(missing)}")

    project = Path(args.project)
    if not (project / "Assets").is_dir():
        raise SystemExit(f"exported project not found (Assets/ missing): {project}")

    report: dict = {
        "manifest": str(manifest_path),
        "source": {
            "kind": "project",
            "project": str(project),
            "animationDir": str(project / "Assets/AnimationClip"),
        },
        "pairs": {},
    }
    if REPORT.is_file():
        previous = json.loads(REPORT.read_text(encoding="utf-8"))
        if previous.get("manifest") == str(manifest_path):
            report["pairs"] = previous.get("pairs", {})

    for pair_id in selected:
        pair = pairs[pair_id]
        composition = pair.get("composition", "mf")
        default_action = pair.get("action")
        if not default_action:
            raise SystemExit(f"{pair_id}: missing action")
        print(f"\n=== {pair_id} ({composition}) -> {default_action} ===")
        report_pair = {
            "composition": composition,
            "action": default_action,
            "label": pair.get("label", pair_id),
            "gap": pair.get("gap"),
            "yaw": pair.get("yaw"),
            "publish": pair.get("publish", True),
            "participants": [],
        }

        for participant in pair.get("participants", []):
            role = participant.get("role", participant.get("gender"))
            gender = participant.get("gender")
            rig = participant.get("rig")
            if rig not in PREFABS:
                raise SystemExit(f"{pair_id}/{role}: rig must be 'man' or 'woman' (got {rig!r})")
            body_path = resolve(participant["body"])
            anim_path = project_anim(project, participant["clip"])
            out_path = resolve(participant["out"])
            action = participant.get("action", default_action)
            prefab = resolve(participant.get("prefab", PREFABS[rig]), project)

            if not body_path.is_file():
                raise SystemExit(f"{pair_id}/{role}: body JSON not found: {body_path}")
            if not anim_path.is_file():
                raise SystemExit(f"{pair_id}/{role}: animation not found: {anim_path}")
            if not prefab.is_file():
                raise SystemExit(f"{pair_id}/{role}: prefab not found: {prefab}")

            body = json.loads(body_path.read_text(encoding="utf-8"))
            bones = body["bones"]
            selector = participant.get("clipName") or anim_path.stem
            print(f"[{pair_id}/{role}] {anim_path.name} ({rig} rig) -> {out_path.name} as {action}")

            env = ProjectEnv.from_prefab(prefab, [anim_path])
            frames, world, fps, clip_name = X.animation_frames(
                str(anim_path),
                bones,
                selector,
                rig,
                aenv=env,
                anim_file=str(anim_path),
            )

            out = {
                "gender": gender,
                "source": {
                    "kind": "project",
                    "manifest": str(manifest_path),
                    "pair": pair_id,
                    "action": action,
                    "role": role,
                    "rig": rig,
                    "prefab": str(prefab),
                    "anim": str(anim_path),
                    "clip": clip_name,
                },
                "skeleton": body.get("skeleton", body.get("source")),
                "bones": bones,
                "frames": frames,
                "fps": fps,
                "animName": clip_name,
                "world": world,
            }
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(out), encoding="utf-8")
            print(
                f"[{pair_id}/{role}] wrote {out_path.relative_to(ROOT)} "
                f"({out_path.stat().st_size} bytes), frames={frames}, fps={fps:g}"
            )
            report_pair["participants"].append(
                {
                    "role": role,
                    "gender": gender,
                    "rig": rig,
                    "action": action,
                    "body": str(body_path),
                    "prefab": str(prefab),
                    "anim": str(anim_path),
                    "clip": clip_name,
                    "frames": frames,
                    "fps": fps,
                    "out": str(out_path),
                }
            )

        report["pairs"][pair_id] = report_pair

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    report["pairs"] = {
        pair_id: report["pairs"][pair_id]
        for pair_id in pairs
        if pair_id in report["pairs"]
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\n[import] report: {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
