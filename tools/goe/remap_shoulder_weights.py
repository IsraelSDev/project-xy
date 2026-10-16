"""
Passa a influência de shoulder.l/r para arm_stretch.l/r nos vértices da manga de uma roupa.

Uso:
    python tools/goe/remap_shoulder_weights.py <entrada.glb> <saida.glb>

Motivo: a pose procedural do GoE dirige arm_stretch (braço), mas não shoulder.*. Na roupa, parte dos
vértices da manga está presa a shoulder.*, então o cap da manga fica no repouso (horizontal) enquanto o braço
desce. Aqui o peso de shoulder.X vai para arm_stretch.X.

Só o que está perto do cap da manga é remapeado: a fração movida cresce de 0 a 1 entre `pivô - FADE` e o pivô
do braço (|x| do arm_stretch). A gola e o pescoço, mais para dentro, ficam presos ao ombro. Remapear tudo faz a
gola subir junto com o braço quando ele desce (a cabeça "afunda" na roupa). Os pesos são renormalizados para
somar 1 e o corpo não é alterado.
"""

import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from glb_tools import read_glb, world_matrices, write_glb  # noqa: E402

UBYTE = 5121
FLOAT = 5126
PAIRS = {"shoulder.l": "arm_stretch.l", "shoulder.r": "arm_stretch.r"}
FADE = 0.12  # m: largura da transição, para dentro a partir do pivô do braço


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def remap(gltf, binary):
    nodes = gltf["nodes"]
    skin = gltf["skins"][0]
    names = [nodes[j].get("name", "") for j in skin["joints"]]
    index = {name: i for i, name in enumerate(names)}
    for src, dst in PAIRS.items():
        if src not in index or dst not in index:
            raise SystemExit(f"joint ausente para remapear: {src} -> {dst}")
    remap_src = {index[src]: index[dst] for src, dst in PAIRS.items()}

    worlds = world_matrices(nodes)
    node_of = {nodes[j].get("name", ""): j for j in skin["joints"]}
    pivot = abs(worlds[node_of["arm_stretch.l"]][0][3])  # |x| do pivô do braço no repouso

    changed = 0
    done = set()
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            attrs = prim["attributes"]
            key = (attrs["POSITION"], attrs["JOINTS_0"], attrs["WEIGHTS_0"])
            if key in done:
                continue
            done.add(key)
            pa = gltf["accessors"][attrs["POSITION"]]
            ja = gltf["accessors"][attrs["JOINTS_0"]]
            wa = gltf["accessors"][attrs["WEIGHTS_0"]]
            if pa["componentType"] != FLOAT or ja["componentType"] != UBYTE or wa["componentType"] != FLOAT:
                raise SystemExit("formato de POSITION/JOINTS_0/WEIGHTS_0 não suportado (esperado FLOAT/UBYTE/FLOAT)")
            pbv, jbv, wbv = (gltf["bufferViews"][a["bufferView"]] for a in (pa, ja, wa))
            if "byteStride" in jbv or "byteStride" in wbv:
                raise SystemExit("JOINTS_0/WEIGHTS_0 intercalados: não suportado")
            poff = pbv.get("byteOffset", 0) + pa.get("byteOffset", 0)
            pstride = pbv.get("byteStride", 12)
            joff = jbv.get("byteOffset", 0) + ja.get("byteOffset", 0)
            woff = wbv.get("byteOffset", 0) + wa.get("byteOffset", 0)
            for v in range(ja["count"]):
                js = list(struct.unpack_from("<4B", binary, joff + 4 * v))
                ws = list(struct.unpack_from("<4f", binary, woff + 16 * v))
                if not any(j in remap_src and w > 0.0 for j, w in zip(js, ws)):
                    continue
                x = struct.unpack_from("<f", binary, poff + pstride * v)[0]
                move = smoothstep((abs(x) - (pivot - FADE)) / FADE)
                merged = {}
                for j, w in zip(js, ws):
                    if w <= 0.0:
                        continue
                    if j in remap_src:
                        merged[remap_src[j]] = merged.get(remap_src[j], 0.0) + w * move
                        merged[j] = merged.get(j, 0.0) + w * (1.0 - move)
                    else:
                        merged[j] = merged.get(j, 0.0) + w
                top = sorted(((j, w) for j, w in merged.items() if w > 0.0), key=lambda kv: -kv[1])[:4]
                total = sum(w for _, w in top) or 1.0
                new_j = [j for j, _ in top] + [0] * (4 - len(top))
                new_w = [w / total for _, w in top] + [0.0] * (4 - len(top))
                struct.pack_into("<4B", binary, joff + 4 * v, *new_j)
                struct.pack_into("<4f", binary, woff + 16 * v, *new_w)
                changed += 1
    return changed, pivot


def main():
    if len(sys.argv) != 3:
        raise SystemExit("uso: remap_shoulder_weights.py <entrada.glb> <saida.glb>")
    source, target = sys.argv[1], sys.argv[2]
    gltf, binary = read_glb(source)
    binary = bytearray(binary)
    changed, pivot = remap(gltf, binary)
    write_glb(target, gltf, bytes(binary))
    print(f"REMAP_OK {target} ({changed} vértices ajustados, pivô |x|={pivot:.3f}, transição {FADE} m)")


if __name__ == "__main__":
    main()
