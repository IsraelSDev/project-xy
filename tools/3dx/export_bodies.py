"""Rebuild the published 3DX body GLBs from the base body + the publishable actions in ``pairs.json``.

The published bodies are a single GLB per gender: meshes, skeleton and all animation actions. This
script assembles the exact ``export_glb.py`` command (base clips first, then the pair actions from
the manifest) so adding a pair is only a manifest entry — no hand-edited Blender command.

The manifest is fed by the exported Unity project (``import_pairs.py``); bundle-derived clips are no
longer part of this path. Entries with ``"publish": false`` are test-only and are skipped here.

Examples
--------
Build both bodies into the published assets::

    py -3.11 tools/3dx/export_bodies.py

Build into a scratch folder first::

    py -3.11 tools/3dx/export_bodies.py --test
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "tools/3dx/pairs.json"
DEFAULT_OUTDIR = ROOT / "apps/web/public/assets/3dx"
TEST_OUTDIR = ROOT / "tools/3dx/build/glb/published"

# Base actions already published in both bodies (`docs/guides/3dx-nativo.md`).
BASE_ACTIONS = {
    "male": [
        ("male_idle_pf.json", "idle"),
        ("male_walk_pf_sway.json", "walk"),
        ("male_pose_pf.json", "pose01"),
        ("male_pair.json", "pair01"),
        ("pair02_male.json", "pair02"),
        ("pair03_male.json", "pair03"),
    ],
    "female": [
        ("female_idle_pf.json", "idle"),
        ("female_walk_pf.json", "walk"),
        ("female_pose_pf.json", "pose01"),
        ("female_pair.json", "pair01"),
        ("pair02_female.json", "pair02"),
        ("pair03_female.json", "pair03"),
        ("female_dance_strip1.json", "dance"),
        ("female_dance_strip2.json", "dance2"),
    ],
}
BODIES = {
    "male": "tools/3dx/build/project/body_male.json",
    "female": "tools/3dx/build/project/body_female.json",
}
# Skin/face/albedo+normal maps from `extract_body_textures_project.py` (native PNG).
MATERIALS = {
    "male": "tools/3dx/build/project/body_male_materials.json",
    "female": "tools/3dx/build/project/body_female_materials.json",
}


def resolve(path: str) -> Path:
    p = Path(path)
    return p if p.is_absolute() else ROOT / p


def load_clip(path: Path) -> dict:
    if not path.is_file():
        raise SystemExit(f"animation JSON not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def collect_actions(gender: str, manifest: dict, skip_pairs: bool = False) -> list[tuple[Path, str]]:
    actions: list[tuple[Path, str]] = []
    for filename, name in BASE_ACTIONS[gender]:
        actions.append((ROOT / "tools/3dx/build/project" / filename, name))

    if skip_pairs:  # rebuild the published clip set only (e.g. re-exporting the skin textures)
        manifest = {}

    for pair_id, pair in manifest.get("pairs", {}).items():
        if pair.get("publish", True) is False:
            print(f"[skip] {pair_id}: publish=false (test-only)")
            continue
        default_action = pair.get("action")
        for participant in pair.get("participants", []):
            if participant.get("gender") != gender:
                continue
            action = participant.get("action", default_action)
            if not action:
                raise SystemExit(f"{pair_id}: participant without action")
            actions.append((resolve(participant["out"]), action))

    seen: dict[str, Path] = {}
    for path, name in actions:
        if name in seen:
            raise SystemExit(f"duplicate action {name!r}: {seen[name]} and {path}")
        seen[name] = path
    return actions


def check_actions(gender: str, body: dict, actions: list[tuple[Path, str]]) -> None:
    # O layout é comparado pelo caminho do osso (o `pid` só existe nos JSONs de clipe; o corpo vem do
    # contrato em `rigs/`, que não carrega path_id).
    expected = [(bone["path"], bone["parent"]) for bone in body["bones"]]
    fps: float | None = None
    for path, name in actions:
        clip = load_clip(path)
        actual = [(bone["path"], bone["parent"]) for bone in clip["bones"]]
        if actual != expected:
            raise SystemExit(f"{gender}/{name}: bone layout does not match {path}")
        if len(clip["world"]) != clip["frames"]:
            raise SystemExit(f"{gender}/{name}: frames/world mismatch")
        if fps is None:
            fps = clip["fps"]
        elif abs(clip["fps"] - fps) > 1e-6:
            raise SystemExit(f"{gender}/{name}: fps {clip['fps']} != {fps}")


def build(
    gender: str,
    actions: list[tuple[Path, str]],
    outdir: Path,
    dry_run: bool,
    materials: Path | None = None,
) -> Path:
    body = ROOT / BODIES[gender]
    dest = outdir / f"character_{gender}.glb"
    tmp = outdir / f"character_{gender}.tmp.glb"
    cmd = [
        sys.executable,
        str(ROOT / "tools/3dx/run_blender.py"),
        "export_glb.py",
        "--",
        "--json",
        str(body.resolve()),
        "--out",
        str(tmp.resolve()),
    ]
    if materials is not None:
        cmd.extend(["--materials", str(materials.resolve()), "--tangents"])
    for path, name in actions:
        cmd.extend(["--extra-anim", str(path.resolve()), name])

    print(f"\n=== {gender}: {len(actions)} actions -> {dest.relative_to(ROOT)} ===")
    print(" ".join(f'"{part}"' if " " in part else part for part in cmd))
    if dry_run:
        return dest
    outdir.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        raise SystemExit(f"Blender export failed for {gender} (exit {result.returncode})")
    if not tmp.is_file():
        raise SystemExit(f"Blender did not write {tmp}")
    os.replace(tmp, dest)
    print(f"[export] wrote {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)")
    return dest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    ap.add_argument("--outdir", help="output directory (default: published assets, or scratch with --test)")
    ap.add_argument("--test", action="store_true", help="write to tools/3dx/build/glb/published")
    ap.add_argument("--only", choices=["male", "female"], help="build only one body")
    ap.add_argument(
        "--no-textures",
        action="store_true",
        help="skip the materials JSON (flat skin color, no albedo/normal maps)",
    )
    ap.add_argument(
        "--skip-pairs",
        action="store_true",
        help="only the base actions (idle/walk/pose01/pair01..03), ignoring publishable pairs",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    outdir = Path(args.outdir) if args.outdir else (TEST_OUTDIR if args.test else DEFAULT_OUTDIR)
    outdir = outdir if outdir.is_absolute() else ROOT / outdir

    genders = [args.only] if args.only else ["male", "female"]
    for gender in genders:
        body_path = ROOT / BODIES[gender]
        body = load_clip(body_path)
        actions = collect_actions(gender, manifest, args.skip_pairs)
        check_actions(gender, body, actions)
        materials = None
        if not args.no_textures:
            candidate = ROOT / MATERIALS[gender]
            if not candidate.is_file():
                raise SystemExit(
                    f"materials not found: {candidate}\n"
                    "run: py -3.11 tools/3dx/extract_body_textures_project.py --outdir tools/3dx/build/project"
                )
            materials = candidate
        build(gender, actions, outdir, args.dry_run, materials)


if __name__ == "__main__":
    main()
