"""Extract a 3DXChat room scene (level*) with furniture into a room JSON.

The scene file references meshes, materials and textures living in sibling
``sharedassets*.assets``/``resources.assets`` files. This script resolves those
PPtrs, bakes each rendered mesh into world space, groups triangles by material
and writes a static room JSON plus the base-color textures.

Example (the smallest room, a bedroom/dressing room)::

    py -3.11 tools/3dx/extract_room.py \
        --scene "C:/.../3DXChat_Data/level20" \
        --name home \
        --out tools/3dx/build/home.json \
        --texdir tools/3dx/build/home_textures
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import UnityPy
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler

import lib3dx as L

DEFAULT_ROOTS = ("ROOM", "FURNITURE", "FURNITURE DYNAMIC", "LIGHTS")
SKIP_WORDS = (
    "collider",
    "invisible",
    "cage",
    "reflection",
    "probe",
    "volume",
    "respawn",
    "spawn",
    "camera",
    "audio",
    "sound",
    "script",
    "gui",
    "canvas",
    "vr ",
)


def skip_transform_name(name: str) -> bool:
    """Skip editor helpers by name, except visible floors (the club floor is called
    ``collider_floor`` but carries the real concrete/tile floor materials)."""
    lower = name.lower()
    if "collider" in lower and "floor" in lower:
        return False
    return any(word in lower for word in SKIP_WORDS)


def scale_matrix(s: list[float]) -> list[list[float]]:
    return [
        [s[0], 0, 0, 0],
        [0, s[1], 0, 0],
        [0, 0, s[2], 0],
        [0, 0, 0, 1],
    ]


def world_matrix(info: dict, pid: int, memo: dict) -> list[list[float]]:
    if pid in memo:
        return memo[pid]
    item = info[pid]
    local = L.mm4(
        L.m4(L.mat_from_q(item["rot"]), item["pos"]),
        scale_matrix(item["scale"]),
    )
    parent = item["parent"]
    matrix = L.mm4(world_matrix(info, parent, memo), local) if parent is not None else local
    memo[pid] = matrix
    return matrix


def descendants(info: dict, root: int) -> set[int]:
    children: dict[int, list[int]] = {}
    for pid, item in info.items():
        children.setdefault(item["parent"], []).append(pid)
    out: set[int] = set()
    stack = [root]
    while stack:
        pid = stack.pop()
        if pid in out:
            continue
        out.add(pid)
        stack.extend(children.get(pid, []))
    return out


def transform_point(matrix: list[list[float]], v: list[float]) -> list[float]:
    return [
        sum(matrix[r][c] * v[c] for c in range(3)) + matrix[r][3]
        for r in range(3)
    ]


def transform_normal(matrix: list[list[float]], n: list[float]) -> list[float]:
    out = [sum(matrix[r][c] * n[c] for c in range(3)) for r in range(3)]
    length = math.sqrt(sum(c * c for c in out)) or 1.0
    return [c / length for c in out]


def to_blender(v: list[float]) -> list[float]:
    # Unity Y-up -> Blender Z-up (same P bridge as the avatar pipeline).
    return [v[0], -v[2], v[1]]


class Resolver:
    def __init__(self, scene_path: Path):
        self.scene_path = scene_path
        self.base = scene_path.parent
        self.envs: dict[int, object] = {}
        self.scene = UnityPy.load(str(scene_path))
        self.envs[0] = self.scene
        for index, external in enumerate(self.scene.file.externals, 1):
            path = self.base / external.path
            if not path.exists() or path.stat().st_size > 220 * 1024 * 1024:
                continue
            try:
                self.envs[index] = UnityPy.load(str(path))
            except Exception as error:
                print(f"  ! dependency {external.path}: {error}")
        print(f"  dependencies: {len(self.envs)} files")
        self._objects: dict[tuple[int, int], object | None] = {}
        self._index: dict[int, dict[int, object]] = {}
        for file_id, env in self.envs.items():
            self._index[file_id] = {obj.path_id: obj for obj in env.objects}

    def object(self, file_id: int, path_id: int):
        key = (file_id, path_id)
        if key in self._objects:
            return self._objects[key]
        obj = self._index.get(file_id, {}).get(path_id)
        found = obj.read() if obj is not None else None
        self._objects[key] = found
        return found

    def pptr(self, pptr, base_file: int = 0):
        return self.object(pptr.m_FileID if pptr.m_FileID else base_file, pptr.m_PathID)


def save_texture(texture, path: Path, mode: str, max_size: int) -> None:
    image = texture.image
    alpha = mode in ("cutout", "blend")
    image = image.convert("RGBA" if alpha else "RGB")
    if max(image.size) > max_size:
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    if alpha:
        image.save(path, optimize=True)
    else:
        image.save(path, quality=88, optimize=True)


def material_spec(
    material, resolver: Resolver, texdir: Path, max_size: int, mat_file: int
) -> dict:
    floats = {key.name: float(value) for key, value in material.m_SavedProperties.m_Floats}
    colors = {key.name: value for key, value in material.m_SavedProperties.m_Colors}
    mode_value = int(round(floats.get("_Mode", 0)))
    name = material.m_Name
    lower = name.lower()
    if mode_value == 1:
        alpha_mode = "cutout"
    elif mode_value in (2, 3):
        alpha_mode = "blend"
    else:
        alpha_mode = "opaque"
    if any(word in lower for word in ("glass", "window", "mirror")) and alpha_mode == "opaque":
        alpha_mode = "blend"

    color = colors.get("_Color")
    rgba = [color.r, color.g, color.b, color.a] if color is not None else [1.0, 1.0, 1.0, 1.0]
    if alpha_mode == "opaque":
        rgba[3] = 1.0
    elif rgba[3] <= 0.001:
        # The source uses alpha 0 for some lamp/window glasses; keep them visible.
        rgba[3] = 0.28

    texture = None
    for key, value in material.m_SavedProperties.m_TexEnvs:
        if key.name != "_MainTex" or getattr(value.m_Texture, "path_id", 0) == 0:
            continue
        texture = resolver.pptr(value.m_Texture, mat_file)
        break

    texture_name = None
    if texture is not None:
        safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in texture.m_Name)[:60]
        suffix = ".png" if alpha_mode != "opaque" else ".jpg"
        path = texdir / f"{safe}{suffix}"
        if not path.exists():
            save_texture(texture, path, alpha_mode, max_size)
        try:
            texture_name = str(path.relative_to(texdir.parent))
        except ValueError:
            texture_name = path.name
        print(f"  material {name}: {texture.m_Name} -> {texture_name}")

    glossiness = floats.get("_Glossiness", 0.5)
    return {
        "name": name,
        "texture": texture_name,
        "alphaMode": alpha_mode,
        "cutoff": floats.get("_Cutoff", 0.5),
        "color": [round(c, 4) for c in rgba],
        "roughness": round(1.0 - glossiness, 4),
        "metallic": round(floats.get("_Metallic", 0.0), 4),
        "doubleSided": any(word in lower for word in ("glass", "window", "mirror")),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scene", required=True, help="level file with the room")
    ap.add_argument("--name", required=True, help="room id used in mesh/material names")
    ap.add_argument("--out", required=True, help="output JSON")
    ap.add_argument("--texdir", required=True, help="texture output folder")
    ap.add_argument("--roots", nargs="+", default=list(DEFAULT_ROOTS))
    ap.add_argument("--max-texture", type=int, default=512)
    args = ap.parse_args()

    scene_path = Path(args.scene).resolve()
    resolver = Resolver(scene_path)
    _, info = L.build_transforms(resolver.scene)
    go_of_transform: dict[int, object] = {}
    go_to_transform: dict[int, int] = {}
    mesh_filter_of_transform: dict[int, object] = {}
    mesh_renderer_of_transform: dict[int, object] = {}
    for obj in resolver.scene.objects:
        if obj.type.name != "Transform":
            continue
        try:
            transform = obj.read()
            go = transform.m_GameObject.read()
            go_of_transform[obj.path_id] = go
            go_to_transform[transform.m_GameObject.path_id] = obj.path_id
        except Exception:
            pass
    for obj in resolver.scene.objects:
        if obj.type.name == "MeshFilter":
            value = obj.read()
            transform_pid = go_to_transform.get(value.m_GameObject.path_id)
            if transform_pid is not None:
                mesh_filter_of_transform[transform_pid] = value
        elif obj.type.name == "MeshRenderer":
            value = obj.read()
            transform_pid = go_to_transform.get(value.m_GameObject.path_id)
            if transform_pid is not None:
                mesh_renderer_of_transform[transform_pid] = value

    included: set[int] = set()
    for pid, item in info.items():
        if item["parent"] is None and item["name"] in args.roots:
            included |= descendants(info, pid)
    print(f"  roots {args.roots}: {len(included)} transforms")

    # LODs: incluir só o LOD0 de cada LODGroup; os LOD1+ são a mesma mobília mais simples.
    lod0: set[int] = set()
    lod_other: set[int] = set()
    for obj in resolver.scene.objects:
        if obj.type.name != "LODGroup":
            continue
        group = obj.read()
        for level_index, lod in enumerate(getattr(group, "m_LODs", [])):
            for renderer_ref in getattr(lod, "renderers", []):
                try:
                    renderer = renderer_ref.read()
                    transform_pid = go_to_transform.get(renderer.m_GameObject.path_id)
                except Exception:
                    continue
                if transform_pid is None:
                    continue
                (lod0 if level_index == 0 else lod_other).add(transform_pid)

    texdir = Path(args.texdir)
    materials: dict[str, dict] = {}
    material_ids: dict[tuple[int, int], str] = {}
    groups: dict[str, dict] = {}
    matrices: dict[int, list[list[float]]] = {}
    skipped = 0
    rendered = 0
    processed = 0

    for pid in sorted(included):
        processed += 1
        if processed % 25 == 0:
            print(f"  … {processed}/{len(included)} transforms, {rendered} submeshes", flush=True)
        mf = mesh_filter_of_transform.get(pid)
        if mf is None:
            continue
        name = info[pid]["name"]
        if skip_transform_name(name):
            skipped += 1
            continue
        if pid in lod_other and pid not in lod0:
            skipped += 1
            continue
        go = go_of_transform.get(pid)
        if go is not None and not getattr(go, "m_IsActive", True):
            skipped += 1
            continue
        renderer = mesh_renderer_of_transform.get(pid)
        if renderer is None or not getattr(renderer, "m_Enabled", True):
            skipped += 1
            continue

        mesh = resolver.pptr(mf.m_Mesh)
        if mesh is None:
            skipped += 1
            continue
        try:
            handler = MeshHandler(mesh)
            handler.process()
        except Exception as error:
            print(f"  ! {name}: mesh error {error}")
            skipped += 1
            continue
        triangles = handler.get_triangles()
        if not triangles or not handler.m_Vertices:
            skipped += 1
            continue

        matrix = world_matrix(info, pid, matrices)
        material_refs = list(renderer.m_Materials)
        batch = getattr(renderer, "m_StaticBatchInfo", None)
        if batch is not None and getattr(batch, "subMeshCount", 0):
            # Static batching already baked the object transform into the combined mesh;
            # applying the renderer transform again (some props have scale 100) explodes it.
            matrix = L.I4
            selected = [
                (index, triangles[index])
                for index in range(
                    batch.firstSubMesh, batch.firstSubMesh + batch.subMeshCount
                )
                if index < len(triangles)
            ]
            material_offset = batch.firstSubMesh
        else:
            selected = list(enumerate(triangles))
            material_offset = 0

        for submesh_index, submesh in selected:
            if not submesh:
                continue
            material = None
            if material_refs:
                material_index = min(
                    max(0, submesh_index - material_offset), len(material_refs) - 1
                )
                ref = material_refs[material_index]
                material = resolver.pptr(ref)
            if material is not None and "default" in material.m_Name.lower():
                # Placeholders/cages from the editor; they render as opaque white boxes.
                continue
            if material is None:
                material_key = f"{args.name}_default"
                if material_key not in materials:
                    materials[material_key] = {
                        "name": "Default",
                        "texture": None,
                        "alphaMode": "opaque",
                        "cutoff": 0.5,
                        "color": [1, 1, 1, 1],
                        "roughness": 0.7,
                        "metallic": 0.0,
                    }
            else:
                ref_key = (ref.m_FileID, ref.m_PathID)
                material_key = material_ids.get(ref_key)
                if material_key is None:
                    material_key = f"{args.name}_{len(materials):03d}_{material.m_Name}"
                    material_ids[ref_key] = material_key
                    materials[material_key] = material_spec(
                        material,
                        resolver,
                        texdir,
                        args.max_texture,
                        ref.m_FileID or 0,
                    )
            group = groups.setdefault(
                material_key,
                {"name": f"{args.name}_{material_key}", "material": material_key,
                 "verts": [], "normals": [], "uvs": [], "indices": []},
            )
            # A combined/static-batched mesh has thousands of vertices but each renderer
            # uses one small submesh. Transform only the vertices this submesh references.
            used = sorted({int(index) for triangle in submesh for index in triangle})
            local = {old: new for new, old in enumerate(used)}
            base = len(group["verts"])
            verts = handler.m_Vertices
            normals = handler.m_Normals or []
            uvs = handler.m_UV0 or []
            for vi in used:
                world = transform_point(matrix, list(verts[vi]))
                group["verts"].append([round(c, 5) for c in to_blender(world)])
                if vi < len(normals):
                    normal = transform_normal(matrix, list(normals[vi]))
                    group["normals"].append([round(c, 5) for c in to_blender(normal)])
                else:
                    group["normals"].append([0.0, 0.0, 1.0])
                group["uvs"].append(list(uvs[vi]) if vi < len(uvs) else [0.0, 0.0])
            for tri in submesh:
                group["indices"].extend([base + local[int(i)] for i in tri])
            rendered += 1

    meshes = [group for group in groups.values() if group["indices"]]
    total_verts = sum(len(mesh["verts"]) for mesh in meshes)
    total_tris = sum(len(mesh["indices"]) // 3 for mesh in meshes)
    print(f"  meshes: {len(meshes)} groups, {total_verts} verts, {total_tris} tris, {skipped} skipped")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({"name": args.name, "materials": materials, "meshes": meshes}),
        encoding="utf-8",
    )
    print(f"[room] wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
