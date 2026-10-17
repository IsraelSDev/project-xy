"""
Exporta uma peça do GoE Character Creator (basemesh do pacote comprado) para GLB.

Uso (sempre em modo background; NÃO salva o .blend):

    blender -b <arquivo.blend> --factory-startup --python tools/goe/export_goe.py -- \
        --gender male|female --item body --out <pasta>

Itens: body, genitals (só masculino), hair-1, hair-2, hair-3, e as roupas de cada gênero (ver ITEMS).
Regras fixas:
- Corpo, olhos, dentes e língua saem OPAQUE (o canal "Opacity" não vira alpha); olhos sem metal.
- Sobrancelha e cabelo saem com alpha de recorte (MASK, via nó Math ROUND).
- Morphs: todas as shape keys de cada malha saem (corpo, rosto, expressões, anatomia), com o nome original. Roupa,
  cabelo, olhos e sobrancelha trazem as mesmas chaves do corpo (no .blend elas seguem o corpo por drivers): o jogo
  aplica a mesma influência, por nome, em todas as malhas. Os drivers saem e todas as chaves ficam em 0. Chave que
  não desloca nenhum vértice da malha (ver MIN_KEY_DISPLACEMENT) não é exportada nessa malha.
- Só ossos de deformação (export_def_bones).
"""

import argparse
import os
import sys

import bpy

BONE_FOR_HAIR = "head.x"


# Nome do arquivo de cada item = id do catálogo (packages/contracts/src/avatar.ts).
OUTPUT_NAMES = {
    "male": {
        "body": "GoE_Male",
        "genitals": "GoE_M_Genitals",
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
        "genitals": ["M_Basemesh_B_GOE_Genitals"],
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


def item_alpha_mode(obj_name):
    if obj_name.endswith("_Eyes"):
        return "OPAQUE"
    if "Eyebrows" in obj_name or "Hair" in obj_name:
        return "CLIP"
    if obj_name.endswith(("_Body", "_Genitals", "_Teeth_Up", "_Teeth_Down", "_Tongue")):
        return "OPAQUE"
    return None  # roupa: mantém o material como está; o verificador confere


# Chave que não desloca nenhum vértice mais que isto (m, em espaço de mundo) não muda nada que se veja e sai: o
# exporter grava uma chave sem efeito como array denso de zeros (o cabelo masculino 1 passava de 290 MB).
MIN_KEY_DISPLACEMENT = 1e-4


def prepare_shape_keys(obj):
    """Deixa as shape keys em 0 e sem driver: no .blend as chaves de roupa, cabelo, olhos e sobrancelha copiam o
    valor do corpo por driver, e o exporter gravaria esse valor como peso inicial. Tira as chaves sem efeito
    visível na malha. Devolve (mantidas, removidas), sem contar a Basis."""
    if obj.type != "MESH" or not obj.data.shape_keys:
        return 0, 0
    import numpy as np

    keys = obj.data.shape_keys
    if keys.animation_data:
        for fcurve in list(keys.animation_data.drivers):
            keys.animation_data.drivers.remove(fcurve)
    basis = keys.reference_key
    count = len(obj.data.vertices) * 3
    base = np.empty(count, dtype=np.float32)
    basis.data.foreach_get("co", base)
    scale = sum(obj.matrix_world.to_scale()) / 3.0
    removed = 0
    for block in list(keys.key_blocks):
        if block == basis:
            continue
        co = np.empty(count, dtype=np.float32)
        block.data.foreach_get("co", co)
        if float(np.abs(co - base).max(initial=0.0)) * scale < MIN_KEY_DISPLACEMENT:
            obj.shape_key_remove(block)
            removed += 1
    for block in keys.key_blocks:
        block.value = 0.0
        block.mute = False
    return len(keys.key_blocks) - 1, removed


# Parâmetros das chaves sintéticas dos genitais (ver add_genital_morphs). Valores do .blend v1.4, em metros.
# GENS_ORIGIN é o encaixe da malha no corpo (vértice de maior y); GENS_AXIS, a direção encaixe -> ponta (o cano sobe
# levemente), ambos medidos na própria malha (ela não traz essas chaves).
GENS_ORIGIN = (0.00853952, -0.04117997, 0.91607273)
GENS_AXIS = (-0.06425485, -0.98819338, 0.13908688)
GENS_SIZE = 0.625  # BodyPenisSize: escala do conjunto todo (base, escroto, cano, glande) com influência 1.0
GENS_SIZE_D0 = 0.012  # a partir daqui (m do encaixe) tamanho e grossura começam: a emenda com o corpo fica parada...
GENS_SIZE_D1 = 0.040  # ...e aqui já valem por inteiro (o escroto, de 0.04 a 0.06 m, acompanha)
GENS_GIRTH = 0.45  # BodyPenisGirth: aumento relativo do raio (perpendicular ao cano) com influência 1.0


def smoothstep(values, low, high):
    import numpy as np

    t = np.clip((values - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def add_genital_morphs(obj):
    """Sintetiza as shape keys BodyPenisSize (tamanho) e BodyPenisGirth (grossura) na malha dos genitais.

    O basemesh v1.4 do pacote não traz essas chaves (o addon v1.5 lista "Penis Size" como BodyPenisSize, mas a
    malha não tem). O tamanho é uma escala UNIFORME em torno do encaixe, aplicada ao conjunto todo: base, escroto,
    cano e glande crescem juntos, então as proporções se mantêm (esticar só o cano deixava glande e base
    desproporcionais, com uma quebra visível na emenda). Uma rampa curta perto do encaixe (GENS_SIZE_D0..D1) deixa a
    emenda com o corpo parada, senão ela abriria. A grossura segue a mesma lógica: cresce o raio perpendicular ao
    cano em todo o conjunto (base, escroto, cano e glande), com a mesma rampa, então não sobra degrau entre a
    base e o cano. Só cria as chaves; não mexe em valor (ficam em 0).
    """
    if obj.type != "MESH":
        return []
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    keys = obj.data.shape_keys
    if "BodyPenisSize" in keys.key_blocks or "BodyPenisGirth" in keys.key_blocks:
        return []
    import numpy as np

    count = len(obj.data.vertices) * 3
    base = np.empty(count, dtype=np.float32)
    keys.reference_key.data.foreach_get("co", base)
    co = base.reshape(-1, 3).astype(np.float64)

    axis = np.array(GENS_AXIS, dtype=np.float64)
    axis /= np.linalg.norm(axis)
    origin = np.array(GENS_ORIGIN, dtype=np.float64)

    offset = co - origin
    along = offset @ axis
    radial = offset - along[:, None] * axis
    size_weight = smoothstep(np.linalg.norm(offset, axis=1), GENS_SIZE_D0, GENS_SIZE_D1)

    made = []
    for name, disp in (
        ("BodyPenisSize", offset * (GENS_SIZE * size_weight)[:, None]),
        ("BodyPenisGirth", radial * (GENS_GIRTH * size_weight)[:, None]),
    ):
        block = obj.shape_key_add(name=name, from_mix=False)
        block.data.foreach_set("co", (co + disp).reshape(-1).astype(np.float32))
        block.value = 0.0
        made.append((name, round(float(np.abs(disp).max(initial=0.0)), 5)))
    return made


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

    exported_keys = 0
    pruned_keys = 0
    removed_eye_verts = 0
    genital_morphs = []
    for obj in part_objects:
        if "Eyes" in obj.name:
            removed_eye_verts += drop_transparent_eye_layers(obj)
        kept, pruned = prepare_shape_keys(obj)
        exported_keys += kept
        pruned_keys += pruned
        fix_materials(obj)
        if args.item.startswith("hair-"):
            bind_rigid_to_head(obj, armature)
        if args.item == "genitals":
            bpy.context.view_layer.objects.active = obj
            genital_morphs += add_genital_morphs(obj)

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
        export_morph=True,
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
        export_animations=False,
        # AUTO: mantém o formato original da textura (sem recodificar para WebP).
        export_image_format="AUTO",
    )

    print(f"EXPORT_OK {out_path}")
    print(f"SHAPE_KEYS_EXPORTED {exported_keys} PRUNED {pruned_keys}")
    print(f"REMOVED_EYE_LAYER_VERTS {removed_eye_verts}")
    if genital_morphs:
        print(f"GENITAL_MORPHS {genital_morphs}")


if __name__ == "__main__":
    main()
