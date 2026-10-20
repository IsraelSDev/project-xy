"""Extract a 3DXChat room from the exported Unity project into a room JSON.

This is the project-source counterpart of ``extract_room.py`` (bundle path). The
scene is a ``.unity`` YAML file; meshes, materials and textures resolve by GUID
through the project's ``.meta`` index, the same way ``project_env`` reads the
avatar. The output contract is identical, so ``export_room_glb.py`` does not
change.

Example (the dressing room used as the closet)::

    py -3.11 tools/3dx/extract_room_project.py \
        --scene "C:/dev/exported/ExportedProject/Assets/scenes/char_editor_decor.unity" \
        --name room20 \
        --out tools/3dx/build/project/room20.json \
        --texdir tools/3dx/build/project/room20_textures --max-texture 512

The club (balada) uses explicit roots::

    ... --scene ".../scenes/club.unity" --name club7 \
        --roots LEVEL bar_1 dj_pult coctail1 coctail2 coctail3 ...

See ``docs/guides/3dx-projeto-exportado.md`` and ``tools/3dx/README.md``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

import lib3dx as L
import project_env as P
from extract_room import (
    DEFAULT_ROOTS,
    SKIP_WORDS,
    descendants,
    to_blender,
    transform_normal,
    transform_point,
    world_matrix,
)

DEFAULT_TEXTURE_SIZE = 512


def _field(node, name, default):
    try:
        return getattr(node, name)
    except AttributeError:
        return default


def _safe_name(name: str, limit: int = 60) -> str:
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in name)[:limit]


def _save_image(source: Path, target: Path, alpha: bool, max_size: int) -> None:
    image = Image.open(source)
    image.load()
    image = image.convert("RGBA" if alpha else "RGB")
    if max(image.size) > max_size:
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    if alpha:
        image.save(target, optimize=True)
    else:
        image.save(target, quality=88, optimize=True)


def material_spec(
    material,
    env: P.ProjectEnv,
    texdir: Path,
    max_size: int,
    texture_names: dict[str, str],
) -> dict:
    properties = _field(material, "m_SavedProperties", None)
    floats = {}
    colors = {}
    texenvs = []
    if properties is not None:
        for entry in _field(properties, "m_Floats", []):
            floats[entry.first.name] = float(entry.second)
        for entry in _field(properties, "m_Colors", []):
            color = entry.second
            colors[entry.first.name] = [
                float(color.r),
                float(color.g),
                float(color.b),
                float(color.a),
            ]
        texenvs = _field(properties, "m_TexEnvs", [])

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

    rgba = list(colors.get("_Color", [1.0, 1.0, 1.0, 1.0]))
    if alpha_mode == "opaque":
        rgba[3] = 1.0
    elif rgba[3] <= 0.001:
        # The source uses alpha 0 for some lamp/window glasses; keep them visible.
        rgba[3] = 0.28

    texture_name = None
    for entry in texenvs:
        if entry.first.name != "_MainTex":
            continue
        reference = entry.second.m_Texture
        path = env.asset_path(reference.guid)
        if path is None or not path.exists():
            break
        alpha = alpha_mode != "opaque"
        suffix = ".png" if alpha else ".jpg"
        safe = _safe_name(path.stem)
        target = texdir / f"{safe}{suffix}"
        texture_name = texture_names.get(str(path))
        if texture_name is None:
            texture_name = (
                f"{texdir.name}/{target.name}"
                if target.parent == texdir
                else str(target.relative_to(texdir.parent))
            )
            texture_names[str(path)] = texture_name
        if not target.exists():
            _save_image(path, target, alpha, max_size)
        print(f"  material {name}: {path.name} -> {texture_name}")
        break

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


class MeshCache:
    def __init__(self, env: P.ProjectEnv):
        self.env = env
        self.cache: dict[tuple[str | None, int], dict | None] = {}

    def get(self, reference) -> dict | None:
        key = (reference.guid, reference.path_id)
        if key not in self.cache:
            mesh = reference.read()
            if mesh is None:
                self.cache[key] = None
            else:
                self.cache[key] = P.extract_mesh_project(mesh, with_submeshes=True)
        return self.cache[key]


class MaterialCache:
    def __init__(self, env: P.ProjectEnv, texdir: Path, max_size: int):
        self.env = env
        self.texdir = texdir
        self.max_size = max_size
        self.materials: dict[str, dict] = {}
        self.by_reference: dict[tuple[str | None, int], str] = {}
        self.texture_names: dict[str, str] = {}

    def get(self, reference, name: str) -> tuple[str, dict]:
        key = (reference.guid, reference.path_id)
        material_key = self.by_reference.get(key)
        if material_key is not None:
            return material_key, self.materials[material_key]
        material = reference.read()
        if material is None:
            raise ValueError(f"material {name!r} could not be read")
        material_key = f"{name}_{len(self.materials):03d}_{material.m_Name}"
        self.by_reference[key] = material_key
        self.materials[material_key] = material_spec(
            material, self.env, self.texdir, self.max_size, self.texture_names
        )
        return material_key, self.materials[material_key]


def default_material(room: str) -> tuple[str, dict]:
    key = f"{room}_default"
    return key, {
        "name": "Default",
        "texture": None,
        "alphaMode": "opaque",
        "cutoff": 0.5,
        "color": [1, 1, 1, 1],
        "roughness": 0.7,
        "metallic": 0.0,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scene", required=True, help=".unity scene with the room")
    ap.add_argument("--name", required=True, help="room id used in mesh/material names")
    ap.add_argument("--out", required=True, help="output JSON")
    ap.add_argument("--texdir", required=True, help="texture output folder")
    ap.add_argument("--roots", nargs="+", default=list(DEFAULT_ROOTS))
    ap.add_argument("--max-texture", type=int, default=DEFAULT_TEXTURE_SIZE)
    args = ap.parse_args()

    scene_path = Path(args.scene).resolve()
    env = P.ProjectEnv.from_scene(scene_path)
    _, info = L.build_transforms(env)

    go_of_transform: dict[int, object] = {}
    go_to_transform: dict[int, int] = {}
    mesh_filter_of_transform: dict[int, object] = {}
    mesh_renderer_of_transform: dict[int, object] = {}
    for obj in env.objects:
        if obj.type.name != "Transform":
            continue
        try:
            transform = obj.read()
            go = transform.m_GameObject.read()
            go_of_transform[obj.path_id] = go
            go_to_transform[transform.m_GameObject.path_id] = obj.path_id
        except Exception:
            pass
    for obj in env.objects:
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

    # LODs: include only LOD0 of each LODGroup; LOD1+ is the same furniture, simplified.
    lod0: set[int] = set()
    lod_other: set[int] = set()
    for obj in env.objects:
        if obj.type.name != "LODGroup":
            continue
        group = obj.read()
        for level_index, lod in enumerate(_field(group, "m_LODs", [])):
            for entry in _field(lod, "renderers", []):
                try:
                    renderer = entry.renderer.read()
                    transform_pid = go_to_transform.get(renderer.m_GameObject.path_id)
                except Exception:
                    continue
                if transform_pid is None:
                    continue
                (lod0 if level_index == 0 else lod_other).add(transform_pid)

    texdir = Path(args.texdir)
    meshes = MeshCache(env)
    material_cache = MaterialCache(env, texdir, args.max_texture)
    groups: dict[str, dict] = {}
    matrices: dict[int, list[list[float]]] = {}
    skipped = 0
    missing_meshes = 0
    rendered = 0
    processed = 0

    for pid in sorted(included):
        processed += 1
        if processed % 25 == 0:
            print(f"  … {processed}/{len(included)} transforms, {rendered} submeshes", flush=True)
        mesh_filter = mesh_filter_of_transform.get(pid)
        if mesh_filter is None:
            continue
        name = info[pid]["name"]
        lower = name.lower()
        if any(word in lower for word in SKIP_WORDS):
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

        mesh = meshes.get(mesh_filter.m_Mesh)
        if mesh is None:
            missing_meshes += 1
            continue
        submeshes = mesh.get("submeshes") or []
        if not submeshes or not mesh["verts"]:
            skipped += 1
            continue

        matrix = world_matrix(info, pid, matrices)
        material_refs = list(_field(renderer, "m_Materials", []))
        batch = _field(renderer, "m_StaticBatchInfo", None)
        if batch is not None and getattr(batch, "subMeshCount", 0):
            # Static batching baked the object transform into the combined mesh;
            # applying the renderer transform again (some props have scale 100) explodes it.
            matrix = L.I4
            selected = [
                (index, submeshes[index])
                for index in range(batch.firstSubMesh, batch.firstSubMesh + batch.subMeshCount)
                if index < len(submeshes)
            ]
            material_offset = batch.firstSubMesh
        else:
            selected = list(enumerate(submeshes))
            material_offset = 0

        for submesh_index, submesh in selected:
            if len(submesh) < 3:
                continue
            triangles = [submesh[i : i + 3] for i in range(0, len(submesh) - 2, 3)]
            material_key = None
            material = None
            if material_refs:
                material_index = min(
                    max(0, submesh_index - material_offset), len(material_refs) - 1
                )
                reference = material_refs[material_index]
                material = reference.read()
            if material is not None and "default" in material.m_Name.lower():
                # Placeholders/cages from the editor; they render as opaque white boxes.
                continue
            if material is None:
                material_key, spec = default_material(args.name)
                if material_key not in material_cache.materials:
                    material_cache.materials[material_key] = spec
            else:
                material_key, _ = material_cache.get(reference, args.name)
            group = groups.setdefault(
                material_key,
                {
                    "name": f"{args.name}_{material_key}",
                    "material": material_key,
                    "verts": [],
                    "normals": [],
                    "uvs": [],
                    "indices": [],
                },
            )
            # A combined/static-batched mesh has thousands of vertices but each renderer
            # uses one small submesh. Transform only the vertices this submesh references.
            used = sorted({int(index) for triangle in triangles for index in triangle})
            local = {old: new for new, old in enumerate(used)}
            base = len(group["verts"])
            verts = mesh["verts"]
            normals = mesh["normals"]
            uvs = mesh["uvs"]
            for vi in used:
                world = transform_point(matrix, list(verts[vi]))
                group["verts"].append([round(c, 5) for c in to_blender(world)])
                if vi < len(normals):
                    normal = transform_normal(matrix, list(normals[vi]))
                    group["normals"].append([round(c, 5) for c in to_blender(normal)])
                else:
                    group["normals"].append([0.0, 0.0, 1.0])
                group["uvs"].append(list(uvs[vi]) if vi < len(uvs) else [0.0, 0.0])
            for tri in triangles:
                group["indices"].extend([base + local[int(i)] for i in tri])
            rendered += 1

    materials = {key: spec for key, spec in material_cache.materials.items() if key in groups}
    meshes_out = [group for group in groups.values() if group["indices"]]
    total_verts = sum(len(mesh["verts"]) for mesh in meshes_out)
    total_tris = sum(len(mesh["indices"]) // 3 for mesh in meshes_out)
    print(
        f"  meshes: {len(meshes_out)} groups, {total_verts} verts, {total_tris} tris, "
        f"{skipped} skipped, {missing_meshes} built-in/missing meshes"
    )

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({"name": args.name, "materials": materials, "meshes": meshes_out}),
        encoding="utf-8",
    )
    print(f"[room] wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
