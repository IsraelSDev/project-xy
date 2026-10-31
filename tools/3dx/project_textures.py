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
from PIL import Image, ImageChops, ImageFilter


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


#: Contraste que sobra no RGB do cabelo (0 = cor chapada, 1 = atlas original).
HAIR_FLAT = 0.55


def save_hair_atlas(image: Image.Image, path: Path, flat: float = HAIR_FLAT) -> None:
    """Atlas de cabelo fosco: alfa denso (sem furos) e RGB de contraste baixo.

    O atlas do 3DX pinta os fios claros na própria cor. Multiplicado pela cor da
    aparência, esse desenho vira brilho metálico — e os vãos entre os fios deixam a
    pele da cabeça aparecer por baixo dos cartões. Aqui o alfa é fechado (os vãos
    internos viram opacos) e realçado, e o RGB fica numa faixa estreita perto do
    branco: a cor fosca vem do ``albedoColor`` da peça, não da textura.
    """
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.getextrema() == (255, 255):
        # Fios claros sobre fundo preto, sem alfa: o desenho é a máscara.
        alpha = rgba.convert("L")
    # Fecha os buracos pequenos de dentro do cartão (borda externa fica igual).
    closed = alpha.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    alpha = ImageChops.lighter(alpha, closed)
    # Realça a cobertura: fio fraco vira opaco e só a borda externa continua suave.
    alpha = alpha.point(lambda value: round(255 * (value / 255) ** 0.45))
    luma = rgba.convert("L")
    body = luma.point(lambda value: round(255 * (flat + (1 - flat) * value / 255)))
    out = Image.merge("RGBA", (body, body, body, alpha))
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, optimize=True)
    opaque = sum(alpha.histogram()[128:]) / (out.width * out.height)
    print(
        f"  {path.name}: {out.width}x{out.height} cabelo fosco "
        f"({opaque:.0%} opaco, {path.stat().st_size // 1024} KB)"
    )
