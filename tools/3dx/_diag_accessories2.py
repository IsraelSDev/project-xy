"""List renderers/transforms for project accessory prefabs."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, "tools/3dx")
import lib3dx as L
import project_env as P

root = Path(r"C:\dev\exported\ExportedProject\Assets\Resources")
gender = sys.argv[1]
for name in sys.argv[2:]:
    prefab = root / gender / "cloth" / f"{name}.prefab"
    env = P.ProjectEnv.from_prefab(prefab)
    _, info = L.build_transforms(env)
    print("==", name)
    for obj in env.objects:
        kind = obj.type.name
        if kind not in {"SkinnedMeshRenderer", "MeshRenderer", "MeshFilter", "Transform", "GameObject"}:
            continue
        d = obj.read()
        if kind in {"SkinnedMeshRenderer", "MeshRenderer"}:
            try:
                go = d.m_GameObject.read().m_Name
            except Exception:
                go = "?"
            print(" ", kind, go, "enabled", getattr(d, "m_Enabled", "?"))
        elif kind == "MeshFilter":
            try:
                mesh = d.m_Mesh.read()
                print("  MeshFilter", mesh.m_Name)
            except Exception:
                pass
