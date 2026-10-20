"""Exporta a coleção de roupas 3DX a partir do projeto Unity exportado.

Fonte única: ``Resources/{man,woman}/cloth/*.prefab`` do projeto exportado. O
rest pose/esqueleto de referência vem de ``tools/3dx/rigs/3dx_{gender}.json``
(contrato do corpo publicado), então nenhum asset bundle é necessário.

Exemplo (publica direto em ``apps/web/public/assets/3dx/clothes``)::

    py -3.11 tools/3dx/export_clothes_project.py

Só algumas peças, em staging::

    py -3.11 tools/3dx/export_clothes_project.py --only 3dx_m_top_shirt \
        --staging C:/Users/me/AppData/Local/Temp/opencode/clothes

O script roda ``extract_character.py`` (JSON) e ``run_blender.py export_glb.py``
(GLB branco) por peça e valida o repouso com ``verify_glb.py --rest``.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "3dx"
DEFAULT_PROJECT = Path(r"C:\dev\exported\ExportedProject")
DEFAULT_OUT = ROOT / "apps" / "web" / "public" / "assets" / "3dx" / "clothes"

FOLDER = {"male": "man", "female": "woman"}

# id, slot, gender, prefab, mesh (LOD0)
PIECES = [
    # masculino (13)
    ("3dx_m_top_shirt", "top", "male", "shirt_1", "shirt_1"),
    ("3dx_m_top_tshirt_basic", "top", "male", "tshirt_1", "tshirt_1"),
    ("3dx_m_top_tshirt_print", "top", "male", "tshirt_2", "tshirt_2"),
    ("3dx_m_top_tshirt_long", "top", "male", "tshirt_3", "tshirt_3"),
    ("3dx_m_top_harness", "top", "male", "harness_1", "harness_1"),
    ("3dx_m_outerwear_cardigan", "outerwear", "male", "cardigan", "cardigan"),
    ("3dx_m_outerwear_jacket", "outerwear", "male", "jacket_1", "jacket_1"),
    ("3dx_m_outerwear_bomber", "outerwear", "male", "jacket_2", "jacket_2"),
    ("3dx_m_bottom_pants", "bottom", "male", "jeans_1", "jeans_1"),
    ("3dx_m_bottom_jeans", "bottom", "male", "jeans_2", "jeans_2"),
    ("3dx_m_bottom_shorts", "bottom", "male", "shorts_1", "shorts_1"),
    ("3dx_m_underwear_briefs", "underwear", "male", "pantie_1", "pantie_1"),
    ("3dx_m_underwear_boxer", "underwear", "male", "pantie_2", "pantie_2"),
    # feminino (15)
    ("3dx_f_top_shirt", "top", "female", "tshirt_4", "tshirt_4"),
    ("3dx_f_top_blouse", "top", "female", "blouse_1", "blouse_1"),
    ("3dx_f_top_tube", "top", "female", "tshirt_3", "tshirt_3"),
    ("3dx_f_top_offshoulder", "top", "female", "tshirt_5", "tshirt_5"),
    ("3dx_f_top_tank", "top", "female", "tshirt_6", "tshirt_6"),
    ("3dx_f_outerwear_coat", "outerwear", "female", "coat", "coat"),
    ("3dx_f_bottom_pants", "bottom", "female", "jeans_1", "jeans_1"),
    ("3dx_f_bottom_leggings", "bottom", "female", "leggins_1", "leggins_1"),
    ("3dx_f_bottom_shorts", "bottom", "female", "shorts_1", "shorts_1"),
    ("3dx_f_bottom_skirt", "bottom", "female", "skirt_1", "skirt_1"),
    ("3dx_f_bottom_skirt_pleated", "bottom", "female", "skirt_3", "skirt_3"),
    ("3dx_f_bottom_skirt_short", "bottom", "female", "skirt_2", "skirt_2"),
    ("3dx_f_underwear_panties", "underwear", "female", "pantie_1", "pantie_1"),
    ("3dx_f_underwear_bra", "underwear", "female", "bra_1", "bra_1"),
    ("3dx_f_underwear_bra_lace", "underwear", "female", "bra_2", "bra_2"),
]


def run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(f"falhou: {' '.join(cmd)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project", type=Path, default=DEFAULT_PROJECT, help="raiz do ExportedProject")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="diretório de saída (publicado)")
    ap.add_argument(
        "--staging",
        type=Path,
        help="se definido, grava todos os GLBs num diretório único (não separa por slot)",
    )
    ap.add_argument("--only", nargs="*", help="ids a exportar (padrão: todos)")
    ap.add_argument("--skip-verify", action="store_true", help="não roda verify_glb --rest")
    args = ap.parse_args()

    resources = args.project / "Assets" / "Resources"
    if not resources.is_dir():
        raise SystemExit(f"projeto não encontrado: {resources}")

    build = TOOLS / "build" / "project" / "clothes"
    build.mkdir(parents=True, exist_ok=True)
    if args.staging:
        args.staging.mkdir(parents=True, exist_ok=True)

    wanted = set(args.only or [])
    pieces = [piece for piece in PIECES if not wanted or piece[0] in wanted]
    unknown = wanted - {piece[0] for piece in PIECES}
    if unknown:
        raise SystemExit(f"ids desconhecidos: {sorted(unknown)}")

    failed: list[str] = []
    for piece_id, slot, gender, prefab, mesh in pieces:
        source = resources / FOLDER[gender] / "cloth" / f"{prefab}.prefab"
        rig = TOOLS / "rigs" / f"3dx_{gender}.json"
        json_out = build / f"{piece_id}.json"
        glb_out = (
            args.staging / f"{piece_id}.glb"
            if args.staging
            else args.out / slot / f"{piece_id}.glb"
        )
        glb_out.parent.mkdir(parents=True, exist_ok=True)

        print(f"=== {piece_id} ({gender}/{slot}) <- {prefab}")
        print(subprocess.run(
            [
                sys.executable, str(TOOLS / "extract_character.py"),
                "--source", str(source),
                "--skeleton-json", str(rig),
                "--mesh", mesh,
                "--gender", gender,
                "--retarget",
                "--out", str(json_out),
            ],
            cwd=ROOT, capture_output=True, text=True,
        ).stdout.rstrip())

        run([
            sys.executable, str(TOOLS / "run_blender.py"),
            "export_glb.py", "--",
            "--json", str(json_out),
            "--out", str(glb_out),
            "--color", "1,1,1",
            "--roughness", "0.8",
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
