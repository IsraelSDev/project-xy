"""
Exporta uma peça do GoE Character Creator (basemesh do pacote comprado) para GLB.

Uso (sempre em modo background; NÃO salva o .blend):

    blender -b <arquivo.blend> --factory-startup --python tools/goe/export_goe.py -- \
        --gender male|female --item body --out <pasta>

Itens: body, hair-1, hair-2, hair-3, e as roupas de cada gênero (ver ITEMS).
Regras fixas (ver docs/guides/goe-pipeline.md):
- Malhas e shape keys de conteúdo sexual explícito são removidas antes do export.
- Corpo, olhos, dentes e língua saem OPAQUE (o canal "Opacity" não vira alpha); olhos sem metal.
- Sobrancelha e cabelo saem com alpha de recorte (MASK, via nó Math ROUND).
- Morphs: corpo e rosto só de expressão (Anim*); roupa e cabelo sem morph.
- Só ossos de deformação (export_def_bones).
"""

import argparse
import os
import re
import sys

import bpy

# Nomes de malha que nunca são exportados. Lista de exclusão, não de conteúdo.
EXCLUDED_MESH = re.compile(r"genit", re.IGNORECASE)
# Shape keys de anatomia explícita: nunca exportadas.
EXCLUDED_SHAPE_KEYS = {
    "AnimAnusOpen",
    "AnimPenisErect",
    "AnimForeskin",
    "AnimClitorisExpose",
    "BodyNipples",
    # Nome ambíguo (pode ser abertura genital). Fora até confirmar o que a chave move no modelo.
    "AnimGensOpen",
}

BONE_FOR_HAIR = "head.x"


# Nome do arquivo de cada item = id do catálogo (packages/contracts/src/avatar.ts).
OUTPUT_NAMES = {
    "male": {
        "body": "GoE_Male",
        "hair-1": "GoE_M_Hair01",
        "hair-2": "GoE_M_Hair02",
        "hair-3": "GoE_M_Hair03",
        "top-fitness": "GoE_M_Top_Fitness",
        "bottom-fitness": "GoE_M_Bottom_Fitness",
        "shoes-fitness": "GoE_M_Shoes_Fitness",
        "outerwear-street": "GoE_M_Outerwear_Street",
        "bottom-street": "GoE_M_Bottom_Street",
    },
    "female": {
        "body": "GoE_Female",
        "hair-1": "GoE_F_Hair01",
        "hair-2": "GoE_F_Hair02",
        "hair-3": "GoE_F_Hair03",
        "top-casualsport": "GoE_F_Top_CasualSport",
        "bottom-casualsport": "GoE_F_Bottom_CasualSport",
        "shoes-casual": "GoE_F_Shoes_Casual",
        "top-sportswear": "GoE_F_Top_Sportswear",
        "bottom-sportswear": "GoE_F_Bottom_Sportswear",
    },
}

# Itens por gênero. Chave = id de exportação; valor = objetos do .blend que compõem o item.
ITEMS = {
    "male": {
        "body": ["M_Basemesh_B_GOE_Body", "M_Basemesh_B_GOE_Eyes", "M_Basemesh_B_GOE_Teeth_Up",
                 "M_Basemesh_B_GOE_Teeth_Down", "M_Basemesh_B_GOE_Tongue", "M_Basemesh_GOE_Eyebrows"],
        "hair-1": ["M_Basemesh_GOE_Hair01"],
        "hair-2": ["M_Basemesh_GOE_Hair02"],
        "hair-3": ["M_Basemesh_GOE_Hair03"],
        "top-fitness": ["M_B_GOE_Fitness_Shirt"],
        "bottom-fitness": ["M_B_GOE_Fitness_Shorts"],
        "shoes-fitness": ["M_B_GOE_Fitness_Boots"],
        "outerwear-street": ["M_B_GOE_Street_Hoodie"],
        "bottom-street": ["M_B_GOE_Street_Pants"],
    },
    "female": {
        "body": ["F_Basemesh_B_GOE_Body", "F_Basemesh_B_GOE_Eyes", "F_Basemesh_B_GOE_Teeth_Up",
                 "F_Basemesh_B_GOE_Teeth_Down", "F_Basemesh_B_GOE_Tongue", "F_Basemesh_GOE_Eyebrows"],
        "hair-1": ["F_Basemesh_B_GOE_Hair_1"],
        "hair-2": ["F_Basemesh_B_GOE_Hair_2"],
        "hair-3": ["F_Basemesh_B_GOE_Hair_3"],
        "top-casualsport": ["F_B_GOE_Casual_Sport_Top"],
        "bottom-casualsport": ["F_B_GOE_Casual_Sport_Bottom"],
        "shoes-casual": ["F_B_GOE_Boots_Casual"],
        "top-sportswear": ["F_B_GOE_Sportswear_Top"],
        "bottom-sportswear": ["F_B_GOE_Sportswear_Bot"],
    },
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    import argparse as ap
    parser = ap.ArgumentParser()
    parser.add_argument("--gender", choices=["male", "female"], required=True)
    parser.add_argument("--item", required=True)
    parser.add_argument("--out", required=True)
    return parser.parse_args(argv)


def item_morph_mode(item_id):
    """body (corpo, rosto, dentes, língua, sobrancelha): só expressões. Demais: nenhum morph."""
    return "expressions" if item_id == "body" else "none"


def item_alpha_mode(obj_name):
    if obj_name.endswith("_Eyes"):
        return "OPAQUE"
    if "Eyebrows" in obj_name or "Hair" in obj_name:
        return "CLIP"
    if obj_name.endswith(("_Body", "_Teeth_Up", "_Teeth_Down", "_Tongue")):
        return "OPAQUE"
    return None  # roupa: mantém o material como está; o verificador confere


def remove_excluded_meshes():
    removed = []
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and EXCLUDED_MESH.search(obj.name):
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def strip_shape_keys(obj, morph_mode):
    """Tira chaves explícitas e, conforme o modo, todas as que não são expressão."""
    if obj.type != "MESH" or not obj.data.shape_keys:
        return 0
    keys = obj.data.shape_keys
    if keys.animation_data:
        for fcurve in list(keys.animation_data.drivers):
            if any(name in fcurve.data_path for name in EXCLUDED_SHAPE_KEYS):
                keys.animation_data.drivers.remove(fcurve)
    removed = 0
    for block in list(keys.key_blocks):
        if block.name == keys.reference_key.name:
            continue
        drop = block.name in EXCLUDED_SHAPE_KEYS or morph_mode == "none" or (
            morph_mode == "expressions" and not block.name.startswith("Anim")
        )
        if drop:
            obj.shape_key_remove(block)
            removed += 1
    return removed


def unlink_input(material, input_name):
    if not material.use_nodes:
        return
    for node in material.node_tree.nodes:
        if node.type != "BSDF_PRINCIPLED":
            continue
        socket = node.inputs[input_name]
        for link in list(material.node_tree.links):
            if link.to_socket == socket:
                material.node_tree.links.remove(link)


def set_opaque(material):
    unlink_input(material, "Alpha")
    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            node.inputs["Alpha"].default_value = 1.0


def set_clip(material):
    """O exporter do Blender só marca MASK quando o alpha passa por um nó Math ROUND (corte 0.5)."""
    if not material.use_nodes:
        return
    tree = material.node_tree
    for node in tree.nodes:
        if node.type != "BSDF_PRINCIPLED":
            continue
        alpha_in = node.inputs["Alpha"]
        incoming = [link for link in tree.links if link.to_socket == alpha_in]
        if not incoming:
            continue
        source = incoming[0].from_socket
        if incoming[0].from_node.type == "MATH" and incoming[0].from_node.operation == "ROUND":
            continue
        tree.links.remove(incoming[0])
        rounder = tree.nodes.new("ShaderNodeMath")
        rounder.operation = "ROUND"
        rounder.location = (node.location.x - 220, node.location.y - 260)
        tree.links.new(source, rounder.inputs[0])
        tree.links.new(rounder.outputs[0], alpha_in)


def fix_materials(obj):
    mode = item_alpha_mode(obj.name)
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            continue
        if obj.name.endswith("_Eyes"):
            set_opaque(mat)
            unlink_input(mat, "Metallic")
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    node.inputs["Metallic"].default_value = 0.0
        elif mode == "OPAQUE":
            set_opaque(mat)
        elif mode == "CLIP":
            set_clip(mat)


def bind_rigid_to_head(obj, armature):
    """Cabelo: peso 1.0 no osso da cabeça (head.x), armature como modificador e pai do objeto.

    O cabelo do .blend está preso ao osso de controle c_head.x (que não sai no export) e pode não
    ter grupo de vértice. Aqui ele vira filho do armature por objeto, mantendo a transformação.
    """
    if BONE_FOR_HAIR not in armature.data.bones:
        raise SystemExit(f"Osso {BONE_FOR_HAIR} não existe no armature")
    if not any(mod.type == "ARMATURE" for mod in obj.modifiers):
        modifier = obj.modifiers.new(name="Armature", type="ARMATURE")
        modifier.object = armature
    group = obj.vertex_groups.get(BONE_FOR_HAIR) or obj.vertex_groups.new(name=BONE_FOR_HAIR)
    group.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "OBJECT"
    obj.parent_bone = ""
    obj.matrix_world = world


def drop_transparent_eye_layers(obj):
    """Remove da malha dos olhos as camadas transparentes (a película 'úmida' da córnea, opacidade ~0,06).
    O material do artista usa o mapa de opacidade para escondê-las; o export força o material opaco e o app
    troca o albedo por uma textura sem alfa, então a película viraria uma casca cinza sobre a íris. Cada ilha
    da malha é avaliada pela opacidade média do mapa nos seus UV: abaixo de 0,5 ela sai."""
    import bmesh

    opacity = None
    for slot in obj.material_slots:
        if slot.material and slot.material.use_nodes:
            for node in slot.material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image and "opacity" in node.image.name.lower():
                    opacity = node.image
    if opacity is None:
        return 0
    width, height = opacity.size
    pixels = opacity.pixels[:]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv_layer = bm.loops.layers.uv.active
    seen, islands = set(), []
    for vert in bm.verts:
        if vert.index in seen:
            continue
        stack, island = [vert], []
        while stack:
            current = stack.pop()
            if current.index in seen:
                continue
            seen.add(current.index)
            island.append(current)
            stack.extend(edge.other_vert(current) for edge in current.link_edges)
        islands.append(island)
    doomed = []
    for island in islands:
        samples = []
        for vert in island:
            for loop in vert.link_loops:
                uv = loop[uv_layer].uv
                x = min(width - 1, max(0, int(uv.x * width)))
                y = min(height - 1, max(0, int(uv.y * height)))
                samples.append(pixels[(y * width + x) * 4])
        if samples and sum(samples) / len(samples) < 0.5:
            doomed.extend(island)
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context="VERTS")
        bm.to_mesh(obj.data)
        obj.data.update()
    bm.free()
    return len(doomed)


def drop_outside_item(armature, keep):
    """Remove do arquivo aberto (só em memória, o .blend não é salvo) os objetos parentados ao armature
    que não fazem parte do item. O exporter mantém um osso não deform enquanto algum objeto parentado a
    ele existir, mesmo que o objeto não saia no GLB: os cabelos (filhos de c_head.x) faziam c_head.x virar
    joint e isolavam head.x do skeleton."""
    for obj in list(bpy.data.objects):
        if obj.parent == armature and obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)


def main():
    args = parse_args()
    if args.item not in ITEMS[args.gender]:
        raise SystemExit(f"Item desconhecido para {args.gender}: {args.item}")
    os.makedirs(args.out, exist_ok=True)
    out_path = os.path.join(args.out, f"{OUTPUT_NAMES[args.gender][args.item]}.glb")

    removed_meshes = remove_excluded_meshes()

    armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise SystemExit("Nenhum armature no .blend")
    armature.hide_set(False)
    armature.hide_viewport = False

    part_objects = []
    for name in ITEMS[args.gender][args.item]:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise SystemExit(f"Malha do item não encontrada no .blend: {name}")
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        part_objects.append(obj)

    morph_mode = item_morph_mode(args.item)
    removed_keys = 0
    removed_eye_verts = 0
    for obj in part_objects:
        if "Eyes" in obj.name:
            removed_eye_verts += drop_transparent_eye_layers(obj)
        removed_keys += strip_shape_keys(obj, morph_mode)
        fix_materials(obj)
        if args.item.startswith("hair-"):
            bind_rigid_to_head(obj, armature)

    keep = part_objects + [armature]
    drop_outside_item(armature, keep)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in keep:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_skins=True,
        export_def_bones=True,
        export_morph=morph_mode != "none",
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
        export_animations=False,
        # AUTO: mantém o formato original da textura (sem recodificar para WebP).
        export_image_format="AUTO",
    )

    print(f"EXPORT_OK {out_path}")
    print(f"REMOVED_MESHES {removed_meshes}")
    print(f"REMOVED_SHAPE_KEYS_COUNT {removed_keys}")
    print(f"REMOVED_EYE_LAYER_VERTS {removed_eye_verts}")


if __name__ == "__main__":
    main()
