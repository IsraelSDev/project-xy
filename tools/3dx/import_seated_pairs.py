"""Import pair poses from the 3DX animation bundles.

These are authored *pose bundles* (the skeleton is stored in the pose), so each side is
imported with ``extract_character.animation_frames(..., source_pose=True)``. The output
contract is the same as ``import_pose_bundle.py`` and is consumed by
``export_bodies.py --extra-anim <json> <action>``.

Two manifests share this importer:

* ``seated-pairs.json`` — M/F furniture pairs (``sides: {male, female}``, one action shared
  by both bodies because each body carries its own half under the same name).
* ``same-gender-pairs.json`` — F/F and M/M pairs (attention/social in ``*/rel`` and furniture).
  Each side declares its ``gender`` and its own ``action`` (``ff_hug_a``/``ff_hug_b``), since
  both halves play on bodies of the same gender.

The manifest also records where each side sits relative to the initiator (offset in metres and
yaw in degrees). Those values are mirrored in ``PAIR_POSES`` so the server can place both
avatars on the furniture.

Examples
--------
Import every seated pair::

    py -3.11 tools/3dx/import_seated_pairs.py

Import one pair::

    py -3.11 tools/3dx/import_seated_pairs.py --pair sofa1

Import the same-gender pairs::

    py -3.11 tools/3dx/import_seated_pairs.py --manifest tools/3dx/same-gender-pairs.json
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import extract_character as X
from project_env import ProjectEnv

ROOT = Path(__file__).resolve().parents[2]
PREFABS = {
    "male": Path(r"E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab"),
    "female": Path(r"E:\dev\exported\ExportedProject\Assets\Resources\woman\woman.prefab"),
}
ANIM_ROOT = {"male": "man", "female": "woman"}
_prefab_cache: dict[str, ProjectEnv] = {}


def prefab_env(side: str) -> ProjectEnv:
    if side not in _prefab_cache:
        _prefab_cache[side] = ProjectEnv.from_prefab(PREFABS[side])
    return _prefab_cache[side]
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


def side_gender(role: str, entry: dict) -> str:
    """Gênero do corpo de um lado; manifesto antigo (``male``/``female``) não declara nada."""
    gender = entry.get("gender") or role
    if gender not in ("male", "female"):
        raise SystemExit(f"side {role!r}: gender must be 'male' or 'female' (got {gender!r})")
    return gender


def check_sides(pair_id: str, pairing: str, sides: dict[str, dict]) -> None:
    """O par tem exatamente duas metades e os gêneros combinam com a composição."""
    if pairing not in ("mf", "ff", "mm"):
        raise SystemExit(f"{pair_id}: pairing must be 'mf', 'ff' or 'mm' (got {pairing!r})")
    if len(sides) != 2:
        raise SystemExit(f"{pair_id}: a pair needs exactly two sides")
    genders = [side_gender(role, entry) for role, entry in sides.items()]
    if pairing == "mf" and sorted(genders) != ["female", "male"]:
        raise SystemExit(f"{pair_id}: M/F pair needs one male and one female side")
    if pairing == "ff" and genders != ["female", "female"]:
        raise SystemExit(f"{pair_id}: F/F pair needs two female sides")
    if pairing == "mm" and genders != ["male", "male"]:
        raise SystemExit(f"{pair_id}: M/M pair needs two male sides")


def report_path(manifest_path: Path) -> Path:
    """Report do manifesto: o de `seated-pairs.json` mantém o nome histórico."""
    if manifest_path.name == "seated-pairs.json":
        return REPORT
    return REPORT.with_name(f"{manifest_path.stem}.generated.json")


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
    report_file = report_path(manifest_path)
    if report_file.is_file():
        previous = json.loads(report_file.read_text(encoding="utf-8"))
        if previous.get("manifest") == str(manifest_path):
            report["pairs"] = previous.get("pairs", {})

    for pair_id in selected:
        pair = pairs[pair_id]
        action = pair.get("action")
        seat = pair.get("seat")
        pairing = pair.get("pairing", "mf")
        sides = pair.get("sides", {})
        placement = pair.get("placement", {})
        if not action:
            raise SystemExit(f"{pair_id}: missing action")
        if seat is not None and seat not in ("sofa", "chair", "bed", "wall"):
            raise SystemExit(
                f"{pair_id}: seat must be 'sofa', 'chair', 'bed' or 'wall' (got {seat!r})"
            )
        check_sides(pair_id, pairing, sides)
        print(f"\n=== {pair_id} ({seat or pairing}) -> {action} ===")

        report_pair = {
            "action": action,
            "seat": seat,
            "pairing": pairing,
            "label": pair.get("label", pair_id),
            "placement": placement,
            "sides": {},
        }
        for role, entry in sides.items():
            gender = side_gender(role, entry)
            side_action = entry.get("action", action)
            bundle = resolve(entry["bundle"], bundles)
            out_path = resolve(entry["out"])
            bones_path = BONES[gender]
            if not bundle.is_file():
                raise SystemExit(f"{pair_id}/{role}: bundle not found: {bundle}")
            if not bones_path.is_file():
                raise SystemExit(f"{pair_id}/{role}: body JSON not found: {bones_path}")

            body = json.loads(bones_path.read_text(encoding="utf-8"))
            bones = body["bones"]
            print(f"[{pair_id}/{role}] {bundle.name} -> {out_path.name}")
            if pair.get("mode") == "motion":
                # Clipe de inserção (bundles `ai_*`/`midnight_*`): só curvas, tocadas sobre o prefab
                # do personagem com as curvas de posição — como o jogo base.
                frames, world, fps, clip_name = X.animation_frames(
                    str(bundle),
                    bones,
                    None,
                    ANIM_ROOT[gender],
                    skeleton_env=prefab_env(gender),
                    position_curves=True,
                )
            else:
                frames, world, fps, clip_name = X.animation_frames(
                    str(bundle),
                    bones,
                    None,
                    None,
                    source_pose=True,
                    keep_bundle_space=True,
                )
            out = {
                "gender": gender,
                "source": {
                    "kind": "bundle",
                    "manifest": str(manifest_path),
                    "pair": pair_id,
                    "action": action,
                    "side": role,
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
                f"[{pair_id}/{role}] wrote {out_path.relative_to(ROOT)} "
                f"({out_path.stat().st_size} bytes), frames={frames}, fps={fps:g}"
            )
            report_pair["sides"][role] = {
                "gender": gender,
                "action": side_action,
                "bundle": str(bundle),
                "clip": clip_name,
                "out": str(out_path),
                "frames": frames,
                "fps": fps,
            }
        report["pairs"][pair_id] = report_pair

    report_file.parent.mkdir(parents=True, exist_ok=True)
    report["pairs"] = {
        pair_id: report["pairs"][pair_id]
        for pair_id in pairs
        if pair_id in report["pairs"]
    }
    report_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\n[seated] report: {report_file.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
