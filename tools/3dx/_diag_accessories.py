"""List SMR meshes inside project accessory prefabs."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, "tools/3dx")
import lib3dx as L
import project_env as P

root = Path(r"C:\dev\exported\ExportedProject\Assets\Resources")
gender = sys.argv[1] if len(sys.argv) > 1 else "man"
names = sys.argv[2:] or [
    "hat_flat",
    "hat_bunny",
    "hat_horns",
    "hat_witch",
    "hat_wool",
    "glasses_1",
    "glasses_2",
    "glasses_3",
    "glasses_4",
    "glasses_5",
    "mask_1",
    "mask_2",
    "mask_3",
    "mask_4",
    "mask_5",
    "collar_1",
    "collar_2",
    "collar_3",
    "collar_4",
    "collar_5",
    "headphones",
    "necklace_1",
]
for name in names:
    prefab = root / gender / "cloth" / f"{name}.prefab"
    if not prefab.exists():
        print(name, "MISSING")
        continue
    try:
        env = P.ProjectEnv.from_prefab(prefab)
        _, info = L.build_transforms(env)
        rows = []
        for obj in env.objects:
            if obj.type.name != "SkinnedMeshRenderer":
                continue
            smr = obj.read()
            mesh = smr.m_Mesh.read()
            go = smr.m_GameObject.read()
            rows.append((mesh.m_Name, len(smr.m_Bones), go.m_Name))
        print(name, "->", rows)
    except Exception as exc:
        print(name, "ERROR", type(exc).__name__, exc)
