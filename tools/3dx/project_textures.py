"""Leitura de materiais e texturas do projeto Unity exportado (fonte nativa).

Compartilhado por ``extract_body_textures_project.py`` (corpo/cabeça) e por
``export_clothes_project.py`` (roupas). Nada é decodificado de ``.assets``: o
material aponta para o PNG por GUID e o arquivo é copiado na resolução nativa,
sem recodificar (PNG lossless). O ``_BumpMap`` do projeto é um normal map de
espaço tangente (azul ≈ 254), não um bump em escala de cinza.
"""

from __future__ import annotations

from pathlib import Path

import project_env as P
from PIL import Image


def tex_envs(material) -> dict[str, dict]:
    """``{slot: texture ref}`` de um material do projeto (Unity serializa pares)."""
    out: dict[str, dict] = {}
    for item in material._data.get("m_SavedProperties", {}).get("m_TexEnvs", []):
        name = item.get("first", {}).get("name")
        ref = item.get("second", {}).get("m_Texture") or {}
        if name and int(ref.get("fileID") or 0) != 0:
            out[name] = ref
    return out


def material_color(material) -> tuple[float, float, float]:
    """``_Color`` do material (o multiplicador que o shader 3DX aplica no albedo)."""
    for item in material._data.get("m_SavedProperties", {}).get("m_Colors", []):
        if item.get("first", {}).get("name") == "_Color":
            value = item.get("second") or {}
            return (float(value.get("r", 1)), float(value.get("g", 1)), float(value.get("b", 1)))
    return (1.0, 1.0, 1.0)


def smr_materials(env: P.ProjectEnv) -> dict[str, list]:
    """nome da malha -> materiais do SkinnedMeshRenderer que a desenha."""
    out: dict[str, list] = {}
    for obj in env.objects:
        if obj.type.name != "SkinnedMeshRenderer":
            continue
        smr = obj.read()
        mesh_ref = getattr(smr, "m_Mesh", None)
        if mesh_ref is None or mesh_ref.path_id == 0:
            continue
        mesh = env.resolve(obj._file_key, mesh_ref.path_id, mesh_ref._guid)
        if mesh is None:
            continue
        name = str(mesh.read().m_Name)
        if name in out:
            continue
        materials = []
        for ref in smr.m_Materials:
            if ref.path_id == 0:
                continue
            material = env.resolve(obj._file_key, ref.path_id, ref._guid)
            if material is not None:
                materials.append(material.read())
        out[name] = materials
    return out


def load_texture(env: P.ProjectEnv, ref: dict, label: str) -> tuple[Image.Image, Path]:
    path = env.asset_path(ref.get("guid"))
    if path is None or not path.exists():
        raise SystemExit(f"{label}: texture not found for {ref}")
    with Image.open(path) as image:
        return image.copy(), path


def is_placeholder(path: Path) -> bool:
    """``empty.png``/16x16 marcando "sem textura" nos materiais do 3DX."""
    with Image.open(path) as image:
        return path.stem == "empty" or max(image.size) <= 16


def save_rgb(image: Image.Image, path: Path, webp: bool = False) -> None:
    """Albedo/normal com perda zero e resolução nativa (sem alfa: o mapa é opaco)."""
    rgb = image.convert("RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    if webp:
        rgb.save(path, "WEBP", lossless=True, method=6)
    else:
        rgb.save(path, optimize=True)
    print(f"  {path.name}: {rgb.width}x{rgb.height} ({path.stat().st_size // 1024} KB)")


def save_cutout(image: Image.Image, path: Path) -> None:
    """Atlas com recorte: RGB preto + alfa pela luminância quando a fonte não tem alfa."""
    rgba = image.convert("RGBA")
    if rgba.getchannel("A").getextrema() == (255, 255):
        # Fios brancos sobre preto, sem alfa: o próprio desenho vira a máscara.
        alpha = rgba.convert("L")
        rgba = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
        rgba.putalpha(alpha)
    path.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(path, optimize=True)
    print(f"  {path.name}: {rgba.width}x{rgba.height} alfa=luma ({path.stat().st_size // 1024} KB)")
