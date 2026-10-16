"""
Utilitários de GLB para o pipeline GoE (só stdlib). Usado por optimize_goe.py e verify_goe.py.

- read_glb / write_glb: leitura e escrita de GLB (JSON + BIN).
- merge_identical_skins: funde skins duplicados (o gltf-transform meshopt duplica um skin por malha).
  Só funde se os joints e as matrizes de bind forem idênticos; senão falha.
"""

import json
import struct

GLB_MAGIC = b"glTF"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    with open(path, "rb") as handle:
        data = handle.read()
    magic, version, _length = struct.unpack("<4sII", data[:12])
    if magic != GLB_MAGIC or version != 2:
        raise ValueError(f"{path}: não é GLB 2.0")
    offset = 12
    gltf = None
    binary = b""
    while offset < len(data):
        chunk_len, chunk_type = struct.unpack("<II", data[offset:offset + 8])
        chunk = data[offset + 8:offset + 8 + chunk_len]
        if chunk_type == JSON_CHUNK:
            gltf = json.loads(chunk.decode("utf-8"))
        elif chunk_type == BIN_CHUNK:
            binary = chunk
        offset += 8 + chunk_len
    if gltf is None:
        raise ValueError(f"{path}: sem chunk JSON")
    return gltf, binary


def write_glb(path, gltf, binary):
    payload = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    binary = binary + b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(payload) + (8 + len(binary) if binary else 0)
    out = struct.pack("<4sII", GLB_MAGIC, 2, total)
    out += struct.pack("<II", len(payload), JSON_CHUNK) + payload
    if binary:
        out += struct.pack("<II", len(binary), BIN_CHUNK) + binary
    with open(path, "wb") as handle:
        handle.write(out)


def _ibm_bytes(gltf, binary, skin):
    accessor = gltf["accessors"][skin["inverseBindMatrices"]]
    view = gltf["bufferViews"][accessor["bufferView"]]
    ext = view.get("extensions", {}).get("EXT_meshopt_compression")
    if ext:
        # Com meshopt o conteúdo fica comprimido; compara o bloco de bytes original do BIN.
        offset, length = ext["byteOffset"], ext["byteLength"]
    else:
        offset, length = view.get("byteOffset", 0), view["byteLength"]
    return binary[offset:offset + length], view.get("byteOffset", 0), view.get("byteLength", 0)


def merge_identical_skins(gltf, binary):
    skins = gltf.get("skins", [])
    if len(skins) <= 1:
        return gltf, 0
    first = skins[0]
    first_ibm = _ibm_bytes(gltf, binary, first)[0]
    for skin in skins[1:]:
        if skin["joints"] != first["joints"]:
            raise ValueError("skins com joints diferentes: não é seguro fundir")
        if _ibm_bytes(gltf, binary, skin)[0] != first_ibm:
            raise ValueError("skins com matrizes de bind diferentes: não é seguro fundir")
    merged = 0
    for node in gltf.get("nodes", []):
        if "skin" in node and node["skin"] != 0:
            node["skin"] = 0
            merged += 1
    gltf["skins"] = [first]
    return gltf, merged
