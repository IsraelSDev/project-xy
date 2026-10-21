"""Extract the main texture (``_MainTex``) of a 3DXChat material to PNG.

Hair and other textured wearables keep their atlas inside the Unity bundle. The
GLB exporter embeds the PNG, so the pipeline needs a reproducible way to pull it
out before calling ``export_glb.py --texture``.

Examples
--------
    py -3.11 tools/3dx/extract_texture.py \
        --source "C:/.../AssetBundles/hair/male/hair_15" \
        --material hair15 --out tools/3dx/build/hair_male_15.png

    py -3.11 tools/3dx/extract_texture.py --source <bundle> --out <png>
"""

from __future__ import annotations

import argparse
from pathlib import Path

import UnityPy

# Unity Standard shader `_Mode`: 0 opaque, 1 cutout, 2 fade, 3 transparent.
ALPHA_MODES = {0: "opaque", 1: "cutout", 2: "blend", 3: "blend"}


def has_main_texture(mat) -> bool:
    for key, value in mat.m_SavedProperties.m_TexEnvs:
        if key.name == "_MainTex" and getattr(value.m_Texture, "path_id", 0) != 0:
            return True
    return False


def first_textured_material(env):
    """Material referenced by a SkinnedMeshRenderer that has a ``_MainTex``."""
    for obj in env.objects:
        if obj.type.name != "SkinnedMeshRenderer":
            continue
        smr = obj.read()
        for ref in smr.m_Materials:
            try:
                mat = ref.read()
            except Exception:
                continue
            if has_main_texture(mat):
                return mat
    for obj in env.objects:
        if obj.type.name != "Material":
            continue
        mat = obj.read()
        if has_main_texture(mat):
            return mat
    return None


def saved_float(mat, name: str, default: float) -> float:
    for key, value in mat.m_SavedProperties.m_Floats:
        if key.name == name:
            return float(value)
    return default


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, help="hair/wear bundle that contains the material")
    ap.add_argument("--material", help="material name (default: first textured material of the SMR)")
    ap.add_argument("--texture", default="_MainTex", help="texture property (default: _MainTex)")
    ap.add_argument("--out", required=True, help="output PNG")
    args = ap.parse_args()

    env = UnityPy.load(args.source)
    material = None
    for obj in env.objects:
        if obj.type.name != "Material":
            continue
        candidate = obj.read()
        if args.material is None or candidate.m_Name == args.material:
            material = candidate
            break
    if material is None and args.material is not None:
        raise SystemExit(f"material {args.material!r} not found in {args.source}")
    if material is None:
        material = first_textured_material(env)
    if material is None:
        raise SystemExit(f"no textured material found in {args.source}")

    texture = None
    for key, value in material.m_SavedProperties.m_TexEnvs:
        if key.name != args.texture or getattr(value.m_Texture, "path_id", 0) == 0:
            continue
        texture = value.m_Texture.read()
        break
    if texture is None:
        raise SystemExit(f"material {material.m_Name!r} has no {args.texture}")

    image = texture.image
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out)

    mode = int(round(saved_float(material, "_Mode", 0)))
    cutoff = saved_float(material, "_Cutoff", 0.5)
    print(
        f"[texture] material={material.m_Name} texture={texture.m_Name} "
        f"{image.width}x{image.height} mode={mode} ({ALPHA_MODES.get(mode, 'opaque')}) "
        f"cutoff={cutoff:g} -> {out}"
    )


if __name__ == "__main__":
    main()
