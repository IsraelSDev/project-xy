"""Small launcher so the Blender steps are one reproducible command.

    python tools/3dx/run_blender.py export_glb.py -- --json <in.json> --out <out.glb>

Finds Blender via ``--blender``, ``$BLENDER`` or the default install path
(plan section 2, rule 8). The ``--`` separates this launcher's args from the
Blender script's args.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

DEFAULT_BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("script", help="script inside tools/3dx, e.g. export_glb.py")
    ap.add_argument("--blender", default=os.environ.get("BLENDER", DEFAULT_BLENDER))
    args, rest = ap.parse_known_args()

    blender = Path(args.blender)
    if not blender.exists():
        raise SystemExit(f"Blender not found at {blender}; pass --blender or set $BLENDER")

    script = Path(__file__).parent / args.script
    if not script.exists():
        raise SystemExit(f"script not found: {script}")

    cmd = [str(blender), "-b", "--factory-startup", "--python", str(script), "--", *rest]
    print(" ".join(f'"{c}"' if " " in c else c for c in cmd))
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
