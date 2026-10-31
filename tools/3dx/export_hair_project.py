"""Exporta cabelos 3DX do projeto Unity exportado (fonte única: ``E:\\dev\\exported``).

Cada estilo é um ``Resources/{man,woman}/hair/hair_N.prefab``. A malha LOD0 é
retargetada para o esqueleto do corpo publicado (``rigs/3dx_{gender}.json``) e
sai num GLB com o atlas de fios em versão fosca (alfa denso, RGB de contraste
baixo — ver ``save_hair_atlas``) e, quando o material tiver, o normal map. O atlas
não é redimensionado: mantém a resolução original do PNG.

Uso:
    py -3.11 tools/3dx/export_hair_project.py
    py -3.11 tools/3dx/export_hair_project.py --only 3dx_m_hair_1 --staging %TEMP%/hair
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
    load_texture,
    save_hair_atlas,
    save_rgb,
    smr_materials,
    tex_envs,
)

DEFAULT_PROJECT = Path(r"E:\dev\exported\ExportedProject")
DEFAULT_OUT = ROOT / "apps" / "web" / "public" / "assets" / "3dx" / "hair"
FOLDER = {"male": "man", "female": "woman"}

# LOD0 de cada estilo; a numeração segue os prefabs do projeto exportado.
PIECES = [
    # masculino (5 novos)
    ("3dx_m_hair_1", "male", "hair_1"),
    ("3dx_m_hair_2", "male", "hair_2"),
    ("3dx_m_hair_3", "male", "hair_3"),
    ("3dx_m_hair_6", "male", "hair_6"),
    ("3dx_m_hair_7", "male", "hair_7"),
    # feminino (5 novos)
    ("3dx_f_hair_1", "female", "hair_1"),
    ("3dx_f_hair_2", "female", "hair_2"),
    ("3dx_f_hair_3", "female", "hair_3"),
    ("3dx_f_hair_8", "female", "hair_8"),
    ("3dx_f_hair_6", "female", "hair_6"),
]

# O alfa dos cards é recortado; o limite segue o publicado por gênero.
CUTOFF = {"male": 0.3, "female": 0.5}
HAIR_ROUGHNESS = 1.0


def run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(f"falhou: {' '.join(cmd)}")


def build_materials(
    piece_id: str, prefab: Path, mesh: str, texdir: Path, gender: str
) -> tuple[Path, bool]:
    env = P.ProjectEnv.from_prefab(prefab)
    materials = smr_materials(env).get(mesh, [])
    if not materials:
        raise SystemExit(f"{prefab.name}/{mesh}: material não encontrado")
    material = materials[0]
    slots = tex_envs(material)
    main = slots.get("_MainTex")
    if main is None:
        raise SystemExit(f"{prefab.name}/{mesh}: sem _MainTex")
    image, source = load_texture(env, main, f"{piece_id}/_MainTex")
    texture_path = texdir / f"{piece_id}_diffuse.png"
    save_hair_atlas(image, texture_path)

    normal_path: Path | None = None
    bump = slots.get("_BumpMap")
    if bump is not None:
        normal_image, _ = load_texture(env, bump, f"{piece_id}/_BumpMap")
        normal_path = texdir / f"{piece_id}_normal.png"
        save_rgb(normal_image, normal_path)

    entry: dict = {
        "color": "1,1,1",
        "alphaMode": "cutout",
        "cutoff": CUTOFF[gender],
        "doubleSided": True,
        "smooth": True,
        "roughness": HAIR_ROUGHNESS,
        "texture": texture_path.name,
    }
    if normal_path is not None:
        entry["normal"] = normal_path.name
    spec = texdir / f"{piece_id}_materials.json"
    spec.write_text(json.dumps({mesh: entry}, indent=2), encoding="utf-8")
    print(f"    atlas {source.name} {image.width}x{image.height}")
    return spec, normal_path is not None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", type=Path, default=DEFAULT_PROJECT)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--staging", type=Path, help="grava todos os GLBs num diretório único")
    ap.add_argument("--only", nargs="*", help="ids a exportar (padrão: todos)")
    ap.add_argument("--skip-verify", action="store_true")
    args = ap.parse_args()

    resources = args.project / "Assets" / "Resources"
    if not resources.is_dir():
        raise SystemExit(f"projeto não encontrado: {resources}")
    build = TOOLS / "build" / "project" / "hair"
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

    for piece_id, gender, prefab_name in pieces:
        prefab = resources / FOLDER[gender] / "hair" / f"{prefab_name}.prefab"
        if not prefab.is_file():
            raise SystemExit(f"prefab não encontrado: {prefab}")
        rig = TOOLS / "rigs" / f"3dx_{gender}.json"
        json_out = build / f"{piece_id}.json"
        glb_out = (
            args.staging / f"{piece_id}.glb"
            if args.staging
            else args.out / f"{piece_id}.glb"
        )
        glb_out.parent.mkdir(parents=True, exist_ok=True)

        print(f"=== {piece_id} ({gender}) <- {prefab.name}")
        run(
            [
                sys.executable,
                str(TOOLS / "extract_character.py"),
                "--source",
                str(prefab),
                "--skeleton-json",
                str(rig),
                "--mesh",
                prefab_name,
                "--gender",
                gender,
                "--retarget",
                "--out",
                str(json_out),
            ]
        )
        spec, has_normal = build_materials(piece_id, prefab, prefab_name, texdir, gender)
        cmd = [
            sys.executable,
            str(TOOLS / "run_blender.py"),
            "export_glb.py",
            "--",
            "--json",
            str(json_out),
            "--out",
            str(glb_out),
            "--materials",
            str(spec),
            "--color",
            "1,1,1",
            "--roughness",
            str(HAIR_ROUGHNESS),
            "--alpha-mode",
            "cutout",
            "--cutoff",
            str(CUTOFF[gender]),
            "--double-sided",
        ]
        if has_normal:
            cmd.append("--tangents")
        run(cmd)

        if not args.skip_verify:
            check = subprocess.run(
                [sys.executable, str(TOOLS / "verify_glb.py"), "--glb", str(glb_out), "--rest"],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            line = next(
                (ln for ln in check.stdout.splitlines() if "maxdisp" in ln),
                check.stdout.strip()[-160:],
            )
            print(f"    {glb_out.stat().st_size} bytes; {line.strip()}")
            if check.returncode != 0 or "maxdisp=0.0000" not in check.stdout:
                raise SystemExit(f"{piece_id}: verify_glb --rest falhou")


if __name__ == "__main__":
    main()
