"""Build a static room GLB from ``extract_room.py`` JSON.

Run through Blender 5.2::

    python tools/3dx/run_blender.py export_room_glb.py -- \
        --json tools/3dx/build/project/home.json \
        --out apps/web/public/assets/3dx/rooms/home/home.glb

The JSON vertices are already in Blender Z-up world space. Materials carry a
base-color texture (JPEG for opaque, PNG for alpha), alpha mode/cutoff, color,
roughness and metallic.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
import argparse

ap = argparse.ArgumentParser()
ap.add_argument("--json", required=True)
ap.add_argument("--out", required=True)
ap.add_argument(
    "--decimate",
    type=float,
    help="razão do Decimate (collapse) por malha, ex.: 0.5 — salas com muitos props pequenos",
)
args = ap.parse_args(argv)

data = json.loads(Path(args.json).read_text(encoding="utf-8"))
out = Path(args.out)
data_dir = Path(args.json).resolve().parent

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

MATERIALS: dict[str, bpy.types.Material] = {}


def make_material(key: str, spec: dict) -> bpy.types.Material:
    material = bpy.data.materials.new(f"{key}_{spec.get('name', 'mat')}")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    color = spec.get("color") or [1, 1, 1, 1]
    if len(color) == 3:
        color = [*color, 1.0]
    alpha_mode = spec.get("alphaMode", "opaque")
    cutoff = float(spec.get("cutoff", 0.5))
    if bsdf:
        bsdf.inputs["Base Color"].default_value = tuple(float(c) for c in color[:3]) + (1.0,)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = float(spec.get("roughness", 0.7))
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = float(spec.get("metallic", 0.0))
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = float(color[3])
        links = material.node_tree.links

        def image_texture(name: str, gamma: bool) -> bpy.types.Node:
            image = bpy.data.images.load(
                str((data_dir / name).resolve()), check_existing=True
            )
            image.colorspace_settings.name = "sRGB" if gamma else "Non-Color"
            node = material.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = image
            node.interpolation = "Linear"
            return node

        texture_name = spec.get("texture")
        if texture_name:
            tex = image_texture(texture_name, True)
            tex.location = (-500, 280)
            links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            if alpha_mode == "cutout":
                alpha_cut = material.node_tree.nodes.new("ShaderNodeMath")
                alpha_cut.operation = "GREATER_THAN"
                alpha_cut.inputs[1].default_value = cutoff
                alpha_cut.location = (-220, 120)
                links.new(tex.outputs["Alpha"], alpha_cut.inputs[0])
                links.new(alpha_cut.outputs["Value"], bsdf.inputs["Alpha"])
            elif alpha_mode == "blend":
                links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])

        normal_name = spec.get("normalTexture")
        if normal_name:
            normal_tex = image_texture(normal_name, False)
            normal_tex.location = (-500, -120)
            normal_map = material.node_tree.nodes.new("ShaderNodeNormalMap")
            normal_map.space = "TANGENT"
            normal_map.inputs["Strength"].default_value = float(spec.get("normalScale", 1.0))
            normal_map.location = (-220, -120)
            links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
            links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

        emissive_strength = float(spec.get("emissiveStrength", 0.0))
        emissive_color = spec.get("emissiveColor") or [0.0, 0.0, 0.0]
        if emissive_strength > 0.0 or spec.get("emissiveTexture"):
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (
                    float(emissive_color[0]),
                    float(emissive_color[1]),
                    float(emissive_color[2]),
                    1.0,
                )
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = max(emissive_strength, 1.0)
            emissive_name = spec.get("emissiveTexture")
            if emissive_name:
                emissive_tex = image_texture(emissive_name, True)
                emissive_tex.location = (-500, 40)
                links.new(emissive_tex.outputs["Color"], bsdf.inputs["Emission Color"])
    material.use_backface_culling = not bool(spec.get("doubleSided", False))
    if alpha_mode == "cutout":
        material.blend_method = "CLIP"
        material.alpha_threshold = cutoff
    elif alpha_mode == "blend":
        material.blend_method = "BLEND"
    else:
        material.blend_method = "OPAQUE"
    return material


for key, spec in data["materials"].items():
    MATERIALS[key] = make_material(key, spec)

total_verts = 0
total_tris = 0
for item in data["meshes"]:
    verts = [tuple(v) for v in item["verts"]]
    if not verts:
        continue
    indices = item["indices"]
    faces = [tuple(indices[i:i + 3]) for i in range(0, len(indices), 3)]
    mesh = bpy.data.meshes.new(item["name"])
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UV")
    uvs = item.get("uvs") or []
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv.data[loop_index].uv = uvs[vertex_index] if vertex_index < len(uvs) else (0.0, 0.0)
    for poly in mesh.polygons:
        poly.use_smooth = True
    normals = item.get("normals") or []
    if len(normals) == len(verts):
        try:
            mesh.normals_split_custom_set_from_vertices([tuple(n) for n in normals])
        except Exception as error:
            print(f"  ! {item['name']}: custom normals skipped ({error})")
    mesh.update()
    material = MATERIALS.get(item["material"])
    if material is not None:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(item["name"], mesh)
    scene.collection.objects.link(obj)
    total_verts += len(verts)
    total_tris += len(faces)

# Otimização opcional: Decimate (collapse) por malha. Salas com dezenas de props pequenos (quarto,
# closet) somam centenas de milhares de triângulos que não aparecem no enquadramento do jogo.
if args.decimate and 0 < args.decimate < 1:
    before = 0
    after = 0
    for obj in [o for o in scene.collection.objects if o.type == "MESH"]:
        before += len(obj.data.polygons)
        modifier = obj.modifiers.new("decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = args.decimate
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        after += len(obj.data.polygons)
    print(f"[room glb] decimate {args.decimate}: {before} -> {after} triângulos")

print(f"[room glb] meshes={len(data['meshes'])} verts={total_verts} tris={total_tris}")

out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(out),
    export_format="GLB",
    use_selection=False,
    export_apply=False,
    export_yup=True,
    export_animations=False,
    export_skins=False,
    export_tangents=True,
    export_texcoords=True,
    export_normals=True,
)
print("EXPORTED", out, out.stat().st_size)
