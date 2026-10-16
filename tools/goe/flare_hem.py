"""
Afasta a barra de uma camiseta do corpo (radialmente em X/Z) para ela ficar por cima da cintura da calça.

Uso:
    python tools/goe/flare_hem.py <entrada.glb> <saida.glb> [--delta 0.03] [--y-full 1.12] [--y-fade 1.22]

Motivo: a camiseta Fitness foi modelada para o shorts Fitness (cintura ~1 cm por dentro da camiseta). Com a calça
Street, mais larga, os raios coincidem numa faixa de ~21 cm e a calça fura a camiseta em manchas. Aqui o torso
inferior ganha `delta` metros de folga até `y-full`, com queda suave até `y-fade` (acima da cintura da calça).
Só vértices do torso (|x| < 0.30) são movidos: mangas e gola ficam como estão. É um ajuste de caimento do
pacote, aplicado depois do export, do FK e do remap de ombro.
"""

import argparse
import math
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from glb_tools import read_glb, write_glb  # noqa: E402

FLOAT = 5126
TORSO_HALF_WIDTH = 0.30


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def flare(gltf, binary, delta, y_full, y_fade):
    moved = 0
    done = set()
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            idx = prim["attributes"]["POSITION"]
            if idx in done:
                continue
            done.add(idx)
            acc = gltf["accessors"][idx]
            if acc["componentType"] != FLOAT:
                raise SystemExit("POSITION não é float32")
            bv = gltf["bufferViews"][acc["bufferView"]]
            off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
            stride = bv.get("byteStride", 12)
            pts = [list(struct.unpack_from("<3f", binary, off + stride * i)) for i in range(acc["count"])]
            torso = [p for p in pts if abs(p[0]) < TORSO_HALF_WIDTH and p[1] <= y_fade]
            if not torso:
                continue
            zc = (min(p[2] for p in torso) + max(p[2] for p in torso)) / 2.0  # eixo do tronco em Z
            for i, p in enumerate(pts):
                x, y, z = p
                if abs(x) >= TORSO_HALF_WIDTH or y > y_fade:
                    continue
                push = delta * (1.0 - smoothstep((y - y_full) / (y_fade - y_full)))
                if push <= 1e-6:
                    continue
                dz = z - zc
                r = math.hypot(x, dz)
                if r < 1e-6:
                    continue
                p[0] = x + x / r * push
                p[2] = z + dz / r * push
                struct.pack_into("<3f", binary, off + stride * i, *p)
                moved += 1
            for c, name in enumerate(("min", "max")):
                acc[name] = [(min if name == "min" else max)(q[k] for q in (struct.unpack_from("<3f", binary, off + stride * i) for i in range(acc["count"]))) for k in range(3)]
    return moved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--delta", type=float, default=0.03)
    parser.add_argument("--y-full", type=float, default=1.12)
    parser.add_argument("--y-fade", type=float, default=1.22)
    args = parser.parse_args()
    gltf, binary = read_glb(args.source)
    binary = bytearray(binary)
    moved = flare(gltf, binary, args.delta, args.y_full, args.y_fade)
    write_glb(args.target, gltf, bytes(binary))
    print(f"FLARE_OK {args.target} ({moved} vértices afastados, delta={args.delta} m)")


if __name__ == "__main__":
    main()
