"""Import the seated M/F pair poses from the 3DX animation bundles.

These are authored *pose bundles* (the skeleton is stored in the pose), so each side is
imported with ``extract_character.animation_frames(..., source_pose=True)``. The output
contract is the same as ``import_pose_bundle.py`` and is consumed by
``export_bodies.py --extra-anim <json> <action>``.

The manifest ``seated-pairs.json`` also records where each side sits relative to the
initiator (offset in metres and yaw in degrees). Those values are mirrored in
``PAIR_POSES`` so the server can place both avatars on the furniture.

Examples
--------
Import every seated pair::

    py -3.11 tools/3dx/import_seated_pairs.py

Import one pair::

    py -3.11 tools/3dx/import_seated_pairs.py --pair sofa1
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import extract_character as X

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "tools/3dx/seated-pairs.json"
DEFAULT_BUNDLES = Path(
    os.environ.get("THREEDX_BUNDLES", r"E:\dev\New folder\Mv444R\AssetBundles\animation")
)
BONES = {
    "male": ROOT / "tools/3dx/build/baseline/character_male.json",
    "female": ROOT / "tools/3dx/build/baseline/character_female.json",
}
REPORT = ROOT / "tools/3dx/build/project/seated.generated.json"


def resolve(path: str | Path, base: Path = ROOT) -> Path:
    value = Path(path)
    return value if value.is_absolute() else base / value


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    ap.add_argument(
        "--bundles",
        default=str(DEFAULT_BUNDLES),
        help="$THREEDX_BUNDLES or the animation root (default: E:/dev/New folder/Mv444R/AssetBundles/animation)",
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

    bundles = Path(args.bundles)
    report: dict = {
        "manifest": str(manifest_path),
        "source": {"kind": "bundle", "root": str(bundles)},
        "pairs": {},
    }
    if REPORT.is_file():
        previous = json.loads(REPORT.read_text(encoding="utf-8"))
        if previous.get("manifest") == str(manifest_path):
            report["pairs"] = previous.get("pairs", {})

    for pair_id in selected:
        pair = pairs[pair_id]
        action = pair.get("action")
        seat = pair.get("seat")
        sides = pair.get("sides", {})
        placement = pair.get("placement", {})
        if not action:
            raise SystemExit(f"{pair_id}: missing action")
        if seat not in ("sofa", "chair", "bed"):
            raise SystemExit(f"{pair_id}: seat must be 'sofa', 'chair' or 'bed' (got {seat!r})")
        if set(sides) != {"male", "female"}:
            raise SystemExit(f"{pair_id}: sides must contain male and female")
        print(f"\n=== {pair_id} ({seat}) -> {action} ===")

        report_pair = {
            "action": action,
            "seat": seat,
            "label": pair.get("label", pair_id),
            "placement": placement,
            "sides": {},
        }
        for side, entry in sides.items():
            bundle = resolve(entry["bundle"], bundles)
            out_path = resolve(entry["out"])
            bones_path = BONES[side]
            if not bundle.is_file():
                raise SystemExit(f"{pair_id}/{side}: bundle not found: {bundle}")
            if not bones_path.is_file():
                raise SystemExit(f"{pair_id}/{side}: body JSON not found: {bones_path}")

            body = json.loads(bones_path.read_text(encoding="utf-8"))
            bones = body["bones"]
            print(f"[{pair_id}/{side}] {bundle.name} -> {out_path.name}")
            frames, world, fps, clip_name = X.animation_frames(
                str(bundle),
                bones,
                None,
                None,
                source_pose=True,
                keep_bundle_space=True,
            )
            out = {
                "gender": side,
                "source": {
                    "kind": "bundle",
                    "manifest": str(manifest_path),
                    "pair": pair_id,
                    "action": action,
                    "side": side,
                    "bundle": str(bundle),
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
                f"[{pair_id}/{side}] wrote {out_path.relative_to(ROOT)} "
                f"({out_path.stat().st_size} bytes), frames={frames}, fps={fps:g}"
            )
            report_pair["sides"][side] = {
                "bundle": str(bundle),
                "clip": clip_name,
                "out": str(out_path),
                "frames": frames,
                "fps": fps,
            }
        report["pairs"][pair_id] = report_pair

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    report["pairs"] = {
        pair_id: report["pairs"][pair_id]
        for pair_id in pairs
        if pair_id in report["pairs"]
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\n[seated] report: {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
