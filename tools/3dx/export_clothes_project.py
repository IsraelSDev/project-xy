"""Exporta a coleção de roupas 3DX a partir do projeto Unity exportado.

Fonte única: ``Resources/{man,woman}/cloth/*.prefab`` do projeto exportado. O
rest pose/esqueleto de referência vem de ``tools/3dx/rigs/3dx_{gender}.json``
(contrato do corpo publicado), então nenhum asset bundle é necessário.

Cada peça sai com o material nativo: o albedo (``_MainTex``, quando existe) e o
normal map (``_BumpMap``) do projeto, em PNG na resolução original, e o resto em
branco para o jogo recolore pelo ``TintPlugin`` (a luminância da textura vira o
brilho da cor escolhida — é o que deixa as dobras/estampas visíveis).

Exemplo (publica direto em ``apps/web/public/assets/3dx/clothes``)::

    py -3.11 tools/3dx/export_clothes_project.py

Só algumas peças, em staging::

    py -3.11 tools/3dx/export_clothes_project.py --only 3dx_m_top_shirt \
        --staging C:/Users/me/AppData/Local/Temp/opencode/clothes

O script roda ``extract_character.py`` (JSON), extrai as texturas e roda
``run_blender.py export_glb.py`` (GLB com material) por peça, validando o
repouso com ``verify_glb.py --rest``.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "3dx"
sys.path.insert(0, str(TOOLS))

import project_env as P  # noqa: E402
from project_textures import (  # noqa: E402
    is_placeholder,
    load_texture,
    save_rgb,
    smr_materials,
    tex_envs,
)

DEFAULT_PROJECT = Path(r"E:\dev\exported\ExportedProject")
DEFAULT_OUT = ROOT / "apps" / "web" / "public" / "assets" / "3dx" / "clothes"

FOLDER = {"male": "man", "female": "woman"}

# Roupa branca no GLB: o `TintPlugin` recolore pela luminância da textura.
CLOTH_ROUGHNESS = 0.8

# Fecha vãos pequenos entre painéis (o casaco mostrava o fundo da sala nas costas) até 12 cm².
FILL_HOLES_CM2 = 12.0

# Folga por slot: casaco/sobretudo é uma peça solta (os pesos vêm de pontos distantes do corpo, então
# a deformação no idle diverge mais) e precisa de mais espaço; peça justa fica com folga pequena.
CLEARANCE_BY_SLOT = {
    "outerwear": 0.012,
    "top": 0.007,
    "bottom": 0.007,
    "underwear": 0.005,
}
BASE_OFFSET_BY_SLOT = {
    "outerwear": 0.008,
    "top": 0.006,
    "bottom": 0.006,
    "underwear": 0.004,
}

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


def piece_material(prefab: Path, mesh: str):
    """Primeiro material do SkinnedMeshRenderer que desenha a malha da peça."""
    env = P.ProjectEnv.from_prefab(prefab)
    material = smr_materials(env).get(mesh, [None])[0]
    if material is None:
        raise SystemExit(f"{prefab.name}/{mesh}: material não encontrado")
    return env, material


def build_materials_json(
    piece_id: str, prefab: Path, mesh: str, texdir: Path
) -> tuple[Path, bool]:
    """Extrai albedo/normal da peça e devolve (materials.json, tem normal)."""
    env, material = piece_material(prefab, mesh)
    slots = tex_envs(material)
    entry: dict = {
        "color": "1,1,1",
        "alphaMode": "opaque",
        # O pano do 3DX é uma superfície de uma camada só: na dobra do ombro/axila a câmera vê o
        # verso do tecido. Com backface culling ligado o pedaço some e a pele aparece como um
        # "buraco" — o jogo desenha os dois lados.
        "doubleSided": True,
        "smooth": True,
        "roughness": CLOTH_ROUGHNESS,
    }
    has_normal = False
    main = slots.get("_MainTex")
    if main is not None:
        image, source = load_texture(env, main, f"{piece_id}/_MainTex")
        if not is_placeholder(source):
            path = texdir / f"{piece_id}_diffuse.png"
            save_rgb(image, path)
            entry["texture"] = path.name
    bump = slots.get("_BumpMap")
    if bump is not None:
        image, source = load_texture(env, bump, f"{piece_id}/_BumpMap")
        if not is_placeholder(source):
            path = texdir / f"{piece_id}_normal.png"
            save_rgb(image, path)
            entry["normal"] = path.name
            has_normal = True
    spec_path = texdir / f"{piece_id}_materials.json"
    spec_path.write_text(json.dumps({mesh: entry}, indent=2), encoding="utf-8")
    return spec_path, has_normal


def fit_to_body(piece_id: str, slot: str, gender: str, cloth: Path, out: Path, args) -> Path:
    """Encaixa a peça na pele: clearance, pesos do corpo e empurrão onde ela afunda.

    Sem isso o corpo atravessa o pano (ombro, axila, busto, coxa) — o ``fit_cloth.py`` já fazia
    isso no pipeline antigo; agora entra em todo lote.
    """
    body = TOOLS / "build" / "project" / f"body_{gender}.json"
    if not body.is_file():
        raise SystemExit(f"corpo de referência não encontrado: {body}")
    base = args.base_offset if args.base_offset is not None else BASE_OFFSET_BY_SLOT.get(slot, 0.006)
    clearance = (
        args.clearance if args.clearance is not None else CLEARANCE_BY_SLOT.get(slot, 0.006)
    )
    result = subprocess.run(
        [
            sys.executable, str(TOOLS / "run_blender.py"), str(TOOLS / "fit_cloth.py"), "--",
            "--body", str(body),
            "--cloth", str(cloth),
            "--out", str(out),
            "--base-offset", str(base),
            "--clearance", str(clearance),
            "--fill-holes", str(FILL_HOLES_CM2),
        ],
        cwd=ROOT, capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(f"{piece_id}: fit_cloth falhou")
    line = next(
        (ln for ln in (result.stdout + result.stderr).splitlines() if " verts," in ln), ""
    )
    print(f"    fit {line.strip()}")
    return out


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
    ap.add_argument(
        "--no-fit",
        action="store_true",
        help="não encaixa a peça na pele (exporta o retarget cru)",
    )
    ap.add_argument(
        "--base-offset",
        type=float,
        default=None,
        help="folga inicial ao longo da normal da peça (m); padrão por slot",
    )
    ap.add_argument(
        "--clearance",
        type=float,
        default=None,
        help="distância mínima fora da pele (m); padrão por slot",
    )
    args = ap.parse_args()

    resources = args.project / "Assets" / "Resources"
    if not resources.is_dir():
        raise SystemExit(f"projeto não encontrado: {resources}")

    build = TOOLS / "build" / "project" / "clothes"
    texdir = build / "textures"
    build.mkdir(parents=True, exist_ok=True)
    texdir.mkdir(parents=True, exist_ok=True)
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

        cmd = [
            sys.executable, str(TOOLS / "run_blender.py"),
            "export_glb.py", "--",
            "--json", str(json_out),
            "--out", str(glb_out),
            "--color", "1,1,1",
            "--roughness", str(CLOTH_ROUGHNESS),
        ]
        spec_path, has_normal = build_materials_json(piece_id, source, mesh, texdir)
        cmd.extend(["--materials", str(spec_path)])
        if has_normal:
            cmd.append("--tangents")
        if not args.no_fit:
            fit_out = build / f"{piece_id}_fit.json"
            fit_to_body(piece_id, slot, gender, json_out, fit_out, args)
            # O `--json` do export passa a ser o encaixado; o retarget cru fica para diagnóstico.
            cmd[cmd.index("--json") + 1] = str(fit_out)
        run(cmd)

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
