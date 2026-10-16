"""
Otimiza um GLB exportado pelo export_goe.py (sem alterar material, morph ou osso).

Uso:
    python tools/goe/optimize_goe.py <entrada.glb> <saida.glb> [--texture-size 1024]

Passos (ver docs/guides/goe-pipeline.md):
    weld -> prune -> resize (texturas) -> meshopt -> fusão de skins duplicados.

Não usar `quantize`: nesta versão do gltf-transform ele também duplica os skins, e a fusão
não recupera o mesmo resultado com segurança.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from glb_tools import merge_identical_skins, read_glb, write_glb  # noqa: E402

GLTF_TRANSFORM = ["npx", "-y", "@gltf-transform/cli@4.5.1"]


def run(args):
    # shell=True: no Windows o npx é um .cmd, que o CreateProcess sem shell não acha.
    result = subprocess.run(" ".join(GLTF_TRANSFORM + args), shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"gltf-transform falhou: {' '.join(args)}\n{result.stderr or result.stdout}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--texture-size", type=int, default=1024)
    # Simplificação de malha (lossy). 0 = não aplica. Usar só quando o orçamento pedir.
    parser.add_argument("--simplify-ratio", type=float, default=0.0)
    args = parser.parse_args()

    work = tempfile.mkdtemp(prefix="goe-opt-")
    try:
        weld = os.path.join(work, "1-weld.glb")
        prune = os.path.join(work, "2-prune.glb")
        resize = os.path.join(work, "3-resize.glb")
        packed = os.path.join(work, "4-meshopt.glb")
        run(["weld", args.source, weld])
        run(["prune", weld, prune])
        run(["resize", prune, resize, "--width", str(args.texture_size), "--height", str(args.texture_size)])
        source_for_meshopt = resize
        if args.simplify_ratio > 0:
            simplified = os.path.join(work, "3b-simplify.glb")
            run(["simplify", resize, simplified, "--ratio", str(args.simplify_ratio), "--error", "0.01"])
            source_for_meshopt = simplified
        run(["meshopt", source_for_meshopt, packed])

        gltf, binary = read_glb(packed)
        gltf, merged = merge_identical_skins(gltf, binary)
        write_glb(args.target, gltf, binary)
        print(f"OK {args.target} ({os.path.getsize(args.target) / 1e6:.2f} MB, nós com skin ajustados: {merged})")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
