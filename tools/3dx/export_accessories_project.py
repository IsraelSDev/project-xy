"""Exporta a coleção de acessórios 3DX do projeto exportado.

Cinco chapéus, cinco óculos e cinco máscaras por gênero. Chapéus são skinnados
(usa ``extract_character.py --retarget``); óculos e máscaras são rígidos e viram
uma skin de 1 osso na cabeça (``extract_accessory_project.py``).

Exemplo::

    py -3.11 tools/3dx/export_accessories_project.py
    py -3.11 tools/3dx/export_accessories_project.py --only 3dx_m_hat_flat --staging C:/Temp/acc
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "3dx"
DEFAULT_PROJECT = Path(r"C:\dev\exported\ExportedProject")
DEFAULT_OUT = ROOT / "apps" / "web" / "public" / "assets" / "3dx" / "accessories"
FOLDER = {"male": "man", "female": "woman"}

# id, slot, gender, prefab, kind, color, roughness
PIECES = [
    # chapéus (skinned)
    ("3dx_m_hat_flat", "hat", "male", "hat_flat", "skinned", (0.90, 0.88, 0.82), 0.8),
    ("3dx_m_hat_bunny", "hat", "male", "hat_bunny", "skinned", (0.92, 0.62, 0.72), 0.8),
    ("3dx_m_hat_horns", "hat", "male", "hat_horns", "skinned", (0.35, 0.08, 0.08), 0.65),
    ("3dx_m_hat_witch", "hat", "male", "hat_witch", "skinned", (0.18, 0.10, 0.28), 0.8),
    ("3dx_m_hat_wool", "hat", "male", "hat_wool", "skinned", (0.55, 0.57, 0.62), 0.9),
    ("3dx_f_hat_flat", "hat", "female", "hat_flat", "skinned", (0.90, 0.88, 0.82), 0.8),
    ("3dx_f_hat_bunny", "hat", "female", "hat_bunny", "skinned", (0.92, 0.62, 0.72), 0.8),
    ("3dx_f_hat_horns", "hat", "female", "hat_horns", "skinned", (0.35, 0.08, 0.08), 0.65),
    ("3dx_f_hat_witch", "hat", "female", "hat_witch", "skinned", (0.18, 0.10, 0.28), 0.8),
    ("3dx_f_hat_wool", "hat", "female", "hat_wool", "skinned", (0.55, 0.57, 0.62), 0.9),
    # óculos (rígidos, 1 osso)
    ("3dx_m_glasses_1", "glasses", "male", "glasses_1", "rigid", (0.05, 0.05, 0.06), 0.3),
    ("3dx_m_glasses_2", "glasses", "male", "glasses_2", "rigid", (0.72, 0.55, 0.20), 0.35),
    ("3dx_m_glasses_3", "glasses", "male", "glasses_3", "rigid", (0.65, 0.67, 0.70), 0.3),
    ("3dx_m_glasses_4", "glasses", "male", "glasses_4", "rigid", (0.55, 0.08, 0.10), 0.35),
    ("3dx_m_glasses_5", "glasses", "male", "glasses_5", "rigid", (0.10, 0.18, 0.45), 0.35),
    ("3dx_f_glasses_1", "glasses", "female", "glasses_1", "rigid", (0.05, 0.05, 0.06), 0.3),
    ("3dx_f_glasses_2", "glasses", "female", "glasses_2", "rigid", (0.72, 0.55, 0.20), 0.35),
    ("3dx_f_glasses_3", "glasses", "female", "glasses_3", "rigid", (0.65, 0.67, 0.70), 0.3),
    ("3dx_f_glasses_4", "glasses", "female", "glasses_4", "rigid", (0.55, 0.08, 0.10), 0.35),
    ("3dx_f_glasses_5", "glasses", "female", "glasses_5", "rigid", (0.10, 0.18, 0.45), 0.35),
    # máscaras (rígidas, 1 osso)
    ("3dx_m_mask_1", "mask", "male", "mask_1", "rigid", (0.08, 0.08, 0.09), 0.5),
    ("3dx_m_mask_2", "mask", "male", "mask_2", "rigid", (0.88, 0.86, 0.82), 0.5),
    ("3dx_m_mask_3", "mask", "male", "mask_3", "rigid", (0.55, 0.08, 0.10), 0.5),
    ("3dx_m_mask_4", "mask", "male", "mask_4", "rigid", (0.70, 0.52, 0.18), 0.45),
    ("3dx_m_mask_5", "mask", "male", "mask_5", "rigid", (0.60, 0.62, 0.66), 0.45),
    ("3dx_f_mask_1", "mask", "female", "mask_1", "rigid", (0.08, 0.08, 0.09), 0.5),
    ("3dx_f_mask_2", "mask", "female", "mask_2", "rigid", (0.88, 0.86, 0.82), 0.5),
    ("3dx_f_mask_3", "mask", "female", "mask_3", "rigid", (0.55, 0.08, 0.10), 0.5),
    ("3dx_f_mask_4", "mask", "female", "mask_4", "rigid", (0.70, 0.52, 0.18), 0.45),
    ("3dx_f_mask_5", "mask", "female", "mask_5", "rigid", (0.60, 0.62, 0.66), 0.45),
]


def run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(f"falhou: {' '.join(cmd)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project", type=Path, default=DEFAULT_PROJECT)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--staging", type=Path)
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--skip-verify", action="store_true")
    args = ap.parse_args()

    resources = args.project / "Assets" / "Resources"
    if not resources.is_dir():
        raise SystemExit(f"projeto não encontrado: {resources}")
    build = TOOLS / "build" / "project" / "accessories"
    build.mkdir(parents=True, exist_ok=True)
    if args.staging:
        args.staging.mkdir(parents=True, exist_ok=True)

    wanted = set(args.only or [])
    pieces = [piece for piece in PIECES if not wanted or piece[0] in wanted]
    unknown = wanted - {piece[0] for piece in PIECES}
    if unknown:
        raise SystemExit(f"ids desconhecidos: {sorted(unknown)}")

    failed: list[str] = []
    for piece_id, slot, gender, prefab, kind, color, roughness in pieces:
        source = resources / FOLDER[gender] / "cloth" / f"{prefab}.prefab"
        rig = TOOLS / "rigs" / f"3dx_{gender}.json"
        json_out = build / f"{piece_id}.json"
        glb_out = (
            args.staging / f"{piece_id}.glb"
            if args.staging
            else args.out / slot / f"{piece_id}.glb"
        )
        glb_out.parent.mkdir(parents=True, exist_ok=True)

        print(f"=== {piece_id} ({gender}/{slot}) <- {prefab} [{kind}]")
        if kind == "skinned":
            result = subprocess.run(
                [
                    sys.executable, str(TOOLS / "extract_character.py"),
                    "--source", str(source),
                    "--skeleton-json", str(rig),
                    "--mesh", prefab,
                    "--gender", gender,
                    "--retarget",
                    "--out", str(json_out),
                ],
                cwd=ROOT, capture_output=True, text=True,
            )
            sys.stdout.write(result.stdout)
            if result.returncode != 0:
                sys.stderr.write(result.stderr)
                failed.append(piece_id)
                continue
        else:
            run([
                sys.executable, str(TOOLS / "extract_accessory_project.py"),
                "--source", str(source),
                "--rig", str(rig),
                "--gender", gender,
                "--out", str(json_out),
            ])

        run([
            sys.executable, str(TOOLS / "run_blender.py"),
            "export_glb.py", "--",
            "--json", str(json_out),
            "--out", str(glb_out),
            "--color", ",".join(f"{c:g}" for c in color),
            "--roughness", f"{roughness:g}",
        ])

        if not args.skip_verify:
            check = subprocess.run(
                [sys.executable, str(TOOLS / "verify_glb.py"), "--glb", str(glb_out), "--rest"],
                cwd=ROOT, capture_output=True, text=True,
            )
            line = next(
                (ln for ln in check.stdout.splitlines() if "maxdisp" in ln),
                check.stdout.strip()[-160:],
            )
            print(f"    {glb_out.stat().st_size} bytes; {line.strip()}")
            if check.returncode != 0 or "maxdisp=0.0000" not in check.stdout:
                failed.append(piece_id)

    print(f"exportadas {len(pieces) - len(failed)}/{len(pieces)} peças")
    if failed:
        raise SystemExit(f"falharam: {failed}")


if __name__ == "__main__":
    main()
