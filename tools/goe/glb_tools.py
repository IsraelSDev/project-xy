"""
Utilitários de GLB para o pipeline GoE (só stdlib). Usado por optimize_goe.py e verify_goe.py.

- read_glb / write_glb: leitura e escrita de GLB (JSON + BIN).
- merge_identical_skins: funde skins duplicados (o gltf-transform meshopt duplica um skin por malha).
  Só funde se os joints e as matrizes de bind forem idênticos; senão falha.
- node_matrix / world_matrices / mat_mul / mat_inverse / decompose_trs: álgebra de nós glTF (matrizes 4x4
  como listas de linhas), usada para reparentar ossos sem mudar o repouso no mundo.
"""

import json
import math
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


def _rotation_matrix(qx, qy, qz, qw):
    return [
        [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
        [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
        [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
    ]


def node_matrix(node):
    """Matriz 4x4 (lista de linhas) do nó, a partir de `matrix` ou de translation/rotation/scale."""
    if "matrix" in node:
        m = node["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    tx, ty, tz = node.get("translation", [0.0, 0.0, 0.0])
    sx, sy, sz = node.get("scale", [1.0, 1.0, 1.0])
    r = _rotation_matrix(*node.get("rotation", [0.0, 0.0, 0.0, 1.0]))
    return [
        [r[0][0] * sx, r[0][1] * sy, r[0][2] * sz, tx],
        [r[1][0] * sx, r[1][1] * sy, r[1][2] * sz, ty],
        [r[2][0] * sx, r[2][1] * sy, r[2][2] * sz, tz],
        [0.0, 0.0, 0.0, 1.0],
    ]


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def mat_inverse(m):
    """Inversa 4x4 por Gauss-Jordan com pivô parcial."""
    n = 4
    aug = [list(map(float, m[i])) + [1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(aug[r][col]))
        if abs(aug[pivot][col]) < 1e-12:
            raise ValueError("matriz singular")
        aug[col], aug[pivot] = aug[pivot], aug[col]
        div = aug[col][col]
        aug[col] = [v / div for v in aug[col]]
        for r in range(n):
            if r != col and aug[r][col] != 0.0:
                factor = aug[r][col]
                aug[r] = [aug[r][k] - factor * aug[col][k] for k in range(2 * n)]
    return [row[n:] for row in aug]


def decompose_trs(m):
    """Separa a matriz em (translation, rotation xyzw, scale). Escala negativa vai em X (espelhamento)."""
    translation = [m[0][3], m[1][3], m[2][3]]
    scale = [math.sqrt(sum(m[r][c] ** 2 for r in range(3))) for c in range(3)]
    det = (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
           - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
           + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
    if det < 0:
        scale[0] = -scale[0]
    rot = [[m[r][c] / scale[c] for c in range(3)] for r in range(3)]
    trace = rot[0][0] + rot[1][1] + rot[2][2]
    if trace > 0:
        s = math.sqrt(trace + 1.0) * 2
        q = [(rot[2][1] - rot[1][2]) / s, (rot[0][2] - rot[2][0]) / s, (rot[1][0] - rot[0][1]) / s, 0.25 * s]
    elif rot[0][0] > rot[1][1] and rot[0][0] > rot[2][2]:
        s = math.sqrt(1.0 + rot[0][0] - rot[1][1] - rot[2][2]) * 2
        q = [0.25 * s, (rot[0][1] + rot[1][0]) / s, (rot[0][2] + rot[2][0]) / s, (rot[2][1] - rot[1][2]) / s]
    elif rot[1][1] > rot[2][2]:
        s = math.sqrt(1.0 + rot[1][1] - rot[0][0] - rot[2][2]) * 2
        q = [(rot[0][1] + rot[1][0]) / s, 0.25 * s, (rot[1][2] + rot[2][1]) / s, (rot[0][2] - rot[2][0]) / s]
    else:
        s = math.sqrt(1.0 + rot[2][2] - rot[0][0] - rot[1][1]) * 2
        q = [(rot[0][2] + rot[2][0]) / s, (rot[1][2] + rot[2][1]) / s, 0.25 * s, (rot[1][0] - rot[0][1]) / s]
    norm = math.sqrt(sum(v * v for v in q))
    return translation, [v / norm for v in q], scale


def parent_map(nodes):
    parent = {}
    for i, node in enumerate(nodes):
        for child in node.get("children", []):
            parent[child] = i
    return parent


def world_matrices(nodes):
    """Matriz de mundo de cada nó (em relação à raiz da cena), seguindo a hierarquia atual."""
    parent = parent_map(nodes)
    cache = {}

    def world(i):
        if i not in cache:
            local = node_matrix(nodes[i])
            cache[i] = local if i not in parent else mat_mul(world(parent[i]), local)
        return cache[i]

    return [world(i) for i in range(len(nodes))]
