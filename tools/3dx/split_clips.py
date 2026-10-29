"""Divide o corpo publicado em: base (o que toca em qualquer lugar) + um GLB por clipe de par.

O corpo inteiro passa de 50–68 MB; os clipes de par (móvel, F/F e M/M) respondem por ~85% disso e
só tocam quando alguém inicia a interação. Este script reescreve o `character_<g>.glb` mantendo
apenas as ações de base e grava `clips/<g>/<ação>.glb` (nós + uma animação, sem malhas/texturas),
que o cliente carrega sob demanda e amarra ao esqueleto do corpo pelo nome dos ossos.

Nada de Blender: opera no GLB já publicado (JSON + BIN), reaproveitando o leitor do `slim_glb.py`.

Uso::

    py -3.11 tools/3dx/split_clips.py
    py -3.11 tools/3dx/split_clips.py --gender male
"""

from __future__ import annotations

import argparse
import json
import os
import struct
from pathlib import Path

import slim_glb as S

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "apps/web/public/assets/3dx"
CLIPS = ASSETS / "clips"
# Lista que o cliente importa: quais ações são clipes sob demanda em cada corpo.
CLIENT_MANIFEST = ROOT / "apps/web/src/game/characters/pair-clips.ts"

# Ações que ficam no corpo: base de locomoção/pose/sentar e os pares sociais (usados em qualquer
# lugar e pequenos). Todo o resto é clipe de par carregado sob demanda.
BASE_ACTIONS = {
    "idle",
    "walk",
    "pose01",
    "dance",
    "dance2",
    "sit_sofa",
    "sit_chair",
    "sit_stool",
    "pair01",
    "pair02",
    "pair03",
    "pair04",
    "pair06",
    "pair07",
    "pair08",
    "pair09",
}


def subset(j: dict, binc: bytes, keep: set[str], include_assets: bool) -> tuple[dict, bytes]:
    """Devolve (documento, BIN) só com as animações de `keep` (e malhas/texturas se pedido)."""
    # Cópia profunda das animações: os samplers são remapeados por arquivo, e reaproveitar os
    # dicts do documento original contaminaria as próximas chamadas (índice de acessor trocado).
    animations = [
        {
            "name": anim.get("name"),
            "samplers": [dict(sampler) for sampler in anim["samplers"]],
            "channels": anim["channels"],
        }
        for anim in j.get("animations", [])
        if anim.get("name") in keep
    ]
    if not animations:
        raise SystemExit("nenhuma animação selecionada")

    live_accessors: set[int] = set()
    live_images: set[int] = set()
    if include_assets:
        for mesh in j.get("meshes", []):
            for prim in mesh.get("primitives", []):
                live_accessors.update(prim.get("attributes", {}).values())
                if "indices" in prim:
                    live_accessors.add(prim["indices"])
                for target in prim.get("targets", []):
                    live_accessors.update(target.values())
        for skin in j.get("skins", []):
            if "inverseBindMatrices" in skin:
                live_accessors.add(skin["inverseBindMatrices"])
        for image in j.get("images", []):
            if "bufferView" in image:
                live_images.add(image["bufferView"])
    for anim in animations:
        for sampler in anim["samplers"]:
            live_accessors.add(sampler["input"])
            live_accessors.add(sampler["output"])

    live_bv: set[int] = set(live_images)
    for index in live_accessors:
        accessor = j["accessors"][index]
        if "bufferView" in accessor:
            live_bv.add(accessor["bufferView"])

    new_bin = bytearray()
    bv_map: dict[int, int] = {}
    new_bvs: list[dict] = []
    for index in sorted(live_bv):
        bv = dict(j["bufferViews"][index])
        start = bv.get("byteOffset", 0)
        length = bv["byteLength"]
        new_bin.extend(b"\0" * ((4 - len(new_bin) % 4) % 4))
        bv["byteOffset"] = len(new_bin)
        bv["buffer"] = 0
        new_bin.extend(binc[start : start + length])
        new_bvs.append(bv)
        bv_map[index] = len(new_bvs) - 1

    acc_map: dict[int, int] = {}
    new_accs: list[dict] = []
    for index in sorted(live_accessors):
        acc = dict(j["accessors"][index])
        if "bufferView" in acc:
            acc["bufferView"] = bv_map[acc["bufferView"]]
        acc_map[index] = len(new_accs)
        new_accs.append(acc)

    doc: dict = {
        "asset": j["asset"],
        "nodes": [dict(node) for node in j.get("nodes", [])],
        "scenes": j.get("scenes", []),
        "scene": j.get("scene", 0),
        "accessors": new_accs,
        "bufferViews": new_bvs,
        "animations": animations,
    }

    if include_assets:
        # Imagens/texturas/materiais/malhas/skins entram como estão (o subconjunto de bufferViews já
        # foi copiado; só os índices precisam ser remapeados).
        if "images" in j:
            doc["images"] = [dict(image) for image in j["images"]]
            for image in doc["images"]:
                if "bufferView" in image:
                    image["bufferView"] = bv_map[image["bufferView"]]
        for key in ("samplers", "textures", "materials", "meshes", "skins"):
            if key in j:
                doc[key] = j[key]
        for mesh in doc.get("meshes", []):
            for prim in mesh.get("primitives", []):
                for name, index in list(prim.get("attributes", {}).items()):
                    prim["attributes"][name] = acc_map[index]
                if "indices" in prim:
                    prim["indices"] = acc_map[prim["indices"]]
                for target in prim.get("targets", []):
                    for name, index in list(target.items()):
                        target[name] = acc_map[index]
        for skin in doc.get("skins", []):
            if "inverseBindMatrices" in skin:
                skin["inverseBindMatrices"] = acc_map[skin["inverseBindMatrices"]]
    else:
        # Clipe sem malha: os nós continuam (o cliente casa pelo nome do osso).
        for node in doc["nodes"]:
            node.pop("mesh", None)
            node.pop("skin", None)

    for anim in doc["animations"]:
        for sampler in anim["samplers"]:
            sampler["input"] = acc_map[sampler["input"]]
            sampler["output"] = acc_map[sampler["output"]]

    doc["buffers"] = [{"byteLength": len(new_bin)}]
    new_bin.extend(b"\0" * ((4 - len(new_bin) % 4) % 4))
    return doc, bytes(new_bin)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gender", choices=["male", "female"], action="append")
    ap.add_argument("--out", default=str(ASSETS))
    args = ap.parse_args()

    out = Path(args.out)
    manifest_path = (CLIENT_MANIFEST if out.resolve() == ASSETS.resolve() else out / "pair-clips.json")
    client_manifest: dict[str, list[str]] = {}
    if manifest_path.is_file():
        client_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for gender in args.gender or ["male", "female"]:
        source = out / f"character_{gender}.glb"
        if not source.is_file():
            raise SystemExit(f"corpo não encontrado: {source}")
        j, binc = S.read_glb(source)
        names = [anim.get("name", "") for anim in j.get("animations", [])]
        clip_names = [name for name in names if name and name not in BASE_ACTIONS]
        if not clip_names:
            raise SystemExit(
                f"{source.name}: já está dividido (só ações de base). Rode o export antes de dividir."
            )

        clip_dir = out / "clips" / gender
        clip_dir.mkdir(parents=True, exist_ok=True)
        for name in clip_names:
            doc, blob = subset(j, binc, {name}, include_assets=False)
            S.write_glb(clip_dir / f"{name}.glb", doc, blob)
        manifest = {
            "gender": gender,
            "base": sorted(set(names) & BASE_ACTIONS),
            "clips": sorted(clip_names),
        }
        (clip_dir / "index.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

        base_doc, base_blob = subset(j, binc, BASE_ACTIONS, include_assets=True)
        S.write_glb(source, base_doc, base_blob)
        client_manifest[gender] = sorted(clip_names)
        print(
            f"{gender}: {len(clip_names)} clipes em {os.path.relpath(clip_dir, ROOT)} | "
            f"corpo {source.stat().st_size / 1e6:.1f} MB (base: {len(base_doc['animations'])} ações)"
        )

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "/** Gerado por `tools/3dx/split_clips.py` a partir dos clipes extraídos do corpo. */",
        "export const PAIR_CLIPS: Readonly<Record<'male' | 'female', readonly string[]>> = {",
    ]
    for gender in ("male", "female"):
        actions = client_manifest.get(gender, [])
        lines.append(f"  {gender}: [")
        lines.extend(f"    '{action}'," for action in actions)
        lines.append("  ],")
    lines.append("};")
    manifest_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"lista do cliente: {os.path.relpath(manifest_path, ROOT)}")


if __name__ == "__main__":
    main()
