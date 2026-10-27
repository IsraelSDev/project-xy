"""Extract the native 3DX body/head/eyelash textures from the exported Unity project.

The source of truth is ``E:\\dev\\exported\\ExportedProject`` (ADR 0017): the body
prefab points at the materials by GUID and the materials point at the PNGs in
``Assets/Texture2D``. Nothing is decoded from ``resources.assets`` any more, so
the atlas keeps its *native* resolution and never goes through a lossy encode.

Per gender the script writes (``--outdir tools/3dx/build/project``):

    body_<gender>_diffuse.png    albedo, native size (2048x2048)
    body_<gender>_normal.png     tangent-space normal map (_BumpMap)
    head_<gender>_diffuse.png    albedo, native size
    head_<gender>_normal.png     tangent-space normal map
    eyelashes_<gender>.png      black RGB + luma alpha (cutout)
    penis_diffuse.png / penis_normal.png   male anatomy
    body_<gender>_materials.json           passed to ``export_glb.py --materials``

The maps are written as PNG (lossless) and the alpha channel of the opaque maps
is dropped (the body atlas is fully opaque) so the GLB does not carry a dead
channel. The ``_BumpMap`` of the project *is* a tangent-space normal map (the
blue channel is ~254), unlike the grayscale bump of the old bundle path.

Usage::

    py -3.11 tools/3dx/extract_body_textures_project.py --outdir tools/3dx/build/project
    py -3.11 tools/3dx/extract_body_textures_project.py --gender female --webp
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import project_env as P  # noqa: E402
from PIL import Image  # noqa: E402
from project_textures import (  # noqa: E402
    load_texture,
    save_cutout,
    save_rgb,
    smr_materials,
    tex_envs,
)

PROJECT = Path(r"E:\dev\exported\ExportedProject")

# mesh -> kind per gender. The mesh name is the LOD0 name used by
# ``extract_character.py``, so the JSON keys match the GLB meshes.
MESHES = {
    "male": {
        "man_body": "body",
        "man_head": "head",
        "man_eyelashes": "eyelashes",
        "man_jaw_eyes_atlas": "eyes",
        "man_penis": "penis",
    },
    "female": {
        "woman_body": "body",
        "woman_head": "head",
        "woman_eyelashes": "eyelashes",
        "woman_jaw_eyes_atlas": "eyes",
    },
}

PREFABS = {
    "male": "Assets/Resources/man/man.prefab",
    "female": "Assets/Resources/woman/woman.prefab",
}

# Roughness kept from the material set that shipped before (glTF has no direct
# equivalent of ``_Smoothness`` in these custom shaders).
ROUGHNESS = {"body": 0.62, "head": 0.55, "eyelashes": 0.8, "eyes": 0.25, "penis": 0.62}
NORMAL_SCALE = 1.5  # _BumpMapPower of the body/head/penis materials


def material_stem(material_name: str, gender: str) -> str:
    """File stem for a material's maps (``body`` -> ``body_male``)."""
    if material_name in ("body", "head", "eyelashes"):
        return f"{material_name}_{gender}"
    return material_name


def paint_iris(image: Image.Image) -> Image.Image:
    """Pinta uma íris no disco claro do atlas de olhos.

    O shader nativo (`Charecters_Eye`) desenha a íris/pupila em cima do atlas usando `_PupilColor` e
    a cor dos olhos escolhida no editor; como esse shader não é exportável, o GLB levaria olhos
    brancos. Aqui a íris é assada no atlas: o disco claro da metade direita vira íris marrom, pupila
    e um brilho especular. A posição/raio vêm da própria textura (o disco mais claro da direita).
    """
    import numpy as np
    from PIL import ImageDraw

    rgb = image.convert("RGB")
    arr = np.asarray(rgb).astype(int)
    height, width, _ = arr.shape
    right = arr[:, width // 2 :]
    bright = right.mean(axis=2) > 150
    ys, xs = np.nonzero(bright)
    if len(xs) < 100:
        return rgb
    cx = int(xs.mean()) + width // 2
    cy = int(ys.mean())
    radius = max(int((xs.max() - xs.min()) / 2), int((ys.max() - ys.min()) / 2))

    iris = Image.new("RGB", (width, height), (0, 0, 0))
    draw = ImageDraw.Draw(iris)
    for r in range(radius, 0, -1):
        if r <= radius * 0.30:
            value = 10  # pupila
        elif r <= radius * 0.42:
            value = 40
        else:
            k = (r - radius * 0.42) / (radius - radius * 0.42)
            value = int(200 - 120 * k)
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(value, value, value))
    draw.ellipse(
        (
            cx - int(radius * 0.42),
            cy - int(radius * 0.55),
            cx - int(radius * 0.16),
            cy - int(radius * 0.29),
        ),
        fill=(250, 250, 250),
    )
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)
    return Image.composite(iris, rgb, mask)

def extract_gender(env: P.ProjectEnv, gender: str, outdir: Path, webp: bool) -> dict:
    by_mesh = smr_materials(env)
    extension = ".webp" if webp else ".png"
    # A material can be shared by more than one mesh (the anatomy uses the body
    # material), so each map is written once and referenced by every mesh.
    written: dict[tuple[str, str], str] = {}
    spec: dict[str, dict] = {}

    def map_file(material, slot: str, kind: str) -> str:
        key = (material.m_Name, slot)
        cached = written.get(key)
        if cached is not None:
            return cached
        slots = tex_envs(material)
        if slot not in slots:
            raise SystemExit(f"{gender}/{material.m_Name}: material has no {slot}")
        image, source = load_texture(env, slots[slot], f"{gender}/{material.m_Name}/{slot}")
        print(f"  {material.m_Name} {slot} <- {source.name}")
        if kind == "eyes" and slot == "_MainTex":
            image = paint_iris(image)
        stem = material_stem(material.m_Name, gender)
        if kind == "eyelashes":
            path = outdir / f"{stem}.png"
            save_cutout(image, path)
        else:
            name = "diffuse" if slot == "_MainTex" else "normal"
            path = outdir / f"{stem}_{name}{extension}"
            save_rgb(image, path, webp)
        written[key] = path.name
        return path.name

    for mesh_name, kind in MESHES[gender].items():
        materials = by_mesh.get(mesh_name)
        if not materials:
            raise SystemExit(f"{gender}: no SkinnedMeshRenderer with material for {mesh_name!r}")
        material = materials[0]
        print(f"[{gender}] {mesh_name} <- {material.m_Name}")
        if kind == "eyelashes":
            spec[mesh_name] = {
                "texture": map_file(material, "_MainTex", kind),
                "alphaMode": "cutout",
                "cutoff": 0.5,
                "smooth": False,
                "roughness": ROUGHNESS[kind],
            }
            continue
        entry: dict = {
            "texture": map_file(material, "_MainTex", kind),
            "alphaMode": "opaque",
            "smooth": True,
            "roughness": ROUGHNESS[kind],
        }
        if kind == "eyes":
            # Os olhos são rígidos no osso da cabeça: os pesos da malha vêm do bindpose do nó e o
            # remap por bindpose os mandava para os pés (apareciam voando no idle).
            entry["rigidBone"] = "Head"
        if "_BumpMap" in tex_envs(material):
            entry["normal"] = map_file(material, "_BumpMap", kind)
            entry["normalScale"] = NORMAL_SCALE
        spec[mesh_name] = entry

    spec_path = outdir / f"body_{gender}_materials.json"
    spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
    print(f"[body textures] {gender}: {spec_path} ({len(spec)} meshes)")
    return spec


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", default=str(PROJECT), help="exported Unity project root")
    ap.add_argument("--outdir", required=True, help="where the maps and material JSONs are written")
    ap.add_argument("--gender", choices=("male", "female", "both"), default="both")
    ap.add_argument("--webp", action="store_true", help="write lossless WebP instead of PNG")
    args = ap.parse_args()

    project = Path(args.project)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    genders = ("male", "female") if args.gender == "both" else (args.gender,)
    for gender in genders:
        prefab = project / PREFABS[gender]
        if not prefab.exists():
            raise SystemExit(f"{gender}: prefab not found at {prefab}")
        env = P.ProjectEnv.from_prefab(prefab)
        extract_gender(env, gender, outdir, args.webp)


if __name__ == "__main__":
    main()
