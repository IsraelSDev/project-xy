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
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops

import project_env as P

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


def _field(node, name, default):
    try:
        return getattr(node, name)
    except AttributeError:
        return default


def _save_texture(source: Path, target: Path, tint: tuple[float, float, float] | None) -> None:
    """Copia a textura na resolução nativa, aplicando o tint do material."""
    image = Image.open(source).convert("RGBA")
    if tint is not None and any(abs(c - 1.0) > 0.005 for c in tint):
        red, green, blue, alpha = image.split()
        solid = [
            Image.new("L", image.size, max(0, min(255, round(c * 255)))) for c in tint
        ]
        image = Image.merge(
            "RGBA",
            (
                ImageChops.multiply(red, solid[0]),
                ImageChops.multiply(green, solid[1]),
                ImageChops.multiply(blue, solid[2]),
                alpha,
            ),
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG", optimize=True)


def material_spec(piece_id: str, source: Path, slot: str, texdir: Path, base: Path) -> dict:
    """Lê o material original do prefab e devolve o spec do `export_glb.py`.

    Albedo, normal, cor, roughness, metallic e alpha vêm do material do projeto
    (não da cor fixa que o catálogo usava).
    """
    env = P.ProjectEnv.from_prefab(source)
    material = None
    for obj in env.objects:
        if obj.type.name not in ("MeshRenderer", "SkinnedMeshRenderer"):
            continue
        for reference in _field(obj.read(), "m_Materials", []):
            candidate = reference.read()
            if candidate is not None:
                material = candidate
                break
        if material is not None:
            break
    if material is None:
        return {}

    properties = _field(material, "m_SavedProperties", None)
    floats: dict[str, float] = {}
    colors: dict[str, list[float]] = {}
    texenvs = []
    if properties is not None:
        for entry in _field(properties, "m_Floats", []):
            floats[entry.first.name] = float(entry.second)
        for entry in _field(properties, "m_Colors", []):
            color = entry.second
            colors[entry.first.name] = [
                float(color.r),
                float(color.g),
                float(color.b),
                float(color.a),
            ]
        texenvs = _field(properties, "m_TexEnvs", [])

    def texture(slot_name: str) -> Path | None:
        for entry in texenvs:
            if entry.first.name != slot_name:
                continue
            path = env.asset_path(entry.second.m_Texture.guid)
            if path is not None and path.exists():
                return path
        return None

    mode = int(round(floats.get("_Mode", 0)))
    name = material.m_Name.lower()
    if mode == 1:
        alpha_mode = "cutout"
    elif mode in (2, 3) or "glass" in name:
        alpha_mode = "blend"
    else:
        alpha_mode = "opaque"
    color = colors.get("_Color", [1.0, 1.0, 1.0, 1.0])
    tint = (color[0], color[1], color[2])
    spec = {
        "color": [round(c, 4) for c in tint],
        "roughness": round(min(1.0, max(0.0, 1.0 - floats.get("_Glossiness", 0.5))), 4),
        "metallic": round(min(1.0, max(0.0, floats.get("_Metallic", 0.0))), 4),
        "alphaMode": alpha_mode,
        "cutoff": round(floats.get("_Cutoff", 0.5), 4),
        "doubleSided": slot == "mask",
    }

    main = texture("_MainTex")
    if main is not None:
        target = texdir / f"{piece_id}_albedo.png"
        _save_texture(main, target, tint)
        spec["texture"] = str(target.relative_to(base))
        spec["color"] = [1.0, 1.0, 1.0]
    normal = texture("_BumpMap")
    if normal is not None:
        target = texdir / f"{piece_id}_normal.png"
        _save_texture(normal, target, None)
        spec["normal"] = str(target.relative_to(base))
        spec["normalScale"] = round(floats.get("_BumpScale", 1.0), 4)
    return spec


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
    texdir = build / "textures"
    texdir.mkdir(parents=True, exist_ok=True)
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

        payload = json.loads(json_out.read_text(encoding="utf-8"))
        mesh_name = payload["meshes"][0]["name"]
        spec = material_spec(piece_id, source, slot, texdir, build)
        if spec:
            sidecar = build / f"{piece_id}.materials.json"
            sidecar.write_text(
                json.dumps({mesh_name: spec}, ensure_ascii=False, indent=1),
                encoding="utf-8",
            )
            export_cmd = [
                sys.executable, str(TOOLS / "run_blender.py"),
                "export_glb.py", "--",
                "--json", str(json_out),
                "--out", str(glb_out),
                "--materials", str(sidecar),
                "--tangents",
            ]
        else:
            export_cmd = [
                sys.executable, str(TOOLS / "run_blender.py"),
                "export_glb.py", "--",
                "--json", str(json_out),
                "--out", str(glb_out),
                "--color", ",".join(f"{c:g}" for c in color),
                "--roughness", f"{roughness:g}",
            ]
        run(export_cmd)

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
