"""Encolhe os GLBs de personagem sem perder qualidade: colapsa canais de animação constantes.

O exportador assa **todas** as transformações de todos os ossos em todos os quadros, então cada
clipe carrega ~966 canais (translação/rotação/escala por osso). Na prática ~80% deles não mudam
nada no clipe inteiro (ossos de prop, face fora dos clipes de beijo, dedos parados) e custam dezenas
de MB. Um canal constante vira duas chaves (primeira e última), o que é **lossless**: o valor é o
mesmo em todos os quadros.

Os acessores originais não são alterados: as versões curtas são acrescentadas ao arquivo e só os
samplers daquele canal passam a apontar para elas. Assim um `input` de tempo compartilhado pelo
clipe inteiro continua intacto para os outros canais.

Uso::

    py -3.11 tools/3dx/slim_glb.py apps/web/public/assets/3dx/character_male.glb --in-place
    py -3.11 tools/3dx/slim_glb.py <glb> --out <saida.glb>

O `export_bodies.py` roda isto no GLB temporário antes de publicar.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

CT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
FMT_SIZE = {"b": 1, "B": 1, "h": 2, "H": 2, "I": 4, "f": 4}

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942

# Tolerância para considerar um canal constante (float32, valores iguais bit a bit na prática).
TOL = 1e-6


def read_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    if raw[:4] != b"glTF":
        raise SystemExit(f"{path}: não é um GLB")
    off = 12
    j: dict | None = None
    binc = b""
    while off < len(raw):
        clen, ctype = struct.unpack_from("<II", raw, off)
        off += 8
        chunk = raw[off : off + clen]
        off += clen
        if ctype == JSON_CHUNK:
            j = json.loads(chunk)
        elif ctype == BIN_CHUNK:
            binc = chunk
    if j is None:
        raise SystemExit(f"{path}: GLB sem chunk JSON")
    return j, binc


def write_glb(path: Path, j: dict, binc: bytes) -> None:
    payload = json.dumps(j, separators=(",", ":")).encode("utf-8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    blob = binc + b"\0" * ((4 - len(binc) % 4) % 4)
    total = 12 + 8 + len(payload) + 8 + len(blob)
    out = bytearray()
    out += b"glTF" + struct.pack("<II", 2, total)
    out += struct.pack("<II", len(payload), JSON_CHUNK) + payload
    out += struct.pack("<II", len(blob), BIN_CHUNK) + blob
    path.write_bytes(out)


def accessor_values(j: dict, binc: bytes, index: int) -> list[tuple[float, ...]]:
    a = j["accessors"][index]
    bv = j["bufferViews"][a["bufferView"]]
    fmt = CT[a["componentType"]]
    n = NC[a["type"]]
    size = FMT_SIZE[fmt]
    base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", size * n)
    return [struct.unpack_from("<" + fmt * n, binc, base + k * stride) for k in range(a["count"])]


def is_constant(values: list[tuple[float, ...]]) -> bool:
    first = values[0]
    for value in values[1:]:
        for a, b in zip(value, first):
            if abs(a - b) > TOL:
                return False
    return True


def pack_values(values: list[tuple[float, ...]], fmt: str) -> bytes:
    out = bytearray()
    for value in values:
        out += struct.pack("<" + fmt * len(value), *value)
    return bytes(out)


def collapse_constant_channels(
    j: dict, binc: bytes
) -> tuple[dict[tuple[int, int], dict], dict[tuple[int, int], dict], dict[str, int]]:
    """Mapeia canais constantes para acessores curtos.

    Devolve `(inputs, outputs, stats)` indexados por `(animação, sampler)`. Cada canal recebe o seu
    próprio par de chaves; os `input` de mesmo clipe são reaproveitados no `rebuild` (mesmos tempos)
    e os `input` originais dos canais que continuam animados ficam intactos.
    """
    inputs: dict[tuple[int, int], dict] = {}
    outputs: dict[tuple[int, int], dict] = {}
    stats = {"channels": 0, "constant": 0, "bytes_before": 0, "bytes_after": 0}
    accessors = j["accessors"]
    for anim_index, anim in enumerate(j.get("animations", [])):
        for sampler_index, sampler in enumerate(anim["samplers"]):
            stats["channels"] += 1
            in_acc = accessors[sampler["input"]]
            out_acc = accessors[sampler["output"]]
            if "bufferView" not in out_acc or out_acc["componentType"] != 5126:
                continue
            before = j["bufferViews"][out_acc["bufferView"]]["byteLength"]
            stats["bytes_before"] += before
            values = accessor_values(j, binc, sampler["output"])
            if len(values) < 3 or not is_constant(values):
                stats["bytes_after"] += before
                continue
            key = (anim_index, sampler_index)
            times = accessor_values(j, binc, sampler["input"])
            inputs[key] = {
                "componentType": in_acc["componentType"],
                "type": in_acc["type"],
                "values": [times[0], times[-1]],
            }
            outputs[key] = {
                "componentType": out_acc["componentType"],
                "type": out_acc["type"],
                "values": [values[0], values[-1]],
            }
            stats["constant"] += 1
            stats["bytes_after"] += FMT_SIZE["f"] * NC[out_acc["type"]] * 2 + FMT_SIZE["f"] * 2
    return inputs, outputs, stats


def rebuild(
    j: dict,
    binc: bytes,
    inputs: dict[tuple[int, int], dict],
    outputs: dict[tuple[int, int], dict],
) -> bytes:
    """Repacka o BIN só com o que continua referenciado e atualiza índices."""
    new_bin = bytearray()
    new_bvs: list[dict] = []
    new_accs: list[dict] = []
    bv_map: dict[int, int] = {}
    acc_map: list[int] = []

    def pad() -> None:
        new_bin.extend(b"\0" * ((4 - len(new_bin) % 4) % 4))

    def copy_bv(old_index: int) -> int:
        if old_index in bv_map:
            return bv_map[old_index]
        bv = dict(j["bufferViews"][old_index])
        start = bv.get("byteOffset", 0)
        length = bv["byteLength"]
        pad()
        bv["byteOffset"] = len(new_bin)
        bv["buffer"] = 0
        new_bin.extend(binc[start : start + length])
        new_bvs.append(bv)
        bv_map[old_index] = len(new_bvs) - 1
        return bv_map[old_index]

    def append_accessor(spec: dict) -> int:
        fmt = CT[spec["componentType"]]
        payload = pack_values(spec["values"], fmt)
        pad()
        offset = len(new_bin)
        new_bin.extend(payload)
        new_bvs.append({"buffer": 0, "byteOffset": offset, "byteLength": len(payload)})
        values = spec["values"]
        acc = {
            "bufferView": len(new_bvs) - 1,
            "componentType": spec["componentType"],
            "count": len(values),
            "type": spec["type"],
        }
        if spec["type"] == "SCALAR":
            # `min`/`max` são obrigatórios em accessors de animação de tempo.
            acc["min"] = [min(v[0] for v in values)]
            acc["max"] = [max(v[0] for v in values)]
        new_accs.append(acc)
        return len(new_accs) - 1

    # Só os accessors ainda referenciados são copiados: o restante (os canais constantes
    # originais) some do BIN junto com o bufferView correspondente.
    live: set[int] = set()
    for mesh in j.get("meshes", []):
        for prim in mesh.get("primitives", []):
            live.update(prim.get("attributes", {}).values())
            if "indices" in prim:
                live.add(prim["indices"])
            for target in prim.get("targets", []):
                live.update(target.values())
    for skin in j.get("skins", []):
        if "inverseBindMatrices" in skin:
            live.add(skin["inverseBindMatrices"])
    for anim_index, anim in enumerate(j.get("animations", [])):
        for sampler_index, sampler in enumerate(anim["samplers"]):
            live.add(sampler["input"])
            if (anim_index, sampler_index) not in outputs:
                live.add(sampler["output"])

    for index, acc in enumerate(j["accessors"]):
        if index not in live:
            acc_map.append(0)
            continue
        acc_map.append(len(new_accs))
        new_acc = dict(acc)
        if "bufferView" in acc:
            new_acc["bufferView"] = copy_bv(acc["bufferView"])
        new_accs.append(new_acc)

    # Um `input` curto por clipe: os canais constantes do mesmo clipe compartilham os tempos.
    input_cache: dict[tuple[int, int, int], int] = {}
    new_inputs: dict[tuple[int, int], int] = {}
    for key in inputs:
        spec = inputs[key]
        times = spec["values"]
        cache_key = (j["animations"][key[0]]["samplers"][key[1]]["input"], len(times), int(times[0][0] * 1e6), int(times[-1][0] * 1e6))
        if cache_key not in input_cache:
            input_cache[cache_key] = append_accessor(spec)
        new_inputs[key] = input_cache[cache_key]
    new_outputs = {key: append_accessor(spec) for key, spec in outputs.items()}

    for image in j.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = copy_bv(image["bufferView"])

    for mesh in j.get("meshes", []):
        for prim in mesh.get("primitives", []):
            for name, acc_index in prim.get("attributes", {}).items():
                prim["attributes"][name] = acc_map[acc_index]
            if "indices" in prim:
                prim["indices"] = acc_map[prim["indices"]]
            for target in prim.get("targets", []):
                for name, acc_index in target.items():
                    target[name] = acc_map[acc_index]

    for skin in j.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = acc_map[skin["inverseBindMatrices"]]

    for anim_index, anim in enumerate(j.get("animations", [])):
        for sampler_index, sampler in enumerate(anim["samplers"]):
            key = (anim_index, sampler_index)
            sampler["input"] = new_inputs.get(key, acc_map[sampler["input"]])
            sampler["output"] = new_outputs.get(key, acc_map[sampler["output"]])

    j["accessors"] = new_accs
    j["bufferViews"] = new_bvs
    j["buffers"] = [{"byteLength": len(new_bin)}]
    pad()
    return bytes(new_bin)


def slim(path: Path, out: Path | None = None) -> tuple[int, int, dict]:
    before = path.stat().st_size
    j, binc = read_glb(path)
    inputs, outputs, stats = collapse_constant_channels(j, binc)
    new_bin = rebuild(j, binc, inputs, outputs)
    dest = out or path
    write_glb(dest, j, new_bin)
    return before, dest.stat().st_size, stats


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("glb", type=Path, help="GLB de personagem")
    ap.add_argument("--out", type=Path, help="saída (padrão: sobrescreve)")
    ap.add_argument("--in-place", action="store_true", help="sobrescreve o arquivo de entrada")
    args = ap.parse_args()
    before, after, stats = slim(args.glb, None if args.in_place else (args.out or args.glb))
    print(
        f"{args.glb.name}: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB "
        f"({100 * (1 - after / before):.0f}% menor); "
        f"{stats['constant']}/{stats['channels']} canais constantes"
    )


if __name__ == "__main__":
    main()
