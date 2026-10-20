"""Build small, per-pair test GLBs and the manifest consumed by ``viewer-pair-test.html``.

Unlike ``export_bodies.py`` (which rebuilds the published body with every action), this writes one
GLB per participant with one action, so a new pair can be tried without touching the production
characters. The catalog records the action of each side (``leftAction``/``rightAction``); M/F usually
shares the same name, while F/F needs one action per female half (``pair05_a``/``pair05_b``).

Outputs (default)::

    apps/web/public/assets/3dx/test/<pair>_male.glb
    apps/web/public/assets/3dx/test/<pair>_female.glb
    apps/web/public/assets/3dx/test/<pair>_a.glb       (F/F)
    apps/web/public/assets/3dx/test/<pair>_b.glb       (F/F)
    apps/web/public/assets/3dx/test/pairs.test.json

Adding the next pair is: append it to ``pairs.json``, run ``import_pairs.py``, then run this script.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import export_bodies as E

ROOT = E.ROOT
DEFAULT_MANIFEST = E.DEFAULT_MANIFEST
DEFAULT_OUTDIR = ROOT / "apps/web/public/assets/3dx/test"


def build_one(
    body: Path,
    action_json: Path,
    action: str,
    dest: Path,
    dry_run: bool,
) -> None:
    tmp = dest.with_name(dest.stem + ".tmp.glb")
    cmd = [
        sys.executable,
        str(ROOT / "tools/3dx/run_blender.py"),
        "export_glb.py",
        "--",
        "--json",
        str(body.resolve()),
        "--out",
        str(tmp.resolve()),
        "--extra-anim",
        str(action_json.resolve()),
        action,
    ]
    print(f"[test] {dest.name}: {action_json.name} -> {action}")
    print(" ".join(f'"{part}"' if " " in part else part for part in cmd))
    if dry_run:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        raise SystemExit(f"Blender export failed for {dest.name} (exit {result.returncode})")
    if not tmp.is_file():
        raise SystemExit(f"Blender did not write {tmp}")
    os.replace(tmp, dest)
    print(f"[test] wrote {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    ap.add_argument("--outdir", default=str(DEFAULT_OUTDIR))
    ap.add_argument("--pair", action="append", help="pair id to build (repeatable; default: all)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    manifest_path = Path(args.manifest)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    pairs = manifest.get("pairs", {})
    selected = args.pair or list(pairs)
    missing = [pair_id for pair_id in selected if pair_id not in pairs]
    if missing:
        raise SystemExit(f"unknown pair(s): {', '.join(missing)}")

    outdir = Path(args.outdir)
    outdir = outdir if outdir.is_absolute() else ROOT / outdir
    catalog_path = outdir / "pairs.test.json"
    catalog: dict = {"version": 2, "pairs": {}}
    if catalog_path.is_file():
        old = json.loads(catalog_path.read_text(encoding="utf-8"))
        catalog["pairs"] = old.get("pairs", {})

    for pair_id in selected:
        pair = pairs[pair_id]
        composition = pair.get("composition", "mf")
        action = pair.get("action")
        if not action:
            raise SystemExit(f"{pair_id}: missing action")
        participants = pair.get("participants", [])
        if composition == "mf":
            if len(participants) != 2:
                raise SystemExit(f"{pair_id}: M/F pair needs two participants")
            files = {}
            side_actions = {}
            frame_counts = []
            fps_seen = []
            for index, participant in enumerate(participants):
                role = participant.get("role") or participant.get("gender")
                if role not in {"male", "female"}:
                    role = "male" if participant.get("gender") == "male" else "female"
                side_action = participant.get("action", action)
                body = E.resolve(participant["body"])
                action_json = E.resolve(participant["out"])
                body_data = E.load_clip(body)
                clip_data = E.load_clip(action_json)
                E.check_actions(participant["gender"], body_data, [(action_json, side_action)])
                frame_counts.append(clip_data["frames"])
                fps_seen.append(clip_data["fps"])
                dest = outdir / f"{pair_id}_{role}.glb"
                build_one(body, action_json, side_action, dest, args.dry_run)
                files[role] = dest
                side_actions[role] = side_action
            left, right = files["male"], files["female"]
            left_action, right_action = side_actions["male"], side_actions["female"]
        elif composition == "ff":
            if len(participants) != 2:
                raise SystemExit(f"{pair_id}: F/F pair needs two participants")
            files = []
            side_actions = []
            frame_counts = []
            fps_seen = []
            for participant in participants:
                role = participant.get("role") or "a"
                side_action = participant.get("action", action)
                body = E.resolve(participant["body"])
                action_json = E.resolve(participant["out"])
                body_data = E.load_clip(body)
                clip_data = E.load_clip(action_json)
                E.check_actions(participant["gender"], body_data, [(action_json, side_action)])
                frame_counts.append(clip_data["frames"])
                fps_seen.append(clip_data["fps"])
                dest = outdir / f"{pair_id}_{role}.glb"
                build_one(body, action_json, side_action, dest, args.dry_run)
                files.append(dest)
                side_actions.append(side_action)
            left, right = files
            left_action, right_action = side_actions
        else:
            raise SystemExit(f"{pair_id}: unsupported composition {composition!r}")

        catalog["pairs"][pair_id] = {
            "id": pair_id,
            "label": pair.get("label", pair_id),
            "composition": composition,
            "action": action,
            "leftAction": left_action,
            "rightAction": right_action,
            "gap": pair.get("gap", 0.25),
            "yaw": pair.get("yaw", 180),
            "left": f"/assets/3dx/test/{left.name}",
            "right": f"/assets/3dx/test/{right.name}",
            "frames": max(frame_counts, default=0),
            "fps": max(fps_seen, default=30),
        }

    ordered = {
        pair_id: catalog["pairs"][pair_id]
        for pair_id in pairs
        if pair_id in catalog["pairs"]
    }
    catalog["pairs"] = ordered
    if not args.dry_run:
        outdir.mkdir(parents=True, exist_ok=True)
        catalog_path.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
        print(f"[test] catalog: {catalog_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
