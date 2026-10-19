"""Extract the native 3DX body/head/eyelash textures and write material specs.

The body meshes live in ``3DXChat_Data/character`` but their materials and
textures live in ``3DXChat_Data/resources.assets``. There are two material sets:

- male: ``body`` with ``_Pubes``, ``head`` with ``_Beard``, ``eyelashes``;
- female: ``body`` with ``_Nipples``, ``head`` with ``_EyesMakeup``,
  ``eyelashes`` with the ``Eyelashes_2`` atlas;
- ``penis`` (male anatomy).

Opaque atlases are kept at their native resolution (up to 2048) and written as
JPEG. The source ``_BumpMap`` is a grayscale detail/bump map, not a tangent-space
normal map, so it is not exported (using it as a normal map produces dark
blotches). The eyelash atlas is white-on-black with no alpha channel, so it is
converted to black RGB + luminance alpha for a cutout material.

Outputs (passed to ``export_glb.py --materials``)::

    py -3.11 tools/3dx/extract_body_textures.py \
        --source "C:/.../3DXChat_Data/resources.assets" \
        --outdir tools/3dx/build
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import UnityPy
from PIL import Image

MAX_DIFFUSE = 2048
JPEG_QUALITY = 92


def tex_keys(material) -> set[str]:
    return {key.name for key, _ in material.m_SavedProperties.m_TexEnvs}


def texture_of(material, key: str = "_MainTex"):
    for prop, value in material.m_SavedProperties.m_TexEnvs:
        if prop.name != key or getattr(value.m_Texture, "path_id", 0) == 0:
            continue
        return value.m_Texture.read()
    return None


def materials_by_name(env):
    out: dict[str, list] = {}
    for obj in env.objects:
        if obj.type.name != "Material":
            continue
        material = obj.read()
        out.setdefault(material.m_Name, []).append(material)
    return out


def save_diffuse(texture, path: Path, max_size: int = MAX_DIFFUSE) -> None:
    image = texture.image.convert("RGB")
    if max(image.size) > max_size:
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, quality=JPEG_QUALITY, optimize=True)
    print(
        f"  {texture.m_Name} {texture.m_Width}x{texture.m_Height} -> "
        f"{path.name} ({path.stat().st_size} bytes)"
    )


def save_eyelashes(texture, path: Path) -> None:
    source = texture.image.convert("RGB")
    # White lashes on black: keep the lash shape as alpha and paint the RGB black.
    alpha = source.convert("L")
    out = Image.new("RGBA", source.size, (0, 0, 0, 0))
    out.putalpha(alpha)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, optimize=True)
    print(f"  {texture.m_Name} {texture.m_Width}x{texture.m_Height} -> {path.name} (alpha=luma)")


def pick_body(materials: dict[str, list], female: bool):
    for material in materials.get("body", []):
        keys = tex_keys(material)
        if female and "_Nipples" in keys:
            return material
        if not female and "_Pubes" in keys:
            return material
    return None


def pick_head(materials: dict[str, list], female: bool):
    for material in materials.get("head", []):
        keys = tex_keys(material)
        if female and "_EyesMakeup" in keys:
            return material
        if not female and "_Beard" in keys:
            return material
    return None


def pick_eyelashes(materials: dict[str, list], female: bool):
    wanted = "Eyelashes_2" if female else "eyelashes"
    for material in materials.get("eyelashes", []):
        texture = texture_of(material)
        if texture is not None and texture.m_Name == wanted:
            return material
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, help="resources.assets with the body materials")
    ap.add_argument("--outdir", required=True, help="where to write PNG/JPEGs and material JSONs")
    args = ap.parse_args()

    env = UnityPy.load(args.source)
    materials = materials_by_name(env)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    male_body = pick_body(materials, female=False)
    female_body = pick_body(materials, female=True)
    body_texture = texture_of(male_body or female_body)
    if body_texture is None:
        raise SystemExit("body material/texture not found")
    body_path = outdir / "body_diffuse.jpg"
    save_diffuse(body_texture, body_path)

    for gender, female, body, body_mesh, head_mesh, lash_mesh in (
        ("male", False, male_body, "man_body", "man_head", "man_eyelashes"),
        ("female", True, female_body, "woman_body", "woman_head", "woman_eyelashes"),
    ):
        head = pick_head(materials, female)
        lashes = pick_eyelashes(materials, female)
        if body is None or head is None or lashes is None:
            raise SystemExit(f"{gender}: body/head/eyelashes material not found")

        head_tex = texture_of(head)
        lash_tex = texture_of(lashes)
        if head_tex is None or lash_tex is None:
            raise SystemExit(f"{gender}: head/eyelashes texture not found")
        head_path = outdir / f"head_{gender}_diffuse.jpg"
        lash_path = outdir / f"eyelashes_{gender}.png"
        save_diffuse(head_tex, head_path)
        save_eyelashes(lash_tex, lash_path)

        body_spec = {
            "texture": body_path.name,
            "alphaMode": "opaque",
            "smooth": True,
            "roughness": 0.62,
        }
        head_spec = {
            "texture": head_path.name,
            "alphaMode": "opaque",
            "smooth": True,
            "roughness": 0.55,
        }

        spec: dict[str, dict] = {
            body_mesh: body_spec,
            head_mesh: head_spec,
            lash_mesh: {
                "texture": lash_path.name,
                "alphaMode": "cutout",
                "cutoff": 0.5,
                "smooth": False,
                "roughness": 0.8,
            },
        }
        if not female:
            penis = (materials.get("penis") or [None])[0]
            penis_tex = texture_of(penis) if penis is not None else None
            if penis_tex is not None:
                penis_path = outdir / "penis_diffuse.jpg"
                save_diffuse(penis_tex, penis_path)
                penis_spec = {
                    "texture": penis_path.name,
                    "alphaMode": "opaque",
                    "smooth": True,
                    "roughness": 0.62,
                }
                spec["man_penis"] = penis_spec

        spec_path = outdir / f"body_{gender}_materials.json"
        spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
        print(f"[body textures] {gender}: {spec_path} ({len(spec)} meshes)")


if __name__ == "__main__":
    main()
